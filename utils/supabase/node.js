/**
 * BANLA BOUTIQUE HOTEL — SUPABASE NODE CLIENT FACTORY
 * Hỗ trợ 2 chế độ tách biệt:
 *   1. `supabase` (publishable key): chỉ gọi được các hàm RPC công khai được phép.
 *   2. `getServiceRoleClient()` (service_role key): chỉ chạy phía Server Node.js,
 *      gắn cứng vào `schema: banla` (tách biệt 100% với `webmoi`).
 */
'use strict';

const { createClient } = require('@supabase/supabase-js');

const DEFAULT_SUPABASE_URL = 'https://hcikbpvzbzottxoitujl.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_4qdA2WQdEK3VOGT6OAf7dw_9TRjzvmL';

function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).trim();

  const publishableKey = (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_PUBLISHABLE_KEY
  ).trim();

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  // Trong môi trường test tự động, không gọi mạng thật trừ khi bật BANLA_TEST_SUPABASE=true
  const isEnabledInRuntime =
    process.env.NODE_ENV !== 'test' || process.env.BANLA_TEST_SUPABASE === 'true';

  return {
    url,
    publishableKey,
    hasServiceRole: Boolean(isEnabledInRuntime && url && serviceRoleKey.length >= 20),
    _serviceRoleKey: isEnabledInRuntime ? serviceRoleKey : ''
  };
}

const initialCfg = getSupabaseConfig();
const supabase = createClient(initialCfg.url, initialCfg.publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

let cachedServiceClient = null;
let cachedServiceKeyFingerprint = '';

function getServiceRoleClient() {
  const cfg = getSupabaseConfig();
  if (!cfg.hasServiceRole) return null;

  const fp = `${cfg.url}::${cfg._serviceRoleKey.length}`;
  if (!cachedServiceClient || cachedServiceKeyFingerprint !== fp) {
    cachedServiceClient = createClient(cfg.url, cfg._serviceRoleKey, {
      db: { schema: 'banla' },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    cachedServiceKeyFingerprint = fp;
  }
  return cachedServiceClient;
}

module.exports = {
  supabase,
  createClient,
  getSupabaseConfig,
  getServiceRoleClient
};
