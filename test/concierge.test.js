const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'banla-concierge-')), 'bookings.json');
process.env.NODE_ENV = 'test';
process.env.BOOKINGS_FILE = tmp;
process.env.ADMIN_KEY = 'TEST_ADMIN_KEY_2026_xyz';
process.env.BANLA_WEBHOOK_SECRET = 'test_webhook_secret_2026';

const { app, buildSmartConciergeReply } = require('../server');
let server;
let base;

before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => server.close());

test('Lễ tân AI (POST /api/chat): trả lời chính xác câu hỏi "Phòng nào hợp cho 2 người lớn và 1 bé?" và không bao giờ báo lỗi "tạm thời chưa sẵn sàng"', async () => {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Phòng nào hợp cho 2 người lớn và 1 bé?' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(typeof data.answer === 'string' && data.answer.length > 40);
  assert.ok(!data.answer.includes('Trợ lý AI tạm thời chưa sẵn sàng'), 'Không được trả về lỗi fallback cũ');
  assert.ok(
    data.answer.includes('Original Suite') || data.answer.includes('Élite Room') || data.answer.includes('Connecting'),
    'Phải gợi ý các hạng phòng phù hợp cho gia đình 2 người lớn + 1 bé'
  );
});

test('Lễ tân AI (POST /api/chat): tư vấn giá phòng, The Roof, đặt cọc VietQR, Smart-Lock PIN và đường đi', async () => {
  const questions = [
    { q: 'Bảng giá các hạng phòng bên mình thế nào?', expect: '950.000' },
    { q: 'Quầy cà phê The Roof mở cửa mấy giờ?', expect: '08:00' },
    { q: 'Cách đặt cọc VietQR và ưu đãi thanh toán 100%?', expect: '0352554863' },
    { q: 'Nhận phòng bằng khóa Smart-Lock PIN như thế nào?', expect: '6 số' },
    { q: 'Từ sân bay Liên Khương về khách sạn bao xa?', expect: '47 Nguyễn Đình Chiểu' }
  ];

  for (const item of questions) {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: item.q })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.answer.includes(item.expect), `Câu hỏi "${item.q}" phải chứa "${item.expect}"`);
    assert.ok(!data.answer.includes('Trợ lý AI tạm thời chưa sẵn sàng'));
  }
});

test('Lễ tân AI (POST /api/chat): câu hỏi rỗng -> 400', async () => {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '   ' })
  });
  assert.strictEqual(res.status, 400);
});

test('Lễ tân AI (Client-side banla-concierge.js): hoạt động độc lập trên GitHub Pages ngay cả khi không có backend/Edge Function', async () => {
  const windowObj = {
    location: { protocol: 'https:', hostname: 'banlaboutiquedalat.com' },
    BANLA_SUPABASE_URL: 'https://hcikbpvzbzottxoitujl.supabase.co',
    BANLA_SUPABASE_ANON_KEY: 'sb_publishable_test'
  };
  global.window = windowObj;
  const stubEl = () => ({
    setAttribute: () => {},
    appendChild: () => {},
    addEventListener: () => {},
    querySelector: () => stubEl(),
    querySelectorAll: () => [],
    remove: () => {},
    focus: () => {},
    style: {},
    innerHTML: '',
    textContent: '',
    className: '',
    value: '',
    disabled: false,
    scrollTop: 0,
    scrollHeight: 0
  });
  global.document = {
    readyState: 'complete',
    getElementById: () => null,
    addEventListener: () => {},
    createElement: () => stubEl(),
    body: { appendChild: () => {} }
  };

  require('../banla-concierge.js');
  assert.ok(windowObj.BanlaConcierge, 'window.BanlaConcierge phải được khởi tạo');
  const reply = windowObj.BanlaConcierge.replyLocal('Phòng nào hợp cho 2 người lớn và 1 bé?');
  assert.ok(reply.includes('2 người lớn và 1 bé'));
  assert.ok(reply.includes('Original Suite'));
  assert.ok(!reply.includes('Trợ lý AI tạm thời chưa sẵn sàng'));
});

test('Server-side Booking (D11) & Payment Session (D16): tự động tính giá phòng, cọc 50% / giảm 10% và STK 0352554863', async () => {
  const resBooking = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Nguyễn Văn Gia Đình',
      phone: '0912345678',
      checkin: '2026-12-10',
      checkout: '2026-12-12',
      room: 'Original Suite',
      guests: 3,
      paymentOption: 'pay_100'
    })
  });
  assert.strictEqual(resBooking.status, 200);
  const { id } = await resBooking.json();

  const savedList = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const saved = savedList.find((b) => b.id === id);
  assert.ok(saved);
  assert.strictEqual(saved.unitPrice, 1550000);
  assert.strictEqual(saved.nights, 2);
  assert.strictEqual(saved.totalPrice, 3100000);
  assert.strictEqual(saved.paymentOption, 'pay_100');
  assert.strictEqual(saved.discountAmount, 310000);
  assert.strictEqual(saved.depositAmount, 2790000);

  const resSession = await fetch(`${base}/api/banla/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'BL9821', amount: 2790000 })
  });
  assert.strictEqual(resSession.status, 201);
  const sessionJson = await resSession.json();
  assert.strictEqual(sessionJson.bankDetails.accountNumber, '0352554863');
  assert.strictEqual(sessionJson.memo, 'BANLA_BL9821');
});
