# Hướng dẫn Deploy — Banla Boutique Hotel

## 1. Chạy local (phát triển)

### Yêu cầu
- Node.js 18+ 
- npm

### Các bước
```bash
git clone https://github.com/lytaothoc1503/Banla.git
cd Banla
npm install
npm start
```

Mở trình duyệt: `http://localhost:3000`

### Chạy static (không cần Node)
Chỉ cần mở file `index.html` bằng Live Server (VS Code / Cursor) hoặc bất kỳ web server tĩnh nào.

---

## 2. Deploy lên GitHub Pages (hiện tại đang dùng)

### Cách 1: Tự động (khuyến nghị)
1. Vào repo: https://github.com/lytaothoc1503/Banla
2. Vào **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / folder: `/ (root)`
5. Lưu. Đợi 1–2 phút.

URL live: https://lytaothoc1503.github.io/Banla/

### Cách 2: GitHub Actions (nếu muốn)
Tạo file `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
```

---

## 3. Deploy lên hosting khác

### Netlify
1. Kéo thả folder vào netlify.com/drop  
   hoặc kết nối GitHub repo.
2. Build command: để trống
3. Publish directory: `.`

### Vercel
1. Import repo GitHub
2. Framework Preset: Other
3. Output directory: `.`

### VPS (Nginx)
```bash
# Trên server
git clone https://github.com/lytaothoc1503/Banla.git /var/www/banla
# Cấu hình Nginx
server {
  listen 80;
  server_name banlaboutique.com;
  root /var/www/banla;
  index index.html;
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 4. Chạy backend (API đặt phòng)

```bash
npm install
npm start
```

API:
- `GET /api/rooms` — danh sách phòng
- `POST /api/booking` — nhận form đặt phòng

**Lưu ý**: GitHub Pages chỉ phục vụ static. Muốn dùng API thật cần deploy backend riêng (Railway, Render, VPS).

---

## 5. Cập nhật sau khi sửa code

```bash
git add .
git commit -m "Mô tả thay đổi"
git push origin main
```

GitHub Pages sẽ tự cập nhật trong 1–2 phút.

---

## 6. Kiểm tra sau deploy

- [ ] Hero hiện đúng
- [ ] Slider 7 phòng chạy
- [ ] Ảnh phòng load
- [ ] Menu mobile mở được
- [ ] Form gửi được (nếu có backend)
- [ ] SEO: xem source có JSON-LD, OG tags

---

## 7. Domain riêng (tùy chọn)

1. Mua domain (vd: banlaboutique.com)
2. Trong GitHub Pages Settings → Custom domain
3. Thêm CNAME record trỏ về `lytaothoc1503.github.io`
4. Bật HTTPS
