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
    const http = require('node:http');
    const { Duplex } = require('node:stream');
    const { app } = require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))});
    function invoke(method, url, headers = {}, body = '') {
      return new Promise((resolve, reject) => {
        const sock = new Duplex({ read() {}, write(_c, _e, cb) { cb(); } });
        sock.remoteAddress = '127.0.0.1';
        const req = new http.IncomingMessage(sock);
        req.method = method;
        req.url = url;
        req.headers = { host: '127.0.0.1', ...headers };
        if (body) req.headers['content-length'] = String(Buffer.byteLength(body));
        const res = new http.ServerResponse(req);
        const origEnd = res.end.bind(res);
        res.end = (c, e, cb) => { origEnd(c, e, cb); resolve({ status: res.statusCode }); };
        app.handle(req, res, reject);
        if (body) req.push(body);
        req.push(null);
      });
    }
    (async () => {
      const login = await invoke('POST', '/api/admin/login', { 'content-type': 'application/json' }, JSON.stringify({ key: 'BANLA8888' }));
      const list = await invoke('GET', '/api/admin/bookings', { 'x-admin-key': 'BANLA8888' });
      const hook = await invoke('POST', '/api/banla/webhook', { 'content-type': 'application/json', 'x-banla-signature': 'x' }, '{}');
      console.log(JSON.stringify({ login: login.status, list: list.status, hook: hook.status }));
    })();
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

