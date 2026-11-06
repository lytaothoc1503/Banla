# SKILL: VISA_PAYMENT_INTEGRATION
# Dự án: Banla Boutique Hotel

## Mục đích
Bổ sung phương thức thanh toán bằng thẻ Visa cho đặt phòng Banla,
song song với VietQR hiện có, mà không lưu dữ liệu thẻ trên hệ thống Banla.

## Nguyên tắc bảo mật quan trọng
- KHÔNG thu thập, lưu trữ, log hoặc hiển thị số thẻ, CVV, expiry date đầy đủ.
- KHÔNG tự xử lý dữ liệu thẻ nếu chưa dùng cổng thanh toán tuân thủ PCI DSS.
- Chỉ dùng payment gateway/tokenization: ví dụ Stripe, PayPal, VNPay, OnePay, MoMo Payment Gateway
  hoặc cổng ngân hàng hỗ trợ Visa/Mastercard.
- Frontend chỉ gửi token/payment intent tới backend.
- Backend chỉ tạo payment intent, xác minh webhook và cập nhật trạng thái đơn.
- Mọi webhook phải xác minh chữ ký.
- Mọi thay đổi trạng thái thanh toán phải ghi vào transactions.

## Phạm vi
Được phép làm:
- Thêm lựa chọn "Thanh toán bằng Visa/Thẻ quốc tế" trên trang đặt phòng.
- Tạo payment session/intent qua cổng thanh toán.
- Tạo API backend cho payment intent và webhook.
- Cập nhật bookings và transactions.
- Hiển thị trạng thái thanh toán.
- Tạo trang redirect/return sau thanh toán.
- Thêm test cho luồng thành công, thất bại, huỷ và webhook.

Không được làm:
- Không lưu số thẻ trong database, log, localStorage hoặc file.
- Không gửi secret key xuống frontend.
- Không tự chế cơ chế xử lý thẻ.
- Không đổi logic VietQR hiện có mà chưa có tôi duyệt.
- Không chạy migration hoặc deploy nếu chưa được duyệt.

## Luồng thanh toán Visa

1. Khách chọn phòng, ngày, số khách và phương thức "Visa/Thẻ quốc tế".
2. Hệ thống tạo booking ở trạng thái pending_payment.
3. Backend tạo payment intent/session qua cổng thanh toán.
4. Frontend chuyển khách tới trang thanh toán bảo mật của cổng.
5. Cổng xử lý 3D Secure/3DS nếu cần.
6. Cổng gọi webhook về backend.
7. Backend xác minh chữ ký webhook.
8. Nếu thành công:
   - Cập nhật booking thành confirmed hoặc deposit_paid.
   - Ghi transaction thành paid.
   - Tạo phiếu xác nhận.
   - Kích hoạt quy trình cấp Smart-Lock PIN nếu phù hợp.
9. Nếu thất bại hoặc huỷ:
   - Giữ booking ở pending_payment hoặc cancelled.
   - Ghi transaction failed/cancelled.
   - Thông báo cho khách.

## API đề xuất

POST /api/payments/visa/create-intent
- Input: booking_id, amount, currency=VND, payment_method_type=card
- Output: payment_intent_id, client_secret hoặc redirect_url
- Yêu cầu booking hợp lệ và amount khớp với booking.

POST /api/payments/visa/webhook
- Nhận sự kiện từ cổng thanh toán.
- Xác minh chữ ký.
- Cập nhật transaction và booking.

GET /api/payments/:booking_id/status
- Trả trạng thái thanh toán cho khách.

## Cấu trúc dữ liệu

Bảng transactions cần hỗ trợ:
- id
- booking_id
- provider: vietqr / visa_gateway
- provider_payment_id
- amount
- currency
- status: pending / requires_action / paid / failed / cancelled / refunded
- payment_method: vietqr / visa / mastercard
- raw_event_reference
- created_at
- updated_at

Không lưu:
- card_number
- cvv
- expiry_month
- expiry_year
- full cardholder data

## Ưu đãi hiện có
Giữ nguyên chính sách hiện tại:
- Cọc 50%, phần còn lại thanh toán khi check-in.
- Thanh toán 100% được giảm 10%.
- Visa phải tính đúng số tiền sau ưu đãi và ghi rõ loại thanh toán.

## Giao diện
Trang đặt phòng cần có:
- Radio: "Cọc 50% qua VietQR"
- Radio: "Thanh toán 100% qua VietQR - giảm 10%"
- Radio: "Thanh toán 100% bằng Visa/Thẻ quốc tế"
- Radio: "Cọc 50% bằng Visa/Thẻ quốc tế" nếu tôi duyệt
- Hiển thị tổng tiền, số tiền cọc, số tiền còn lại
- Nút thanh toán an toàn
- Trang kết quả: thành công / đang xử lý / thất bại

## Quy trình thực thi
1. Đọc server.js, banla_payment_module, supabase schema, Drizzle schema và trang đặt phòng.
2. Xác định cổng thanh toán sẽ dùng và biến môi trường cần thiết.
3. Xuất kế hoạch: provider, API, schema, UI, webhook, test.
4. Chờ tôi duyệt trước khi code.
5. Tạo migration nếu cần.
6. Triển khai backend.
7. Triển khai frontend.
8. Thêm test.
9. Kiểm tra preview.
10. Xuất báo cáo và hướng dẫn cấu hình key trên môi trường thật.

## Đầu ra
- Kế hoạch tích hợp
- Migration SQL nếu cần
- Backend payment router
- Webhook handler
- Frontend payment UI
- Test
- Báo cáo diff
- Hướng dẫn cấu hình biến môi trường
- Checklist kiểm thử thẻ Visa trên sandbox

