# HỆ THỐNG KỸ NĂNG AI CHO DỰ ÁN BANLA (`SKILLS.md`)

> **Trạng thái tài liệu:** Khởi tạo Giai đoạn 0 (Orchestrator Baseline)  
> **Cập nhật lần cuối:** 2026-11-04

---

## 1. Danh sách Skill Hiện Có trong Kho Mã Nguồn (Existing Project Skills)

Hiện tại trong kho mã nguồn Banla đang có sẵn các tài liệu quy tắc/kỹ năng sau:

| Tên Skill / Quy tắc | Vị trí File | Mục đích | Trạng thái |
|---|---|---|---|
| **Banla Project Skill & Architecture Rules** | [`skill.md`](../skill.md) *(và bản sao tại `Banla/skill.md`)* | Quy định nguyên tắc cách ly schema `banla` trên Supabase, chuẩn giao diện *Highland Mist + Ember*, luồng đặt phòng VietQR, phiếu dấu đỏ, mã PIN 6 số và 19 tiêu chuẩn bảo mật vàng. | Đang áp dụng (Active Reference) |
| **Supabase Skill** | [`.agents/skills/supabase/SKILL.md`](../.agents/skills/supabase/SKILL.md) | Hướng dẫn toàn diện làm việc với Supabase (Database, Auth, Edge Functions, RLS, `@supabase/ssr`). | Đã cài đặt (`skills-lock.json`) |
| **Supabase Postgres Best Practices** | [`.agents/skills/supabase-postgres-best-practices/SKILL.md`](../.agents/skills/supabase-postgres-best-practices/SKILL.md) | Quy chuẩn tối ưu hóa truy vấn, chỉ mục, khóa (advisory locks), kết nối và RLS trên PostgreSQL/Supabase. | Đã cài đặt (`skills-lock.json`) |
| **Cross-Reviewer Subagent** | [`.agents/agents/cross-reviewer.md`](../.agents/agents/cross-reviewer.md) & [`.agents/scripts/cross_review.js`](../.agents/scripts/cross_review.js) | Triệu hồi xAI Grok và OpenAI Codex để phản biện độc lập `git diff` trước khi commit. | Đã tích hợp (`npm run cross-review`) |
| **Telegram Cloud Bot Guide** | [`DFT2_bot/AGENTS.md`](../DFT2_bot/AGENTS.md) | Quy tắc phát triển Telegram Mini App và Serverless Bot trên nền tảng `@tgcloud/cli`. | Đang áp dụng cho `DFT2_bot/` |

---

## 2. Danh sách 11 Skill Điều Phối Dự Kiến Thêm (Planned Orchestration Skills)

Để đảm bảo quá trình phát triển đa tác nhân (Multi-Agent) diễn ra an toàn, có kiểm soát và không xung đột, hệ thống đăng ký **11 Skill chuẩn hóa** trong [`skills/registry.md`](../skills/registry.md).

> [!WARNING]
> Toàn bộ 11 Skill dưới đây đang ở trạng thái **`planned`**. Không kích hoạt bất kỳ Skill ghi/thực thi nào cho đến khi chủ dự án phê duyệt.

### Chi tiết Input, Output, Quyền hạn và Rủi ro của từng Skill

#### 1. `read_project`
- **Mục đích:** Đọc, kiểm kê và phân tích mã nguồn, cấu trúc thư mục, trạng thái git và phát hiện điểm nóng xung đột.
- **Agent thực thi:** Orchestrator / Research Agent.
- **Quyền hạn:** Chỉ đọc (`read-only`); cấm đọc giá trị biến bí mật trong `.env` / `.env.local`.
- **Input:** Đường dẫn thư mục/file hoặc phạm vi phân hệ cần kiểm tra (`backend`, `web`, `app`, `database`).
- **Output:** Báo cáo hiện trạng cấu trúc, danh sách phụ thuộc, lỗi tiềmẩn và cảnh báo xung đột.
- **Rủi ro:** Thấp (chỉ cần đảm bảo không in giá trị secret ra màn hình).

