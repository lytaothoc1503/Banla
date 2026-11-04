const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banla-')), 'bookings.json');
process.env.NODE_ENV = 'test';
process.env.BOOKINGS_FILE = tmp;
process.env.OTA_ALLOWED_ORIGINS = 'http://localhost:3001,https://ota.banla.vn';
process.env.OTA_API_KEY = 'secret-ota-token-123';
process.env.BANLA_WEBHOOK_SECRET = 'test_webhook_secret_2026';
process.env.ADMIN_KEY = 'TEST_ADMIN_KEY_2026_xyz';
const ADMIN_KEY = process.env.ADMIN_KEY;

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
  assert.strictEqual(saved.paymentStatus, 'UNPAID');
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

test('Tra cứu booking: số điện thoại dưới 8 chữ số -> 400 (chống brute force IDOR)', async () => {
  const res = await fetch(`${base}/api/booking/lookup?id=test123&contact=9`);
  assert.strictEqual(res.status, 400);
  const json = await res.json();
  assert.ok(json.message.includes('8 chữ số'));
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
  assert.strictEqual(data.booking.paymentStatus, 'UNPAID');
  assert.strictEqual(data.booking.phoneMasked, '090****567');
  assert.ok(!data.booking.phone); // Không trả raw phone
});

test('Bảo mật tĩnh: Chặn truy cập file nhạy cảm và backend internals -> 404', async () => {
  const res1 = await fetch(`${base}/server.js`);
  assert.strictEqual(res1.status, 404);

  const res2 = await fetch(`${base}/package.json`);
  assert.strictEqual(res2.status, 404);

  const res3 = await fetch(`${base}/banla_payment_module/database/banla_migration.sql`);
  assert.strictEqual(res3.status, 404);

  const res4 = await fetch(`${base}/banla_payment_module/backend/banla_payment_router.js`);
  assert.strictEqual(res4.status, 404);
});

test('Webhook Banla Payment: thiếu chữ ký -> 401', async () => {
  const res = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: 200000 })
  });
  assert.strictEqual(res.status, 401);
});

test('Webhook Banla Payment: chữ ký sai -> 401', async () => {
  const res = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-banla-signature': 'invalid_signature_hex'
    },
    body: JSON.stringify({ amount: 200000 })
  });
  assert.strictEqual(res.status, 401);
});

test('Webhook Banla Payment: chữ ký đúng -> 200 và đồng bộ trạng thái booking', async () => {
  // Tạo booking để test đồng bộ
  const postRes = await post({
    name: 'Khách Đặt Ưu Tiên',
    phone: '0965999999',
    room: 'Élite Room'
  });
  const { id: bookingId } = await postRes.json();

  const payload = JSON.stringify({
    bookingId,
    amount: 200000,
    memo: 'BALA9821'
  });

  const secret = process.env.BANLA_WEBHOOK_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const res = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-banla-signature': signature
    },
    body: payload
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.match(data.smartLockPin, /^\d{6}$/, 'PIN Smart-Lock phải đúng 6 chữ số');

  // Xác nhận file booking đã được cập nhật thành PAID và confirmed
  const bookings = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const updated = bookings.find((b) => b.id === bookingId);
  assert.ok(updated);
  assert.strictEqual(updated.paymentStatus, 'PAID');
  assert.strictEqual(updated.status, 'confirmed');
  assert.strictEqual(updated.smartLockPin, data.smartLockPin);
});

test('Admin Auth: truy cập không có hoặc sai key -> 401', async () => {
  const resNoKey = await fetch(`${base}/api/admin/bookings`);
  assert.strictEqual(resNoKey.status, 401);

  const resWrongKey = await fetch(`${base}/api/admin/bookings`, {
    headers: { 'x-admin-key': 'WRONG_KEY' }
  });
  assert.strictEqual(resWrongKey.status, 401);
});

test('Admin Auth: POST /api/admin/login đúng key -> 200', async () => {
  const res = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: ADMIN_KEY })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
});

test('Admin: GET /api/admin/bookings & GET /api/admin/stats tính đối soát Gross vs Net', async () => {
  const resBookings = await fetch(`${base}/api/admin/bookings`, {
    headers: { 'x-admin-key': ADMIN_KEY }
  });
  assert.strictEqual(resBookings.status, 200);
  const dataBookings = await resBookings.json();
  assert.ok(Array.isArray(dataBookings.bookings));
  assert.ok(dataBookings.bookings.length > 0);

  const first = dataBookings.bookings[0];
  assert.ok(first.totalPrice !== undefined);
  assert.ok(first.gatewayFee !== undefined);
  assert.ok(first.netAmount !== undefined);

  const resStats = await fetch(`${base}/api/admin/stats`, {
    headers: { 'x-admin-key': ADMIN_KEY }
  });
  assert.strictEqual(resStats.status, 200);
  const dataStats = await resStats.json();
  assert.ok(dataStats.stats.total >= 1);
  assert.ok(dataStats.stats.grossRevenue >= 0);
  assert.ok(dataStats.stats.netRevenue >= 0);
});

test('Admin: POST /api/admin/booking/smartlock cấp mã PIN thành công', async () => {
  const postRes = await post({
    name: 'Khách Test PIN',
    phone: '0912345678',
    room: 'Suite Room'
  });
  const { id } = await postRes.json();

  const res = await fetch(`${base}/api/admin/booking/smartlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_KEY
    },
    body: JSON.stringify({ id, customPin: '*9999#' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.pin, '*9999#');
  assert.strictEqual(data.booking.smartLockPin, '*9999#');
  assert.strictEqual(data.booking.status, 'confirmed');
});

test('Booking Detail: GET /api/booking/detail hỗ trợ admin key xem toàn bộ', async () => {
  const postRes = await post({
    name: 'Khách Test Detail',
    phone: '0988776655',
    email: 'khachtest@gmail.com',
    room: 'Balcony Room'
  });
  const { id } = await postRes.json();

  const res = await fetch(`${base}/api/booking/detail?id=${id}&key=${ADMIN_KEY}`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.booking.name, 'Khách Test Detail');
  assert.strictEqual(data.booking.phone, '0988776655');
  assert.strictEqual(data.booking.email, 'khachtest@gmail.com');
});

test('Bảo mật D4: mã admin mặc định cũ BANLA8888 bị từ chối', async () => {
  const resKey = await fetch(`${base}/api/admin/bookings`, { headers: { 'x-admin-key': 'BANLA8888' } });
  assert.strictEqual(resKey.status, 401);
  const resLogin = await fetch(`${base}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'BANLA8888' })
  });
  assert.strictEqual(resLogin.status, 401);
});

test('Bảo mật D4: webhook ký bằng secret mặc định cũ bị từ chối', async () => {
  const payload = JSON.stringify({ bookingId: 'any', amount: 1 });
  const forged = crypto.createHmac('sha256', 'banla_secret_priority_2026').update(payload).digest('hex');
  const res = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-banla-signature': forged },
    body: payload
  });
  assert.strictEqual(res.status, 401);
});