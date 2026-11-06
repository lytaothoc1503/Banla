# DỰ ÁN BANLA — TỔNG QUAN DỰ ÁN (`PROJECT.md`)

> **Trạng thái tài liệu:** Khởi tạo Giai đoạn 0 (Orchestrator Baseline)  
> **Cập nhật lần cuối:** 2026-11-04

---

## 1. Tên dự án
**Banla** — Hệ sinh thái số cho **Banla Boutique Hotel Đà Lạt** (*Slogan: "Ngoài lạnh. Trong ấm."*) kết hợp nền tảng Đặt phòng trực tiếp, Đối soát Thanh toán VietQR, Cấp mã khóa thông minh Smart-Lock PIN 6 số, Trợ lý Lễ tân AI ("Bàn Là"), Cổng kết nối OTA và Ứng dụng/Mini App đa kênh.

---

## 2. Mục tiêu dự án
1. **Đặt phòng trực tiếp & Thanh toán tức thì:** Cho phép khách du lịch xem 7 hạng phòng boutique tại 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt, tính giá theo đêm tự động, chọn **Cọc 50%** hoặc **Thanh toán 100% (giảm 10%)**, quét mã VietQR động (`MB Bank - 0352554863 - BANLA_MÃĐƠN`).
2. **Tự động hóa Đối soát & Check-in 24/7:** Khi thanh toán được xác nhận (qua Lễ tân duyệt trên Admin Dashboard hoặc Webhook ngân hàng), cấp **Phiếu xác nhận dịch vụ có Dấu Đỏ chính thức** (in PDF A4 / tải PNG) kèm **Mã khóa thông minh Smart-Lock PIN 6 chữ số** hiệu lực theo khung giờ lưu trú (`14:00 Check-in → 12:00 Check-out`).
3. **Trợ lý Lễ tân AI ("Bàn Là") & AI Studio:** Tư vấn khách hàng 24/7 dựa trên dữ liệu chính thức (7 hạng phòng, The Roof Café & Cocktail Bar, đường đi, chính sách) với cơ chế fallback 3 tầng (`/api/chat` → Supabase Edge Function `banla-gemini` → Smart Knowledge Engine nội bộ), đồng thời hỗ trợ đội ngũ marketing tạo nội dung/ảnh qua `ai-studio.html`.
4. **Phát triển Hợp nhất Đa nền tảng (Backend + Web + App):** Chuẩn bị kiến trúc chuẩn hóa để mở rộng đồng thời **Backend (`backend/`)**, **Web (`web/`)**, và **App / Mini App (`app/`, `DFT2_bot/`)** trong cùng một kho mã nguồn mà không xảy ra xung đột giữa các AI Agent hoặc phiên làm việc.

---

## 3. Đối tượng người dùng
| Nhóm người dùng | Nhu cầu chính | Điểm chạm (Touchpoints) |
|---|---|---|
| **Khách lưu trú (Guests)** | Tìm hiểu phòng, hỏi lễ tân AI, đặt phòng nhanh, chuyển khoản VietQR, tra cứu đơn và nhận Phiếu Dấu Đỏ + mã PIN Smart-Lock để tự check-in. | `index.html`, `room.html`, `phong/*.html`, `phieu.html`, `banla-concierge.js`, `DFT2_bot` (Telegram Mini App/Bot) |
| **Lễ tân & Quản trị viên (Admin / Reception)** | Theo dõi danh sách đơn thời gian thực, đối soát doanh thu Gross/Net (trừ phí cổng 1.5%), kiểm tra biên lai, duyệt đơn, cấp/đổi mã Smart-Lock PIN, xuất phiếu xác nhận. | `admin.html`, `/api/admin/*` |
| **Đội ngũ Nội dung & Marketing** | Tạo bài viết Cẩm nang chuẩn SEO, mô tả phòng, caption mạng xã hội và hình ảnh thương hiệu theo phong cách *Highland Mist + Ember*. | `ai-studio.html`, `blog/*`, Supabase Edge Function `banla-gemini` |
| **Đối tác Sàn OTA (OTA Partners)** | Đồng bộ danh mục phòng (`GET /api/rooms`) và đẩy đơn đặt phòng từ sàn OTA về hệ thống Banla (`POST /api/booking` với `source: "ota"` và `x-api-key`). | `/api/rooms`, `/api/booking` |

---

## 4. Tính năng hiện có (Đã triển khai)
- **Website Thương hiệu & Nội dung Tĩnh:**
  - Trang chủ (`index.html`), danh sách & chi tiết 7 hạng phòng (`room.html`, `phong/*.html`, `listing.html`), hệ thống trang Cẩm nang/Blog (`blog/*`), Điểm đến (`khach-san/*`), Chính sách (`chinh-sach/`, `dieu-khoan/`), FAQ (`faq/`), Liên hệ (`lien-he/`), Về chúng tôi (`ve-chung-toi/`).
  - Thiết kế chuẩn Design System **Highland Mist + Ember** (`DESIGN.md`, `styles.css`, `effects.css`, `vendor/anime.umd.min.js`).
- **Luồng Đặt phòng & Tính giá (`script.js`, `server.js`):**
  - Tính giá trực tiếp theo hạng phòng, số đêm, tùy chọn `deposit_50` (cọc 50%) hoặc `pay_100` (giảm 10%).
  - Hỗ trợ chế độ Hybrid (gửi qua Express `/api/booking`, lưu `data/bookings.json`, fallback `localStorage` trên GitHub Pages).
