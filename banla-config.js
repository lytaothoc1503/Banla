/* Banla — cấu hình công khai cho trợ lý lễ tân AI (Gemini qua Supabase Edge Function).
   Chỉ chứa URL và publishable key của Supabase — được phép công khai.
   KHÔNG đặt GEMINI_API_KEY hay bất kỳ secret nào vào file này. */
window.BANLA_GEMINI_ENDPOINT = window.BANLA_GEMINI_ENDPOINT || 'https://hcikbpvzbzottxoitujl.supabase.co/functions/v1/banla-gemini';
window.BANLA_PAYMENT_ENDPOINT = window.BANLA_PAYMENT_ENDPOINT || 'https://hcikbpvzbzottxoitujl.supabase.co/functions/v1/banla-payment';
window.BANLA_GEMINI_KEY = window.BANLA_GEMINI_KEY || 'sb_publishable_4qdA2WQdEK3VOGT6OAf7dw_9TRjzvmL';
