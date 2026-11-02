# Hướng Dẫn & Quy Trình Bảo Mật Toàn Diện (7 Bước — 19 Tiêu Chuẩn)

Tài liệu này chuẩn hóa quy trình triển khai và vận hành an ninh cho hệ thống **Banla Boutique Hotel**.

---

### BƯỚC 1: TÀI KHOẢN & XÁC THỰC
1. **01. Hash mật khẩu bằng scrypt / Argon2 / bcrypt:**
   - Hệ thống sử dụng mô-đun [`utils/security.js`](../utils/security.js) với thuật toán `scrypt` (memory-hard, chống tấn công ASIC/GPU tương đương Argon2/bcrypt).
   - Mật khẩu lưu trữ ở định dạng `scrypt$salt$hash`.
   - Mọi thao tác đối soát mật khẩu và API Key đều chạy qua hàm `safeTimingCompare()` sử dụng `crypto.timingSafeEqual` để triệt tiêu lỗ hổng Timing Attack.
2. **02. Gắn Rate Limit ở Login:**
   - Endpoint `/api/admin/login` được bọc bởi `adminLoginLimiter` độc lập: Tối đa 10 lượt thử trong 15 phút.
   - Quá số lần cho phép sẽ bị chặn với mã HTTP 429 và thông báo tiếng Việt rõ ràng.
3. **03. Session bắt buộc phải hết hạn:**
   - Phiên quản trị sử dụng token ký HMAC-SHA256 (`generateExpiringToken`), có thời hạn cố định **8 giờ**.
   - Hết 8 giờ, token lập tức vô hiệu; hỗ trợ endpoint `/api/admin/logout` để thu hồi phiên ngay lập tức.

---

### BƯỚC 2: ĐỪNG TỰ LỘ ĐỒ
4. **04. Xóa hết Debug Log:**
   - Mô-đun [`utils/logger.js`](../utils/logger.js) tự động làm sạch và ẩn `[DEBUG]` logs trong môi trường Production.
   - Các trường nhạy cảm như `key`, `token`, `secret`, `password`, `pin` được tự động thay thế bằng `***REDACTED***`.
5. **05. Secret không để ở Frontend:**
   - Tuyệt đối không đưa `ADMIN_SECRET_KEY`, `BANLA_WEBHOOK_SECRET` hay `SERVICE_ROLE_KEY` vào client code.
   - Frontend chỉ tương tác qua các API bảo vệ hoặc Supabase Anon Key bị giới hạn quyền qua RLS.
6. **06. Không show lỗi chi tiết cho thiên hạ đọc:**
   - Toàn bộ exception được bắt bởi `sanitizeClientError()`.
   - Phản hồi ra ngoài chỉ là thông điệp chung `{ success: false, message: '...' }`, không lộ stack trace hay cấu trúc database.

---

### BƯỚC 3: DỮ LIỆU USER GỬI LÊN
7. **07. Giới hạn loại file upload:**
   - Chỉ cho phép danh sách trắng MIME: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
   - Cấm triệt để `.exe`, `.sh`, `.php`, `.js`, `.phtml`, `.svg` (chứa script XSS).
8. **08. Giới hạn dung lượng file:**
   - JSON Request giới hạn tối đa `10KB` qua `express.json({ limit: '10kb' })`.
   - File chứng từ/ảnh giới hạn tối đa `5MB`.
9. **09. Validate lại ở Server:**
   - Hàm `validateBooking()` kiểm tra nghiêm ngặt kiểu dữ liệu, độ dài tên khách (2–100 ký tự), regex SĐT Việt Nam/quốc tế, email RFC 5322, và logic ngày nhận < ngày trả phòng.
10. **10. Tự thử nghiệm phá Server IDOR:**
    - Tuyệt đối không cho phép tra cứu đơn chỉ bằng mã ID đơn thuần.
    - Bắt buộc phải cung cấp kèm Số điện thoại (tối thiểu 8 chữ số) hoặc Email khớp với đơn.
    - Dữ liệu trả về tự động che mờ số điện thoại (`090****567`) và email (`a***@domain.com`).
11. **11. Query DB phải Parameterized:**
    - Toàn bộ hàm RPC trong [`supabase_schema.sql`](../supabase_schema.sql) sử dụng tham số `$1, $2, ...`.
    - Cấm nối chuỗi SQL động (`EXECUTE '... ' || user_input`).

---

### BƯỚC 4: KHÓA PHÍA TRÌNH DUYỆT
12. **12. Bắt buộc HTTPS:**
    - Cấu hình tự động chuyển hướng HTTP -> HTTPS (301) khi chạy trên Production.
13. **13. Thêm Security Headers:**
    - Tích hợp Helmet với:
      - `HSTS` (max-age 1 năm, includeSubDomains, preload).
      - `X-Frame-Options: SAMEORIGIN` (chống Clickjacking).
      - `X-Content-Type-Options: nosniff` (chống MIME-sniffing).
      - `Referrer-Policy: strict-origin-when-cross-origin`.
14. **14. Cookie an toàn:**
    - Cookie `banla_admin_session` bắt buộc đi kèm: `HttpOnly; Secure; SameSite=Strict; Path=/`.

---

### BƯỚC 5: ĐỪNG MỞ TOANG SERVER
15. **15. CORS chỉ cho domain cần thiết:**
    - Kiểm soát qua biến `OTA_ALLOWED_ORIGINS`. Không bật `*` khi cho phép credentials.
16. **16. Database không mở Public:**
    - Schema `banla` cách ly hoàn toàn, cổng 5432 đóng chặt khỏi internet, chỉ truy cập qua Supabase API TLS.
17. **17. DB User chỉ cấp đúng quyền cần dùng:**
    - Quyền `anon` chỉ được gọi hàm tra cứu/tạo đơn có kiểm tra điều kiện.
    - Cấm cấp quyền `DROP`, `TRUNCATE` hay `DELETE` hàng loạt cho role public.

---

### BƯỚC 6 & 7: LỚP CUỐI KHI PUBLIC
18. **18. Đưa Web qua Cloudflare:**
    - Bật Proxy Cloudflare (Đám mây cam) giấu địa chỉ IP gốc.
    - Cài đặt SSL/TLS ở chế độ **Full (Strict)**.
    - Bật WAF Managed Rules, Bot Fight Mode và Rate Limiting mức Edge.
19. **19. Bật Backup tự động và Theo dõi lỗi:**
    - Script sao lưu tự động [`scripts/backup_db.js`](../scripts/backup_db.js) định kỳ lưu snapshot và xoay vòng 30 ngày.
    - Endpoint `/api/health` cung cấp trạng thái uptime và tình trạng bộ nhớ cho các hệ thống giám sát (UptimeRobot, Better Uptime).

