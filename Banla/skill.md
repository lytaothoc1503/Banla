# Banla Boutique Hotel — Project Skill & Architecture Rules (`skill.md`)

Tài liệu này quy định các nguyên tắc kiến trúc, cơ sở dữ liệu, giao diện, nghiệp vụ và quy trình bảo mật bắt buộc cho dự án **Banla Boutique Hotel Đà Lạt**.

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

---

## 4. Quy trình Bảo mật Hệ thống & Database (19 Tiêu Chuẩn Vàng Bắt Buộc)

### Nhóm 1: Quản lý Tài khoản & Xác thực
- **01. Hash mật khẩu & Kiểm tra an toàn:** Mọi mật khẩu / secret quản trị phải được băm an toàn bằng Argon2 / bcrypt / PBKDF2 HMAC-SHA256, và luôn so sánh bằng `crypto.timingSafeEqual` để loại trừ hoàn toàn lỗ hổng Timing Attack.
- **02. Rate Limit tại cổng đăng nhập:** Bắt buộc gắn rate limiter riêng biệt tại `/api/admin/login` (tối đa 5–10 lượt thử trong 15 phút) nhằm ngăn chặn tấn công dò quét Brute-Force hoặc Credential Stuffing.
- **03. Session bắt buộc phải có thời hạn (Expiration):** Không sử dụng token vĩnh viễn; phiên quản trị viên tối đa 8 tiếng (`exp = Date.now() + 8 * 3600 * 1000`). Sau thời gian này phiên tự hủy và buộc đăng nhập lại.

### Nhóm 2: Chống lộ lọt thông tin (Đừng tự lộ đồ)
- **04. Xóa sạch Debug Log:** Không log mật khẩu, mã PIN Smart-Lock, secret key, webhook signatures hay số điện thoại khách hàng ra console môi trường Production.
- **05. Secret tuyệt đối không để ở Frontend:** Toàn bộ API keys có quyền cao (`SERVICE_ROLE_KEY`, `ADMIN_KEY`, `BANLA_WEBHOOK_SECRET`, `SMTP_PASS`) chỉ được lưu trong biến môi trường (`.env` / server memory), cấm hardcode vào file HTML/JS client.
- **06. Không show lỗi chi tiết cho bên ngoài:** Mọi phản hồi lỗi cho client đều ở dạng thông điệp thân thiện (`{ success: false, message: 'Yêu cầu không hợp lệ...' }`). Tuyệt đối không trả về stack trace, đường dẫn file trên server hoặc chi tiết lỗi SQL.

### Nhóm 3: Kiểm soát dữ liệu User gửi lên
- **07. Giới hạn loại file upload:** Nếu có tính năng tải file, chỉ chấp nhận danh sách trắng (whitelist MIME-type) an toàn: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Từ chối toàn bộ file thực thi (`.exe`, `.sh`, `.php`, `.js`, `.html`).
- **08. Giới hạn dung lượng tải lên:** Giới hạn payload tối đa 10KB cho JSON requests thông thường và tối đa 5MB đối với file chứng từ/ảnh.
- **09. Validate lại toàn bộ ở Server:** Không tin tưởng validation của trình duyệt; kiểm tra nghiêm ngặt kiểu dữ liệu, độ dài chuỗi (name 2–100 ký tự, regex số điện thoại, regex email RFC 5322, logic ngày nhận < ngày trả phòng).
- **10. Tự thử nghiệm phá server IDOR:** Kiểm tra lỗ hổng IDOR trên API tra cứu (`/api/booking/lookup`, `/api/booking/detail`). Bắt buộc người dùng cung cấp đúng Mã đơn + Số điện thoại (tối thiểu 8 số) hoặc Email mới được xem, đồng thời tự động che mờ thông tin cá nhân (PII masking: `090****567`).
- **11. Query DB phải Parameterized:** Tuyệt đối không dùng cộng chuỗi trong SQL. Toàn bộ câu lệnh PostgreSQL / Supabase RPC phải dùng truy vấn tham số hóa (`$1, $2, ...` hoặc biến PL/pgSQL).

### Nhóm 4: Khóa an toàn phía Trình duyệt
- **12. Bắt buộc HTTPS:** Kích hoạt chuyển hướng tự động toàn bộ truy cập HTTP sang HTTPS trên môi trường Production; bật HSTS `includeSubDomains; preload` với `max-age=31536000` (1 năm).
- **13. Thêm đầy đủ Security Headers:** Sử dụng Helmet để thiết lập các headers bảo vệ: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **14. Thuộc tính Cookie an toàn:** Mọi cookie xác thực phiên quản trị viên phải đi kèm cờ `HttpOnly; Secure; SameSite=Strict`.

### Nhóm 5: Đóng chặt Server & Database
- **15. CORS chỉ cho domain cần thiết:** Không mở `Access-Control-Allow-Origin: *` cho các endpoint nhạy cảm. Chỉ cấp phép cho domain chính của khách sạn và các sàn đối tác (OTA) đã được cấu hình trong `OTA_ALLOWED_ORIGINS`.
- **16. Database không mở Public:** Cổng PostgreSQL trực tiếp (5432) không mở tự do ra internet; chỉ truy cập qua Supabase API Gateway được mã hóa TLS hoặc thông qua Connection Pooling có giới hạn IP.
- **17. DB User chỉ cấp đúng quyền cần dùng (Principle of Least Privilege):** Phân quyền vai trò rõ ràng; tài khoản `anon` chỉ được thực thi các RPC tra cứu/tạo đơn có kiểm tra logic, không được cấp quyền `DROP`, `TRUNCATE`, `ALTER` hay xóa hàng loạt.

### Nhóm 6: Lớp phòng vệ cuối khi Public
- **18. Đưa Web qua Cloudflare:**
  - Bật Cloudflare Proxy (đám mây cam) để giấu IP thật của máy chủ gốc.
  - Bật WAF (Web Application Firewall), DDoS Protection, Bot Fight Mode và SSL/TLS chế độ **Full (Strict)**.
- **19. Bật Backup tự động và Giám sát lỗi:**
  - Kích hoạt tính năng sao lưu hàng ngày (Daily Database Backup) và PITR (Point-in-Time Recovery) trên Supabase.
  - Thiết lập giám sát cảnh báo lỗi (Error Monitoring & Uptime Alerts) để phát hiện sự cố hệ thống ngay lập tức.
