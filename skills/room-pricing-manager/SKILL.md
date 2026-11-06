# SKILL: ROOM_PRICING_MANAGER
# Dự án: Banla Boutique Hotel

## Mục đích
Cho phép quản trị viên xem, chỉnh sửa và cập nhật giá phòng của Banla một cách an toàn,
đồng bộ giữa database, API và giao diện đặt phòng.

## Phạm vi
Chỉ được làm việc với:
- Bảng/dữ liệu phòng: rooms
- API liên quan đến phòng và giá
- Trang admin quản lý phòng/giá
- Trang đặt phòng hiển thị giá
- Dữ liệu phòng tĩnh nếu còn tồn tại: rooms.json, room.html, listing.html

## Không được làm
- Không sửa bảng users, bookings, transactions trừ khi cần thiết cho ràng buộc dữ liệu.
- Không xoá phòng hoặc dữ liệu lịch sử đặt phòng.
- Không tự chạy migration mà chưa có tôi duyệt.
- Không hardcode giá mới vào nhiều nơi.
- Không hiển thị secret, connection string, API key.

## Yêu cầu chức năng

### 1. Danh sách phòng
Admin phải xem được:
- Tên phòng
- Mã phòng
- Giá gốc mỗi đêm
- Giá khuyến mãi nếu có
- Sức chứa
- Trạng thái: active / inactive
- Ngày cập nhật giá gần nhất

### 2. Chỉnh sửa giá
Admin có thể cập nhật:
- base_price: giá gốc mỗi đêm
- weekend_price: giá cuối tuần, nếu có
- holiday_price: giá ngày lễ, nếu có
- discount_percent: giảm giá theo phần trăm
- effective_from và effective_to: thời gian áp dụng giá

### 3. Quy tắc giá
- Giá hiển thị trên website phải lấy từ database/API, không lấy cứng từ HTML.
- Nếu có nhiều mức giá, hệ thống phải chọn giá hợp lệ theo ngày nhận phòng.
- Giá phải lưu bằng số nguyên VND hoặc decimal chính xác, không dùng số thực dễ sai số.
- Mọi thay đổi giá phải lưu lịch sử: room_price_history.
- Không ghi đè giá cũ; chỉ thêm bản ghi giá mới.

### 4. API đề xuất

GET /api/admin/rooms
- Trả danh sách phòng và giá hiện hành.

GET /api/admin/rooms/:id/prices
- Trả lịch sử giá.

PATCH /api/admin/rooms/:id/prices
- Cập nhật giá mới.
- Yêu cầu Firebase Auth và role admin.
- Validate dữ liệu đầu vào.
- Ghi vào room_price_history.

GET /api/rooms/availability?check_in=...&check_out=...&guests=...
- Trả phòng khả dụng và giá áp dụng cho khoảng thời gian đó.

## Bảo mật
- Tất cả API admin phải yêu cầu xác thực Firebase.
- Chỉ role admin được sửa giá.
- Validate: giá >= 0, ngày hợp lệ, effective_to >= effective_from.
- Ghi audit log: admin_id, room_id, old_price, new_price, timestamp, IP.
- Không cho phép cập nhật giá qua API công khai.

## Giao diện cần có
Trong admin.html, thêm hoặc hoàn thiện:
- Bảng danh sách phòng
- Nút "Chỉnh sửa giá"
- Form cập nhật giá
- Xác nhận trước khi lưu
- Thông báo thành công/thất bại
- Hiển thị giá đang áp dụng và lịch sử giá

## Quy trình thực thi
1. Đọc schema rooms, bookings, transactions và các API hiện có.
2. Xuất kế hoạch thay đổi: file, bảng, API, UI.
3. Chờ tôi duyệt.
4. Tạo migration nếu cần.
5. Cập nhật backend.
6. Cập nhật admin UI.
7. Cập nhật trang đặt phòng để đọc giá động.
8. Chạy test và kiểm tra preview.
9. Xuất báo cáo thay đổi.

## Đầu ra
- Migration SQL nếu cần
- Code backend
- Code admin UI
- Cập nhật trang đặt phòng
- Test
- Báo cáo diff và hướng dẫn kiểm tra

