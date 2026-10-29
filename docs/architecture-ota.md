# Kiến trúc: Banla (site độc lập) ↔ OTA khách sạn tổng

## Hai site
| | Banla Boutique (repo này) | OTA tổng (dự án riêng) |
|---|---|---|
| Vai trò | Site thương hiệu, đặt trực tiếp 1 khách sạn | Sàn nhiều khách sạn, so sánh & đặt |
| Màu | Terracotta `#8B4513` + cam `#f97316` | Navy + cam |
| Hosting | Node/Express (đầy đủ) hoặc GitHub Pages (tĩnh) | Riêng |

## Luồng dữ liệu
1. **`rooms.json`** — nguồn dữ liệu phòng duy nhất của Banla (id, tên, diện tích, sức chứa, mô tả, ảnh). Giá để placeholder, không ghi số chưa xác thực.
2. **`GET /api/rooms`** — trả nguyên `rooms.json`. OTA gọi endpoint này (hoặc đọc file tĩnh `/rooms.json` trên GitHub Pages) để đồng bộ hạng phòng Banla vào trang chi tiết khách sạn của OTA, map theo `id` phòng. Nên cache phía OTA (vd. 1 giờ).
3. **`POST /api/booking`** — nhận yêu cầu đặt phòng (`name`, `phone`/`email`, `checkin`, `checkout`, `room`, `guests`, `message`), validate, lưu `data/bookings.json`, gửi email nếu có SMTP (xem `.env.example`). OTA có thể gửi booking về đây và thêm trường `source: "ota"` (đề xuất, chưa triển khai).

```
OTA (navy/cam) ──GET /api/rooms──▶ Banla server ──đọc── rooms.json
OTA / form Banla ──POST /api/booking──▶ validate ─▶ data/bookings.json (+ email)
```

## Fallback tĩnh
Trên GitHub Pages không có API: form hiển thị thông báo liên hệ qua điện thoại/Zalo (placeholder `[SỐ ĐIỆN THOẠI]`).

## Việc tiếp theo (đề xuất)
- Thêm CORS giới hạn domain OTA khi có domain thật.
- API key đơn giản cho POST từ OTA; chuyển lưu trữ sang DB khi lưu lượng tăng.
- Đồng bộ tình trạng phòng trống (hiện chưa có).
