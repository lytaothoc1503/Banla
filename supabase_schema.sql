-- =============================================================================
-- ⛔ KHÔNG CHẠY FILE NÀY. Bản v1 có lỗ hổng nghiêm trọng (docs/database_audit.md D2, D3):
--    anon đọc/sửa/xóa được mọi đơn và tự gọi hàm duyệt đơn để lấy mã PIN.
--    Dùng bản thay thế đã kiểm thử: supabase/sql/banla_schema_v2.sql
-- =============================================================================
-- =============================================================================
-- BANLA BOUTIQUE HOTEL ĐÀ LẠT — SUPABASE DATABASE SCHEMA (ISOLATED)
-- Quy tắc: Toàn bộ bảng nằm trong schema `banla` để cách ly 100% với `webmoi`.
-- Hướng dẫn: Copy toàn bộ nội dung file này vào Supabase SQL Editor và bấm RUN.
-- =============================================================================

-- 1. Khởi tạo Schema riêng biệt `banla`
CREATE SCHEMA IF NOT EXISTS banla;

-- Cấp quyền truy cập schema `banla` cho các role API của Supabase
GRANT USAGE ON SCHEMA banla TO anon, authenticated, service_role;

-- Tự động thêm `banla` vào danh sách Exposed Schemas của PostgREST (nếu có quyền)
DO $$
BEGIN
  EXECUTE 'ALTER ROLE authenticator SET pgrst.db_schemas = ''public, storage, graphql_public, banla''';
  PERFORM pg_notify('pgrst', 'reload config');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Lưu ý: Nếu cần truy vấn trực tiếp schema banla qua REST, bạn có thể thêm "banla" vào Settings -> API -> Exposed schemas. Các hàm RPC banla_* bên dưới đã hoạt động sẵn 100%.';
END $$;

