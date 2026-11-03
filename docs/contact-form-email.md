# Kết nối form liên hệ với email Banla

Form tại `lien-he/` gửi yêu cầu qua Supabase Edge Function `banla-contact`; Resend chuyển email tới `Contact@banlaboutiquedalat.com`. Khóa Resend và khóa Turnstile bí mật chỉ lưu trong Supabase Secrets.

## Cấu hình một lần

1. Tạo tài khoản Resend, xác minh domain gửi email và tạo API key chỉ có quyền gửi email.
2. Trong Supabase Dashboard → **Edge Functions → Secrets**, đặt:
   - `RESEND_API_KEY`: API key vừa tạo.
   - `BANLA_CONTACT_FROM`: địa chỉ gửi thuộc domain đã xác minh, ví dụ `Banla Website <website@banlaboutiquedalat.com>`.
   - `TURNSTILE_SECRET_KEY`: secret key của widget Turnstile.
3. Trong `banla-config.js`, điền **Site Key công khai** vào `BANLA_TURNSTILE_SITE_KEY`. Không đặt secret/API key ở file này và không gửi secret qua chat.
4. Cấu hình Turnstile cho các hostname thực tế của website, gồm `lytaothoc1503.github.io` và domain riêng nếu có.
5. Triển khai `supabase/functions/banla-contact/index.ts` thành Edge Function tên `banla-contact`. Đặt `verify_jwt = false` theo `supabase/config.toml`; function vẫn yêu cầu publishable key, kiểm tra Origin, xác minh Turnstile và giới hạn tần suất.

Sau khi triển khai, gửi form thử bằng địa chỉ email của bạn và xác nhận thư đến hộp thư Banla. Nếu Resend chưa xác minh domain người nhận/gửi hoặc thiếu Secrets, form sẽ báo lỗi thay vì hiển thị thành công giả.
