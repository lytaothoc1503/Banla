const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'sql', '20261116_banla_lock_anon_dml.sql');
const schemaPath = path.join(__dirname, '..', 'supabase_schema.sql');

test('Migration khóa anon không mở policy USING (true) và không xóa dữ liệu', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /revoke all on table banla\.bookings from %I/i);
  assert.match(sql, /revoke all on table banla\.transactions from %I/i);
  assert.match(sql, /banla_list_bookings/);
  assert.match(sql, /banla_approve_booking/);
  assert.match(sql, /banla_update_booking/);
  assert.match(sql, /payment_status = 'pending'/);
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /delete\s+from\s+banla\./i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  assert.match(sql, /admin\.html/);
});

test('supabase_schema.sql không còn cấp anon đọc/sửa/xóa', () => {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
  assert.match(sql, /banla_bookings_insert_pending_policy/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.banla_list_bookings\(\) FROM PUBLIC, anon, authenticated/i);
  assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.banla_list_bookings\(\) TO anon/i);
  assert.doesNotMatch(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE banla\.bookings TO anon/i);
});
