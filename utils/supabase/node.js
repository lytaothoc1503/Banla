const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hcikbpvzbzottxoitujl.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4qdA2WQdEK3VOGT6OAf7dw_9TRjzvmL';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase, createClient };

