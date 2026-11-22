const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banla-card-'));
const bookingsPath = path.join(dir, 'bookings.json');
const paymentsPath = path.join(dir, 'card_payments.json');
const HASH = '00112233445566778899AABBCCDDEEFF';

process.env.NODE_ENV = 'test';
process.env.BOOKINGS_FILE = bookingsPath;
process.env.CARD_PAYMENTS_FILE = paymentsPath;
process.env.CARD_PAYMENT_MODE = 'sandbox';
process.env.PUBLIC_BASE_URL = 'http://localhost:3000';
process.env.ONEPAY_SANDBOX_MERCHANT = 'TESTMERCHANT';
process.env.ONEPAY_SANDBOX_ACCESS_CODE = 'ABCD1234';
process.env.ONEPAY_SANDBOX_HASH_KEY = HASH;
process.env.PAYPAL_SANDBOX_CLIENT_ID = 'sandbox-client';
process.env.PAYPAL_SANDBOX_CLIENT_SECRET = 'sandbox-secret';
process.env.PAYPAL_SANDBOX_WEBHOOK_ID = 'WH-TEST';
process.env.NINEPAY_ENABLED = '';
process.env.NINEPAY_SANDBOX_MERCHANT_KEY = 'TESTMERCHANT9';
process.env.NINEPAY_SANDBOX_SECRET_KEY = 'NINEPAY_SECRET_DO_NOT_LEAK';
process.env.NINEPAY_SANDBOX_CHECKSUM_KEY = 'NINEPAY_CHECKSUM_DO_NOT_LEAK';
process.env.ADMIN_KEY = 'TEST_ADMIN_KEY_2026_xyz';
process.env.BANLA_WEBHOOK_SECRET = 'test_webhook_secret_2026';

const payments = require('../banla_payment_module/backend/card_payments');
const { redactSensitiveData } = require('../utils/logger');
const { app } = require('../server');

const ninepayState = { inquire: null };

const paypalState = {
  orderSerial: 0,
  lastCreate: null,
  orderId: '',
  captureCurrency: '',
  captureValue: '',
  verify: 'SUCCESS',
  calls: []
};

function mockRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); }
  };
}

payments.setFetch(async (url, options = {}) => {
  const target = String(url);
  paypalState.calls.push(target);
  if (target.endsWith('/v1/oauth2/token')) {
    assert.ok(target.startsWith('https://api-m.sandbox.paypal.com/'));
    return mockRes(200, { access_token: 'TESTTOKEN', expires_in: 300 });
  }
  if (target.endsWith('/v2/checkout/orders') && options.method === 'POST') {
    const body = JSON.parse(options.body);
    paypalState.lastCreate = body;
    paypalState.orderSerial += 1;
    paypalState.orderId = `ORD${paypalState.orderSerial}PAYPALTEST`;
    paypalState.captureCurrency = '';
    paypalState.captureValue = '';
    return mockRes(200, {
      id: paypalState.orderId,
      status: 'PAYER_ACTION_REQUIRED',
      purchase_units: body.purchase_units,
      links: [{ rel: 'payer-action', href: `https://www.sandbox.paypal.com/checkoutnow?token=${paypalState.orderId}` }]
    });
  }
  if (target.endsWith('/capture') && options.method === 'POST') {
    const unit = paypalState.lastCreate.purchase_units[0];
    const value = paypalState.captureValue || unit.amount.value;
    const currency = paypalState.captureCurrency || unit.amount.currency_code;
    return mockRes(200, {
      id: paypalState.orderId,
      status: 'COMPLETED',
      purchase_units: [{
        reference_id: unit.reference_id,
        invoice_id: unit.invoice_id,
        custom_id: unit.custom_id,
        payments: {
          captures: [{
            id: `CAP${paypalState.orderId}`,
            status: 'COMPLETED',
            amount: { currency_code: currency, value: String(value) },
            invoice_id: unit.invoice_id,
            custom_id: unit.custom_id
          }]
        }
      }]
    });
  }
  if (target.includes('9pay.vn') && target.endsWith('/inquire')) {
    assert.ok(target.startsWith('https://sand-payment.9pay.vn/v2/payments/') || target.startsWith('https://payment.9pay.vn/v2/payments/'));
    const header = String(options.headers && options.headers.Authorization || '');
    assert.match(header, /^Signature Algorithm=HS256,Credential=TESTMERCHANT9,SignedHeaders=,Signature=/);
    assert.doesNotMatch(header, /DO_NOT_LEAK/);
    return mockRes(200, ninepayState.inquire || { status: 2, invoice_no: 'none', amount: 1, currency: 'VND', payment_no: 1 });
  }
  if (target.endsWith('/v1/notifications/verify-webhook-signature')) {
    assert.ok(target.startsWith('https://api-m.sandbox.paypal.com/'));
    return mockRes(200, { verification_status: paypalState.verify });
  }
  return mockRes(500, { name: 'UNEXPECTED' });
});

