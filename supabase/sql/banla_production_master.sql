-- =============================================================================
-- BANLA BOUTIQUE HOTEL ĐÀ LẠT — PRODUCTION MASTER SCHEMA (UNIFIED & REAL-DATA READY)
-- Project mục tiêu: hcikbpvzbzottxoitujl (cách ly tuyệt đối trong `schema: banla`, KHÔNG chạm `webmoi`)
--
-- Hợp nhất đầy đủ, chạy 1 lần duy nhất (Idempotent — chạy lại nhiều lần không lỗi):
--   1. `banla.rooms`            — 7 hạng phòng chuẩn & đơn giá BIGINT VND phía CSDL
--   2. `banla.bookings`         — Đơn đặt phòng (VietQR + Visa OnePay, cọc 50% / trả 100% giảm 10%)
--   3. `banla.transactions`     — Sổ cái giao dịch thực nhận (chống ghi trùng theo gateway_txn_id)
--   4. `banla.payment_sessions` — Phiên khóa giữ phòng VietQR 15 phút
--   5. `banla.smartlock_access` — Nhật ký cấp/thu hồi mã Smart-Lock PIN 6 chữ số
--   6. `banla.payment_intents`  — Phiên thanh toán thẻ quốc tế OnePay VPC v2
--   7. `banla.payment_events`   — Nhật ký kiểm toán Webhook / IPN (PCI DSS sanitized)
--   8. Hàm công khai duy nhất cho `anon`:
--        • `public.banla_list_rooms_availability`
--        • `public.banla_create_booking`
--        • `public.banla_booking_status`
--   9. Hàm quản trị & đối soát nội bộ (chỉ `service_role`):
--        • `banla.record_payment`
--        • `banla.approve_booking`
--        • `banla.cancel_booking`
--        • `banla.confirm_onepay_payment`
--  10. KHÔNG chứa bất kỳ dữ liệu mẫu (mock/seed booking) nào.
-- =============================================================================

begin;

-- 0. Bảo vệ dữ liệu cũ nếu có bảng v1 không tương thích + gỡ các RPC v1 mất an toàn
do $$
begin
  if to_regclass('banla.bookings') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'banla' and table_name = 'bookings' and column_name = 'amount_due'
     ) then
    raise exception 'Phát hiện bảng banla.bookings phiên bản v1 cũ. Vui lòng sao lưu dữ liệu trước khi nâng cấp.';
  end if;
end $$;

drop function if exists public.banla_list_bookings();
drop function if exists public.banla_approve_booking(uuid, varchar, boolean, varchar);
drop function if exists public.banla_update_booking(uuid, varchar, varchar, numeric, numeric, varchar, text);
drop function if exists public.banla_create_booking(varchar, text, varchar, text, varchar, integer, timestamptz, timestamptz, numeric, text);

create schema if not exists banla;
revoke all on schema banla from public;
revoke all on schema banla from anon, authenticated;
grant usage on schema banla to service_role;

-- Tự động đăng ký schema `banla` vào PostgREST Exposed Schemas nếu role chạy SQL đủ quyền
do $$
begin
  execute 'alter role authenticator set pgrst.db_schemas = ''public, storage, graphql_public, banla''';
  perform pg_notify('pgrst', 'reload config');
exception when others then
  raise notice 'Ghi chú: Nếu cần gọi trực tiếp REST vào schema banla bằng service_role, hãy kiểm tra Settings -> Data API -> Exposed schemas có "banla".';
end $$;

