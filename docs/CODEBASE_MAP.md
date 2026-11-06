# BẢN ĐỒ MÃ NGUỒN DỰ ÁN BANLA (`CODEBASE_MAP.md`)

> **Trạng thái tài liệu:** Khởi tạo Giai đoạn 0 (Orchestrator Baseline)  
> **Cập nhật lần cuối:** 2026-11-04

---

## 1. Cấu trúc Thư mục Tổng thể (Hiện trạng + Khung mở rộng Giai đoạn 0)

```text
Banla/ (Thư mục gốc dự án)
├── .agents/                        # Cấu hình AI Agent, Subagent (@cross-reviewer) & Skills (supabase)
├── .gemini/                        # Cấu hình môi trường Gemini cục bộ
├── .vscode/                        # Cấu hình trình soạn thảo VS Code
├── Banla/                          # Thư mục con chứa bản sao skill.md
├── banla_payment_module/           # Module thanh toán VietQR, SSE & Webhook độc lập
│   ├── backend/                    # Router Express (/api/banla/*)
│   ├── data/                       # Lưu trữ phiên thanh toán (payment_sessions.json)
│   ├── database/                   # SQL migration thử nghiệm của module thanh toán
│   └── frontend/                   # Giao diện popup thanh toán VietQR (banla-priority-modal.js)
├── blog/                           # Các trang bài viết Cẩm nang du lịch Đà Lạt (HTML tĩnh chuẩn SEO)
├── chinh-sach/                     # Trang Chính sách bảo mật & lưu trú (index.html)
├── data/                           # Kho lưu trữ JSON cục bộ của Server (bookings.json & backups/)
├── DFT2_bot/                       # Dự án Telegram Bot / Mini App chạy trên nền tảng @tgcloud/cli
│   ├── docs/                       # Tài liệu SDK tgcloud
│   └── tgcloud/                    # Mã nguồn serverless (schema.js, handlers/, lib/)
├── dieu-khoan/                     # Trang Điều khoản dịch vụ (index.html)
├── docs/                           # Toàn bộ tài liệu kiến trúc, kiểm toán, hợp đồng API & quy tắc Agent
├── faq/                            # Trang Câu hỏi thường gặp (index.html)
├── images/                         # Tài nguyên hình ảnh phòng và khách sạn (JPG & WebP 600w/900w)
├── khach-san/                      # Các trang giới thiệu khách sạn theo điểm đến (Đà Lạt, Nha Trang, TP.HCM)
├── lien-he/                        # Trang Liên hệ & Bản đồ chỉ dẫn (index.html)
├── phong/                          # 7 trang tĩnh chi tiết từng hạng phòng (elite, signature, highland...)
├── scripts/                        # Các script tiện ích (backup_db.js, generate_room_pages.py, build_content_pages.py)
├── supabase/                       # Cấu hình Supabase, Edge Functions & Schema SQL
│   ├── functions/banla-gemini/     # Edge Function proxy kết nối Google Gemini API
│   └── sql/banla_schema_v2.sql     # Schema PostgreSQL v2 an toàn (đã test PGlite, chờ chạy thật)
├── test/                           # Bộ kiểm thử tự động (node:test + PGlite)
├── utils/                          # Các thư viện dùng chung phía Backend & Supabase client
│   ├── logger.js                   # Ghi log an toàn, tự động che giấu secret/PII
│   ├── security.js                 # Băm scrypt, token 8h, timingSafeEqual, PII masking
│   └── supabase/                   # Client khởi tạo kết nối Supabase (node.js, client.ts, server.ts, middleware.ts)
├── ve-chung-toi/                   # Trang Câu chuyện thương hiệu Banla (index.html)
├── vendor/                         # Thư viện JS bên thứ ba lưu cục bộ (anime.umd.min.js, html2canvas.min.js)
│
├── [Cấu trúc làm việc mở rộng Giai đoạn 0]
├── backend/tasks/                  # Không gian quản lý task và phát triển mở rộng cho Backend Agent
├── web/tasks/                      # Không gian quản lý task và phát triển mở rộng cho Web Frontend Agent
├── app/tasks/                      # Không gian quản lý task và phát triển mở rộng cho Mobile/Mini-App Agent
├── shared/                         # Nơi chứa định nghĩa dùng chung giữa Backend, Web và App
│   ├── types/                      # Kiểu dữ liệu dùng chung
│   ├── schemas/                    # Schema kiểm tra dữ liệu dùng chung
│   └── constants/                  # Hằng số nghiệp vụ dùng chung (mã phòng, giá niêm yết, trạng thái)
├── skills/                         # Hệ thống quản lý kỹ năng cho AI Agent
│   ├── registry.md                 # Bảng đăng ký trạng thái và quyền hạn của các Skill
│   └── templates/                  # Khuôn mẫu tạo Skill mới
├── preview/                        # Thư mục chứa các bản xem trước (preview) trước khi áp dụng
└── backup/                         # Thư mục lưu trữ các bản sao lưu trước khi chỉnh sửa quan trọng
```

---

## 2. Vai trò từng Thư mục & Các File Quan trọng