#### 2. `create_docs`
- **Mục đích:** Tạo mới hoặc đề xuất cập nhật các tài liệu nền trong `docs/` (`PROJECT.md`, `ARCHITECTURE.md`, `CODEBASE_MAP.md`, `API_CONTRACT.md`, `DATA_MODEL.md`, `AGENT_RULES.md`, `SKILLS.md`).
- **Agent thực thi:** Orchestrator / Documentation Agent.
- **Quyền hạn:** Đọc toàn dự án; chỉ được tạo file mới trong `docs/` hoặc `skills/` (nếu file đã tồn tại, chỉ xuất bản đề xuất diff, không tự ý ghi đè).
- **Input:** Kết quả phân tích từ `read_project` hoặc thay đổi kiến trúc đã được duyệt.
- **Output:** Các file Markdown chuẩn hóa trong `docs/`.
- **Rủi ro:** Thấp.

#### 3. `plan_tasks`
- **Mục đích:** Chia nhỏ yêu cầu của chủ dự án thành các đơn vị công việc độc lập (`TASK-ID`) không chồng chéo file.
- **Agent thực thi:** Orchestrator Agent.
- **Quyền hạn:** Ghi file đặc tả task vào `backend/tasks/`, `web/tasks/`, `app/tasks/`.
- **Input:** Yêu cầu tính năng/sửa lỗi từ chủ dự án + `docs/CODEBASE_MAP.md`.
- **Output:** Danh sách `TASK-ID`, Agent sở hữu (`Owner`), danh sách file khóa (`Locked Files`), thứ tự phụ thuộc và tiêu chí nghiệm thu.
- **Rủi ro:** Thấp — giúp ngăn chặn từ gốc việc hai Agent sửa cùng một file.

#### 4. `create_contract`
- **Mục đích:** Thiết lập hoặc cập nhật hợp đồng giao tiếp (API endpoints, JSON Schema, TypeScript/JSDoc types, hằng số mã phòng/trạng thái) trước khi các Agent bắt đầu viết code.
- **Agent thực thi:** Contract & Schema Agent.
- **Quyền hạn:** Ghi vào `shared/types/`, `shared/schemas/`, `shared/constants/`, `docs/API_CONTRACT.md`, `docs/DATA_MODEL.md` (sau khi được duyệt).
- **Input:** Đặc tả nghiệp vụ từ `TASK-ID`.
- **Output:** Các file định nghĩa chuẩn trong `shared/` và tài liệu hợp đồng cập nhật.
- **Rủi ro:** Trung bình — nếu hợp đồng sai sẽ kéo theo cả Backend, Web và App lệch nhau; cần chủ dự án duyệt trước khi áp dụng.

#### 5. `write_backend_code`
- **Mục đích:** Phát triển và chỉnh sửa mã nguồn phía máy chủ (API, kết nối Supabase `service_role`, thanh toán VietQR, bảo mật).
- **Agent thực thi:** Backend Agent.
- **Quyền hạn:** Ghi trong `backend/` (và các file backend được giao quyền Owner trong `TASK-ID` sau khi được duyệt).
- **Input:** `TASK-ID` (`TASK-BE-*`), hợp đồng trong `shared/` và `docs/API_CONTRACT.md`.
- **Output:** Mã nguồn Backend + diff chi tiết + báo cáo hoàn thành task.
- **Rủi ro:** Cao — liên quan đến xác thực, đối soát tiền, webhook và cơ sở dữ liệu; bắt buộc phải qua bước `create_backup` và `run_tests`.

#### 6. `write_frontend_code`
- **Mục đích:** Phát triển và chỉnh sửa giao diện Web khách hàng, trang Quản trị (`admin.html`), Phiếu xác nhận (`phieu.html`) và Lễ tân AI widget.
- **Agent thực thi:** Web Frontend Agent.
- **Quyền hạn:** Ghi trong `web/` (và các file giao diện web được giao quyền Owner trong `TASK-ID` sau khi được duyệt).
- **Input:** `TASK-ID` (`TASK-WEB-*`), Design System (`DESIGN.md`) và hợp đồng `shared/`.
- **Output:** Mã nguồn Web Frontend + diff chi tiết + bản xem trước (`preview/`).
- **Rủi ro:** Trung bình — có thể ảnh hưởng bố cục hiển thị hoặc làm vỡ token màu/font của `DESIGN.md` nếu không kiểm tra kỹ.

#### 7. `write_app_code`
- **Mục đích:** Phát triển ứng dụng di động / Telegram Mini App & Bot (`app/`, `DFT2_bot/`).
- **Agent thực thi:** App / Bot Agent.
- **Quyền hạn:** Ghi trong `app/` (và `DFT2_bot/` khi được giao quyền Owner trong `TASK-ID`).
- **Input:** `TASK-ID` (`TASK-APP-*`), hợp đồng API trong `shared/` và `DFT2_bot/AGENTS.md`.
- **Output:** Mã nguồn App / Mini App + diff chi tiết.
- **Rủi ro:** Trung bình — cần tuân thủ giới hạn môi trường V8 isolate của `tgcloud` (không dùng npm package runtime trong `tgcloud/`).

