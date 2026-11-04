-- =============================================================================
-- BANLA BOUTIQUE HOTEL — SUPABASE SCHEMA v2 (bản an toàn, thay cho supabase_schema.sql)
-- =============================================================================
-- CHƯA ĐƯỢC CHẠY lên Supabase. Đọc kỹ phần "CÁCH CHẠY" ở cuối file trước khi dùng.
-- Đã kiểm thử tự động bằng Postgres thật (PGlite): test/schema_v2.test.js
--
-- Mô hình quyền:
--   anon / authenticated (trình duyệt, publishable key):
--       • KHÔNG đọc/ghi trực tiếp bất kỳ bảng nào.
--       • Chỉ gọi được 2 hàm công khai:
--           public.banla_create_booking(...)  — tạo đơn, giá do CSDL tự tính
--           public.banla_booking_status(...)  — tra đơn bằng MÃ ĐƠN + SỐ ĐIỆN THOẠI
--   service_role (chỉ server Node, khóa nằm trong .env, KHÔNG BAO GIỜ đưa xuống trình duyệt):
--       • Đọc toàn bộ bảng; gọi banla.record_payment / banla.approve_booking / banla.cancel_booking.
--
-- Khắc phục: D2, D3, D7, D8, D9, D10, D11, D12, D13 (docs/database_audit.md) và G4, G5.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Chặn chạy đè lên dữ liệu cũ + gỡ các hàm nguy hiểm của bản v1
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('banla.bookings') is not null
     and not exists (
       select 1 from information_schema.columns
       where table_schema = 'banla' and table_name = 'bookings' and column_name = 'amount_due'
     ) then
    raise exception 'Đã có bảng banla.bookings kiểu cũ (v1). Hãy sao lưu và chuyển dữ liệu trước, rồi mới chạy schema v2.';
  end if;
end $$;

-- Hàm v1: SECURITY DEFINER trong public, cấp cho anon → ai cũng tự duyệt đơn được (D3).
drop function if exists public.banla_list_bookings();
drop function if exists public.banla_approve_booking(uuid, varchar, boolean, varchar);
drop function if exists public.banla_update_booking(uuid, varchar, varchar, numeric, numeric, varchar, text);
drop function if exists public.banla_create_booking(varchar, text, varchar, text, varchar, integer, timestamptz, timestamptz, numeric, text);

create schema if not exists banla;
revoke all on schema banla from public;
revoke all on schema banla from anon, authenticated;
grant usage on schema banla to service_role;

