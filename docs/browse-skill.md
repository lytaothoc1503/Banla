---
name: browse
description: Duyệt web, kiểm tra giao diện (UI/UX), trích xuất mã nguồn và phân tích nội dung website từ URL được cung cấp.
---

# Kỹ Năng Duyệt Web (Browse Skill)

## 1. Mục Đích

Kỹ năng này cho phép Agent truy cập các trang web công khai, đọc cấu trúc DOM/HTML, kiểm tra các liên kết (links), đánh giá thiết kế giao diện và trích xuất dữ liệu bài viết hoặc thông tin phòng/khách sạn.

## 2. Quy Trình Thực Hiện (Workflow)

1. **Kiểm Tra Tính Hợp Lệ:** Đảm bảo URL bắt đầu bằng `http://` hoặc `https://`.
2. **Tải Nội Dung:**
   - Ưu tiên cào nội dung văn bản chính và cấu trúc HTML Semantic (`<header>`, `<nav>`, `<main>`, `<section>`, `<footer>`).
   - Kiểm tra mã trạng thái HTTP (200 OK, 404 Not Found, 403 Forbidden).
3. **Phân Tích Cấu Trúc & Lỗi:**
   - Liệt kê các thẻ điều hướng, form nhập liệu, nút CTA (Call to action).
   - Bắt các lỗi liên kết hỏng (ví dụ: `href="about:invalid"`, link chết, link 404).
4. **Định Dạng Đầu Ra:**
   - Tóm tắt nội dung chính trong 3–5 gạch đầu dòng.
   - Trích xuất bảng dữ liệu hoặc form mẫu nếu người dùng yêu cầu phân tích kỹ thuật.

## 3. Quy Tắc & Giới Hạn (Guardrails)

- Không cố gắng đăng nhập vào các trang yêu cầu mật khẩu nếu không có phiên làm việc (session).
- Bỏ qua các đoạn mã theo dõi (analytics/tracking scripts) để tiết kiệm dung lượng ngữ cảnh (context window).
- Phản hồi bằng tiếng Việt khi làm việc với các dự án tiếng Việt.

## 4. Các Lệnh `browse` CLI Thực Tế

| Tác vụ | Lệnh CLI | Mục đích |
| :--- | :--- | :--- |
| **Mở trang web** | `browse open http://localhost:3000 --local` | Khởi chạy và điều hướng trình duyệt cục bộ |
| **Lấy cấu trúc trang** | `browse snapshot` | Quét cấu trúc DOM và lấy các mã ref `@ref` |
| **Chụp màn hình** | `browse screenshot --path ./preview.png` | Lưu ảnh chụp giao diện hiện tại |
| **Nhập form** | `browse fill @0-1 "Nguyễn Văn A"` | Điền dữ liệu vào ô nhập liệu qua ref |
| **Click nút** | `browse click @0-5` | Click nút gửi yêu cầu hoặc menu |
| **Dừng phiên** | `browse stop` | Đóng phiên làm việc của trình duyệt |

## 5. Kịch Bản Kiểm Thử Cho Banla Boutique Hotel

1. **Kiểm tra Giao diện Đặt phòng:**
   - Mở trang `http://localhost:3000/lien-he/`
   - Quét snapshot kiểm tra các trường: Họ tên, Số điện thoại, Ngày check-in/out, Loại phòng.
   - Thử gửi form rỗng để xác nhận validation lỗi hiển thị đúng.
2. **Kiểm tra Tính Tương Thích Di Động (Responsive):**
   - Thiết lập kích thước viewport: `browse viewport 390 844` (iPhone 14)
   - Chụp ảnh màn hình kiểm tra menu hamburger và độ giãn cách các thành phần.
3. **Kiểm tra Danh Sách Phòng (`rooms.json`):**
   - Mở `http://localhost:3000/listing.html`
   - Kiểm tra các thẻ phòng, hình ảnh và nút "Xem chi tiết" có dẫn đến đúng link hay không.