let server;
let base;

before(() => new Promise((resolve) => {
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    resolve();
  });
}));

after(() => {
  payments.setFetch(null);
  server.close();
});

function readBookings() {
  return JSON.parse(fs.readFileSync(bookingsPath, 'utf8'));
}

function readPayments() {
  if (!fs.existsSync(paymentsPath)) return [];
  return JSON.parse(fs.readFileSync(paymentsPath, 'utf8'));
}

async function book(extra = {}) {
  const res = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Khách Thẻ',
      phone: '0901234567',
      email: 'the@example.com',
      checkin: '2026-12-10',
      checkout: '2026-12-11',
      room: 'Original Suite',
      guests: 2,
      ...extra
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  return readBookings().find((item) => item.id === data.id);
}

async function checkout(id, provider, extra = {}) {
  return fetch(`${base}/api/payments/card/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: id, provider, ...extra })
  });
}

function returnParams(redirectUrl, overrides = {}) {
  const src = new URL(redirectUrl);
  const params = {};
  for (const [key, value] of src.searchParams.entries()) {
    if (key.startsWith('vpc_') && key !== 'vpc_SecureHash') params[key] = value;
  }
  params.vpc_CurrencyCode = 'VND';
  params.vpc_TxnResponseCode = '0';
  params.vpc_TransactionNo = '99887766';
  params.vpc_Message = 'Approved';
  Object.assign(params, overrides);
  delete params.vpc_SecureHash;
  params.vpc_SecureHash = payments.signOnePay(params, HASH);
  return params;
}

test('Đơn vị tiền OnePay: 25.000 VND thành 2500000 và đối chiếu đúng số nguyên', () => {
  assert.strictEqual(payments.invoiceToVpcAmount(25000), '2500000');
  assert.strictEqual(payments.vpcAmountToMajor('2500000'), 25000);
  assert.strictEqual(payments.amountsEqual(575000, 'VND', '575000.00', 'VND'), true);
  assert.strictEqual(payments.amountsEqual(575000, 'VND', '575000.50', 'VND'), false);
  assert.strictEqual(payments.amountsEqual(575000, 'VND', '575000', 'USD'), false);
});

test('Checkout từ chối field thẻ và không lưu chúng', async () => {
  const saved = await book();
  const res = await checkout(saved.id, 'paypal', { cardNumber: 'rejected', cvv: 'no', expiry: 'no' });
  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.match(body.message, /không nhận số thẻ/i);
  assert.strictEqual(readPayments().some((item) => item.bookingId === saved.id), false);
  const fresh = readBookings().find((item) => item.id === saved.id);
  assert.strictEqual(fresh.paymentStatus, 'UNPAID');
});

test('OnePay: bỏ qua số tiền client, chuyển sang host sandbox, từ chối sai số tiền', async () => {
  const saved = await book();
  assert.strictEqual(saved.depositAmount, 575000);
  const res = await checkout(saved.id, 'onepay', { amount: 1, currency: 'USD' });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  const url = new URL(data.redirectUrl);
  assert.strictEqual(url.hostname, 'mtf.onepay.vn');
  assert.strictEqual(url.protocol, 'https:');
  assert.strictEqual(url.searchParams.get('vpc_Amount'), '57500000');
  assert.strictEqual(url.searchParams.get('vpc_Currency'), 'VND');
  assert.strictEqual(url.searchParams.get('vpc_CardList'), 'INTERNATIONAL');
  assert.strictEqual(data.amount, 575000);
  assert.ok(!url.search.includes('card'));

  const bad = returnParams(data.redirectUrl, { vpc_Amount: payments.invoiceToVpcAmount(575000 + 1000) });
  const badRes = await fetch(`${base}/api/payments/onepay/return?${new URLSearchParams(bad)}`);
  assert.strictEqual(badRes.status, 200);
  const badHtml = await badRes.text();
  assert.match(badHtml, /không khớp hóa đơn/);
  assert.doesNotMatch(badHtml, /Thanh toán thành công/);
  const still = readBookings().find((item) => item.id === saved.id);
  assert.strictEqual(still.paymentStatus, 'UNPAID');
  assert.strictEqual(still.status, 'pending');
  assert.strictEqual(readPayments().find((item) => item.id === data.paymentId).status, 'AMOUNT_MISMATCH');
});

test('OnePay: hash sai không đánh dấu đã trả; hash đúng và IPN chỉ ghi nhận một lần', async () => {
  const saved = await book();
  const created = await (await checkout(saved.id, 'onepay')).json();
  const params = returnParams(created.redirectUrl);
  const flipped = params.vpc_SecureHash.endsWith('0') ? '1' : '0';
  const forged = { ...params, vpc_SecureHash: `${params.vpc_SecureHash.slice(0, -1)}${flipped}` };
  const forgedRes = await fetch(`${base}/api/payments/onepay/ipn?${new URLSearchParams(forged)}`);
  assert.strictEqual(forgedRes.status, 400);
  assert.doesNotMatch(await forgedRes.text(), /confirm-success/);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');

  const ipn = await fetch(`${base}/api/payments/onepay/ipn?${new URLSearchParams(params)}`);
  assert.strictEqual(ipn.status, 200);
  assert.strictEqual(await ipn.text(), 'responsecode=1&desc=confirm-success');
  const paid = readBookings().find((item) => item.id === saved.id);
  assert.strictEqual(paid.paymentStatus, 'DEPOSIT_PAID');
  assert.strictEqual(paid.paidAmount, 575000);
  assert.strictEqual(paid.status, 'confirmed');
  assert.strictEqual(paid.cardPayment.provider, 'onepay');
  assert.strictEqual(paid.cardPayment.currency, 'VND');
  assert.ok(!JSON.stringify(readPayments()).includes('cvv'));

  const again = await fetch(`${base}/api/payments/onepay/ipn?${new URLSearchParams(params)}`);
  assert.strictEqual(again.status, 200);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paidAmount, 575000);

  const page = await fetch(`${base}/api/payments/onepay/return?${new URLSearchParams(params)}`);
  const html = await page.text();
  assert.match(html, new RegExp(`Thanh toán thành công\\. Cổng thanh toán đã xác nhận số tiền 575\\.000 ₫ cho đơn ${saved.id}\\.`));
});

test('OnePay: khách hủy thì đơn chưa thanh toán', async () => {
  const saved = await book();
  const created = await (await checkout(saved.id, 'onepay')).json();
  const params = returnParams(created.redirectUrl, { vpc_TxnResponseCode: '99', vpc_TransactionNo: '' });
  delete params.vpc_TransactionNo;
  delete params.vpc_SecureHash;
  params.vpc_SecureHash = payments.signOnePay(params, HASH);
  const res = await fetch(`${base}/api/payments/onepay/return?${new URLSearchParams(params)}`);
  const html = await res.text();
  assert.match(html, /Bạn đã hủy thanh toán\. Đơn chưa được thanh toán; bạn có thể thử lại\./);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');
});

test('OnePay trả đủ 100% ghi PAID đúng số đã giảm, không ghi bằng tổng gốc', async () => {
  const saved = await book({
    checkout: '2026-12-12',
    paymentOption: 'pay_100'
  });
  assert.strictEqual(saved.depositAmount, 2070000);
  const created = await (await checkout(saved.id, 'onepay')).json();
  assert.strictEqual(created.amount, 2070000);
  const params = returnParams(created.redirectUrl);
  const res = await fetch(`${base}/api/payments/onepay/return?${new URLSearchParams(params)}`);
  assert.match(await res.text(), /2\.070\.000 ₫/);
  const paid = readBookings().find((item) => item.id === saved.id);
  assert.strictEqual(paid.paymentStatus, 'PAID');
  assert.strictEqual(paid.paidAmount, 2070000);
  assert.notStrictEqual(paid.paidAmount, paid.totalPrice);
});

test('PayPal: chuyển sang trang sandbox, không gửi field thẻ, capture sai loại tiền thì không chốt đơn', async () => {
  const saved = await book();
  const res = await checkout(saved.id, 'paypal', { amount: 1 });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  const url = new URL(data.redirectUrl);
  assert.strictEqual(url.hostname, 'www.sandbox.paypal.com');
  const body = paypalState.lastCreate;
  assert.strictEqual(body.intent, 'CAPTURE');
  assert.strictEqual(body.purchase_units[0].amount.currency_code, 'VND');
  assert.strictEqual(body.purchase_units[0].amount.value, '575000');
  assert.strictEqual(body.payment_source.paypal.experience_context.landing_page, 'GUEST_CHECKOUT');
  assert.strictEqual(body.payment_source.card, undefined);
  assert.ok(!JSON.stringify(body).toLowerCase().includes('cvv'));

  paypalState.captureCurrency = 'USD';
  const back = await fetch(`${base}/api/payments/paypal/return?token=${data.redirectUrl.split('token=')[1]}`);
  const html = await back.text();
  assert.match(html, /không khớp hóa đơn/);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');
});

test('PayPal: capture đúng số tiền mới xác nhận, hủy thì không xác nhận', async () => {
  const saved = await book();
  const data = await (await checkout(saved.id, 'paypal')).json();
  const token = new URL(data.redirectUrl).searchParams.get('token');
  paypalState.captureCurrency = 'VND';
  paypalState.captureValue = '575000';
  const back = await fetch(`${base}/api/payments/paypal/return?token=${token}`);
  const html = await back.text();
  assert.match(html, new RegExp(`Thanh toán thành công\\. Cổng thanh toán đã xác nhận số tiền 575\\.000 ₫ cho đơn ${saved.id}\\.`));
  const paid = readBookings().find((item) => item.id === saved.id);
  assert.strictEqual(paid.paymentStatus, 'DEPOSIT_PAID');
  assert.strictEqual(paid.paidAmount, 575000);
  assert.strictEqual(paid.cardPayment.provider, 'paypal');

  const other = await book();
  const second = await (await checkout(other.id, 'paypal')).json();
  const cancelToken = new URL(second.redirectUrl).searchParams.get('token');
  const cancel = await fetch(`${base}/api/payments/paypal/cancel?token=${cancelToken}`);
  assert.match(await cancel.text(), /Bạn đã hủy thanh toán\. Đơn chưa được thanh toán; bạn có thể thử lại\./);
  assert.strictEqual(readBookings().find((item) => item.id === other.id).paymentStatus, 'UNPAID');
});

test('PayPal webhook: chữ ký sai hoặc sai số tiền không chốt; chữ ký đúng và khớp tiền thì chốt', async () => {
  const saved = await book();
  const data = await (await checkout(saved.id, 'paypal')).json();
  const token = new URL(data.redirectUrl).searchParams.get('token');
  const event = {
    id: 'WH-EVENT-1',
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAPWEBHOOK123',
      status: 'COMPLETED',
      amount: { currency_code: 'VND', value: '1' },
      invoice_id: data.paymentId,
      custom_id: saved.id,
      supplementary_data: { related_ids: { order_id: token } }
    }
  };
  const headers = {
    'Content-Type': 'application/json',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
    'paypal-transmission-id': 'tid-1',
    'paypal-transmission-sig': 'sig',
    'paypal-transmission-time': new Date().toISOString()
  };
  paypalState.verify = 'FAILURE';
  const badSig = await fetch(`${base}/api/payments/paypal/webhook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(event)
  });
  assert.strictEqual(badSig.status, 401);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');

  paypalState.verify = 'SUCCESS';
  const mismatch = await fetch(`${base}/api/payments/paypal/webhook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(event)
  });
  assert.strictEqual(mismatch.status, 200);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');
  assert.strictEqual(readPayments().find((item) => item.id === data.paymentId).status, 'AMOUNT_MISMATCH');

  const fresh = await book();
  const created = await (await checkout(fresh.id, 'paypal')).json();
  const freshToken = new URL(created.redirectUrl).searchParams.get('token');
  const good = {
    ...event,
    id: 'WH-EVENT-2',
    resource: {
      ...event.resource,
      id: 'CAPWEBHOOK999',
      amount: { currency_code: 'VND', value: '575000' },
      invoice_id: created.paymentId,
      custom_id: fresh.id,
      supplementary_data: { related_ids: { order_id: freshToken } }
    }
  };
  const ok = await fetch(`${base}/api/payments/paypal/webhook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(good)
  });
  assert.strictEqual(ok.status, 200);
  const paid = readBookings().find((item) => item.id === fresh.id);
  assert.strictEqual(paid.paymentStatus, 'DEPOSIT_PAID');
  assert.strictEqual(paid.paidAmount, 575000);
  assert.strictEqual(paid.cardPayment.providerCaptureId, 'CAPWEBHOOK999');
});

