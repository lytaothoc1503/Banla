# HỢP ĐỒNG GIAO TIẾP API (`API_CONTRACT.md`)

> **Trạng thái tài liệu:** Khởi tạo Giai đoạn 0 (Orchestrator Baseline)  
> **Cập nhật lần cuối:** 2026-11-04

---

## 1. Quy ước Chung (General Conventions)
- **Base URL (Local Dev):** `http://localhost:3000`
- **Định dạng Dữ liệu:** `application/json; charset=utf-8` (Giới hạn kích thước body tối đa `10kb`).
- **CORS:** Kiểm soát qua biến môi trường `OTA_ALLOWED_ORIGINS`. Các phương thức được phép: `GET, POST, OPTIONS`. Các header được phép: `Content-Type, x-api-key, x-admin-key, x-admin-token`.
- **Chuẩn phản hồi lỗi:**
  ```json
  {
    "success": false,
    "message": "Thông báo lỗi tiếng Việt thân thiện với người dùng (không lộ stack trace)."
  }
  ```

---

## 2. Danh sách API Hiện Có trên Express Server (`server.js`)

### 2.1. Kiểm tra Sức khỏe & Danh mục Phòng

#### `GET /api/health`
- **Mục đích:** Kiểm tra trạng thái hoạt động của máy chủ (dùng cho Uptime monitoring).
- **Auth:** Công khai (Rate limit chung: 100 req / 15 phút / IP).
- **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "uptime": 120,
    "timestamp": "2026-11-04T12:00:00.000Z",
    "service": "banla-boutique-hotel"
  }
  ```

#### `GET /api/rooms`
- **Mục đích:** Lấy danh sách 7 hạng phòng chính thức từ [`rooms.json`](../rooms.json) (phục vụ cả Web Banla và đồng bộ sang sàn OTA).
- **Auth:** Công khai (Hỗ trợ CORS cho `OTA_ALLOWED_ORIGINS`).
- **Response `200 OK`:**
  ```json
  {
    "rooms": [
      {
        "id": "elite",
        "name": "Élite Room",
        "area": "30m²",
        "capacity": "2 người lớn + 1 trẻ",
        "maxGuests": 3,
        "price": 1250000,
        "priceFormatted": "1.250.000 ₫ / đêm",
        "description": "...",
        "image": "images/elite.jpg",
        "tag": "Gác mái · Ấm cúng"
      }
    ]
  }
  ```

---

### 2.2. Đặt phòng & Tra cứu Đơn (Khách hàng & OTA)

#### `POST /api/booking`
- **Mục đích:** Tạo yêu cầu đặt phòng mới và tự động tính toán giá, số đêm, mức giảm giá/tiền cọc ở phía server.
- **Rate Limit:** Tối đa 10 yêu cầu / 1 giờ / IP (`bookingLimiter`).
- **Auth:**
  - Nếu `source: "direct"` (mặc định): Công khai.
  - Nếu `source: "ota"` hoặc có truyền header `x-api-key`: Bắt buộc khớp `x-api-key` với `process.env.OTA_API_KEY` (nếu server có cài đặt `OTA_API_KEY`).
- **Request Body:**
  ```json
  {
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "email": "khach@example.com",
    "checkin": "2026-12-10",
    "checkout": "2026-12-12",
    "room": "Original Suite",
    "guests": 2,
    "paymentOption": "deposit_50",
    "source": "direct",
    "message": "Nhận phòng lúc 15h"
  }
  ```
  *(Lưu ý: `paymentOption` hoặc `payment_option` nhận `"deposit_50"` hoặc `"pay_100"`; `source` nhận `"direct"` hoặc `"ota"`).*
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "id": "m3abc123",
    "message": "Đã nhận yêu cầu. Banla sẽ liên hệ sớm."
  }
  ```
- **Mã lỗi:**
  - `400 Bad Request`: Dữ liệu không hợp lệ (`{ success: false, errors: [...], message: "..." }`).
  - `401 Unauthorized`: Thiếu hoặc sai `x-api-key` khi gọi từ kênh OTA.
  - `429 Too Many Requests`: Vượt quá giới hạn đặt phòng.
  - `500 Internal Server Error`: Lỗi ghi dữ liệu.

