const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banla-')), 'bookings.json');
process.env.BOOKINGS_FILE = tmp;
process.env.OTA_ALLOWED_ORIGINS = 'http://localhost:3001,https://ota.banla.vn';
process.env.OTA_API_KEY = 'secret-ota-token-123';

const { app } = require('../server');
let server, base;

before(() => new Promise((r) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    r();
  });
}));

after(() => server.close());

const post = (body, headers = {}) => fetch(`${base}/api/booking`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
});

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

test('POST /api/booking hợp lệ mặc định source là direct -> lưu file', async () => {
  const res = await post({
    name: 'Nguyễn A',
    phone: '0900000000',
    checkin: '2026-12-01',
    checkout: '2026-12-03',
    room: 'Attic Room',
    guests: 2
  });
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);

  const bookings = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const saved = bookings.find((b) => b.id === json.id);
  assert.ok(saved);
  assert.strictEqual(saved.source, 'direct');
});

test('POST /api/booking source không hợp lệ -> 400', async () => {
  const res = await post({
    name: 'Khách Test',
    phone: '0900000000',
    source: 'unknown-channel'
  });
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.ok(json.errors.some((err) => err.includes('source')));
});

test('CORS: OPTIONS preflight request cho phép origin hợp lệ', async () => {
  const res = await fetch(`${base}/api/rooms`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'https://ota.banla.vn',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-api-key'
    }
  });
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), 'https://ota.banla.vn');
  assert.ok(res.headers.get('access-control-allow-methods').includes('GET'));
  assert.ok(res.headers.get('access-control-allow-headers').includes('x-api-key'));
});

test('CORS: GET /api/rooms trả header Access-Control-Allow-Origin đúng domain OTA', async () => {
  const res = await fetch(`${base}/api/rooms`, {
    headers: { 'Origin': 'http://localhost:3001' }
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:3001');
});

test('OTA Auth: POST /api/booking với source ota nhưng thiếu x-api-key -> 401', async () => {
  const res = await post({
    name: 'Khách OTA',
    phone: '0912345678',
    source: 'ota'
  });
  assert.strictEqual(res.status, 401);
  const json = await res.json();
  assert.strictEqual(json.success, false);
});

test('OTA Auth: POST /api/booking với source ota sai x-api-key -> 401', async () => {
  const res = await post(
    { name: 'Khách OTA', phone: '0912345678', source: 'ota' },
    { 'x-api-key': 'wrong-key' }
  );
  assert.strictEqual(res.status, 401);
});

test('OTA Auth: POST /api/booking với source ota và đúng x-api-key -> 200 và lưu source ota', async () => {
  const res = await post(
    {
      name: 'Khách Đặt Từ Sàn OTA',
      phone: '0988776655',
      checkin: '2026-12-10',
      checkout: '2026-12-12',
      room: 'Suite Hướng Núi',
      guests: 2,
      source: 'ota'
    },
    { 'x-api-key': 'secret-ota-token-123' }
  );
  assert.strictEqual(res.status, 200);
  const json = await res.json();
  assert.strictEqual(json.success, true);

  const bookings = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const saved = bookings.find((b) => b.id === json.id);
  assert.ok(saved);
  assert.strictEqual(saved.source, 'ota');
});


test('Tra cứu booking: thiếu id hoặc contact -> 400', async () => {
  const res = await fetch(`${base}/api/booking/lookup?id=test123`);
  assert.strictEqual(res.status, 400);
});

test('Tra cứu booking: sai mã hoặc sai số điện thoại -> 404', async () => {
  const res = await fetch(`${base}/api/booking/lookup?id=notfound&contact=0900000000`);
  assert.strictEqual(res.status, 404);
});

test('Tra cứu booking: đúng mã + đúng số điện thoại -> 200 và che giấu thông tin nhạy cảm', async () => {
  // Tạo booking trước
  const postRes = await post({
    name: 'Nguyễn Văn Tra Cứu',
    phone: '0901234567',
    email: 'tracuu@example.com',
    checkin: '2026-12-20',
    checkout: '2026-12-22',
    room: 'Banla Signature',
    guests: 2
  });
  assert.strictEqual(postRes.status, 200);
  const { id } = await postRes.json();

  // Tra cứu với SĐT
  const lookupRes = await fetch(`${base}/api/booking/lookup?id=${id}&contact=0901234567`);
  assert.strictEqual(lookupRes.status, 200);
  const data = await lookupRes.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.booking.name, 'Nguyễn Văn Tra Cứu');
  assert.strictEqual(data.booking.status, 'pending');
  assert.strictEqual(data.booking.phoneMasked, '090****567');
  assert.ok(!data.booking.phone); // Không trả raw phone
});
