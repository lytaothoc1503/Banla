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

## Thanh toán thẻ (PayPal, OnePay và 9Pay)

Khách có thể trả cọc hoặc hóa đơn bằng thẻ trên trang của cổng. Banla không có ô nhập số thẻ. Bấm **Thanh toán an toàn qua PayPal** hoặc **Thanh toán an toàn qua OnePay** sẽ chuyển sang trang của cổng đó. Nút **Thanh toán an toàn qua 9Pay** chỉ hiện khi `NINEPAY_ENABLED=true`. 9Pay nhận Visa, Mastercard, JCB, Amex (nội địa và quốc tế), Apple Pay, Google Pay, Samsung Pay và QR trên trang host của 9Pay. Tiền về tài khoản cổng của cửa hàng; việc rút về ngân hàng nằm trong cổng, không nằm trong website.

Đơn chỉ chuyển sang đã thanh toán khi máy chủ đối chiếu đủ ba điểm: đúng mã đơn, đúng số tiền trên hóa đơn (cọc 50% hoặc 100% đã giảm), và đúng loại tiền `VND`. Sai số tiền hoặc sai loại tiền thì đơn giữ nguyên chưa thanh toán.

### Biến môi trường

Xem [`.env.example`](.env.example). Secret chỉ đặt trong `.env` (đã ignore). `CARD_PAYMENT_MODE` mặc định là `sandbox`.

| Biến | Sandbox | Live |
| --- | --- | --- |
| Công tắc | `CARD_PAYMENT_MODE=sandbox` | `CARD_PAYMENT_MODE=live` và `PUBLIC_BASE_URL` là HTTPS |
| PayPal | `PAYPAL_SANDBOX_CLIENT_ID`, `PAYPAL_SANDBOX_CLIENT_SECRET`, `PAYPAL_SANDBOX_WEBHOOK_ID` | `PAYPAL_LIVE_CLIENT_ID`, `PAYPAL_LIVE_CLIENT_SECRET`, `PAYPAL_LIVE_WEBHOOK_ID` |
| OnePay | `ONEPAY_SANDBOX_MERCHANT`, `ONEPAY_SANDBOX_ACCESS_CODE`, `ONEPAY_SANDBOX_HASH_KEY` | `ONEPAY_LIVE_MERCHANT`, `ONEPAY_LIVE_ACCESS_CODE`, `ONEPAY_LIVE_HASH_KEY` |
| 9Pay | `NINEPAY_ENABLED=true` cùng `NINEPAY_SANDBOX_MERCHANT_KEY`, `NINEPAY_SANDBOX_SECRET_KEY`, `NINEPAY_SANDBOX_CHECKSUM_KEY` | `NINEPAY_LIVE_MERCHANT_KEY`, `NINEPAY_LIVE_SECRET_KEY`, `NINEPAY_LIVE_CHECKSUM_KEY` |

`NINEPAY_ENABLED` mặc định tắt. Khi tắt, nút 9Pay không hiện và máy chủ không tạo phiên 9Pay. PayPal, OnePay và VietQR giữ nguyên.

Hai bộ credential không dùng chéo. Thiếu credential thì nút báo cổng chưa cấu hình, không hiện form thẻ.

`PAYPAL_CURRENCY` để trống để gửi đúng số tiền VND của hóa đơn. Website không tự nhân tỷ giá. Nếu tài khoản PayPal không nhận VND, PayPal từ chối phiên và khách dùng OnePay — OnePay nhận đúng số VND.

### Thử sandbox

1. PayPal: tạo REST app trong [PayPal Developer Sandbox](https://developer.paypal.com/dashboard/applications/sandbox). Điền client id và secret sandbox. Trong app, thêm webhook `https://<domain-public>/api/payments/paypal/webhook`, chọn sự kiện `PAYMENT.CAPTURE.COMPLETED`, rồi điền Webhook ID.
2. OnePay: lấy merchant, access code và hash sandbox từ OnePay. Điền vào biến `ONEPAY_SANDBOX_*`. Trong cổng OnePay, đặt IPN là `https://<domain-public>/api/payments/onepay/ipn`. Return URL do website ký sẵn: `PUBLIC_BASE_URL/api/payments/onepay/return`.
3. `PUBLIC_BASE_URL` phải là origin khách và cổng quay lại được. IPN/webhook cần địa chỉ public; `localhost` chỉ đủ cho bước redirect trên máy mình.
4. 9Pay: đăng ký merchant tại 9Pay và lấy bộ key sandbox (Merchant Key, Secret Key, Checksum Key). Đặt vào `NINEPAY_SANDBOX_*`. Trên Merchant View sandbox (`https://sand-business.9pay.vn`), đăng ký IPN:
   - Site tĩnh đang gọi Supabase: `https://hcikbpvzbzottxoitujl.supabase.co/functions/v1/banla-payment`
   - Máy chủ Express: `https://<domain-public>/api/payments/ninepay/ipn`
   Return URL do máy chủ ký sẵn, không cần nhập secret vào trang: Supabase `.../banla-payment?flow=ninepay-return`, Express `PUBLIC_BASE_URL/api/payments/ninepay/return`.
5. Chạy `npm start`, đặt phòng, bấm một nút thẻ. Nhập thẻ thử chỉ trên trang PayPal, OnePay hoặc 9Pay. Không chép số thẻ thử vào repo, email, log hay database.
6. Thành công khi trang Banla hiện số tiền và mã đơn đã được cổng xác nhận, và đơn trong dữ liệu có `paymentStatus` là `DEPOSIT_PAID` (cọc) hoặc `PAID` (trả đủ). Hủy trên cổng thì đơn vẫn chưa thanh toán.

Chỉ đổi `CARD_PAYMENT_MODE=live` sau khi chủ cửa hàng xác nhận merchant live, URL HTTPS và webhook/IPN live. Đừng điền secret live vào chế độ sandbox. Chỉ đặt `NINEPAY_ENABLED=true` sau khi sandbox 9Pay đã xác nhận đúng số tiền. Site đang chạy giữ nguyên nút PayPal, OnePay và VietQR khi cờ này tắt.

## Deploy

Xem hướng dẫn đầy đủ: [docs/deploy.md](docs/deploy.md)

## Live

https://lytaothoc1503.github.io/Banla/

## Repo

https://github.com/lytaothoc1503/Banla