- **Module Thanh toán VietQR & SSE (`banla_payment_module/`):**
  - Tạo phiên giữ chỗ 15 phút (`POST /api/banla/session`), sinh mã QR MB Bank (`0352554863`), lắng nghe trạng thái qua Server-Sent Events (`GET /api/banla/session/:sessionId/stream`) và nhận Webhook HMAC-SHA256 (`POST /api/banla/webhook`).
- **Trang Quản trị & Đối soát (`admin.html`):**
  - Mở nhanh bằng thao tác bấm 3 lần vào logo `BANLA` hoặc truy cập `/admin.html`.
  - Đăng nhập bằng `ADMIN_KEY` (`/api/admin/login`), cấp cookie phiên `HttpOnly` 8 giờ, thống kê tài chính Gross/Fee/Net, duyệt đơn và cấp mã Smart-Lock PIN.
- **Phiếu Xác nhận Dịch vụ Dấu Đỏ (`phieu.html`, `phieu.js`):**
  - Hiển thị phiếu xác nhận chuẩn A4, con dấu đỏ SVG chỉ đóng khi đơn đã được xác thực thanh toán (`PAID`), hỗ trợ in PDF và xuất ảnh PNG (`vendor/html2canvas.min.js`).
- **Trợ lý Lễ tân AI "Bàn Là" (`banla-concierge.js`, `server.js`, `supabase/functions/banla-gemini/index.ts`):**
  - Khung chat nổi góc phải tư vấn chính xác thông tin 7 hạng phòng, The Roof, thanh toán VietQR, đường đi; luôn hoạt động kể cả khi mất kết nối mạng/backend nhờ bộ tri thức nội bộ (`generateLocalConciergeReply`).
- **Bảo mật & Kiểm thử cơ bản (`utils/security.js`, `utils/logger.js`, `test/*.test.js`):**
  - Helmet headers, Rate Limiting, CORS whitelist, chống IDOR kèm che mờ PII (`maskPhoneNumber`, `maskEmailAddress`), băm `scrypt`, so sánh `timingSafeEqual`, kiểm thử tự động với `node:test` và `@electric-sql/pglite`.

---

## 5. Tính năng dự kiến & Đang hoàn thiện
1. **Đồng bộ Cơ sở dữ liệu Supabase Schema v2 (`supabase/sql/banla_schema_v2.sql`):**
   - Triển khai schema `banla` bản v2 lên Supabase thật (thay thế hoàn toàn bản v1 có lỗ hổng RLS và `data/bookings.json` cục bộ).
   - Chuyển toàn bộ thao tác đọc/ghi của `server.js`, `script.js`, `admin.html`, `phieu.html` sang dùng 2 RPC công khai (`public.banla_create_booking`, `public.banla_booking_status`) và 3 RPC nội bộ `service_role` (`banla.record_payment`, `banla.approve_booking`, `banla.cancel_booking`).
2. **Xử lý dứt điểm các Lỗ hổng Logic (G1–G5 & D1–D16):**
   - Đồng bộ kho dữ liệu duy nhất giữa Server và Client; loại bỏ việc `phieu.html` hay `banla-priority-modal.js` tin cậy `localStorage` hoặc chứa đơn mẫu `defaultSamples` có dấu đỏ trên môi trường production.
3. **Triển khai Supabase Edge Function `banla-gemini`:**
   - Liên kết Supabase CLI và deploy function proxy gọi Gemini API cho cả chat công khai và AI Studio nội bộ.
4. **Hoàn thiện Telegram Mini App / Bot (`DFT2_bot/`) & Ứng dụng (`app/`):**
   - Đồng bộ hotline/thông tin thật vào `DFT2_bot`, kết nối thông báo đơn mới/thanh toán VietQR về Telegram cho lễ tân và phát triển giao diện Mini App/App.
5. **Mở rộng Kiến trúc Đa Phân hệ (`backend/`, `web/`, `app/`, `shared/`):**
   - Tách bạch rõ ràng mã nguồn Backend, Web, App và các định nghĩa dùng chung (`shared/types`, `shared/schemas`, `shared/constants`) khi người dùng tải thêm mã nguồn mới lên.

---

## 6. Giới hạn phạm vi (Scope Boundaries)
- **Cách ly Database tuyệt đối:** Dự án dùng chung Supabase project (`hcikbpvzbzottxoitujl`) với dự án khác (`webmoi`). Mọi bảng và hàm của Banla **bắt buộc** nằm trong schema `banla` hoặc có tiền tố `banla_`; tuyệt đối không đụng chạm các bảng trong `public` của `webmoi`.
- **Không xử lý thẻ tín dụng trực tiếp (No Raw Card Processing):** Chỉ sử dụng chuyển khoản ngân hàng qua chuẩn VietQR và đối soát biên lai/webhook, không thu thập số thẻ CVV/OTP của khách.
- **Quy tắc Giai đoạn 0:** Không tự ý di chuyển, ghi đè hoặc sửa mã nguồn hiện có, không cài thêm package, không chạy migration hay deploy khi chưa có lệnh duyệt tường minh từ chủ dự án.