#### `GET /api/booking/lookup`
- **Mục đích:** Tra cứu trạng thái đơn đặt phòng an toàn (chống quét IDOR, tự động ẩn PII).
- **Rate Limit:** 30 yêu cầu / 15 phút / IP (`lookupLimiter`).
- **Query Params:**
  - `id` *(bắt buộc)*: Mã đặt phòng.
  - `contact` *(bắt buộc)*: Số điện thoại (tối thiểu 8 chữ số) hoặc địa chỉ Email khớp với đơn.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "booking": {
      "id": "m3abc123",
      "name": "Nguyễn Văn A",
      "room": "Original Suite",
      "checkin": "2026-12-10",
      "checkout": "2026-12-12",
      "guests": 2,
      "status": "pending",
      "paymentStatus": "UNPAID",
      "smartLockPin": null,
      "createdAt": "2026-11-04T12:00:00.000Z",
      "source": "direct",
      "phoneMasked": "090****567",
      "emailMasked": "k***@example.com"
    }
  }
  ```
- **Mã lỗi:** `400` (thiếu `id`/`contact` hoặc SĐT < 8 số), `404` (không tìm thấy hoặc thông tin liên hệ không khớp).

#### `GET /api/booking/detail`
- **Mục đích:** Lấy chi tiết đơn phục vụ trang Phiếu xác nhận (`phieu.html`) hoặc Quản trị viên.
- **Rate Limit:** 30 yêu cầu / 15 phút / IP (`lookupLimiter`).
- **Query Params / Headers:**
  - `id` *(bắt buộc)*: Mã đơn đặt phòng.
  - `contact` *(tùy chọn cho khách)*: Số điện thoại hoặc Email để đối chiếu.
  - `x-admin-key` / `x-admin-token` / `?key=` *(dành cho Admin)*: Trả về đầy đủ SĐT/Email gốc không bị che mờ.
- **Response `200 OK`:** Trả về đối tượng `booking` kèm `totalPrice`, `paidAmount`, `smartLockPin`.
- **Mã lỗi:** `400` (thiếu `id`), `403` (truyền `contact` nhưng không khớp với đơn), `404` (không tìm thấy đơn).

---

### 2.3. Quản trị viên & Đối soát (`Admin APIs`)

> **Cơ chế Xác thực Admin (`requireAdminAuth`):**  
> Yêu cầu một trong hai: Header `x-admin-key` (hoặc `query.key` / `body.key`) khớp với `ADMIN_KEY`, HOẶC Header `x-admin-token` là token phiên còn hạn (8 giờ) được cấp từ `/api/admin/login`. Nếu server chưa cấu hình `ADMIN_KEY` (>= 12 ký tự), tất cả các endpoint dưới đây trả về `503 Service Unavailable`.

| Method & Path | Mục đích | Request Body / Header | Response `200 OK` | Lỗi |
|---|---|---|---|---|
| `POST /api/admin/login` | Đăng nhập Admin & nhận token phiên 8h + Cookie `banla_admin_session` | `{ "key": "<ADMIN_KEY>" }` | `{ "success": true, "token": "...", "expiresIn": 28800 }` | `401`, `429`, `503` |
| `POST /api/admin/logout` | Xóa cookie phiên quản trị | Không yêu cầu body | `{ "success": true, "message": "..." }` | — |
| `GET /api/admin/bookings` | Lấy toàn bộ danh sách đơn kèm chuẩn hóa tài chính (`gatewayFee`, `netAmount`) | Header `x-admin-key` hoặc `x-admin-token` | `{ "success": true, "bookings": [...] }` | `401`, `500`, `503` |
| `GET /api/admin/stats` | Thống kê tổng đơn, trạng thái, doanh thu Gross / Fee (1.5%) / Net, số khóa PIN đang hoạt động | Header `x-admin-key` hoặc `x-admin-token` | `{ "success": true, "stats": { "total", "grossRevenue", "gatewayFee", "netRevenue", ... } }` | `401`, `500`, `503` |
| `POST /api/admin/booking/update` | Cập nhật trạng thái đơn, trạng thái thanh toán, số tiền đã trả, hạng phòng, ghi chú | `{ "id", "status", "paymentStatus", "paidAmount", "totalPrice", "room", "message" }` | `{ "success": true, "booking": {...} }` | `400`, `401`, `404`, `500`, `503` |
| `POST /api/admin/booking/smartlock` | Cấp mới hoặc đổi mã PIN Smart-Lock và chuyển đơn từ `pending` sang `confirmed` | `{ "id": "...", "customPin": "*1234#" }` *(tùy chọn)* | `{ "success": true, "pin": "*1234#", "booking": {...} }` | `400`, `401`, `404`, `500`, `503` |

---

### 2.4. Module Thanh toán Ưu tiên VietQR (`/api/banla/*`)

Được định nghĩa trong [`banla_payment_module/backend/banla_payment_router.js`](../banla_payment_module/backend/banla_payment_router.js):

| Method & Path | Mục đích | Request | Response | Lỗi |
|---|---|---|---|---|
| `POST /api/banla/session` *(hoặc `/session/create`)* | Tạo phiên thanh toán VietQR giữ chỗ 15 phút (STK MB Bank `0352554863`, nội dung `BANLA_<bookingId>`) | `{ "bookingId", "roomId", "amount", "roomName", "customerName", "customerContact" }` | `201 Created`: `{ "success": true, "sessionId", "memo": "BANLA_...", "vietQrUrl": "...", "bankDetails": {...} }` | `500` |
| `GET /api/banla/session/:sessionId` | Kiểm tra trạng thái khóa phiên thanh toán | URL Param `sessionId` | `200 OK`: `{ "success": true, "sessionId", "lockStatus": "LOCKED" }` | — |
| `GET /api/banla/session/:sessionId/stream` *(hoặc `/stream/:sessionId`)* | Kênh SSE (`text/event-stream`) đẩy thông báo tức thì về trình duyệt khi tiền vào tài khoản | URL Param `sessionId` | Stream sự kiện `data: {"status":"CONFIRMED","smartLockPin":"..."}` + heartbeat 20s | — |
| `POST /api/banla/webhook` | Nhận thông báo giao dịch từ cổng thanh toán, kiểm tra chữ ký HMAC-SHA256, sinh PIN 6 chữ số và đồng bộ đơn | Header `x-banla-signature` (HMAC-SHA256 của raw body bằng `BANLA_WEBHOOK_SECRET`), Body `{ "transactionId", "memo", "amount", "sessionId", "bookingId" }` | `200 OK`: `{ "success": true, "smartLockPin": "123456", "eventData": {...} }` | `401` (sai/thiếu chữ ký), `503` (chưa cấu hình secret) |

---

### 2.4b. Module Thanh toán Thẻ Quốc tế Visa / Mastercard / Amex / JCB (`/api/payments/*` — OnePay VPC v2)

Được định nghĩa theo kiến trúc 3 tầng trong [`backend/modules/payments/`](../backend/modules/payments/) (`visa.routes.js` → `visa.service.js` → `visa.repository.js` + `onepay.service.js`).  
**Nguyên tắc PCI DSS:** Tuyệt đối từ chối (`400 FORBIDDEN_CARD_DATA`) mọi request gửi `card_number`, `pan`, `cvv`, `cvc`, `expiry` về máy chủ Banla.

| Method & Path | Mục đích | Request | Response | Lỗi |
|---|---|---|---|---|
| `GET /api/payments/visa/config-status` | Kiểm tra cổng OnePay đã cấu hình sẵn sàng hay chưa (không lộ giá trị khóa) | Không cần body | `200 OK`: `{ "success": true, "provider": "ONEPAY", "configured": true, "supported_cards": ["VISA","MASTERCARD","AMEX","JCB"] }` | — |
| `POST /api/payments/visa/create-intent` *(alias: `/api/payments/onepay/create`)* | Khởi tạo phiên OnePay Hosted Checkout (giá tính 100% ở Server, hỗ trợ Idempotency chống bấm đúp & Retry sau khi lỗi) | Body `{ "booking_id": "BL8A4F2C", "payment_option": "deposit_50" \| "pay_100" }` hoặc `?booking_code=...` (Rate limit: 15 req/phút/IP) | `201 Created` / `200 OK`: `{ "success": true, "booking_code", "amount_vnd", "merchant_txn_ref", "redirect_url", "reused" }` | `400` (mã sai / gửi dữ liệu thẻ), `404`, `409` (đã trả tiền), `422`, `429`, `503` (thiếu cấu hình OnePay) |
| `GET\|POST /api/payments/onepay/ipn` *(alias: `/api/payments/visa/webhook`)* | Nguồn chân lý duy nhất xác thực chữ ký `vpc_SecureHash` (HMAC-SHA256 khóa HEX), đối chiếu `vpc_Amount == amount_vnd * 100`, chống replay, duyệt đơn & cấp `smartLockPin` 6 số | Tham số chuẩn OnePay VPC v2 (`vpc_MerchTxnRef`, `vpc_Amount`, `vpc_TxnResponseCode`, `vpc_TransactionNo`, `vpc_SecureHash`, ...) | `200 OK`: `{ "success": true, "vpc_ResponseCode": "0", "payment_status": "PAID" \| "FAILED", "booking_status": "CONFIRMED" }` | `400` (thiếu ref / sai chữ ký / lệch tiền), `404`, `503` |
| `GET /api/payments/onepay/return` *(alias: `/onepay-return`, `/onepay-return.php`)* | Return URL đón khách từ OnePay quay về (KHÔNG tự ý đánh dấu `PAID`), chuyển hướng sang `payment-result.html` | Query chuẩn OnePay VPC v2 | `302 Found` → `/payment-result.html?booking_id=...&merchant_txn_ref=...&state=success\|processing\|failed` | — |
| `GET /api/payments/:booking_id/status` *(hoặc `/api/payments/status?booking_code=...`)* | Tra cứu trạng thái thanh toán; chỉ mở khóa `smart_lock_pin` khi đơn đã `PAID` VÀ khớp `merchant_txn_ref` hoặc `contact` (SĐT/Email) | Query `merchant_txn_ref` hoặc `contact` | `200 OK`: `{ "success": true, "booking_code", "payment_status", "booking_status", "paid_vnd", "remaining_vnd", "smart_lock_pin" }` | `400`, `404`, `429` |

---

### 2.5. Trợ lý Lễ tân AI & Supabase Edge Function

#### 1. Backend Nội bộ: `POST /api/chat` (`server.js`)
- **Request Body:** `{ "question": "..." }` hoặc `{ "mode": "chat", "messages": [{ "role": "user", "text": "..." }] }`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "source": "gemini | knowledge_engine | fallback",
    "reply": "Dạ với **2 người lớn và 1 bé**, Banla có **5 hạng phòng**...",
    "answer": "Dạ với **2 người lớn và 1 bé**, Banla có **5 hạng phòng**..."
  }
  ```
- **Mã lỗi:** `400 Bad Request` nếu câu hỏi rỗng.

#### 2. Supabase Edge Function: `POST /functions/v1/banla-gemini` (`supabase/functions/banla-gemini/index.ts`)
- **Chế độ 1 (`mode: "chat"` — Công khai, giới hạn 12 req/phút/IP):**
  - Body: `{ "mode": "chat", "messages": [{ "role": "user", "text": "..." }] }`
  - Response: `{ "reply": "..." }`
- **Chế độ 2 (`mode: "content"` — Yêu cầu Header `x-banla-admin: <BANLA_ADMIN_TOKEN>`):**
  - Body: `{ "mode": "content", "task": "blog" | "room" | "social", "prompt": "..." }`
  - Response: `{ "text": "..." }`
- **Chế độ 3 (`mode: "image"` — Yêu cầu Header `x-banla-admin: <BANLA_ADMIN_TOKEN>`):**
  - Body: `{ "mode": "image", "prompt": "..." }`
  - Response: `{ "images": [{ "mimeType": "image/png", "data": "<base64>" }], "text": "..." }`

---

## 3. Các API Đang Thiếu hoặc Chưa Hoàn Chỉnh (Gaps To Address)

1. **`GET /api/booking/detail` khi không truyền `contact` và không phải Admin:**
   - Hiện tại nếu khách gọi `GET /api/booking/detail?id=xxx` mà **không truyền `contact`**, API vẫn trả về thông tin đơn (dù đã che mờ SĐT/email bằng `maskPhoneNumber`/`maskEmailAddress`), nhưng **vẫn trả về `smartLockPin`** nếu đơn có PIN! Cần yêu cầu bắt buộc xác thực `contact` (SĐT/Email) trước khi trả về `smartLockPin`.
2. **Định dạng mã PIN Smart-Lock chưa đồng nhất giữa hai endpoint:**
   - `POST /api/banla/webhook` và `banla_schema_v2.sql` sinh mã PIN **6 chữ số** (`^\d{6}$`, ví dụ `839204`), trong khi `POST /api/admin/booking/smartlock` trong `server.js` đang mặc định sinh mã PIN **4 chữ số bọc `*...#`** (ví dụ `*1234#`). Cần thống nhất theo đúng quy chuẩn 6 chữ số hoặc hỗ trợ cả hai có kiểm soát.
3. **Chưa kết nối Express API với Supabase Schema v2 (`banla.*`):**
   - Toàn bộ `/api/booking`, `/api/admin/*` và `/api/banla/webhook` trên `server.js` hiện vẫn đọc/ghi vào `data/bookings.json`, chưa gọi các hàm RPC `public.banla_create_booking`, `banla.record_payment`, `banla.approve_booking` của Schema v2.
4. **Endpoint kiểm tra phòng trống theo khoảng ngày (`GET /api/rooms/availability`):**
   - Hiện chưa có API để Frontend kiểm tra số lượng phòng còn trống (`inventory`) theo `checkin`/`checkout` trước khi bấm đặt.
5. **Xác thực Cookie trên `requireAdminAuth`:**
   - `POST /api/admin/login` có đặt cookie `banla_admin_session` (`HttpOnly`), nhưng `requireAdminAuth` mới chỉ đọc `req.headers['x-admin-token']` hoặc `x-admin-key`, chưa đọc token từ header `Cookie: banla_admin_session=...`.

