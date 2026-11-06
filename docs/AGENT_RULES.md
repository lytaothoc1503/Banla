# QUY TẮC PHÂN QUYỀN & CHỐNG XUNG ĐỘT AGENT (`AGENT_RULES.md`)

> **Trạng thái tài liệu:** BẮT BUỘC TUÂN THỦ (Mandatory Governance Rules — Phase 0)  
> **Áp dụng cho:** Orchestrator và toàn bộ Subagents / Cuộc trò chuyện làm việc trên dự án Banla

---

## 1. 8 Quy Tắc Chống Xung Đột Bắt Buộc (Core Anti-Conflict Rules)

Mọi AI Agent và cuộc trò chuyện tham gia vào dự án Banla **bắt buộc** tuân thủ tuyệt đối 8 quy tắc sau:

1. **Một cuộc trò chuyện chỉ làm một `TASK-ID`:**
   - Mỗi phiên làm việc hoặc subagent chỉ được phép nhận và thực thi đúng **01 mã công việc (`TASK-ID`)** đã được định nghĩa rõ phạm vi (ví dụ: `TASK-BE-001`, `TASK-WEB-002`, `TASK-APP-001`). Không tự ý làm lan sang tính năng khác trong cùng một lượt.
2. **Mỗi Agent chỉ sửa thư mục được giao:**
   - Agent thuộc phân hệ nào chỉ được quyền tạo/sửa file trong phạm vi thư mục của phân hệ đó (xem Bảng Phân Quyền Thư Mục ở Mục 2). Nghiêm cấm sửa chéo sang thư mục của Agent khác.
3. **Trước khi ghi file, phải liệt kê file sẽ tạo/sửa và diff dự kiến:**
   - Trước khi thực hiện bất kỳ thao tác ghi đè hoặc chỉnh sửa mã nguồn hiện có, Agent phải xuất danh sách đường dẫn file chịu ảnh hưởng kèm tóm tắt thay đổi (diff dự kiến) để chủ dự án hoặc Orchestrator duyệt.
4. **Không ghi đè file mà chưa đọc bản hiện tại:**
   - Bắt buộc gọi công cụ đọc file (`read_file`) để kiểm tra nội dung mới nhất trên đĩa ngay trước khi sửa (`edit_file` / `write_file`). Tuyệt đối không dựa vào trí nhớ từ các lượt hội thoại cũ vì có thể một tác nhân khác vừa cập nhật file đó.
5. **Không sửa file dùng chung nếu chưa có đề xuất và được duyệt:**
   - Các file dùng chung (như `package.json`, `rooms.json`, `server.js`, `script.js`, `DESIGN.md`, `shared/*`, `supabase/sql/*`, `.env*`) được khóa bảo vệ. Mọi thay đổi trên các file này phải được đề xuất lên Orchestrator và chờ chủ dự án phê duyệt tường minh.
6. **Nếu hai Agent cần cùng một file, chỉ một Agent là Owner:**
   - Không bao giờ cho phép 2 Agent chỉnh sửa song song cùng một file. Orchestrator phải chỉ định duy nhất **01 Agent làm Owner** thực hiện thay đổi tuần tự, hoặc tách phần mã đó thành module độc lập trước khi giao việc.
7. **Mọi thay đổi Contract phải cập nhật `docs/` và `shared/` sau khi được duyệt:**
   - Bất kỳ thay đổi nào về đường dẫn API, cấu trúc Request/Response, tên bảng/cột CSDL, hoặc mã hạng phòng đều phải được cập nhật đồng bộ vào [`docs/API_CONTRACT.md`](API_CONTRACT.md), [`docs/DATA_MODEL.md`](DATA_MODEL.md) và thư mục [`shared/`](../shared/) ngay sau khi chủ dự án duyệt.
8. **Mọi Task kết thúc phải có Báo cáo bàn giao:**
   - Khi hoàn thành một `TASK-ID`, Agent bắt buộc xuất báo cáo gồm: (a) Danh sách file đã tạo/sửa, (b) Kết quả chạy kiểm thử, (c) Các rủi ro hoặc điểm cần lưu ý cho phân hệ khác.

---

## 2. Phân Quyền Agent & Phạm Vi Thư Mục (Directory Ownership Matrix)

