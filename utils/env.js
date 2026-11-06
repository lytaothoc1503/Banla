/**
 * BANLA BOUTIQUE HOTEL — SAFE ENVIRONMENT LOADER
 * Tự động nạp `.env` và `.env.local` khi chạy trực tiếp `node server.js` (PM2 / Docker / CLI),
 * không ghi đè các biến đã được đặt sẵn từ môi trường hệ thống hoặc bộ test (`NODE_ENV=test`).
 * TUYỆT ĐỐI KHÔNG ghi log giá trị biến môi trường.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let loaded = false;

function parseEnvContent(content) {
  const entries = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const cleaned = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIdx = cleaned.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = cleaned.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let val = cleaned.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else {
      const commentIdx = val.indexOf(' #');
      if (commentIdx >= 0) val = val.slice(0, commentIdx).trim();
    }
    entries[key] = val;
  }
  return entries;
}

function loadEnvFiles(rootDir = path.join(__dirname, '..')) {
  if (loaded) return;
  loaded = true;

  // Khi chạy kiểm thử tự động (`NODE_ENV=test`), giữ nguyên môi trường cô lập của từng file test
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  // Thứ tự ưu tiên: biến môi trường OS > `.env.local` > `.env`
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');

  for (const filePath of [envLocalPath, envPath]) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined && v !== '') {
          process.env[k] = v;
        }
      }
    } catch (_) {
      // Bỏ qua lỗi đọc file cấu hình tùy chọn
    }
  }

  // Đồng bộ bí danh cấu hình công khai Supabase nếu chưa khai báo SUPABASE_URL riêng
  if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!process.env.SUPABASE_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
}

module.exports = { loadEnvFiles, parseEnvContent };
