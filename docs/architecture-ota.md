# Kiến trúc: Banla (site độc lập) ↔ OTA khách sạn tổng

## Hai site
| | Banla Boutique (repo này) | OTA tổng (dự án riêng) |
|---|---|---|
| Vai trò | Site thương hiệu, đặt trực tiếp 1 khách sạn | Sàn nhiều khách sạn, so sánh & đặt |
| Màu | Terracotta `#8B4513` + cam `#f97316` | Navy + cam |
| Hosting | Node/Express (đầy đủ) hoặc GitHub Pages (tĩnh) | Riêng |

## Luồng dữ liệu
1. **`rooms.json`** — nguồn dữ liệu phòng duy nhất của Banla (id, tên, diện tích, sức chứa, mô tả, ảnh). Giá để placeholder, không ghi số chưa xác thực.
2. **`GET /api/rooms`** — trả nguyên `rooms.json`. OTA gọi endpoint này (hoặc đọc file tĩnh `/rooms.json` trên GitHub Pages) để đồng bộ hạng phòng Banla vào trang chi tiết khách sạn của OTA, map theo `id` phòng. Nên cache phía OTA (vd. 1 giờ). Hỗ trợ CORS cấu hình qua `OTA_ALLOWED_ORIGINS`.
3. **`POST /api/booking`** — nhận yêu cầu đặt phòng (`name`, `phone`/`email`, `checkin`, `checkout`, `room`, `guests`, `source`, `message`), validate, lưu `data/bookings.json`, gửi email nếu có SMTP (xem `.env.example`).
   - Trường `source`: nhận giá trị `"direct"` (mặc định nếu đặt trên web Banla) hoặc `"ota"` (nếu đặt từ sàn OTA).
   - Xác thực: Khi `OTA_API_KEY` được thiết lập trên server, request từ OTA (`source: "ota"` hoặc gửi kèm header) bắt buộc phải truyền header `x-api-key`.

```
OTA (navy/cam) ──GET /api/rooms (CORS)──▶ Banla server ──đọc── rooms.json
OTA / form Banla ──POST /api/booking (x-api-key)──▶ validate (source) ─▶ data/bookings.json (+ email)
```

## Fallback tĩnh
Trên GitHub Pages không có API: form hiển thị thông báo liên hệ qua điện thoại tel:0965999999 hoặc Zalo https://zalo.me/0965999999.

## Việc tiếp theo (đề xuất)
- Chuyển lưu trữ booking từ JSON sang Database (PostgreSQL / SQLite) khi lưu lượng tăng cao.
- Đồng bộ tình trạng phòng trống theo thời gian thực (Availability calendar).
- Webhook phản hồi trạng thái xác nhận đặt phòng ngược về OTA.