-- =============================================================================
-- 1. DANH MỤC 7 HẠNG PHÒNG CHUẨN (`banla.rooms`)
-- =============================================================================
create table if not exists banla.rooms (
  code        text primary key check (code ~ '^[a-z0-9_-]{2,32}$'),
  name        text not null unique check (char_length(name) between 2 and 100),
  unit_price  bigint not null check (unit_price > 0),
  max_guests  integer not null check (max_guests between 1 and 20),
  inventory   integer not null default 1 check (inventory >= 0),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

insert into banla.rooms (code, name, unit_price, max_guests, inventory) values
  ('elite',      'Élite Room',      1250000, 3, 1),
  ('signature',  'Banla Signature', 1150000, 3, 1),
  ('highland',   'Highland Room',   1100000, 3, 1),
  ('connecting', 'Connecting Room', 1850000, 6, 1),
  ('twin',       'Deluxe Twin',      950000, 3, 1),
  ('suite',      'Original Suite',  1550000, 3, 1),
  ('balcony',    'Deluxe Balcony',   980000, 3, 1)
on conflict (code) do update
  set name = excluded.name,
      unit_price = excluded.unit_price,
      max_guests = excluded.max_guests,
      updated_at = now();

-- =============================================================================
-- 2. ĐƠN ĐẶT PHÒNG THỰC TẾ (`banla.bookings`)
-- =============================================================================
create table if not exists banla.bookings (
  id               uuid primary key default gen_random_uuid(),
  booking_code     text not null unique check (booking_code ~ '^BL[0-9A-Z]{4,12}$'),
  guest_name       text not null check (char_length(btrim(guest_name)) between 2 and 100),
  guest_phone      text not null check (guest_phone ~ '^[0-9]{8,15}$'),
  guest_email      text check (guest_email is null or guest_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  room_code        text not null references banla.rooms (code),
  guests           integer not null check (guests between 1 and 20),
  check_in         date not null,
  check_out        date not null,
  nights           integer generated always as (check_out - check_in) stored,
  unit_price       bigint not null check (unit_price > 0),
  total_amount     bigint not null check (total_amount > 0),
  payment_option   text not null check (payment_option in ('deposit_50', 'pay_100')),
  payment_method   text not null default 'vietqr' check (payment_method in ('vietqr', 'visa', 'bank_transfer')),
  discount_amount  bigint not null default 0 check (discount_amount >= 0),
  amount_due       bigint not null check (amount_due > 0),
  paid_amount      bigint not null default 0 check (paid_amount >= 0),
  payment_status   text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  booking_status   text not null default 'pending' check (booking_status in ('pending', 'confirmed', 'completed', 'cancelled')),
  smartlock_pin    text check (smartlock_pin ~ '^[0-9]{6}$'),
  source           text not null default 'direct' check (source in ('direct', 'ota', 'admin')),
  note             text not null default '' check (char_length(note) <= 1000),
  hold_expires_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  paid_at          timestamptz,
  approved_at      timestamptz,
  approved_by      text,
  constraint bookings_stay_valid check (check_out > check_in and check_out - check_in <= 30),
  constraint bookings_amounts_valid check (
    discount_amount <= total_amount
    and amount_due <= total_amount - discount_amount
    and paid_amount <= total_amount - discount_amount
  ),
  constraint bookings_pin_requires_paid check (
    smartlock_pin is null
    or (payment_status = 'paid' and booking_status in ('confirmed', 'completed'))
  )
);

-- Bổ sung cột `payment_method` an toàn nếu bảng đã được tạo từ `banla_schema_v2.sql` trước đó
alter table banla.bookings
  add column if not exists payment_method text not null default 'vietqr'
  check (payment_method in ('vietqr', 'visa', 'bank_transfer'));

create index if not exists idx_bookings_room_stay
  on banla.bookings (room_code, check_in, check_out)
  where booking_status in ('pending', 'confirmed');
create index if not exists idx_bookings_phone on banla.bookings (guest_phone);
create index if not exists idx_bookings_created on banla.bookings (created_at desc);
create index if not exists idx_bookings_status on banla.bookings (booking_status, payment_status);

-- =============================================================================
-- 3. SỔ CÁI GIAO DỊCH (`banla.transactions`)
-- =============================================================================
create table if not exists banla.transactions (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references banla.bookings (id) on delete restrict,
  reference_code  text not null,
  gateway_txn_id  text not null unique check (char_length(gateway_txn_id) between 3 and 128),
  amount          bigint not null check (amount > 0),
  bank_code       text not null default 'MB' check (char_length(bank_code) <= 30),
  source          text not null default 'manual' check (source in ('manual', 'webhook')),
  recorded_by     text,
  raw_payload     jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_transactions_booking on banla.transactions (booking_id);

-- =============================================================================
-- 4. PHIÊN VIETQR & KHÓA SMART-LOCK (`banla.payment_sessions`, `banla.smartlock_access`)
-- =============================================================================
create table if not exists banla.payment_sessions (
  session_id        text primary key check (char_length(session_id) between 6 and 80),
  booking_id        uuid references banla.bookings (id) on delete cascade,
  booking_code      text not null,
  room_code         text not null references banla.rooms (code),
  customer_name     text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_contact  text not null default '',
  gross_amount      bigint not null check (gross_amount > 0),
  fee_amount        bigint not null default 0 check (fee_amount >= 0),
  net_amount        bigint not null check (net_amount >= 0),
  currency          text not null default 'VND' check (currency = 'VND'),
  memo              text not null unique,
  bank_code         text not null default 'MB',
  account_number    text not null default '0352554863',
  vietqr_url        text,
  lock_status       text not null default 'LOCKED'
                      check (lock_status in ('LOCKED', 'COMPLETED', 'EXPIRED', 'CANCELLED')),
  expires_at        timestamptz not null,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_banla_payment_sessions_booking
  on banla.payment_sessions (booking_code, created_at desc);

create table if not exists banla.smartlock_access (
  access_id         uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references banla.bookings (id) on delete cascade,
  booking_code      text not null,
  room_code         text not null references banla.rooms (code),
  pin_code          text not null check (pin_code ~ '^[0-9]{6}$'),
  valid_from        timestamptz not null,
  valid_until       timestamptz not null,
  is_active         boolean not null default true,
  issued_by         text not null default 'system',
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint smartlock_validity_window check (valid_until > valid_from)
);

-- =============================================================================
-- 5. THẺ QUỐC TẾ VISA / ONEPAY VPC v2 (`banla.payment_intents`, `banla.payment_events`)
-- =============================================================================
create table if not exists banla.payment_intents (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references banla.bookings (id) on delete restrict,
  booking_code      text not null,
  provider          text not null default 'ONEPAY' check (provider in ('ONEPAY', 'VIETQR', 'MANUAL')),
  method            text not null default 'CARD' check (method in ('CARD', 'VIETQR', 'BANK_TRANSFER')),
  payment_option    text not null default 'deposit_50' check (payment_option in ('deposit_50', 'pay_100')),
  amount_vnd        bigint not null check (amount_vnd > 0),
  currency          char(3) not null default 'VND',
  status            text not null default 'PENDING'
                      check (status in ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  idempotency_key   text not null unique check (char_length(idempotency_key) between 4 and 160),
  merchant_txn_ref  text not null unique check (char_length(merchant_txn_ref) between 4 and 64),
  provider_txn_id   text,
  failure_reason    text,
  raw_request       jsonb,
  raw_response      jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_payment_intents_booking
  on banla.payment_intents (booking_id);
create index if not exists idx_payment_intents_booking_code
  on banla.payment_intents (booking_code, created_at desc);
create index if not exists idx_payment_intents_status
  on banla.payment_intents (status, created_at desc);

create table if not exists banla.payment_events (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid references banla.payment_intents (id) on delete set null,
  booking_id         uuid references banla.bookings (id) on delete set null,
  booking_code       text,
  event_type         text not null check (char_length(event_type) between 2 and 64),
  provider_event_id  text unique,
  signature_valid    boolean not null default false,
  amount_match       boolean not null default false,
  payload            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_payment_events_payment
  on banla.payment_events (payment_id, created_at desc);

-- =============================================================================
-- 6. BẬT RLS TRÊN TOÀN BỘ 7 BẢNG TRONG `banla` (ZERO ANON DIRECT TABLE ACCESS)
-- =============================================================================
alter table banla.rooms enable row level security;
alter table banla.bookings enable row level security;
alter table banla.transactions enable row level security;
alter table banla.payment_sessions enable row level security;
alter table banla.smartlock_access enable row level security;
alter table banla.payment_intents enable row level security;
alter table banla.payment_events enable row level security;

revoke all on all tables in schema banla from public, anon, authenticated;
grant select, insert, update on
  banla.rooms,
  banla.bookings,
  banla.transactions,
  banla.payment_sessions,
  banla.smartlock_access,
  banla.payment_intents,
  banla.payment_events
to service_role;

-- =============================================================================
-- 7. TRIGGERS & HÀM TIỆN ÍCH NỘI BỘ
-- =============================================================================
create or replace function banla.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_touch on banla.bookings;
create trigger trg_bookings_touch before update on banla.bookings
  for each row execute function banla.touch_updated_at();

drop trigger if exists trg_payment_sessions_touch on banla.payment_sessions;
create trigger trg_payment_sessions_touch before update on banla.payment_sessions
  for each row execute function banla.touch_updated_at();

drop trigger if exists trg_payment_intents_touch on banla.payment_intents;
create trigger trg_payment_intents_touch before update on banla.payment_intents
  for each row execute function banla.touch_updated_at();

create or replace function banla.normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '');
$$;

-- =============================================================================
-- 8. HÀM CÔNG KHAI CHO TRÌNH DUYỆT (`anon` / `authenticated`)
-- =============================================================================

-- 8.1. Kiểm tra phòng trống & bảng giá thực tế theo ngày
create or replace function public.banla_list_rooms_availability(
  p_check_in  date default null,
  p_check_out date default null,
  p_guests    integer default 1
)
returns table (
  code            text,
  name            text,
  unit_price      bigint,
  max_guests      integer,
  inventory       integer,
  available_units integer,
  is_available    boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with occupied as (
    select b.room_code, count(*)::integer as taken
    from banla.bookings b
    where p_check_in is not null
      and p_check_out is not null
      and p_check_out > p_check_in
      and b.booking_status in ('pending', 'confirmed')
      and b.check_in < p_check_out
      and b.check_out > p_check_in
      and (b.payment_status = 'paid' or b.booking_status = 'confirmed' or b.hold_expires_at > now())
    group by b.room_code
  )
  select
    r.code,
    r.name,
    r.unit_price,
    r.max_guests,
    r.inventory,
    greatest(0, r.inventory - coalesce(o.taken, 0)) as available_units,
    (greatest(0, r.inventory - coalesce(o.taken, 0)) > 0 and r.max_guests >= greatest(1, coalesce(p_guests, 1))) as is_available
  from banla.rooms r
  left join occupied o on o.room_code = r.code
  where r.active = true
  order by r.unit_price asc;
$$;

-- 8.2. Tạo đơn đặt phòng an toàn (giá do CSDL tính, khóa chống đặt trùng phòng)
create or replace function public.banla_create_booking(
  p_guest_name     text,
  p_guest_phone    text,
  p_guest_email    text,
  p_room_code      text,
  p_check_in       date,
  p_check_out      date,
  p_guests         integer,
  p_payment_option text,
  p_note           text default '',
  p_payment_method text default 'vietqr'
)
returns table (
  booking_code          text,
  room_name             text,
  nights                integer,
  total_amount          bigint,
  discount_amount       bigint,
  amount_due            bigint,
  remaining_at_checkin  bigint,
  hold_expires_at       timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room      banla.rooms%rowtype;
  v_phone     text := banla.normalize_phone(p_guest_phone);
  v_today     date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_method    text := case when lower(coalesce(p_payment_method, '')) in ('visa', 'card', 'onepay') then 'visa' else 'vietqr' end;
  v_nights    integer;
  v_total     bigint;
  v_discount  bigint;
  v_due       bigint;
  v_taken     integer;
  v_code      text;
  v_hold      timestamptz := now() + interval '2 hours';
  v_attempt   integer := 0;
begin
  if p_guest_name is null or char_length(btrim(p_guest_name)) not between 2 and 100 then
    raise exception 'Họ tên không hợp lệ.' using errcode = '22023';
  end if;
  if v_phone is null or char_length(v_phone) not between 8 and 15 then
    raise exception 'Số điện thoại không hợp lệ.' using errcode = '22023';
  end if;
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'Ngày trả phòng phải sau ngày nhận phòng.' using errcode = '22023';
  end if;
  if p_check_in < v_today then
    raise exception 'Ngày nhận phòng đã qua.' using errcode = '22023';
  end if;
  if p_check_in > v_today + 365 then
    raise exception 'Chỉ nhận đặt trước tối đa 365 ngày.' using errcode = '22023';
  end if;
  v_nights := p_check_out - p_check_in;
  if v_nights > 30 then
    raise exception 'Mỗi đơn tối đa 30 đêm.' using errcode = '22023';
  end if;
  if p_payment_option is null or p_payment_option not in ('deposit_50', 'pay_100') then
    raise exception 'Phương thức thanh toán không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_room from banla.rooms r where r.code = lower(btrim(p_room_code)) and r.active;
  if not found then
    raise exception 'Hạng phòng không tồn tại.' using errcode = '22023';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > v_room.max_guests then
    raise exception 'Số khách vượt sức chứa của hạng phòng (tối đa %).', v_room.max_guests using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('banla_room:' || v_room.code));
  select count(*) into v_taken
  from banla.bookings b
  where b.room_code = v_room.code
    and b.booking_status in ('pending', 'confirmed')
    and b.check_in < p_check_out
    and b.check_out > p_check_in
    and (b.payment_status = 'paid' or b.booking_status = 'confirmed' or b.hold_expires_at > now());
  if v_taken >= v_room.inventory then
    raise exception 'Hạng phòng % đã hết phòng trong khoảng ngày này.', v_room.name using errcode = 'P0001';
  end if;

  v_total := v_room.unit_price * v_nights;
  if p_payment_option = 'pay_100' then
    v_discount := round(v_total * 0.10)::bigint;
    v_due := v_total - v_discount;
  else
    v_discount := 0;
    v_due := round(v_total * 0.5)::bigint;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := 'BL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into banla.bookings (
        booking_code, guest_name, guest_phone, guest_email, room_code, guests,
        check_in, check_out, unit_price, total_amount, payment_option, payment_method,
        discount_amount, amount_due, note, hold_expires_at
      ) values (
        v_code, btrim(p_guest_name), v_phone, nullif(btrim(coalesce(p_guest_email, '')), ''),
        v_room.code, p_guests, p_check_in, p_check_out, v_room.unit_price, v_total,
        p_payment_option, v_method, v_discount, v_due, left(coalesce(p_note, ''), 1000), v_hold
      );
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;

  return query select
    v_code, v_room.name, v_nights, v_total, v_discount, v_due,
    (v_total - v_discount - v_due), v_hold;
end;
$$;

-- 8.3. Tra cứu trạng thái đơn bằng Mã Đơn + Số Điện Thoại (chống IDOR)
create or replace function public.banla_booking_status(
  p_booking_code text,
  p_guest_phone  text
)
returns table (
  booking_code     text,
  guest_name       text,
  room_name        text,
  check_in         date,
  check_out        date,
  nights           integer,
  guests           integer,
  payment_option   text,
  payment_method   text,
  total_amount     bigint,
  discount_amount  bigint,
  amount_due       bigint,
  paid_amount      bigint,
  remaining_amount bigint,
  payment_status   text,
  booking_status   text,
  smartlock_pin    text,
  paid_at          timestamptz,
  approved_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.booking_code, b.guest_name, r.name, b.check_in, b.check_out, b.nights, b.guests,
    b.payment_option, b.payment_method, b.total_amount, b.discount_amount, b.amount_due, b.paid_amount,
    (b.total_amount - b.discount_amount - b.paid_amount),
    b.payment_status, b.booking_status,
    case when b.payment_status = 'paid' and b.booking_status in ('confirmed', 'completed')
         then b.smartlock_pin end,
    b.paid_at, b.approved_at
  from banla.bookings b
  join banla.rooms r on r.code = b.room_code
  where b.booking_code = upper(btrim(p_booking_code))
    and b.guest_phone = banla.normalize_phone(p_guest_phone)
  limit 1;
$$;

-- =============================================================================
-- 9. HÀM NỘI BỘ CHỈ DÀNH CHO `service_role`
-- =============================================================================
create or replace function banla.record_payment(
  p_booking_code   text,
  p_amount         bigint,
  p_gateway_txn_id text,
  p_bank_code      text default 'MB',
  p_source         text default 'manual',
  p_recorded_by    text default null,
  p_raw_payload    jsonb default null
)
returns banla.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_b         banla.bookings%rowtype;
  v_existing  banla.transactions%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Số tiền phải lớn hơn 0.' using errcode = '22023';
  end if;

  select * into v_b from banla.bookings where booking_code = upper(btrim(p_booking_code)) for update;
  if not found then
    raise exception 'Không tìm thấy đơn %.', p_booking_code using errcode = 'P0002';
  end if;

  select * into v_existing from banla.transactions where gateway_txn_id = p_gateway_txn_id;
  if found then
    if v_existing.booking_id <> v_b.id then
      raise exception 'Mã giao dịch % đã được ghi cho đơn khác.', p_gateway_txn_id using errcode = '23505';
    end if;
    return v_b;
  end if;

  if v_b.booking_status = 'cancelled' or v_b.payment_status = 'refunded' then
    raise exception 'Đơn đã hủy/hoàn tiền, không ghi nhận thêm.' using errcode = 'P0001';
  end if;
  if v_b.paid_amount + p_amount > v_b.total_amount - v_b.discount_amount then
    raise exception 'Số tiền vượt tổng giá trị đơn (% ₫).', v_b.total_amount - v_b.discount_amount using errcode = '22023';
  end if;

  insert into banla.transactions (booking_id, reference_code, gateway_txn_id, amount, bank_code, source, recorded_by, raw_payload)
  values (v_b.id, 'BANLA_' || v_b.booking_code, p_gateway_txn_id, p_amount,
          coalesce(nullif(p_bank_code, ''), 'MB'), p_source, p_recorded_by, p_raw_payload);

  update banla.bookings
  set paid_amount = paid_amount + p_amount,
      payment_status = case when paid_amount + p_amount >= amount_due then 'paid' else payment_status end,
      paid_at = case when paid_amount + p_amount >= amount_due and paid_at is null then now() else paid_at end,
      hold_expires_at = null
  where id = v_b.id
  returning * into v_b;

  return v_b;
end;
$$;

create or replace function banla.approve_booking(
  p_booking_code text,
  p_pin          text,
  p_approved_by  text
)
returns banla.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_b banla.bookings%rowtype;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Mã PIN phải gồm đúng 6 chữ số.' using errcode = '22023';
  end if;
  if p_approved_by is null or btrim(p_approved_by) = '' then
    raise exception 'Thiếu người duyệt.' using errcode = '22023';
  end if;

  select * into v_b from banla.bookings where booking_code = upper(btrim(p_booking_code)) for update;
  if not found then
    raise exception 'Không tìm thấy đơn %.', p_booking_code using errcode = 'P0002';
  end if;
  if v_b.booking_status = 'cancelled' then
    raise exception 'Đơn đã hủy.' using errcode = 'P0001';
  end if;
  if v_b.payment_status <> 'paid' or v_b.paid_amount < v_b.amount_due then
    raise exception 'Chưa nhận đủ tiền: đã nhận % ₫ / cần % ₫.', v_b.paid_amount, v_b.amount_due using errcode = 'P0001';
  end if;

  update banla.bookings
  set booking_status = 'confirmed',
      smartlock_pin = p_pin,
      approved_at = now(),
      approved_by = btrim(p_approved_by)
  where id = v_b.id
  returning * into v_b;

  insert into banla.smartlock_access (
    booking_id, booking_code, room_code, pin_code,
    valid_from, valid_until, is_active, issued_by
  ) values (
    v_b.id,
    v_b.booking_code,
    v_b.room_code,
    p_pin,
    (v_b.check_in::text || ' 14:00:00+07')::timestamptz,
    (v_b.check_out::text || ' 12:00:00+07')::timestamptz,
    true,
    btrim(p_approved_by)
  );

  return v_b;
end;
$$;

create or replace function banla.cancel_booking(
  p_booking_code text,
  p_reason       text default ''
)
returns banla.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_b banla.bookings%rowtype;
begin
  update banla.bookings
  set booking_status = 'cancelled',
      smartlock_pin = null,
      hold_expires_at = null,
      note = left(note || case when coalesce(p_reason, '') <> '' then E'\n[Hủy] ' || p_reason else '' end, 1000)
  where booking_code = upper(btrim(p_booking_code))
  returning * into v_b;
  if not found then
    raise exception 'Không tìm thấy đơn %.', p_booking_code using errcode = 'P0002';
  end if;

  update banla.smartlock_access
  set is_active = false, revoked_at = now()
  where booking_id = v_b.id and is_active = true;

  return v_b;
end;
$$;

create or replace function banla.confirm_onepay_payment(
  p_merchant_txn_ref text,
  p_provider_txn_id  text,
  p_amount_vnd       bigint,
  p_pin              text,
  p_raw_payload      jsonb default '{}'::jsonb
)
returns banla.bookings
language plpgsql
set search_path = ''
as $$
declare
  v_pi      banla.payment_intents%rowtype;
  v_b       banla.bookings%rowtype;
  v_gw_id   text;
begin
  if p_merchant_txn_ref is null or btrim(p_merchant_txn_ref) = '' then
    raise exception 'Thiếu vpc_MerchTxnRef.' using errcode = '22023';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Mã Smart-Lock PIN phải gồm đúng 6 chữ số.' using errcode = '22023';
  end if;

  select * into v_pi
  from banla.payment_intents
  where merchant_txn_ref = btrim(p_merchant_txn_ref)
  for update;

  if not found then
    raise exception 'Không tìm thấy phiên thanh toán %.', p_merchant_txn_ref using errcode = 'P0002';
  end if;

  if v_pi.amount_vnd <> p_amount_vnd then
    update banla.payment_intents
    set status = case when status = 'PAID' then 'PAID' else 'FAILED' end,
        raw_response = p_raw_payload
    where id = v_pi.id;
    raise exception 'Sai lệch số tiền IPN: kỳ vọng % ₫, nhận % ₫.', v_pi.amount_vnd, p_amount_vnd using errcode = '22023';
  end if;

  if v_pi.status = 'PAID' then
    select * into v_b from banla.bookings where id = v_pi.booking_id;
    return v_b;
  end if;

  v_gw_id := coalesce(nullif(btrim(p_provider_txn_id), ''), 'ONEPAY_' || v_pi.merchant_txn_ref);

  v_b := banla.record_payment(
    v_pi.booking_code,
    p_amount_vnd,
    v_gw_id,
    'ONEPAY',
    'webhook',
    'onepay_ipn',
    p_raw_payload
  );

  if v_b.smartlock_pin is null then
    v_b := banla.approve_booking(v_pi.booking_code, p_pin, 'onepay_ipn');
  end if;

  update banla.bookings
  set payment_method = 'visa'
  where id = v_b.id
  returning * into v_b;

  update banla.payment_intents
  set status = 'PAID',
      provider_txn_id = nullif(btrim(coalesce(p_provider_txn_id, '')), ''),
      raw_response = p_raw_payload
  where id = v_pi.id;

  insert into banla.payment_events (
    payment_id, booking_id, booking_code, event_type, provider_event_id,
    signature_valid, amount_match, payload
  ) values (
    v_pi.id, v_pi.booking_id, v_pi.booking_code, 'ONEPAY_IPN', nullif(btrim(coalesce(p_provider_txn_id, '')), ''),
    true, true, coalesce(p_raw_payload, '{}'::jsonb)
  )
  on conflict (provider_event_id) do nothing;

  return v_b;
end;
$$;

-- =============================================================================
-- 10. PHÂN QUYỀN GỌI HÀM CHẶT CHẼ
-- =============================================================================
revoke all on function public.banla_list_rooms_availability(date, date, integer) from public;
revoke all on function public.banla_create_booking(text, text, text, text, date, date, integer, text, text, text) from public;
revoke all on function public.banla_booking_status(text, text) from public;
revoke all on all functions in schema banla from public, anon, authenticated;

grant execute on function public.banla_list_rooms_availability(date, date, integer) to anon, authenticated, service_role;
grant execute on function public.banla_create_booking(text, text, text, text, date, date, integer, text, text, text) to anon, authenticated, service_role;
grant execute on function public.banla_booking_status(text, text) to anon, authenticated, service_role;

grant execute on function banla.record_payment(text, bigint, text, text, text, text, jsonb) to service_role;
grant execute on function banla.approve_booking(text, text, text) to service_role;
grant execute on function banla.cancel_booking(text, text) to service_role;
grant execute on function banla.confirm_onepay_payment(text, text, bigint, text, jsonb) to service_role;
grant execute on function banla.normalize_phone(text) to service_role;

commit;