test('Live không dùng credential sandbox và không mở trang thu thẻ', async () => {
  const saved = await book();
  const callsBefore = paypalState.calls.length;
  process.env.CARD_PAYMENT_MODE = 'live';
  try {
    const onepay = await checkout(saved.id, 'onepay');
    assert.strictEqual(onepay.status, 503);
    const paypal = await checkout(saved.id, 'paypal');
    assert.strictEqual(paypal.status, 503);
    assert.strictEqual(paypalState.calls.length, callsBefore);
    assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');
  } finally {
    process.env.CARD_PAYMENT_MODE = 'sandbox';
  }
});

function ninepayNotice(fields) {
  const payload = {
    amount: fields.amount,
    currency: fields.currency || 'VND',
    description: 'Banla',
    invoice_no: fields.invoice_no,
    method: fields.method || 'CREDIT_CARD',
    payment_no: fields.payment_no,
    status: fields.status,
    card_info: { card_name: 'TEST GUEST', card_brand: 'VISA', card_number: '411111xxxxxx1111' }
  };
  const result = Buffer.from(JSON.stringify(payload)).toString('base64');
  const checksum = crypto.createHash('sha256').update(result + process.env.NINEPAY_SANDBOX_CHECKSUM_KEY).digest('hex').toUpperCase();
  return { result, checksum, version: '1' };
}

