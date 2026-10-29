# Changelog

## [Unreleased] — nhánh `bo-sung-con-thieu`
### Thêm
- `docs/architecture-ota.md`: kiến trúc kết nối Banla với site OTA tổng (rooms.json, /api/rooms, /api/booking).
- `/api/booking` xử lý thật: validate (họ tên, SĐT/email, ngày, phòng, số khách), lưu `data/bookings.json`, gửi email qua nodemailer nếu có cấu hình SMTP.
- `.env.example` mô tả biến môi trường SMTP.
- Ô "Số khách" trong form đặt phòng.
- Test `test/api.test.js` (node:test + fetch) và script `npm test`.
- `.gitignore` (node_modules, data/bookings.json, .env).
### Sửa
- `script.js`: gửi đúng trường ghi chú (`note`), thêm `guests`; chỉ reset form khi gửi thành công; thông báo rõ khi không gọi được API (bản GitHub Pages) kèm placeholder điện thoại/Zalo.
- Thay placeholder `[SỐ ĐIỆN THOẠI]` bằng `0965999999` (`tel:0965999999`, `https://zalo.me/0965999999`).
- `server.js`: export `app` để test, chỉ listen khi chạy trực tiếp.
