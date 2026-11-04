const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Chạy server trong tiến trình riêng KHÔNG có ADMIN_KEY / BANLA_WEBHOOK_SECRET
// để chứng minh không còn mã mặc định nào mở được trang quản trị hay webhook.
test('Bảo mật D4: thiếu ADMIN_KEY và BANLA_WEBHOOK_SECRET -> API quản trị và webhook trả 503', () => {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banla-noadmin-')), 'bookings.json');
  const script = `
    const { app } = require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
    const srv = app.listen(0, async () => {
      const base = 'http://127.0.0.1:' + srv.address().port;
      const login = await fetch(base + '/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'BANLA8888' })
      });
      const list = await fetch(base + '/api/admin/bookings', { headers: { 'x-admin-key': 'BANLA8888' } });
      const hook = await fetch(base + '/api/banla/webhook', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-banla-signature': 'x' },
        body: '{}'
      });
      console.log(JSON.stringify({ login: login.status, list: list.status, hook: hook.status }));
      srv.close();
    });
  `;
  const env = { ...process.env, NODE_ENV: 'test', BOOKINGS_FILE: tmp };
  delete env.ADMIN_KEY;
  delete env.ADMIN_SESSION_SECRET;
  delete env.BANLA_WEBHOOK_SECRET;

  const out = spawnSync(process.execPath, ['-e', script], { env, encoding: 'utf8', timeout: 20000 });
  const line = (out.stdout || '').trim().split(/\r?\n/).pop();
  assert.ok(line, 'Không nhận được kết quả từ tiến trình con: ' + out.stderr);
  const r = JSON.parse(line);
  assert.deepStrictEqual(r, { login: 503, list: 503, hook: 503 });
});

