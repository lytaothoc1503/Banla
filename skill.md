# Banla Boutique Hotel — Project Skill & Architecture Rules (`skill.md`)

Tài liệu này quy định các nguyên tắc kiến trúc, cơ sở dữ liệu, giao diện và nghiệp vụ bắt buộc cho dự án **Banla Boutique Hotel Đà Lạt**.

---

## 1. Quy tắc Cơ sở dữ liệu Supabase (Cách ly 100% với `webmoi`)
- **Schema độc lập:** Toàn bộ bảng, hàm và truy vấn CSDL Supabase của dự án Banla **bắt buộc** nằm trong schema riêng `banla` (`CREATE SCHEMA IF NOT EXISTS banla;`) hoặc sử dụng tiền tố `banla_` cho các view/RPC công khai.
- **Tuyệt đối không xung đột:** Không đọc, ghi đè hoặc sửa đổi bất kỳ bảng nào thuộc schema `public` của dự án `webmoi` (`bookings`, `rooms`, `site_settings`, `refunds`, `cash_entries`).
- **Cấu trúc bảng cốt lõi:**
  1. `banla.bookings`: Lưu thông tin đặt phòng, trạng thái thanh toán (`pending`, `paid`, `refunded`), trạng thái đơn (`pending`, `confirmed`, `completed`, `cancelled`), và mã khóa thông minh `smartlock_pin` (6 chữ số).
  2. `banla.transactions`: Lưu lịch sử giao dịch đối soát VietQR với mã tham chiếu `reference_code` theo cú pháp `BANLA_xxxx`.
- **Row Level Security (RLS):** Bật RLS trên tất cả các bảng trong schema `banla` và cấp quyền phù hợp cho `anon` / `authenticated` để hoạt động mượt mà trên GitHub Pages.

---

## 2. Quy tắc Kỹ thuật & Mã nguồn (Vanilla ES6+ Modular)
- **JavaScript thuần hiện đại (ES6+):**
  - Sử dụng `async/await`, ES6 Modules / IIFE cô lập scope, `crypto.getRandomValues` cho mã PIN 6 số.
  - Hỗ trợ cơ chế **Hybrid Storage (Supabase + REST API + LocalStorage Fallback)** để website hoạt động 100% không lỗi trên cả môi trường tĩnh **GitHub Pages (`lytaothoc1503.github.io`)** lẫn máy chủ Node.js.
- **Bảo toàn & Tối ưu Giao diện CSS:**
  - Giữ vững hệ màu *Highland Mist & Ember* (`--pine: #2a3f38`, `--ember: #b8612e`, `--fog: #eef2f3`, `--cream: #faf7f2`).
  - Typography gọn gàng, ngăn nắp, tối giản, dễ đọc; kết hợp hiệu ứng **Glassmorphism** (kính mờ lướt sáng tinh tế) và chuyển động mượt mà (`cubic-bezier(0.22, 1, 0.36, 1)`).
  - Không làm vỡ bố cục hiện tại trên cả Desktop và Mobile.

---

## 3. Quy tắc Nghiệp vụ Đặt phòng, Đối soát & Smart-Lock
1. **Lối tắt Quản trị viên (Admin Shortcut):**
   - Bấm **3 lần liên tiếp vào logo `BANLA`** trên thanh điều hướng để chuyển thẳng vào trang Quản trị & Đối soát (`admin.html`).
2. **Luồng Đặt phòng & Thanh toán VietQR trực tiếp:**
   - Khách điền thông tin đặt phòng -> Hệ thống tạo mã đơn và hiển thị ngay bước **Thanh toán VietQR động**:
     `https://img.vietqr.io/image/{BANK_ID}-{ACCOUNT_NO}-compact2.png?amount={AMOUNT}&addInfo=BANLA_{BOOKING_CODE}`
   - Sau khi thanh toán, hướng dẫn khách liên hệ **Fanpage Facebook Banla (Hỗ trợ 24/7)** hoặc **Hotline `0296.9996.999 - 0352554863`** để nhận Phiếu xác nhận dịch vụ chính thức có dấu đỏ.
3. **Cơ chế Duyệt đơn & Smart-Lock PIN 6 số:**
   - Khi Admin bấm **"Duyệt đơn"**, hệ thống tự động sinh mã PIN **6 chữ số** ngẫu nhiên an toàn, lưu vào `banla.bookings.smartlock_pin`, chuyển `booking_status = 'confirmed'`, và hiển thị rõ thời gian hiệu lực (`Check-in -> Check-out`).
4. **Phiếu Xác Nhận Dịch Vụ Có Dấu Đỏ (Modal Preview & A4 PDF/PNG):**
   - Hỗ trợ xem trước trực tiếp trong Modal tại `admin.html` và trang độc lập `phieu.html`.
   - Con dấu mộc tròn vector SVG màu đỏ có dòng chữ **"BANLA BOUTIQUE HOTEL - ĐÃ THANH TOÁN"** xoay góc nghiêng 12 độ chân thực, hỗ trợ in PDF khổ A4 và tải ảnh PNG.

