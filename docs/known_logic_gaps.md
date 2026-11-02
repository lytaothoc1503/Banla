# Lỗ hổng logic đã biết (chưa sửa) — cập nhật 2026-11-03

Phát hiện khi đối chiếu luồng đặt phòng với mã nguồn. Mô phỏng trực quan: `docs/banla_flow_simulation.html`.

| # | Vị trí | Vấn đề | Hướng sửa |
|---|---|---|---|
| G1 | `banla_payment_module/frontend/banla-priority-modal.js` → `checkRealtimeStatus()` | Popup chỉ đọc localStorage của khách, không hỏi server → lễ tân duyệt ở máy khác thì popup không bao giờ đổi trạng thái. | Polling API trạng thái phía server hoặc Supabase Realtime theo `booking_code`. |
| G2 | `phieu.html` (bước 1 đọc localStorage) | Khách sửa localStorage thành `paid` là có dấu đỏ + PIN; bản ghi pending cũ che trạng thái paid thật. | Chỉ render dấu đỏ từ dữ liệu server/Supabase. |
| G3 | `phieu.html` → `defaultSamples` | Đơn mẫu BL9821/BL7342 có sẵn dấu đỏ + PIN, ai cũng mở được. | Xóa khỏi production hoặc chỉ bật với `?demo=1` + watermark MẪU. |
| G4 | `admin.html` → `approveBookingAndIssuePin()`; `script.js` → `saveBookingToSupabase()` | Duyệt luôn ghi `paid_amount = total_amount` (cọc 50% thành 100%); không lưu `payment_option`/giảm giá. | Lưu `payment_option`, `amount_due`, `discount_amount`; lễ tân nhập số tiền thực nhận khi duyệt. |
| G5 | `phieu.html` → `.from('bookings').select('*')` | Tải toàn bảng bằng anon key → nguy cơ lộ PII nếu RLS cho phép. | Tra cứu qua API (mã đơn + SĐT); RLS chặn anon SELECT. |

Thứ tự ưu tiên đề xuất: G2 + G3 + G5 → G4 → G1 → webhook ngân hàng (SePay) + thông báo qua `DFT2_bot`.