| Vai trò Agent | Thư mục được phép Ghi (`Write Scope`) | Thư mục chỉ được Đọc (`Read-Only Scope`) | Thư mục / File CẤM Chạm (`Forbidden Scope`) |
|---|---|---|---|
| **Orchestrator Agent** *(Điều phối viên)* | `docs/`, `skills/`, `backend/tasks/`, `web/tasks/`, `app/tasks/`, `preview/`, `backup/` | Toàn bộ dự án | Không tự ý sửa code nghiệp vụ, config, schema khi chưa được duyệt |
| **Contract & Schema Agent** | `shared/types/`, `shared/schemas/`, `shared/constants/`, `docs/API_CONTRACT.md`, `docs/DATA_MODEL.md` | Toàn bộ dự án | Không tự ý chạy migration hoặc sửa code UI/App |
| **Backend Agent** (`backend-agent`) | `backend/`, `banla_payment_module/backend/`, `utils/`, `scripts/`, *(và `server.js`, `supabase/` khi được giao quyền Owner)* | `shared/`, `docs/`, `rooms.json`, `test/`, `skills/backend-agent/SKILL.md` | `web/`, `app/`, `DFT2_bot/`, `styles.css`, `index.html`, `.env` |
| **Web Frontend Agent** | `web/`,*(và các file HTML/CSS/JS giao diện web khi được giao quyền Owner)* | `shared/`, `docs/`, `rooms.json`, `images/`, `vendor/` | `backend/`, `server.js`, `supabase/`, `DFT2_bot/`, `utils/security.js`, `.env` |
| **App / Bot Agent** | `app/`, `DFT2_bot/` | `shared/`, `docs/`, `rooms.json` | `backend/`, `web/`, `server.js`, `supabase/`, `DFT2_bot/.tgcloud/`, `.env` |
| **QA / Test & Review Agent** | `test/`, `preview/` | Toàn bộ dự án | Không sửa mã nguồn sản phẩm (chỉ viết test và xuất báo cáo review) |

---

## 3. Quy Tắc Đặt Tên & Quản Lý Task (`TASK-ID`)

Mỗi công việc phải được tạo thành một file đặc tả trong thư mục `tasks/` tương ứng trước khi bắt đầu code:
- **Backend Task:** `backend/tasks/TASK-BE-<số>-<slug>.md`
- **Web Task:** `web/tasks/TASK-WEB-<số>-<slug>.md`
- **App Task:** `app/tasks/TASK-APP-<số>-<slug>.md`

Mỗi file Task phải ghi rõ:
1. `TASK-ID` và tên công việc.
2. Agent chịu trách nhiệm (`Owner`).
3. Danh sách **chính xác** các file được phép tạo mới hoặc chỉnh sửa (`Locked Files`).
4. Tiêu chí nghiệm thu (`Acceptance Criteria`).
5. Trạng thái: `draft` → `approved` → `in_progress` → `review` → `completed`.

---

## 4. Quy Tắc Bảo Mật & An Toàn Dữ Liệu (Security & Safety Rules)

1. **Bảo vệ Bí mật (Zero Secret Exposure):**
   - Tuyệt đối không đọc để in ra màn hình, không ghi vào tài liệu/log/commit bất kỳ giá trị nào của: `ADMIN_KEY`, `ADMIN_SESSION_SECRET`, `BANLA_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OTA_API_KEY`, `SMTP_PASS`, `XAI_API_KEY`, `OPENAI_API_KEY`, `BANLA_ADMIN_TOKEN`.
   - Khi kiểm tra cấu hình môi trường, chỉ được phép liệt kê **tên biến** (keys), không bao giờ hiển thị **giá trị** (values).
2. **Cách ly Cơ sở dữ liệu Supabase:**
   - Mọi truy vấn, bảng, view, function của dự án Banla phải nằm trong schema `banla` hoặc mang tiền tố `banla_`.
   - Tuyệt đối không chạy lệnh `DROP`, `TRUNCATE`, `ALTER` hoặc `DELETE` trên schema `public` (nơi chứa dữ liệu của dự án `webmoi`).
3. **Bảo vệ Luồng Thanh toán & Mã khóa Smart-Lock:**
   - Không bao giờ cấp mã `smartLockPin` hoặc hiển thị con dấu đỏ **"ĐÃ THANH TOÁN"** dựa trên dữ liệu chưa xác thực từ `localStorage` hoặc query parameter trên URL.
   - Mọi so sánh mật khẩu, API key, token quản trị và chữ ký webhook phải sử dụng `crypto.timingSafeEqual` (`safeTimingCompare`).
4. **Sao lưu Trước Khi Sửa Quan Trọng:**
   - Trước khi thực hiện các thay đổi lớn trên file cốt lõi (`server.js`, `script.js`, `admin.html`, `phieu.html`, `data/bookings.json`), phải kích hoạt bước sao lưu vào `backup/` hoặc `data/backups/`.

