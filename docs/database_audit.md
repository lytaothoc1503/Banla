# Rà soát CSDL & mã nguồn Banla — 2026-11-04

Kiểm tra thực tế: đọc toàn bộ file SQL, `server.js`, `banla_payment_router.js`, `script.js`, `admin.html`, `phieu.html`, `.env` (chỉ tên biến) và gọi thử Supabase project `hcikbpvzbzottxoitujl` (chỉ kiểm tra cấu trúc, không đọc dữ liệu).

## Kết quả kiểm tra Supabase thật

| Kiểm tra | Kết quả |
|---|---|
| `GET /rest/v1/bookings` với `Accept-Profile: banla` | `PGRST106 – Invalid schema: banla` (chỉ có `public`, `graphql_public`) |
| `HEAD /rest/v1/rpc/banla_list_bookings` | `404 Not Found` |

**Kết luận: `supabase_schema.sql` chưa từng được chạy trên project này.** Mọi lệnh Supabase trong code đang thất bại im lặng (lỗi bị `catch` nuốt). Dữ liệu thật hiện chỉ nằm ở `data/bookings.json` (server) và localStorage của từng trình duyệt.

## 🔴 Nghiêm trọng — phải xử lý trước khi chạy thật

| # | Vấn đề | Vị trí |
|---|---|---|
| D1 | Đơn có thể bị mất: trên hosting tĩnh (không có Node server) `/api/booking` thất bại, còn Supabase không được cấu hình ở trang khách (`window.BANLA_SUPABASE_URL` không được gán ở đâu; `script.js` đọc khóa `BANLA_SUPABASE_URL` nhưng admin lưu ở `BANLA_SUPABASE_CONFIG`). Đơn chỉ còn trong localStorage của khách, khách sạn không nhận được. | `script.js` `saveBookingToSupabase()` |
| D2 | **Không được chạy `supabase_schema.sql` như hiện tại.** RLS `USING (true)` + `GRANT ... DELETE` cho `anon` → ai có publishable key (công khai trên web) cũng đọc hết SĐT/email/PIN, tự sửa đơn thành `paid`, hoặc xóa đơn. | `supabase_schema.sql` mục 4 |
| D3 | 4 hàm `SECURITY DEFINER` trong schema `public`, cấp `EXECUTE` cho `anon` → vượt RLS hoàn toàn. Ai cũng gọi được `banla_approve_booking` để tự duyệt đơn và lấy PIN. | `supabase_schema.sql` mục 5 |
| D4 | Mã admin `BANLA8888` viết cứng, điền sẵn trong ô nhập, in ngay dưới form, và trình duyệt chấp nhận mà không cần server. `.env` thiếu `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `BANLA_WEBHOOK_SECRET` → server dùng giá trị mặc định nằm công khai trong mã nguồn (ai cũng giả được webhook "đã thanh toán"). | `admin.html` L522, L525, L829, L1427; `server.js` L414–415; `banla_payment_router.js` L13 |

## 🟠 Cao — thiếu sót cấu trúc dữ liệu

| # | Vấn đề |
|---|---|
| D5 | Hai kho dữ liệu không đồng bộ: server ghi `data/bookings.json` (camelCase), trình duyệt/admin ghi Supabase (snake_case). `utils/supabase/node.js` có sẵn nhưng không file nào dùng. Router thanh toán và `backup_db.js` chỉ biết file JSON. |
| D6 | `banla_migration.sql` (sessions, payment_transactions, smartlock_access): nằm ở `public`, **không bật RLS**, `booking_id` là chuỗi không có khóa ngoại, không được code nào sử dụng (router dùng file JSON). Cần gộp vào schema `banla` hoặc bỏ. |
| D7 | Bảng `bookings` thiếu cột: `payment_option`, `amount_due`, `discount_amount`, `unit_price`, `nights`, `source`, `paid_at`, `approved_at`, `approved_by`, `updated_at`. Vì vậy không phân biệt được cọc 50% và trả 100% (gốc của lỗi G4). |
| D8 | `transactions` thiếu `UNIQUE` cho mã giao dịch ngân hàng (chống ghi nhận trùng khi webhook gửi lại), thiếu `raw_payload`; hàm duyệt luôn ghi `amount_paid = total_amount`. |
| D9 | Thiếu ràng buộc toàn vẹn: `check_out > check_in`, số tiền `>= 0`, `paid_amount <= total_amount`, PIN đúng 6 chữ số, `guests` 1–20. `room_id` là chữ tự do, không có bảng `rooms`. |
| D10 | **Không có chống đặt trùng phòng**: không kiểm tra phòng còn trống, không có exclusion constraint theo khoảng ngày. Hai khách có thể đặt cùng phòng cùng đêm. |
| D11 | Server không tự tính giá: `POST /api/booking` không lưu `totalPrice`, không kiểm tra `room` có trong `rooms.json`, ngày nhận/trả là tùy chọn. Thống kê admin rơi về mặc định 1.500.000 ₫. |

## 🟡 Trung bình

| # | Vấn đề |
|---|---|
| D12 | Dữ liệu mẫu (BL9821, BL7342 có trạng thái `paid` kèm PIN) nằm trong file schema production. |
| D13 | Index `idx_banla_bookings_code` thừa (cột đã `UNIQUE`). |
| D14 | Sao lưu chỉ chụp file JSON, không có Supabase, không chạy theo lịch. |

## 🤖 Trợ lý AI (Google AI Studio / Gemini)

Mã nguồn đã có (`supabase/functions/banla-gemini/index.ts`, `banla-concierge.js`, `ai-studio.html`) và thiết kế đúng: key Gemini chỉ nằm trong Supabase Secrets.

| Kiểm tra | Kết quả |
|---|---|
| API key Gemini do chủ dự án cung cấp | Hợp lệ (HTTP 200), có sẵn `gemini-flash-latest` và `gemini-2.5-flash-image` mà function dùng mặc định |
| `POST .../functions/v1/banla-gemini` | `404 – Requested function was not found` → **function chưa được deploy**, chưa đặt secret |
| Supabase CLI trên máy | Chưa cài, chưa đăng nhập |

Việc còn thiếu (chủ dự án tự chạy, vì cần đăng nhập tài khoản Supabase):
`supabase link --project-ref hcikbpvzbzottxoitujl` → `supabase secrets set GEMINI_API_KEY=...` → `supabase secrets set BANLA_ADMIN_TOKEN=...` → `supabase functions deploy banla-gemini`.

> ⚠ Bước 5 trong `docs/gemini-ai-studio.md` (gán `window.BANLA_SUPABASE_URL` trên mọi trang) **không nên làm** cho tới khi sửa xong D2/D3, vì lúc đó trang khách sẽ ghi thẳng vào bảng đang mở toang quyền.

## Vẫn còn mở từ lần trước

G1–G5 trong `docs/known_logic_gaps.md` (popup đọc localStorage, phiếu tin dữ liệu trình duyệt, đơn mẫu có dấu đỏ, duyệt luôn ghi 100%, phiếu tải toàn bảng).

## Thứ tự đề xuất

1. D4: đặt `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `BANLA_WEBHOOK_SECRET` mạnh trong `.env`; bỏ PIN mặc định khỏi `admin.html`.
2. Viết lại schema (bản v2) trước khi chạy: anon chỉ được tạo đơn qua một hàm có kiểm tra dữ liệu; mọi thao tác đọc/duyệt đi qua server bằng khóa `service_role` (chỉ để trong `.env`); thêm cột D7, ràng buộc D9, chống trùng phòng D10, idempotency D8; bỏ dữ liệu mẫu.
3. Cho server dùng Supabase làm kho chính (gộp D5), tính giá phía server (D11).
4. Sửa G1–G5 dựa trên nền mới, kèm test tấn công cho từng lỗi.