test('9Pay tắt mặc định: không mở phiên, PayPal và OnePay vẫn mở, không có form thẻ', async () => {
  process.env.NINEPAY_ENABLED = '';
  const saved = await book();
  const blocked = await checkout(saved.id, 'ninepay', { amount: 1 });
  assert.strictEqual(blocked.status, 403);
  const body = await blocked.json();
  assert.match(body.message, /chưa được bật/i);
  assert.match(body.message, /không nhận số thẻ/i);
  assert.strictEqual(readPayments().some((item) => item.bookingId === saved.id), false);
  assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');

  const providers = await fetch(`${base}/api/payments/card/providers`);
  const flags = await providers.json();
  assert.strictEqual(flags.paypal, true);
  assert.strictEqual(flags.onepay, true);
  assert.strictEqual(flags.ninepay, false);

  const onepay = await checkout(saved.id, 'onepay');
  assert.strictEqual(onepay.status, 201);
  assert.strictEqual(new URL((await onepay.json()).redirectUrl).hostname, 'mtf.onepay.vn');
});

test('9Pay: redirect sandbox có chữ ký, bỏ số tiền client, return và IPN chỉ chốt khi khớp', async () => {
  process.env.NINEPAY_ENABLED = 'true';
  process.env.CARD_PAYMENT_MODE = 'sandbox';
  try {
    const saved = await book();
    const res = await checkout(saved.id, 'ninepay', { amount: 1, currency: 'USD', cardNumber: '4111111111111111' });
    assert.strictEqual(res.status, 400);
    const opened = await checkout(saved.id, 'ninepay', { amount: 1, currency: 'USD' });
    assert.strictEqual(opened.status, 201);
    const data = await opened.json();
    const url = new URL(data.redirectUrl);
    assert.strictEqual(url.protocol, 'https:');
    assert.strictEqual(url.hostname, 'sand-payment.9pay.vn');
    assert.strictEqual(url.pathname, '/portal');
    assert.strictEqual(data.amount, 575000);
    assert.doesNotMatch(data.redirectUrl, /DO_NOT_LEAK|411111|card_number|cvv/i);
    const decoded = JSON.parse(Buffer.from(url.searchParams.get('baseEncode'), 'base64').toString('utf8'));
    assert.strictEqual(decoded.amount, 575000);
    assert.strictEqual(decoded.currency, 'VND');
    assert.strictEqual(decoded.lang, 'vi');
    assert.strictEqual(decoded.merchantKey, 'TESTMERCHANT9');
    assert.strictEqual(decoded.invoice_no, data.paymentId);
    assert.strictEqual(decoded.method, undefined);
    assert.ok(!decoded.secretKey && !decoded.checksumKey);
    const signed = new URLSearchParams();
    for (const key of Object.keys(decoded).sort()) signed.append(key, String(decoded[key]));
    const message = `POST\nhttps://sand-payment.9pay.vn/payments/create\n${decoded.time}\n${signed.toString()}`;
    const expected = crypto.createHmac('sha256', process.env.NINEPAY_SANDBOX_SECRET_KEY).update(message).digest('base64');
    assert.strictEqual(url.searchParams.get('signature'), expected);

    const forged = ninepayNotice({ amount: 575000, invoice_no: data.paymentId, payment_no: 99887766, status: 5 });
    forged.checksum = forged.checksum.slice(0, -1) + (forged.checksum.endsWith('A') ? 'B' : 'A');
    const forgedRes = await fetch(`${base}/api/payments/ninepay/ipn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(forged)
    });
    assert.strictEqual(forgedRes.status, 400);
    assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');

    const wrongAmount = ninepayNotice({ amount: 1000, invoice_no: data.paymentId, payment_no: 99887766, status: 5 });
    const mismatch = await fetch(`${base}/api/payments/ninepay/return?${new URLSearchParams(wrongAmount)}`);
    assert.match(await mismatch.text(), /không khớp hóa đơn/);
    assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');

    const good = ninepayNotice({ amount: 575000, invoice_no: data.paymentId, payment_no: 99887766, status: 5 });
    const ipn = await fetch(`${base}/api/payments/ninepay/ipn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(good)
    });
    assert.strictEqual(ipn.status, 200);
    assert.strictEqual(await ipn.text(), 'success');
    const paid = readBookings().find((item) => item.id === saved.id);
    assert.strictEqual(paid.paymentStatus, 'DEPOSIT_PAID');
    assert.strictEqual(paid.paidAmount, 575000);
    assert.strictEqual(paid.status, 'confirmed');
    assert.strictEqual(paid.cardPayment.provider, 'ninepay');
    assert.strictEqual(paid.cardPayment.providerCaptureId, '99887766');
    const stored = JSON.stringify(readPayments()) + JSON.stringify(readBookings());
    assert.doesNotMatch(stored, /411111|xxxxxx|TEST GUEST|card_number|DO_NOT_LEAK/);

    const again = await fetch(`${base}/api/payments/ninepay/return?${new URLSearchParams(good)}`);
    assert.match(await again.text(), new RegExp(`Thanh toán thành công\\. Cổng thanh toán đã xác nhận số tiền 575\\.000 ₫ cho đơn ${saved.id}\\.`));
    assert.strictEqual(readBookings().find((item) => item.id === saved.id).paidAmount, 575000);
  } finally {
    process.env.NINEPAY_ENABLED = '';
    process.env.CARD_PAYMENT_MODE = 'sandbox';
  }
});

