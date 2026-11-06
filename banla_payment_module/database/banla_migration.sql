-- =============================================================================
-- BANLA PAYMENT MODULE & SMART-LOCK ACCESS MIGRATION (ISOLATED IN SCHEMA `banla`)
-- Khắc phục triệt để lỗ hổng D6 & D12 (docs/database_audit.md):
--   1. Chuyển toàn bộ bảng khỏi `public` vào `schema: banla` (cách ly 100% với `webmoi`).
--   2. Đổi tiền tệ sang `BIGINT` (số nguyên VND, không dùng số thực/lẻ).
--   3. Chuẩn hóa cú pháp nội dung chuyển khoản `BANLA_<booking_code>` và mã PIN 6 chữ số.
--   4. Bật Row Level Security (RLS) nghiêm ngặt: khóa `anon`/`authenticated`, chỉ cấp cho `service_role`.
--   5. Xóa bỏ hoàn toàn dữ liệu mẫu giả trong CSDL.
-- Yêu cầu chạy sau `supabase/sql/banla_schema_v2.sql` (hoặc dùng bản gộp `supabase/sql/banla_production_master.sql`).
-- =============================================================================

begin;

do $$
begin
  if to_regclass('banla.bookings') is null then
    raise exception 'Chưa có bảng banla.bookings. Hãy chạy supabase/sql/banla_production_master.sql (hoặc banla_schema_v2.sql) trước.';
  end if;
end $$;

-- 1. Bảng quản lý phiên khóa giữ phòng VietQR 15 phút (`banla.payment_sessions`)
create table if not exists banla.payment_sessions (
  session_id        text primary key check (char_length(session_id) between 6 and 80),
  booking_id        uuid references banla.bookings (id) on delete cascade,
  booking_code      text not null check (booking_code ~ '^BL[0-9A-Z]{4,12}$'),
  room_code         text not null references banla.rooms (code),
  customer_name     text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_contact  text not null default '',
  gross_amount      bigint not null check (gross_amount > 0),
  fee_amount        bigint not null default 0 check (fee_amount >= 0),
  net_amount        bigint not null check (net_amount >= 0),
  currency          text not null default 'VND' check (currency = 'VND'),
  memo              text not null unique check (memo ~ '^BANLA_BL[0-9A-Z]{4,12}$'),
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

create index if not exists idx_banla_payment_sessions_active_lock
  on banla.payment_sessions (room_code, expires_at)
  where lock_status = 'LOCKED';

-- 2. Bảng quản lý lịch sử cấp & thu hồi mã khóa cửa thông minh 6 số (`banla.smartlock_access`)
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

create index if not exists idx_banla_smartlock_booking
  on banla.smartlock_access (booking_id)
  where is_active = true;

-- 3. Bật Row Level Security (RLS) & khóa quyền truy cập trực tiếp từ trình duyệt
alter table banla.payment_sessions enable row level security;
alter table banla.smartlock_access enable row level security;

revoke all on table banla.payment_sessions, banla.smartlock_access from public, anon, authenticated;
grant select, insert, update on table banla.payment_sessions, banla.smartlock_access to service_role;

drop trigger if exists trg_payment_sessions_touch on banla.payment_sessions;
create trigger trg_payment_sessions_touch
  before update on banla.payment_sessions
  for each row execute function banla.touch_updated_at();

commit;
