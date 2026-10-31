-- ====================================================================
-- BANLA PAYMENT SYSTEM - DATABASE MIGRATION SCRIPT
-- Phù hợp: PostgreSQL / Supabase
-- ====================================================================

-- 1. Bảng quản lý phiên thanh toán (Khóa tạm 15 phút, không sửa bảng cũ)
CREATE TABLE IF NOT EXISTS banla_payment_sessions (
    id VARCHAR(64) PRIMARY KEY,                         -- VD: SESS_BALA_9821_17118899
    booking_id VARCHAR(64) NOT NULL,                    -- Khóa ngoại trỏ tới bảng booking cũ
    room_id VARCHAR(64) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,                     -- 200000.00
    currency VARCHAR(10) DEFAULT 'VND',
    status VARCHAR(30) DEFAULT 'PENDING',               -- PENDING, CONFIRMED, EXPIRED, REFUND_REQUIRED, PARTIAL_PAID
    payment_method VARCHAR(30),                         -- VIETQR, DEEPLINK, VISA_MASTER
    bank_code VARCHAR(20),                              -- MB, VCB, TCB...
    memo VARCHAR(50) NOT NULL UNIQUE,                   -- Nội dung CK chuẩn: BALA9821
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,       -- Hết hạn sau 15 phút
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bảng đối soát tài chính thực nhận (Gross/Net) & Chống trùng lặp Webhook (Idempotency)
CREATE TABLE IF NOT EXISTS banla_payment_transactions (
    id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) REFERENCES banla_payment_sessions(id) ON DELETE CASCADE,
    gateway_transaction_id VARCHAR(128) NOT NULL UNIQUE, -- Idempotency Key chống ghi nhận 2 lần
    gross_amount NUMERIC(15, 2) NOT NULL,                -- Số tiền khách trả (VD: 200,000 VND)
    gateway_fee NUMERIC(15, 2) DEFAULT 0,                -- Phí cổng thanh toán khấu trừ
    net_amount NUMERIC(15, 2) NOT NULL,                  -- Tiền thực nhận về tài khoản
    bank_account_target VARCHAR(50),
    raw_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Bảng cấp mã khóa phòng thông minh theo khung giờ lưu trú
CREATE TABLE IF NOT EXISTS banla_smartlock_access (
    id SERIAL PRIMARY KEY,
    booking_id VARCHAR(64) NOT NULL,
    pin_code VARCHAR(16) NOT NULL,                      -- Mã PIN mở cửa, VD: *9821#
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index tăng tốc kiểm tra trạng thái và tìm kiếm memo
CREATE INDEX IF NOT EXISTS idx_banla_sess_status ON banla_payment_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_banla_sess_memo ON banla_payment_sessions(memo);
