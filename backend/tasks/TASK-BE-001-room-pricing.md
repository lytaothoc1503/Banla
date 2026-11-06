# TASK-BE-001: Quản lý Giá Phòng & Kiểm Tra Phòng Trống (`ROOM_PRICING_MANAGER`)

- **TASK-ID:** `TASK-BE-001`
- **Owner Agent:** `backend-agent` (`senior-backend` + `senior-security` + `database-administrator`)
- **Trạng thái:** `planned` (Chờ xác nhận Stack & Migration)
- **Skill tham chiếu:** `skills/room-pricing-manager/SKILL.md`, `skills/backend-agent/SKILL.md`

## 1. Phạm vi File Khóa (`Locked Files`)
- Tạo mới (Kiến trúc 3 tầng trong `backend/`):
  - `backend/modules/rooms/room.routes.js` (Controller / Route)
  - `backend/modules/rooms/room.service.js` (Business logic tính giá theo ngày, lễ, cuối tuần, khuyến mãi)
  - `backend/modules/rooms/room.repository.js` (Data-access: Supabase RPC / PostgreSQL parameterized + JSON fallback)
  - `backend/modules/rooms/room.validator.js` (Input validation)
  - `supabase/sql/003_room_pricing_manager.sql` (Migration SQL có kèm Rollback)
- Sửa đổi (sau khi backup & duyệt):
  - `server.js` (chỉ mount router, không nhồi logic nghiệp vụ vào `server.js`)
  - `rooms.json` (đồng bộ cấu trúc dữ liệu gốc)

## 2. Endpoints
- `GET /api/admin/rooms`
- `GET /api/admin/rooms/:id/prices`
- `PATCH /api/admin/rooms/:id/prices`
- `GET /api/rooms/availability?check_in=...&check_out=...&guests=...`

## 3. Tiêu chí Nghiệm thu
- Giá lưu số nguyên `BIGINT` VND (`>= 0`), `effective_to >= effective_from`, `0 <= discount_percent <= 100`.
- Mọi lần sửa giá đều ghi trong 1 transaction: thêm dòng vào `banla.room_price_history` + `banla.pricing_audit_logs` + cập nhật giá hiện hành trên `banla.rooms`.
- Không ghi đè lịch sử giá cũ; không lộ secret trong log hoặc error response.