### 2.1. Nhóm Backend & Cơ sở dữ liệu
| Đường dẫn File | Mục đích & Vai trò |
|---|---|
| [`server.js`](../server.js) | Máy chủ Express chính: cấu hình bảo mật (Helmet, Rate Limit, CORS), phục vụ file tĩnh, cung cấp API phòng (`/api/rooms`), đặt phòng (`/api/booking`), tra cứu (`/api/booking/lookup`, `/api/booking/detail`), quản trị (`/api/admin/*`) và lễ tân AI (`/api/chat`). |
| [`banla_payment_module/backend/banla_payment_router.js`](../banla_payment_module/backend/banla_payment_router.js) | Router Express xử lý phiên thanh toán VietQR (`/api/banla/session`), luồng sự kiện thời gian thực SSE (`/api/banla/session/:id/stream`) và nhận Webhook ngân hàng (`/api/banla/webhook`). |
| [`utils/security.js`](../utils/security.js) | Cung cấp các hàm bảo mật cốt lõi: `hashPassword`, `verifyPassword` (`scrypt`), `safeTimingCompare`, `generateExpiringToken`, `verifyExpiringToken`, `maskPhoneNumber`, `maskEmailAddress`, `validateUploadPayload`. |
| [`utils/logger.js`](../utils/logger.js) | Bộ ghi log tự động lọc bỏ các trường nhạy cảm (`password`, `secret`, `token`, `pin`, `key`) và hàm `sanitizeClientError` ẩn stack trace. |
| [`supabase/sql/banla_schema_v2.sql`](../supabase/sql/banla_schema_v2.sql) | **Bản chuẩn Schema PostgreSQL v2:** Thiết lập `banla.rooms`, `banla.bookings`, `banla.transactions`, khóa RLS chặt chẽ, chống đặt trùng phòng (`pg_advisory_xact_lock`) và 5 hàm RPC phân quyền rõ giữa `anon` và `service_role`. |
| [`supabase_schema.sql`](../supabase_schema.sql) | Bản schema v1 cũ — **Đã đóng băng và gắn cảnh báo KHÔNG CHẠY** do lỗ hổng RLS (`USING (true)` cho `anon`). |
| [`supabase/functions/banla-gemini/index.ts`](../supabase/functions/banla-gemini/index.ts) | Supabase Edge Function (Deno/TypeScript) làm proxy gọi Gemini API cho khung chat Lễ tân AI (`mode: "chat"`) và trang AI Studio (`mode: "content" | "image"`). |
| [`scripts/backup_db.js`](../scripts/backup_db.js) | Script sao lưu `data/bookings.json` sang `data/backups/` và xoay vòng xóa bản lưu cũ quá 30 ngày. |

### 2.2. Nhóm Web Frontend & Thiết kế
| Đường dẫn File | Mục đích & Vai trò |
|---|---|
| [`DESIGN.md`](../DESIGN.md) | Nguồn sự thật về giao diện (Design System): khóa bảng màu *Highland Mist + Ember* và bộ font *Fraunces + Figtree*. |
| [`rooms.json`](../rooms.json) | Nguồn dữ liệu chuẩn cho 7 hạng phòng của Banla (id, tên, diện tích, sức chứa, giá niêm yết, mô tả, ảnh). |
| [`index.html`](../index.html) | Trang chủ chính thức của Banla Boutique Hotel Đà Lạt. |
| [`room.html`](../room.html) & [`listing.html`](../listing.html) | Trang chi tiết hạng phòng động và trang danh sách phòng. |
| [`script.js`](../script.js) | Bộ điều khiển Frontend chính: lối tắt bấm 3 lần logo mở Admin, bộ tính giá phòng trực tiếp, xử lý form đặt phòng, gọi VietQR modal, hiệu ứng Anime.js. |
| [`banla-concierge.js`](../banla-concierge.js) & [`banla-concierge.css`](../banla-concierge.css) | Widget Lễ tân AI "Bàn Là" kèm bộ tri thức nội bộ (`generateLocalConciergeReply`) đảm bảo hoạt động 100% ngay cả khi offline/hosting tĩnh. |
| [`banla-config.js`](../banla-config.js) | Cấu hình URL công khai của Supabase Edge Function và publishable key. |
| [`admin.html`](../admin.html) | Giao diện Quản trị viên & Đối soát tài chính, duyệt đơn và cấp mã PIN Smart-Lock. |
| [`phieu.html`](../phieu.html) & [`phieu.js`](../phieu.js) | Trang hiển thị và kiểm tra điều kiện đóng dấu đỏ cho Phiếu xác nhận dịch vụ khổ A4. |
| [`ai-studio.html`](../ai-studio.html) | Công cụ nội bộ hỗ trợ viết bài blog, mô tả phòng, caption mạng xã hội và tạo ảnh minh họa qua Gemini. |
| [`sw.js`](../sw.js) | Service Worker quản lý bộ nhớ đệm theo cơ chế Network-First cho trang HTML. |