-- -----------------------------------------------------------------------------
-- 1. Hạng phòng (nguồn giá duy nhất)
-- -----------------------------------------------------------------------------
create table if not exists banla.rooms (
  code        text primary key check (code ~ '^[a-z0-9_-]{2,32}$'),
  name        text not null unique check (char_length(name) between 2 and 100),
  unit_price  bigint not null check (unit_price > 0),           -- VND / đêm
  max_guests  integer not null check (max_guests between 1 and 20),
  inventory   integer not null default 1 check (inventory >= 0), -- số phòng vật lý của hạng này
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ⚠ inventory = 1 cho mỗi hạng là GIẢ ĐỊNH. Chủ khách sạn cần sửa đúng số phòng thực tế.
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

-- -----------------------------------------------------------------------------
-- 2. Đơn đặt phòng
-- -----------------------------------------------------------------------------
create table if not exists banla.bookings (
  id               uuid primary key default gen_random_uuid(),
  booking_code     text not null unique check (booking_code ~ '^BL[0-9A-Z]{6}$'),
  guest_name       text not null check (char_length(btrim(guest_name)) between 2 and 100),
  guest_phone      text not null check (guest_phone ~ '^[0-9]{8,15}$'),  -- chỉ chữ số, đã chuẩn hóa
  guest_email      text check (guest_email is null or guest_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  room_code        text not null references banla.rooms (code),
  guests           integer not null check (guests between 1 and 20),
  check_in         date not null,
  check_out        date not null,
  nights           integer generated always as (check_out - check_in) stored,
  unit_price       bigint not null check (unit_price > 0),
  total_amount     bigint not null check (total_amount > 0),
  payment_option   text not null check (payment_option in ('deposit_50', 'pay_100')),
  discount_amount  bigint not null default 0 check (discount_amount >= 0),
  amount_due       bigint not null check (amount_due > 0),   -- số tiền phải chuyển trước (50% hoặc 90%)
  paid_amount      bigint not null default 0 check (paid_amount >= 0),
  payment_status   text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  booking_status   text not null default 'pending' check (booking_status in ('pending', 'confirmed', 'completed', 'cancelled')),
  smartlock_pin    text check (smartlock_pin ~ '^[0-9]{6}$'),
  source           text not null default 'direct' check (source in ('direct', 'ota', 'admin')),
  note             text not null default '' check (char_length(note) <= 1000),
  hold_expires_at  timestamptz,                               -- giữ phòng tạm cho đơn chưa thanh toán
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
  -- PIN chỉ tồn tại khi đã nhận đủ tiền và đơn đã duyệt (khóa lỗi "chưa trả đã có PIN")
  constraint bookings_pin_requires_paid check (
    smartlock_pin is null
    or (payment_status = 'paid' and booking_status in ('confirmed', 'completed'))
  )
);

create index if not exists idx_bookings_room_stay
  on banla.bookings (room_code, check_in, check_out)
  where booking_status in ('pending', 'confirmed');
create index if not exists idx_bookings_phone on banla.bookings (guest_phone);
create index if not exists idx_bookings_created on banla.bookings (created_at desc);
create index if not exists idx_bookings_status on banla.bookings (booking_status, payment_status);

-- -----------------------------------------------------------------------------
-- 3. Giao dịch (mỗi lần tiền về là 1 dòng, chống ghi trùng)
-- -----------------------------------------------------------------------------
create table if not exists banla.transactions (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references banla.bookings (id) on delete restrict,
  reference_code  text not null,                       -- BANLA_<booking_code>
  gateway_txn_id  text not null unique check (char_length(gateway_txn_id) between 3 and 128),
  amount          bigint not null check (amount > 0),
  bank_code       text not null default 'MB' check (char_length(bank_code) <= 30),
  source          text not null default 'manual' check (source in ('manual', 'webhook')),
  recorded_by     text,
  raw_payload     jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_transactions_booking on banla.transactions (booking_id);

-- -----------------------------------------------------------------------------
-- 4. Quyền: bật RLS, KHÔNG có policy nào cho anon/authenticated
-- -----------------------------------------------------------------------------
alter table banla.rooms enable row level security;
alter table banla.bookings enable row level security;
alter table banla.transactions enable row level security;

revoke all on all tables in schema banla from public, anon, authenticated;
grant select, insert, update on banla.rooms, banla.bookings, banla.transactions to service_role;

-- -----------------------------------------------------------------------------
-- 5. Trigger cập nhật updated_at
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 6. Hàm nội bộ dùng chung
-- -----------------------------------------------------------------------------
create or replace function banla.normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '');
$$;

-- -----------------------------------------------------------------------------
-- 7. HÀM CÔNG KHAI #1 — Tạo đơn (anon được gọi)
--    Giá, giảm giá, số tiền phải trả đều do CSDL tính, không tin số liệu từ trình duyệt.
-- -----------------------------------------------------------------------------
create or replace function public.banla_create_booking(
  p_guest_name     text,
  p_guest_phone    text,
  p_guest_email    text,
  p_room_code      text,
  p_check_in       date,
  p_check_out      date,
  p_guests         integer,
  p_payment_option text,
  p_note           text default ''
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
  v_nights    integer;
  v_total     bigint;
  v_discount  bigint;
  v_due       bigint;
  v_taken     integer;
  v_code      text;
  v_hold      timestamptz := now() + interval '2 hours';
  v_attempt   integer := 0;
begin
  -- Kiểm tra dữ liệu đầu vào
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

  select * into v_room from banla.rooms r where r.code = p_room_code and r.active;
  if not found then
    raise exception 'Hạng phòng không tồn tại.' using errcode = '22023';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > v_room.max_guests then
    raise exception 'Số khách vượt sức chứa của hạng phòng (tối đa %).', v_room.max_guests using errcode = '22023';
  end if;

  -- Chống đặt trùng: khóa theo hạng phòng trong transaction rồi đếm số phòng đã bị chiếm
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

  -- Tính tiền (khớp công thức trên website)
  v_total := v_room.unit_price * v_nights;
  if p_payment_option = 'pay_100' then
    v_discount := round(v_total * 0.10)::bigint;
    v_due := v_total - v_discount;
  else
    v_discount := 0;
    v_due := round(v_total * 0.5)::bigint;
  end if;

  -- Sinh mã đơn ngẫu nhiên, thử lại nếu trùng
  loop
    v_attempt := v_attempt + 1;
    v_code := 'BL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into banla.bookings (
        booking_code, guest_name, guest_phone, guest_email, room_code, guests,
        check_in, check_out, unit_price, total_amount, payment_option,
        discount_amount, amount_due, note, hold_expires_at
      ) values (
        v_code, btrim(p_guest_name), v_phone, nullif(btrim(coalesce(p_guest_email, '')), ''),
        v_room.code, p_guests, p_check_in, p_check_out, v_room.unit_price, v_total,
        p_payment_option, v_discount, v_due, left(coalesce(p_note, ''), 1000), v_hold
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

-- -----------------------------------------------------------------------------
-- 8. HÀM CÔNG KHAI #2 — Tra đơn bằng MÃ ĐƠN + SỐ ĐIỆN THOẠI (anon được gọi)
--    Sai một trong hai → không trả dòng nào (không lộ đơn có tồn tại hay không).
--    Mã PIN chỉ trả về khi đã nhận đủ tiền và lễ tân đã duyệt.
-- -----------------------------------------------------------------------------
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
    b.payment_option, b.total_amount, b.discount_amount, b.amount_due, b.paid_amount,
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

-- -----------------------------------------------------------------------------
-- 9. HÀM NỘI BỘ (chỉ service_role) — Ghi nhận tiền về
--    Cộng dồn từng khoản; chỉ chuyển 'paid' khi đã đủ amount_due. Chống ghi trùng
--    theo gateway_txn_id (webhook ngân hàng gửi lại nhiều lần vẫn chỉ cộng 1 lần).
-- -----------------------------------------------------------------------------
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
    return v_b; -- đã ghi rồi: không cộng lần nữa
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

-- -----------------------------------------------------------------------------
-- 10. HÀM NỘI BỘ (chỉ service_role) — Duyệt đơn + cấp PIN
--     Từ chối nếu CHƯA nhận đủ số tiền phải trả (sửa lỗi G4: không còn tự ghi 100%).
--     PIN do server sinh bằng crypto.randomInt rồi truyền vào.
-- -----------------------------------------------------------------------------
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

  return v_b;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. HÀM NỘI BỘ (chỉ service_role) — Hủy đơn (giải phóng phòng, xóa PIN)
-- -----------------------------------------------------------------------------
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
  return v_b;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Cấp quyền gọi hàm (mặc định Postgres cho PUBLIC gọi mọi hàm → thu hồi hết trước)
-- -----------------------------------------------------------------------------
revoke all on function public.banla_create_booking(text, text, text, text, date, date, integer, text, text) from public;
revoke all on function public.banla_booking_status(text, text) from public;
revoke all on all functions in schema banla from public;

grant execute on function public.banla_create_booking(text, text, text, text, date, date, integer, text, text) to anon, authenticated, service_role;
grant execute on function public.banla_booking_status(text, text) to anon, authenticated, service_role;
grant execute on function banla.record_payment(text, bigint, text, text, text, text, jsonb) to service_role;
grant execute on function banla.approve_booking(text, text, text) to service_role;
grant execute on function banla.cancel_booking(text, text) to service_role;
grant execute on function banla.normalize_phone(text) to service_role;

commit;

-- =============================================================================
-- CÁCH CHẠY (chỉ khi chủ dự án đã đồng ý)
-- 1. Sửa banla.rooms.inventory đúng số phòng thực tế của từng hạng (mục 1).
-- 2. Supabase Dashboard → SQL Editor → dán toàn bộ file → Run.
-- 3. Settings → Data API → Exposed schemas: thêm "banla" (an toàn vì anon/authenticated
--    không có quyền gì trên schema này; chỉ service_role của server dùng được).
-- 4. Lấy khóa service_role (Settings → API Keys) và đặt vào .env của server:
--      SUPABASE_URL=...   SUPABASE_SERVICE_ROLE_KEY=...
--    TUYỆT ĐỐI không đưa khóa này vào HTML/JS hay commit lên GitHub.
-- 5. Chạy Supabase Advisors (Database → Advisors) và xử lý cảnh báo nếu có.
-- =============================================================================

