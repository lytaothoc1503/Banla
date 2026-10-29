# Banla Boutique Hotel — Website

Website chính thức cho Banla Boutique Hotel Đà Lạt.  
Phong cách boutique ấm áp, tinh tế — “Ngoài lạnh. Trong ấm.”

## Cấu trúc

- `index.html` — Trang chủ (hero, slider phòng, The Roof, gallery, contact)
- `room.html` — Trang chi tiết từng phòng (động từ `rooms.json`)
- `rooms.json` — Dữ liệu 7 phòng
- `styles.css` — Giao diện terracotta, responsive
- `script.js` — Slider, lightbox, form, service worker
- `server.js` — Express API (`/api/rooms`, `/api/booking`)
- `sw.js` — Service Worker cache
- `robots.txt`, `sitemap.xml` — SEO

## Chạy local

```bash
npm install
npm start
# http://localhost:3000
```

## Ảnh

Thư mục `images/` chứa ảnh phòng thật (elite, signature, highland, connecting, twin, suite, balcony).

## GitHub

https://github.com/lytaothoc1503/Banla
