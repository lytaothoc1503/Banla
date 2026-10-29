const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banla-')), 'bookings.json');
process.env.BOOKINGS_FILE = tmp;
const { app } = require('../server');
let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());
const post = (body) => fetch(`${base}/api/booking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('GET /api/rooms trả danh sách phòng', async () => {
  const res = await fetch(`${base}/api/rooms`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.rooms) && data.rooms.length > 0);
});
test('POST /api/booking thiếu thông tin -> 400', async () => {
  const res = await post({ name: '' });
  assert.strictEqual(res.status, 400);
  assert.ok((await res.json()).errors.length >= 2);
});
test('POST /api/booking ngày sai thứ tự -> 400', async () => {
  const res = await post({ name: 'Nguyễn A', phone: '0900000000', checkin: '2026-12-05', checkout: '2026-12-01' });
  assert.strictEqual(res.status, 400);
});
test('POST /api/booking số khách không hợp lệ -> 400', async () => {
  assert.strictEqual((await post({ name: 'Nguyễn A', email: 'a@example.com', guests: 0 })).status, 400);
});
test('POST /api/booking hợp lệ -> lưu file', async () => {
  const res = await post({ name: 'Nguyễn A', phone: '0900000000', checkin: '2026-12-01', checkout: '2026-12-03', room: 'Attic Room', guests: 2 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).success, true);
  assert.strictEqual(JSON.parse(fs.readFileSync(tmp, 'utf8')).length, 1);
});