#### 8. `run_tests`
- **Mục đích:** Chạy bộ kiểm thử tự động (`node --test test/*.test.js`), kiểm thử schema PGlite và kiểm tra an toàn bảo mật.
- **Agent thực thi:** QA / Test Agent.
- **Quyền hạn:** Thực thi lệnh kiểm thử và ghi file test trong `test/`; không sửa dữ liệu thật.
- **Input:** Mã nguồn hiện tại hoặc nhánh thay đổi của một `TASK-ID`.
- **Output:** Báo cáo kết quả Pass/Fail từng test suite, log chẩn đoán lỗi và đề xuất khắc phục.
- **Rủi ro:** Thấp (các bài test sử dụng thư mục tạm `os.tmpdir()` và PGlite in-memory).

#### 9. `create_preview`
- **Mục đích:** Tạo bản xem trước độc lập (HTML/mock hoặc báo cáo so sánh trực quan Trước/Sau) trong thư mục `preview/` để chủ dự án nghiệm thu trước khi áp dụng vào file chính.
- **Agent thực thi:** Web / App / QA Agent.
- **Quyền hạn:** Chỉ ghi trong thư mục `preview/`.
- **Input:** Các thay đổi giao diện hoặc luồng nghiệp vụ đang đề xuất.
- **Output:** File xem trước trong `preview/` kèm hướng dẫn mở kiểm tra.
- **Rủi ro:** Thấp (cô lập hoàn toàn trong `preview/`, không ảnh hưởng mã nguồn đang chạy).

#### 10. `apply_changes`
- **Mục đích:** Áp dụng các thay đổi đã được kiểm tra từ bản đề xuất/preview vào mã nguồn chính sau khi chủ dự án ra lệnh phê duyệt.
- **Agent thực thi:** Orchestrator / Owner Agent của `TASK-ID`.
- **Quyền hạn:** Ghi vào đúng danh sách file đã được phê duyệt của `TASK-ID`.
- **Input:** Lệnh phê duyệt của chủ dự án + bản sao lưu từ `create_backup` + diff đã duyệt.
- **Output:** Mã nguồn chính được cập nhật + kết quả xác nhận từ `run_tests`.
- **Rủi ro:** Cao — chỉ được phép chạy sau khi `create_backup` thành công và có sự đồng ý rõ ràng của chủ dự án.

#### 11. `create_backup`
- **Mục đích:** Tạo bản sao lưu đầy đủ có gắn nhãn thời gian và mã `TASK-ID` cho các file mã nguồn hoặc dữ liệu chuẩn bị chỉnh sửa.
- **Agent thực thi:** Orchestrator / System Agent.
- **Quyền hạn:** Đọc file cần sao lưu và ghi vào thư mục `backup/` (hoặc `data/backups/`).
- **Input:** Danh sách đường dẫn file sắp chỉnh sửa và `TASK-ID`.
- **Output:** Bản sao lưu nguyên vẹn tại `backup/<timestamp>_<TASK-ID>/` kèm manifest khôi phục (`restore`).
- **Rủi ro:** Thấp — là chốt chặn an toàn bắt buộc trước mọi thao tác sửa đổi quan trọng.

---

## 3. Nhóm Skill Chuyên Biệt Cho Nghiệp Vụ Banla (Trạng thái: `planned`)

#### 12. `audit_supabase_isolation`
- **Mục đích:** Tự động quét toàn bộ file `.sql`, `.js`, `.ts` để đảm bảo 100% bảng và truy vấn Supabase của Banla nằm trong schema `banla` (hoặc RPC có tiền tố `banla_`), tuyệt đối không chạm vào các bảng thuộc schema `public` của dự án `webmoi`, đồng thời kiểm tra RLS.
- **Agent thực thi:** QA / Database Agent.
- **Quyền hạn:** Chỉ đọc (`read-only`).
- **Input:** Các file SQL và mã nguồn kết nối Supabase.
- **Output:** Báo cáo kiểm toán cách ly schema và danh sách vi phạm (nếu có).
- **Rủi ro:** Thấp.

