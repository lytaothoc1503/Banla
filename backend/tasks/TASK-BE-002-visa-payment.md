# TASK-BE-002: Tích hợp Thanh toán Thẻ Quốc tế Visa / OnePay (`VISA_PAYMENT_INTEGRATION`)

- **TASK-ID:** `TASK-BE-002`
- **Owner Agent:** `backend-agent` (`senior-backend` + `senior-security`)
- **Trạng thái:** `completed` (Đã kiểm thử tự động 100%, chờ chủ dự án điền khóa OnePay & duyệt chạy migration v3 lên Supabase)
- **Skill tham chiếu:** `skills/visa-payment/SKILL.md`, `skills/backend-agent/SKILL.md`

## 1. Phạm vi File Đã Thực Hiện
- Tạo mới:
  - `shared/constants/rooms.js`
  - `backend/modules/payments/onepay.service.js`
  - `backend/modules/payments/visa.validator.js`
  - `backend/modules/payments/visa.repository.js`
  - `backend/modules/payments/visa.service.js`
  - `backend/modules/payments/visa.routes.js`
  - `supabase/sql/banla_v3_onepay_visa.sql`
  - `payment-result.html`
  - `test/visa_onepay.test.js`
- Cập nhật (đã lưu bản sao lưu tại `backup/2026-11-05_TASK-BE-002_visa_onepay/`):
  - `server.js`, `utils/logger.js`, `.env.example`
  - `index.html`, `khach-san/banla-boutique-hotel/index.html`, `script.js`, `styles.css`
  - `docs/API_CONTRACT.md`, `docs/DATA_MODEL.md`
