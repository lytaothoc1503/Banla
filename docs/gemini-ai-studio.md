# Kết nối Google AI Studio (Gemini) với web Banla

## Kiến trúc

```
Trình duyệt (banla-concierge.js / ai-studio.html)
   │  publishable key Supabase (được phép công khai)
   ▼
Supabase Edge Function `banla-gemini`  ←  GEMINI_API_KEY (Supabase Secrets)
   │
   ▼
Gemini API (generativelanguage.googleapis.com)
```

API key Gemini **không bao giờ** nằm trong HTML/JS gửi xuống trình duyệt.

## Các file

| File | Vai trò |
| :--- | :--- |
| `supabase/functions/banla-gemini/index.ts` | Proxy gọi Gemini: chế độ `chat` (công khai, giới hạn 12 tin/phút/IP), `content` và `image` (cần mã quản trị) |
| `banla-concierge.js` + `banla-concierge.css` | Khung chat "Bàn Là · Lễ tân AI"; mọi câu hỏi tự gõ hoặc chọn gợi ý đều gửi tới Gemini |
| `ai-studio.html` | Trang nội bộ (noindex) tạo bài Cẩm nang, mô tả phòng, caption, ảnh marketing |

## Hội thoại và bộ nhớ ngữ cảnh

- Widget giữ tối đa 20 tin nhắn gần nhất trong `sessionStorage` của tab trình duyệt và gửi chúng cùng mỗi câu hỏi cho Gemini. Nhờ vậy Gemini có thể hiểu câu hỏi tiếp nối trong phiên hiện tại.
- Sau câu trả lời thành công, lượt hỏi/đáp có thể được ghi vào bảng `public.banla_concierge_turns` để lễ tân xem lại. Bộ log này không được đưa vào ngữ cảnh của khách khác; Gemini chỉ nhận lịch sử của tab hiện tại.
- Edge Function chỉ lưu lượt không phát hiện chuỗi giống email, số điện thoại hoặc số thẻ. Khung chat thông báo việc lưu hội thoại và nhắc khách không gửi thông tin cá nhân.
- Gemini là nguồn trả lời duy nhất của widget. Nếu Edge Function/API AI không sẵn sàng hoặc trả lời rỗng, widget báo lỗi kết nối thay vì đưa ra câu trả lời soạn sẵn. Các nút gợi ý ban đầu vẫn được giữ nguyên và không bắt buộc phải bấm.

## Thiết lập (một lần)

1. Tạo API key tại https://aistudio.google.com/apikey.
2. Cài Supabase CLI, đăng nhập và liên kết project:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   ```
3. Lưu secrets (gõ trực tiếp trong terminal của bạn, không dán vào chat hay commit):
   ```bash
   supabase secrets set GEMINI_API_KEY=<key-từ-AI-Studio>
   supabase secrets set BANLA_ADMIN_TOKEN=<chuỗi-ngẫu-nhiên-dài-≥32-ký-tự>
   # Tuỳ chọn:
   supabase secrets set GEMINI_MODEL=gemini-flash-latest
   supabase secrets set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
   supabase secrets set BANLA_ALLOWED_ORIGINS=https://lytaothoc1503.github.io,http://localhost:3000
   ```
   Kiểm tra tên model hiện hành trong AI Studio; nếu Google đổi tên model, chỉ cần cập nhật secret, không phải sửa code.
4. Deploy function:
   ```bash
   supabase functions deploy banla-gemini
   ```
5. Cấu hình trang web dùng Supabase (đã dùng chung cho lưu đơn đặt phòng):
   ```html
   <script>
     window.BANLA_SUPABASE_URL = 'https://<PROJECT_REF>.supabase.co';
     window.BANLA_SUPABASE_ANON_KEY = '<publishable-key>';
   </script>
   ```
   Edge Function cần được deploy và cấu hình đúng endpoint/key. Để lưu lượt hội thoại, áp dụng SQL `supabase/sql/banla_concierge_turns.sql` và bảo đảm Edge Function có `SUPABASE_SERVICE_ROLE_KEY` dưới dạng secret. Nếu AI chưa sẵn sàng, khung chat vẫn hiển thị nhưng báo lỗi kết nối, không thay bằng câu trả lời mẫu.

## Kiểm tra nhanh

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/banla-gemini" \
  -H "Content-Type: application/json" \
  -H "apikey: <publishable-key>" -H "Authorization: Bearer <publishable-key>" \
  -H "Origin: http://localhost:3000" \
  -d '{"mode":"chat","messages":[{"role":"user","text":"Giờ mở cửa The Roof?"}]}'
```

## Lưu ý an toàn

- Trợ lý chỉ trả lời theo dữ kiện khách sạn trong `HOTEL_FACTS`; khi đổi giá/chính sách, cập nhật khối này rồi deploy lại.
- Trợ lý không xem phòng trống, không nhận thanh toán, không cấp mã PIN.
- Đặt giới hạn chi tiêu/hạn mức cho API key trong Google AI Studio / Google Cloud.
- Đổi `BANLA_ADMIN_TOKEN` ngay nếu nghi bị lộ.