#### 13. `sync_room_catalog`
- **Mục đích:** Kiểm tra và đồng bộ danh mục 7 hạng phòng cùng bảng giá niêm yết giữa `rooms.json`, `shared/constants/`, `server.js`, `script.js`, `banla-concierge.js`, `supabase/functions/banla-gemini/index.ts` và `supabase/sql/banla_schema_v2.sql`.
- **Agent thực thi:** Contract & Schema Agent.
- **Quyền hạn:** Ghi vào `shared/constants/` và xuất bản đề xuất diff cho các phân hệ liên quan (chờ duyệt trước khi áp dụng).
- **Input:** Danh mục chuẩn trong `rooms.json` / `shared/constants/`.
- **Output:** Báo cáo đối chiếu 7 hạng phòng và diff đồng bộ.
- **Rủi ro:** Trung bình.

#### 14. `verify_security_19_rules`
- **Mục đích:** Kiểm tra tự động 19 tiêu chuẩn bảo mật vàng của Banla (kiểm tra lộ secret, băm mật khẩu, thời hạn token 8h, PII masking chống IDOR, xác thực chữ ký HMAC-SHA256 của webhook, và điều kiện chỉ đóng dấu đỏ/cấp PIN khi đơn đã `PAID`).
- **Agent thực thi:** QA / Security Agent.
- **Quyền hạn:** Chỉ đọc (`read-only`) và chạy các bài kiểm thử bảo mật.
- **Input:** Mã nguồn hoặc `git diff` của một `TASK-ID`.
- **Output:** Biên bản kiểm tra 19 tiêu chuẩn bảo mật (Pass/Fail từng mục).
- **Rủi ro:** Thấp.

#### 15. `room_pricing_manager` ([`skills/room-pricing-manager/SKILL.md`](../skills/room-pricing-manager/SKILL.md))
- **Mục đích:** Cho phép quản trị viên xem, chỉnh sửa và cập nhật giá phòng (`base_price`, `weekend_price`, `holiday_price`, `discount_percent`, `effective_from`, `effective_to`), lưu lịch sử thay đổi (`room_price_history`) kèm audit log, và đồng bộ giá động giữa Database, API (`/api/admin/rooms*`, `/api/rooms/availability`), `admin.html` và giao diện đặt phòng.
- **Agent thực thi:** Backend Agent & Web Frontend Agent (theo từng `TASK-ID` độc lập).
- **Quyền hạn:** Chỉ làm việc với dữ liệu phòng (`rooms`, `room_price_history`), API phòng/giá, `admin.html` và các trang hiển thị giá/đặt phòng; không xóa phòng hay lịch sử đặt phòng.
- **Input:** Thông số cập nhật giá phòng từ Admin và khoảng ngày `check_in` / `check_out` từ khách hàng.
- **Output:** Migration SQL, API quản lý giá + kiểm tra phòng trống, giao diện Admin quản lý giá phòng, cập nhật đọc giá động trên Web và bộ kiểm thử.
- **Rủi ro:** Cao — liên quan trực tiếp đến tính tiền đặt phòng; bắt buộc chờ duyệt kế hoạch trước khi thực thi.

#### 16. `visa_payment_integration` ([`skills/visa-payment/SKILL.md`](../skills/visa-payment/SKILL.md))
- **Mục đích:** Bổ sung phương thức thanh toán bằng thẻ quốc tế Visa/Mastercard qua cổng thanh toán đạt chuẩn PCI DSS (Stripe / VNPay / OnePay / PayPal) song song với VietQR hiện có, tuyệt đối không thu thập hay lưu trữ dữ liệu thẻ (`card_number`, `cvv`, `expiry`) trên hệ thống Banla.
- **Agent thực thi:** Backend Agent & Web Frontend Agent (theo từng `TASK-ID` độc lập).
- **Quyền hạn:** Tạo router `/api/payments/visa/create-intent`, `/api/payments/visa/webhook`, `/api/payments/:booking_id/status`, cập nhật `transactions`/`bookings`, bổ sung lựa chọn thanh toán Visa trên form đặt phòng và trang kết quả thanh toán.
- **Input:** Yêu cầu thanh toán (`booking_id`, `amount`, `currency`, `payment_option`) và Webhook có chữ ký xác thực từ cổng thanh toán.
- **Output:** Migration SQL mở rộng `transactions`, Backend Visa payment router & webhook handler, giao diện chọn thanh toán Visa + trang kết quả, và bộ test sandbox.
- **Rủi ro:** Cao — liên quan đến giao dịch tài chính và PCI DSS; bắt buộc chờ duyệt kế hoạch và lựa chọn cổng thanh toán trước khi viết code.