### 2.3. Nhóm App / Bot & Kiểm thử
| Đường dẫn File | Mục đích & Vai trò |
|---|---|
| [`DFT2_bot/`](../DFT2_bot/AGENTS.md) | Dự án Telegram Mini App & Bot sử dụng `@tgcloud/cli`, gồm [`tgcloud/schema.js`](../DFT2_bot/tgcloud/schema.js), [`tgcloud/handlers/message.js`](../DFT2_bot/tgcloud/handlers/message.js) và [`tgcloud/handlers/callback_query.js`](../DFT2_bot/tgcloud/handlers/callback_query.js). |
| [`test/api.test.js`](../test/api.test.js) | Kiểm thử tích hợp toàn bộ REST API của `server.js` và `banla_payment_router.js`. |
| [`test/concierge.test.js`](../test/concierge.test.js) | Kiểm thử Lễ tân AI (`/api/chat` & client-side `banla-concierge.js`) và tính giá đặt phòng phía server. |
| [`test/schema_v2.test.js`](../test/schema_v2.test.js) | Kiểm thử thực tế `supabase/sql/banla_schema_v2.sql` bằng PostgreSQL nhúng (`@electric-sql/pglite`). |
| [`test/security.test.js`](../test/security.test.js) | Kiểm thử đơn vị cho các hàm băm mật khẩu, token hết hạn, lọc log và che mờ PII. |
| [`test/slip_verification.test.js`](../test/slip_verification.test.js) | Kiểm thử logic `phieu.js` đảm bảo đơn chưa thanh toán không bao giờ có dấu đỏ hoặc lộ mã PIN. |
| [`test/admin_unconfigured.test.js`](../test/admin_unconfigured.test.js) | Kiểm thử trạng thái khóa an toàn `503` khi server thiếu cấu hình `ADMIN_KEY` hoặc `BANLA_WEBHOOK_SECRET`. |

---

## 3. Các File Đang Có Nguy Cơ Xung Đột Cao (Hotspots)

Dựa trên lịch sử commit gần nhất và cấu trúc ghép nối hiện tại, các file sau là **điểm nóng xung đột (Conflict Hotspots)** cần được quản lý chặt chẽ theo quy tắc Single-Owner:

1. **[`server.js`](../server.js) (Mức độ rủi ro: RẤT CAO)**
   - **Lý do:** Tập trung toàn bộ logic Backend trong 1 file duy nhất (830 dòng): vừa cấu hình bảo mật, vừa xử lý đặt phòng, vừa chứa API Admin, vừa chứa prompt và logic Lễ tân AI (`/api/chat`). Khi nối Supabase Schema v2, cả Backend Agent và AI/Payment Agent đều có xu hướng sửa file này.
2. **[`script.js`](../script.js) (Mức độ rủi ro: RẤT CAO)**
   - **Lý do:** Điều khiển toàn bộ tương tác trang khách, bảng giá `ROOM_PRICES`, luồng gửi đơn `/api/booking`, gọi Supabase REST trực tiếp (`saveBookingToSupabase`) và mở popup VietQR.
3. **[`admin.html`](../admin.html) & [`phieu.html`](../phieu.html) (Mức độ rủi ro: CAO)**
   - **Lý do:** Cả hai file đều nhúng trực tiếp lượng lớn CSS và JavaScript nội tuyến (inline script) xử lý đối soát, đồng bộ Supabase/LocalStorage và hiển thị mã PIN/dấu đỏ (liên quan trực tiếp tới các mục `D1`, `D5`, `G2`, `G3`, `G4`, `G5` trong [`docs/database_audit.md`](database_audit.md)).
4. **[`rooms.json`](../rooms.json) & Danh mục giá phòng (Mức độ rủi ro: TRUNG BÌNH - CAO)**
   - **Lý do:** Thông tin và giá của 7 hạng phòng hiện đang lặp lại ở 5 nơi: [`rooms.json`](../rooms.json), [`script.js`](../script.js) (`ROOM_PRICES`), [`server.js`](../server.js) (`HOTEL_FACTS_PROMPT`), [`banla-concierge.js`](../banla-concierge.js) (`ROOMS_CATALOG`), [`supabase/functions/banla-gemini/index.ts`](../supabase/functions/banla-gemini/index.ts) (`HOTEL_FACTS`) và [`supabase/sql/banla_schema_v2.sql`](../supabase/sql/banla_schema_v2.sql) (`banla.rooms`). Sửa một nơi mà quên các nơi khác sẽ gây lệch giá.
5. **[`data/bookings.json`](../data/bookings.json) (Mức độ rủi ro: TRUNG BÌNH)**
   - **Lý do:** File dữ liệu runtime có thể bị thay đổi khi chạy server hoặc chạy script ngoài môi trường test.
6. **[`page.tsx`](../page.tsx) và [`utils/supabase/*.ts`](../utils/supabase/server.ts) (Mức độ rủi ro: NHẦM LẪN KIẾN TRÚC)**
   - **Lý do:** Là các file TypeScript/Next.js mẫu (`todos`) nằm lẫn trong repo Express/Vanilla JS. Nếu một Agent tưởng nhầm dự án là Next.js App Router và sửa các file này, công sức sẽ bị lãng phí hoặc gây xung đột cấu hình.

