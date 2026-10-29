# Banla Boutique Hotel — Website

Website chính thức cho Banla Boutique Hotel Đà Lạt.  
Phong cách boutique — highland mist + ember — “Ngoài lạnh. Trong ấm.”  
Nguồn sự thật giao diện: [`DESIGN.md`](DESIGN.md).

## Trạng thái

Đầy đủ và đang chạy live.

## Cấu trúc

| File | Mô tả |
|------|--------|
| `index.html` | Trang chủ (hero full-bleed, slider 7 phòng, The Roof, gallery, contact) |
| `room.html` | Trang chi tiết phòng động |
| `rooms.json` | Dữ liệu 7 phòng |
| `DESIGN.md` | Design system — khóa màu + typography (2 tử huyệt) |
| `styles.css` | Highland mist + ember, responsive, ảnh phòng |
| `script.js` | Slider, lightbox, form, Anime.js motion |
| `vendor/anime.umd.min.js` | Anime.js v4 (local) |
| `server.js` | Express API `/api/rooms`, `/api/booking` |
| `sw.js` | Service Worker |
| `robots.txt`, `sitemap.xml` | SEO |
| `images/` | 7 ảnh phòng thật |
| `docs/deploy.md` | Hướng dẫn deploy chi tiết |

## Ảnh phòng

- `elite.jpg` — Élite Room
- `signature.jpg` — Banla Signature
- `highland.jpg` — Highland Room
- `connecting.jpg` — Connecting Room
- `twin.jpg` — Deluxe Twin
- `suite.jpg` — Original Suite
- `balcony.jpg` — Deluxe Balcony

## Chạy local

```bash
npm install
npm start
# http://localhost:3000
```

## Deploy

Xem hướng dẫn đầy đủ: [docs/deploy.md](docs/deploy.md)

## Live

https://lytaothoc1503.github.io/Banla/

## Repo

https://github.com/lytaothoc1503/Banla
