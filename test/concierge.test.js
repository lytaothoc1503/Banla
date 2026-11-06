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
const knowledge = require('../banla-concierge-knowledge');
let server;
let base;

assert.strictEqual(typeof buildSmartConciergeReply, 'function');
assert.strictEqual(buildSmartConciergeReply, knowledge.buildSmartConciergeReply);

before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => server.close());

test('Lễ tân AI (POST /api/chat): không có Gemini thì báo dịch vụ chưa cấu hình, không trả lời mẫu', async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Phòng nào hợp cho 2 người lớn và 1 bé?' })
    });
    assert.strictEqual(res.status, 503);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.match(data.error, /Gemini chưa được cấu hình/);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('Lễ tân AI (POST /api/chat): chuyển hội thoại gần nhất cho Gemini để trả lời tiếp tự nhiên', async () => {
  const originalFetch = global.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  let upstreamBody;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  global.fetch = (url, options) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) {
      upstreamBody = JSON.parse(options.body);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'Gemini trả lời theo ngữ cảnh.' }] } }] })
      });
    }
    return originalFetch(url, options);
  };
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', text: 'Tôi đi cùng gia đình, phòng nào phù hợp?' },
          { role: 'model', text: 'Banla gợi ý Original Suite.' },
          { role: 'user', text: 'Vậy giá phòng đó thế nào?' }
        ]
      })
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.source, 'gemini');
    assert.strictEqual(data.reply, 'Gemini trả lời theo ngữ cảnh.');
    assert.deepStrictEqual(upstreamBody.contents.map((message) => message.parts[0].text), [
      'Tôi đi cùng gia đình, phòng nào phù hợp?',
      'Banla gợi ý Original Suite.',
      'Vậy giá phòng đó thế nào?'
    ]);
    assert.match(upstreamBody.systemInstruction.parts[0].text, /dùng các lượt hội thoại trước để hiểu câu tiếp nối/);
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test('Lễ tân AI knowledge: không nhầm wifi/làm việc thành Suite; cocktail không kích hoạt cọc sai', () => {
  const wifi = buildSmartConciergeReply('Tôi muốn làm việc remote, wifi thế nào?');
  assert.ok(wifi.includes('WiFi'), wifi);
  assert.ok(!wifi.includes('Original Suite'), 'Không được đẩy Suite chỉ vì chữ làm việc');

  const roof = buildSmartConciergeReply('Quầy cocktail The Roof mở đến mấy giờ?');
  assert.ok(roof.includes('16:00'), roof);
  assert.ok(roof.includes('The Roof'), roof);

  const early = buildSmartConciergeReply('Đặt sớm trước 14 ngày có giảm 10% không?');
  assert.ok(early.includes('Thanh toán 100% giảm 10%') || early.includes('700.000'), early);
  assert.ok(!/đặt sớm trước 14 ngày giảm/i.test(early));
});

test('Lễ tân AI (POST /api/chat): câu hỏi rỗng -> 400', async () => {
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '   ' })
  });
  assert.strictEqual(res.status, 400);
});

test('Lễ tân AI client: khởi tạo khung chat và không dùng câu trả lời tri thức dự phòng', async () => {
  const windowObj = {
    location: { protocol: 'https:', hostname: 'banlaboutiquedalat.com' },
    BANLA_GEMINI_ENDPOINT: 'https://example.test/functions/v1/banla-gemini',
    BANLA_GEMINI_KEY: 'sb_publishable_test',
    setTimeout: () => 0
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

  delete require.cache[require.resolve('../banla-concierge.js')];
  require('../banla-concierge.js');
  assert.ok(windowObj.BanlaConcierge, 'window.BanlaConcierge phải được khởi tạo');
  assert.strictEqual(windowObj.BanlaConcierge.replyLocal, undefined);
  const script = fs.readFileSync(require.resolve('../banla-concierge.js'), 'utf8');
  assert.ok(!script.includes("tryFetchJson('/api/chat'"), 'Không ưu tiên câu trả lời mặc định từ backend nội bộ');
  assert.ok(!script.includes('generateLocalConciergeReply'), 'Không dùng tri thức tĩnh làm câu trả lời dự phòng');
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
  assert.strictEqual(saved.unitPrice, 1150000);
  assert.strictEqual(saved.nights, 2);
  assert.strictEqual(saved.totalPrice, 2300000);
  assert.strictEqual(saved.paymentOption, 'pay_100');
  assert.strictEqual(saved.discountAmount, 230000);
  assert.strictEqual(saved.depositAmount, 2070000);

  const resSession = await fetch(`${base}/api/banla/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'BL9821', amount: 2070000 })
  });
  assert.strictEqual(resSession.status, 201);
  const sessionJson = await resSession.json();
  assert.strictEqual(sessionJson.bankDetails.accountNumber, '0352554863');
  assert.strictEqual(sessionJson.memo, 'BANLA_BL9821');
});