-- =============================================================================
-- 2. Bảng `banla.bookings` (Quản lý Đặt phòng & Smart-Lock PIN 6 số)
-- =============================================================================
CREATE TABLE IF NOT EXISTS banla.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(24) UNIQUE NOT NULL DEFAULT ('BL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  guest_name TEXT NOT NULL,
  guest_phone VARCHAR(30) NOT NULL,
  guest_email TEXT DEFAULT '',
  room_id VARCHAR(100) NOT NULL,
  guests INTEGER NOT NULL DEFAULT 2,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  booking_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (booking_status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  smartlock_pin VARCHAR(6) DEFAULT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banla_bookings_created_at ON banla.bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_banla_bookings_status ON banla.bookings (booking_status, payment_status);
CREATE INDEX IF NOT EXISTS idx_banla_bookings_code ON banla.bookings (booking_code);
CREATE INDEX IF NOT EXISTS idx_banla_bookings_phone ON banla.bookings (guest_phone);

-- =============================================================================
-- 3. Bảng `banla.transactions` (Đối soát giao dịch VietQR BANLA_xxxx)
-- =============================================================================
CREATE TABLE IF NOT EXISTS banla.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES banla.bookings(id) ON DELETE CASCADE,
  reference_code VARCHAR(64) NOT NULL, -- Cú pháp chuẩn: BANLA_xxxx
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bank_code VARCHAR(30) NOT NULL DEFAULT 'MB',
  status VARCHAR(20) NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_banla_transactions_booking_id ON banla.transactions (booking_id);
CREATE INDEX IF NOT EXISTS idx_banla_transactions_ref ON banla.transactions (reference_code);

-- =============================================================================
-- 4. Bật Row Level Security (RLS) & Cấp quyền cho `anon` / `authenticated`
-- =============================================================================
ALTER TABLE banla.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE banla.transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banla.bookings TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banla.transactions TO anon, authenticated, service_role;

-- Policies cho phép đọc/ghi đơn đặt phòng từ Web & Admin Dashboard của Banla
DROP POLICY IF EXISTS "banla_bookings_select_policy" ON banla.bookings;
CREATE POLICY "banla_bookings_select_policy"
  ON banla.bookings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "banla_bookings_insert_policy" ON banla.bookings;
CREATE POLICY "banla_bookings_insert_policy"
  ON banla.bookings FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "banla_bookings_update_policy" ON banla.bookings;
CREATE POLICY "banla_bookings_update_policy"
  ON banla.bookings FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "banla_transactions_select_policy" ON banla.transactions;
CREATE POLICY "banla_transactions_select_policy"
  ON banla.transactions FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "banla_transactions_insert_policy" ON banla.transactions;
CREATE POLICY "banla_transactions_insert_policy"
  ON banla.transactions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "banla_transactions_update_policy" ON banla.transactions;
CREATE POLICY "banla_transactions_update_policy"
  ON banla.transactions FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. Các hàm RPC Bridge (Prefix `banla_`) giúp gọi từ JS không cần chỉnh Exposed Schema
-- =============================================================================

-- 5.1. Lấy danh sách bookings kèm giao dịch mới nhất
CREATE OR REPLACE FUNCTION public.banla_list_bookings()
RETURNS SETOF banla.bookings
LANGUAGE sql
SECURITY DEFINER
SET search_path = banla, public
AS $$
  SELECT * FROM banla.bookings ORDER BY created_at DESC;
$$;

-- 5.2. Tạo đơn đặt phòng mới từ trang khách hoặc Admin
CREATE OR REPLACE FUNCTION public.banla_create_booking(
  p_booking_code VARCHAR DEFAULT NULL,
  p_guest_name TEXT DEFAULT 'Khách hàng',
  p_guest_phone VARCHAR DEFAULT '',
  p_guest_email TEXT DEFAULT '',
  p_room_id VARCHAR DEFAULT 'Deluxe Room',
  p_guests INTEGER DEFAULT 2,
  p_check_in TIMESTAMPTZ DEFAULT now(),
  p_check_out TIMESTAMPTZ DEFAULT (now() + interval '2 days'),
  p_total_amount NUMERIC DEFAULT 1500000,
  p_note TEXT DEFAULT ''
)
RETURNS banla.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = banla, public
AS $$
DECLARE
  v_code VARCHAR(24);
  v_row banla.bookings;
BEGIN
  v_code := COALESCE(NULLIF(trim(p_booking_code), ''), 'BL' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)));
  INSERT INTO banla.bookings (
    booking_code, guest_name, guest_phone, guest_email,
    room_id, guests, check_in, check_out,
    total_amount, paid_amount, payment_status, booking_status, note
  ) VALUES (
    v_code, p_guest_name, p_guest_phone, COALESCE(p_guest_email, ''),
    p_room_id, COALESCE(p_guests, 2), p_check_in, p_check_out,
    COALESCE(p_total_amount, 0), 0, 'pending', 'pending', COALESCE(p_note, '')
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 5.3. Duyệt đơn & Cấp mã Smart-Lock PIN 6 số + Ghi nhận giao dịch VietQR
CREATE OR REPLACE FUNCTION public.banla_approve_booking(
  p_id UUID,
  p_pin VARCHAR(6),
  p_mark_paid BOOLEAN DEFAULT true,
  p_bank_code VARCHAR DEFAULT 'MB'
)
RETURNS banla.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = banla, public
AS $$
DECLARE
  v_row banla.bookings;
  v_ref VARCHAR(64);
BEGIN
  UPDATE banla.bookings
  SET
    booking_status = 'confirmed',
    smartlock_pin = p_pin,
    payment_status = CASE WHEN p_mark_paid THEN 'paid' ELSE payment_status END,
    paid_amount = CASE WHEN p_mark_paid THEN total_amount ELSE paid_amount END
  WHERE id = p_id
  RETURNING * INTO v_row;

  IF FOUND AND p_mark_paid THEN
    v_ref := 'BANLA_' || COALESCE(v_row.booking_code, substr(v_row.id::text, 1, 6));
    INSERT INTO banla.transactions (booking_id, reference_code, amount_paid, bank_code, status, paid_at)
    VALUES (v_row.id, v_ref, v_row.total_amount, COALESCE(p_bank_code, 'MB'), 'completed', now());
  END IF;

  RETURN v_row;
END;
$$;

-- 5.4. Cập nhật trạng thái đơn / thanh toán / mã PIN linh hoạt
CREATE OR REPLACE FUNCTION public.banla_update_booking(
  p_id UUID,
  p_booking_status VARCHAR DEFAULT NULL,
  p_payment_status VARCHAR DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT NULL,
  p_total_amount NUMERIC DEFAULT NULL,
  p_smartlock_pin VARCHAR DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS banla.bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = banla, public
AS $$
DECLARE
  v_row banla.bookings;
BEGIN
  UPDATE banla.bookings
  SET
    booking_status = COALESCE(p_booking_status, booking_status),
    payment_status = COALESCE(p_payment_status, payment_status),
    paid_amount = COALESCE(p_paid_amount, paid_amount),
    total_amount = COALESCE(p_total_amount, total_amount),
    smartlock_pin = COALESCE(p_smartlock_pin, smartlock_pin),
    note = COALESCE(p_note, note)
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.banla_list_bookings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.banla_create_booking(VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.banla_approve_booking(UUID, VARCHAR, BOOLEAN, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.banla_update_booking(UUID, VARCHAR, VARCHAR, NUMERIC, NUMERIC, VARCHAR, TEXT) TO anon, authenticated, service_role;

-- =============================================================================
-- 6. Dữ liệu khởi tạo mẫu (Chỉ thêm nếu bảng đang trống)
-- =============================================================================
DO $$
DECLARE
  v_b1 UUID;
  v_b2 UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM banla.bookings LIMIT 1) THEN
    INSERT INTO banla.bookings (
      booking_code, guest_name, guest_phone, guest_email, room_id, guests,
      check_in, check_out, total_amount, paid_amount, payment_status, booking_status, smartlock_pin, note
    ) VALUES (
      'BL9821', 'Hoàng Minh Tuấn', '0988776655', 'minhtuan.dalat@gmail.com', 'Élite Room', 2,
      '2026-11-05 14:00:00+07', '2026-11-07 12:00:00+07', 2400000, 2400000, 'paid', 'confirmed', '839204',
      'Cần phòng tầng cao, view nhìn trọn thung lũng sương.'
    ) RETURNING id INTO v_b1;

    INSERT INTO banla.transactions (booking_id, reference_code, amount_paid, bank_code, status)
    VALUES (v_b1, 'BANLA_BL9821', 2400000, 'MB', 'completed');

    INSERT INTO banla.bookings (
      booking_code, guest_name, guest_phone, guest_email, room_id, guests,
      check_in, check_out, total_amount, paid_amount, payment_status, booking_status, smartlock_pin, note
    ) VALUES (
      'BL7342', 'Trần Thị Mai Anh', '0912345678', 'maianh.tran@outlook.com', 'Original Suite', 2,
      '2026-11-10 14:00:00+07', '2026-11-12 12:00:00+07', 3200000, 3200000, 'paid', 'confirmed', '561829',
      'Kỷ niệm ngày cưới, nhờ khách sạn chuẩn bị hoa tươi.'
    ) RETURNING id INTO v_b2;

    INSERT INTO banla.transactions (booking_id, reference_code, amount_paid, bank_code, status)
    VALUES (v_b2, 'BANLA_BL7342', 3200000, 'VCB', 'completed');

    INSERT INTO banla.bookings (
      booking_code, guest_name, guest_phone, guest_email, room_id, guests,
      check_in, check_out, total_amount, paid_amount, payment_status, booking_status, smartlock_pin, note
    ) VALUES (
      'BL3519', 'Phạm Trần Linh', '0965555555', 'banhfuli1503@gmail.com', 'Deluxe Twin', 2,
      '2027-02-02 14:00:00+07', '2027-02-04 12:00:00+07', 2700000, 0, 'pending', 'pending', NULL,
      'Đặt trực tuyến từ website Banla.'
    );
  END IF;
END $$;

