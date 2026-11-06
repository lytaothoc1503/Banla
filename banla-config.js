/* Banla — cấu hình công khai cho trợ lý lễ tân AI & các hàm RPC công khai trên Supabase (`banla`).
   Chỉ chứa URL và publishable key của Supabase — được phép công khai.
   Trình duyệt KHÔNG có quyền đọc/ghi trực tiếp bảng nào (chỉ gọi được các hàm RPC công khai).
   TUYỆT ĐỐI KHÔNG đặt GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY hay bất kỳ secret nào vào file này. */
window.BANLA_SUPABASE_URL = window.BANLA_SUPABASE_URL || 'https://hcikbpvzbzottxoitujl.supabase.co';
window.BANLA_SUPABASE_ANON_KEY = window.BANLA_SUPABASE_ANON_KEY || 'sb_publishable_4qdA2WQdEK3VOGT6OAf7dw_9TRjzvmL';
window.BANLA_GEMINI_ENDPOINT = window.BANLA_GEMINI_ENDPOINT || (window.BANLA_SUPABASE_URL + '/functions/v1/banla-gemini');
window.BANLA_GEMINI_KEY = window.BANLA_GEMINI_KEY || window.BANLA_SUPABASE_ANON_KEY;
