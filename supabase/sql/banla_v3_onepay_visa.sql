-- =============================================================================
-- BANLA BOUTIQUE HOTEL — SUPABASE MIGRATION v3: VISA / ONEPAY HOSTED CHECKOUT
-- =============================================================================
-- CHƯA ĐƯỢC CHẠY tự động lên Supabase Production. Chỉ thực thi sau khi chủ dự án duyệt.
-- Phạm vi cô lập: CHỈ thao tác trên schema `banla` (TUYỆT ĐỐI không đụng các bảng `public`
-- dùng chung của dự án `webmoi`).
--
-- Yêu cầu tiên quyết: Đã chạy `supabase/sql/banla_schema_v2.sql`.
-- Tuân thủ PCI DSS: KHÔNG có bất kỳ cột nào lưu số thẻ (PAN), CVV, ngày hết hạn hay OTP.
-- =============================================================================

begin;

-- 0. Kiểm tra schema v2 đã tồn tại
do $$
begin
  if to_regclass('banla.bookings') is null or to_regclass('banla.transactions') is null then
    raise exception 'Chưa tìm thấy bảng banla.bookings / banla.transactions của v2. Hãy chạy banla_schema_v2.sql trước.';
  end if;
end $$;

-- 1. Bổ sung cột phương thức thanh toán trên banla.bookings (mặc định 'vietqr' tương thích ngược)
alter table banla.bookings
  add column if not exists payment_method text not null default 'vietqr'
    check (payment_method in ('vietqr', 'visa', 'bank_transfer'));

-- 2. Bảng phiên thanh toán cổng OnePay / VietQR (tương ứng bảng `payments` chuẩn OnePay)
create table if not exists banla.payment_intents (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references banla.bookings (id) on delete restrict,
  booking_code      text not null,
  provider          text not null default 'ONEPAY' check (provider in ('ONEPAY', 'VIETQR', 'MANUAL')),
  method            text not null check (method in ('CARD', 'VIETQR', 'BANK_TRANSFER')),
  payment_option    text not null default 'deposit_50' check (payment_option in ('deposit_50', 'pay_100')),
  amount_vnd        bigint not null check (amount_vnd > 0),
  currency          char(3) not null default 'VND',
  status            text not null default 'PENDING'
                      check (status in ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED')),
  idempotency_key   text not null unique check (char_length(idempotency_key) between 4 and 128),
  merchant_txn_ref  text not null unique check (char_length(merchant_txn_ref) between 6 and 64),
  provider_txn_id   text,
  raw_request       jsonb,
  raw_response      jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_payment_intents_booking
  on banla.payment_intents (booking_id);
create index if not exists idx_payment_intents_status
  on banla.payment_intents (status, created_at desc);
create index if not exists idx_payment_intents_provider_txn
  on banla.payment_intents (provider_txn_id)
  where provider_txn_id is not null;

drop trigger if exists trg_payment_intents_touch on banla.payment_intents;
create trigger trg_payment_intents_touch
  before update on banla.payment_intents
  for each row execute function banla.touch_updated_at();

-- 3. Bảng nhật ký sự kiện thanh toán & kiểm toán chữ ký IPN/Webhook (`payment_events`)
create table if not exists banla.payment_events (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid references banla.payment_intents (id) on delete set null,
  booking_id         uuid references banla.bookings (id) on delete set null,
  event_type         text not null check (char_length(event_type) between 2 and 64),
  provider_event_id  text unique,
  signature_valid    boolean not null default false,
  amount_match       boolean not null default false,
  payload            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists idx_payment_events_payment
  on banla.payment_events (payment_id, created_at desc);

-- 4. Khóa chặt RLS: anon / authenticated KHÔNG có quyền truy cập trực tiếp
alter table banla.payment_intents enable row level security;
alter table banla.payment_events enable row level security;

revoke all on table banla.payment_intents, banla.payment_events from public, anon, authenticated;
grant select, insert, update on table banla.payment_intents, banla.payment_events to service_role;

-- 5. Hàm nội bộ (chỉ service_role): Xác nhận IPN OnePay nguyên tử (Transaction-safe & Idempotent)
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

  -- Idempotency: nếu đã PAID từ lần gọi IPN trước, trả về ngay bản ghi booking hiện tại
  if v_pi.status = 'PAID' then
    select * into v_b from banla.bookings where id = v_pi.booking_id;
    return v_b;
  end if;

  v_gw_id := coalesce(nullif(btrim(p_provider_txn_id), ''), 'ONEPAY_' || v_pi.merchant_txn_ref);

  -- Ghi vào banla.transactions + cộng paid_amount trên banla.bookings
  v_b := banla.record_payment(
    v_pi.booking_code,
    p_amount_vnd,
    v_gw_id,
    'ONEPAY',
    'webhook',
    'onepay_ipn',
    p_raw_payload
  );

  -- Nếu chưa có PIN thì duyệt đơn và cấp PIN 6 số
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
    payment_id, booking_id, event_type, provider_event_id,
    signature_valid, amount_match, payload
  ) values (
    v_pi.id, v_pi.booking_id, 'ONEPAY_IPN', nullif(btrim(coalesce(p_provider_txn_id, '')), ''),
    true, true, coalesce(p_raw_payload, '{}'::jsonb)
  )
  on conflict (provider_event_id) do nothing;

  return v_b;
end;
$$;

revoke all on function banla.confirm_onepay_payment(text, text, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function banla.confirm_onepay_payment(text, text, bigint, text, jsonb) to service_role;

commit;

-- =============================================================================
-- ROLLBACK PLAN (CHỈ CHẠY KHI CẦN HOÀN TÁC PHẦN MỞ RỘNG v3)
-- =============================================================================
-- begin;
-- drop function if exists banla.confirm_onepay_payment(text, text, bigint, text, jsonb);
-- drop table if exists banla.payment_events;
-- drop table if exists banla.payment_intents;
-- alter table banla.bookings drop column if exists payment_method;
-- commit;