test('9Pay: hủy, thất bại và giao dịch đang xử lý không chốt; inquire đúng tiền thì chốt', async () => {
  process.env.NINEPAY_ENABLED = 'true';
  process.env.CARD_PAYMENT_MODE = 'sandbox';
  try {
    const cancelled = await book();
    const cancelCreated = await (await checkout(cancelled.id, 'ninepay')).json();
    const cancelNotice = ninepayNotice({ amount: 575000, invoice_no: cancelCreated.paymentId, payment_no: 111, status: 8 });
    const cancelPage = await fetch(`${base}/api/payments/ninepay/return?${new URLSearchParams(cancelNotice)}`);
    assert.match(await cancelPage.text(), /Bạn đã hủy thanh toán/);
    assert.strictEqual(readBookings().find((item) => item.id === cancelled.id).paymentStatus, 'UNPAID');

    const failed = await book();
    const failedCreated = await (await checkout(failed.id, 'ninepay')).json();
    const failedNotice = ninepayNotice({ amount: 575000, invoice_no: failedCreated.paymentId, payment_no: 222, status: 6 });
    await fetch(`${base}/api/payments/ninepay/ipn?${new URLSearchParams(failedNotice)}`);
    assert.strictEqual(readBookings().find((item) => item.id === failed.id).paymentStatus, 'UNPAID');
    assert.strictEqual(readPayments().find((item) => item.id === failedCreated.paymentId).status, 'FAILED');

    const pending = await book();
    const pendingCreated = await (await checkout(pending.id, 'ninepay')).json();
    ninepayState.inquire = null;
    const pendingNotice = ninepayNotice({ amount: 575000, invoice_no: pendingCreated.paymentId, payment_no: 333, status: 2 });
    const pendingPage = await fetch(`${base}/api/payments/ninepay/return?${new URLSearchParams(pendingNotice)}`);
    assert.match(await pendingPage.text(), /Đơn chưa được thanh toán cho đến khi số tiền được xác nhận/);
    assert.strictEqual(readBookings().find((item) => item.id === pending.id).paymentStatus, 'UNPAID');

    const waiting = await book();
    const waitingCreated = await (await checkout(waiting.id, 'ninepay')).json();
    ninepayState.inquire = {
      invoice_no: waitingCreated.paymentId,
      amount: 575000,
      currency: 'VND',
      status: 5,
      payment_no: 44445555,
      card_info: { card_number: '411111xxxxxx1111' }
    };
    const processing = ninepayNotice({ amount: 575000, invoice_no: waitingCreated.paymentId, payment_no: 333, status: 4 });
    const done = await fetch(`${base}/api/payments/ninepay/ipn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(processing)
    });
    assert.strictEqual(done.status, 200);
    const paid = readBookings().find((item) => item.id === waiting.id);
    assert.strictEqual(paid.paymentStatus, 'DEPOSIT_PAID');
    assert.strictEqual(paid.paidAmount, 575000);
    assert.strictEqual(paid.cardPayment.providerCaptureId, '44445555');
    assert.doesNotMatch(JSON.stringify(readPayments()) + JSON.stringify(readBookings()), /411111|xxxxxx/);

    const back = await fetch(`${base}/api/payments/ninepay/cancel?invoice=${pendingCreated.paymentId}`);
    assert.match(await back.text(), /Bạn đã hủy thanh toán/);
    assert.strictEqual(readPayments().find((item) => item.id === pendingCreated.paymentId).status, 'CANCELLED');
  } finally {
    ninepayState.inquire = null;
    process.env.NINEPAY_ENABLED = '';
    process.env.CARD_PAYMENT_MODE = 'sandbox';
  }
});

test('9Pay live không dùng key sandbox và không mở trang sandbox', async () => {
  process.env.NINEPAY_ENABLED = 'true';
  process.env.CARD_PAYMENT_MODE = 'live';
  try {
    const saved = await book();
    const res = await checkout(saved.id, 'ninepay');
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.match(body.message, /chưa được cấu hình/i);
    assert.doesNotMatch(JSON.stringify(body), /sand-payment|DO_NOT_LEAK/);
    assert.strictEqual(readBookings().find((item) => item.id === saved.id).paymentStatus, 'UNPAID');
  } finally {
    process.env.NINEPAY_ENABLED = '';
    process.env.CARD_PAYMENT_MODE = 'sandbox';
  }
});

test('Giao diện checkout không có ô nhập thẻ và logger che CVV', () => {
  const modal = fs.readFileSync(path.join(__dirname, '..', 'banla_payment_module', 'frontend', 'banla-priority-modal.js'), 'utf8');
  const backend = fs.readFileSync(path.join(__dirname, '..', 'banla_payment_module', 'backend', 'card_payments.js'), 'utf8');
  assert.match(modal, /Thanh toán bằng thẻ/);
  assert.match(modal, /Chúng tôi không thu thập hoặc lưu số thẻ, ngày hết hạn hay mã CVV\./);
  assert.match(modal, /Thanh toán an toàn qua PayPal/);
  assert.match(modal, /Thanh toán an toàn qua OnePay/);
  assert.match(modal, /ninepayOn \? '<button type="button" class="banla-card-secondary" data-card-provider="ninepay">Thanh toán an toàn qua 9Pay<\/button>' : ''/);
  assert.match(modal, /PayPal, OnePay hoặc 9Pay/);
  assert.doesNotMatch(modal, /<input[^>]+card/i);
  assert.doesNotMatch(modal, /cardnumber|card_number|name=["']cvv["']/i);
  assert.doesNotMatch(backend, /TESTONEPAY|6D0870CDE5F24F34F3915FB0045120DB/);
  const redacted = redactSensitiveData({ cvv: 'no', pan: 'no', note: 'ok' });
  assert.strictEqual(redacted.cvv, '***REDACTED***');
  assert.strictEqual(redacted.pan, '***REDACTED***');
  assert.strictEqual(redacted.note, 'ok');
});
