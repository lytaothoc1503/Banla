/**
 * KIỂM THỬ TỰ ĐỘNG TÍCH HỢP THANH TOÁN THẺ QUỐC TẾ VISA / ONEPAY VPC v2
 * Bao phủ:
 * 1. Ký & xác minh chữ ký HMAC-SHA256 khóa HEX (khớp vector onepay_hash_test.php) + chống giả mạo.
 * 2. Chặn tuyệt đối dữ liệu thẻ nhạy cảm (PCI DSS: card_number, pan, cvv, expiry).
 * 3. Tạo phiên thanh toán (tính giá phía Server cho deposit_50 & pay_100, Idempotency, Retry sau lỗi).
 * 4. Xử lý IPN/Webhook (sai chữ ký, sai số tiền, khách hủy 99, thành công 0, chống replay trùng).
 * 5. Return URL không tự ý duyệt đơn khi chưa có IPN + chống dò mã PIN (IDOR).
 * 6. Kiểm thử Migration SQL `banla_v3_onepay_visa.sql` trên Postgres thật (PGlite).
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banla-visa-test-'));
const tmpBookingsFile = path.join(tmpDir, 'bookings.json');
const tmpPaymentsFile = path.join(tmpDir, 'payments.json');
const tmpEventsFile = path.join(tmpDir, 'payment_events.json');

process.env.NODE_ENV = 'test';
process.env.BOOKINGS_FILE = tmpBookingsFile;
process.env.PAYMENTS_FILE = tmpPaymentsFile;
process.env.PAYMENT_EVENTS_FILE = tmpEventsFile;
process.env.ONEPAY_MERCHANT_ID = 'TESTONEPAY';
process.env.ONEPAY_ACCESS_CODE = '6BEB2546';
process.env.ONEPAY_SECURE_SECRET = 'ABCDEF0123456789ABCDEF0123456789';
process.env.ONEPAY_PAYMENT_URL = 'https://mtf.onepay.vn/vpcpay/vpcpay.op';
process.env.APP_BASE_URL = 'https://banlaboutiquedalat.com';

const TEST_SECRET = process.env.ONEPAY_SECURE_SECRET;

const OnePayService = require('../backend/modules/payments/onepay.service');
const visaValidator = require('../backend/modules/payments/visa.validator');
const visaService = require('../backend/modules/payments/visa.service');
const visaRepo = require('../backend/modules/payments/visa.repository');
const { resolveRoom, calculateStayPricing } = require('../shared/constants/rooms');

function seedBooking({
  id,
  room = 'Banla Signature',
  checkin = '2026-12-10',
  checkout = '2026-12-12',
  guests = 2,
  paymentOption = 'deposit_50',
  phone = '0901234567',
  email = 'guest@banla.vn'
}) {
  const roomObj = resolveRoom(room);
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
  const pricing = calculateStayPricing({
    unitPriceVnd: roomObj.price,
    nights,
    paymentOption
  });

  const existing = fs.existsSync(tmpBookingsFile)
    ? JSON.parse(fs.readFileSync(tmpBookingsFile, 'utf8'))
    : [];

  const record = {
    id,
    bookingCode: id,
    name: 'Nguyễn Minh Khách',
    phone,
    email,
    room: roomObj.name,
    checkin,
    checkout,
    guests,
    nights: pricing.nights,
    unitPrice: pricing.unitPriceVnd,
    totalPrice: pricing.subtotalVnd,
    paymentOption: pricing.paymentOption,
    paymentMethod: 'visa',
    discountAmount: pricing.discountVnd,
    depositAmount: pricing.amountDueVnd,
    remainingAmount: pricing.remainingVnd,
    paidAmount: 0,
    status: 'pending',
    paymentStatus: 'UNPAID',
    createdAt: new Date().toISOString()
  };

  existing.push(record);
  fs.writeFileSync(tmpBookingsFile, JSON.stringify(existing, null, 2), 'utf8');
  return record;
}

function buildSignedIpnPayload(overrides = {}, secret = TEST_SECRET) {
  const payload = {
    vpc_Version: '2',
    vpc_Command: 'pay',
    vpc_Merchant: 'TESTONEPAY',
    vpc_MerchTxnRef: 'BLTEST-0001',
    vpc_Amount: '115000000',
    vpc_Currency: 'VND',
    vpc_TxnResponseCode: '0',
    vpc_TransactionNo: '9900112233',
    vpc_Card: 'VC',
    ...overrides
  };
  payload.vpc_SecureHash = OnePayService.createSecureHash(payload, secret);
  return payload;
}

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('1. OnePay Hash & Tamper Test: Khớp chính xác thuật toán tham chiếu onepay_hash_test.php', () => {
  const params = {
    vpc_Version: '2',
    vpc_Command: 'pay',
    vpc_AccessCode: 'TESTACCESS',
    vpc_MerchTxnRef: 'BLTEST-0001',
    vpc_Merchant: 'TESTMERCHANT',
    vpc_OrderInfo: 'Banla booking BLTEST',
    vpc_Amount: '155250000',
    vpc_Currency: 'VND',
    vpc_ReturnURL: 'https://banlaboutiquedalat.com/onepay-return.php',
    vpc_Locale: 'vi',
    vpc_TicketNo: '127.0.0.1',
    vpc_MerchTxnDate: '20261104000000'
  };

  const hash = OnePayService.createSecureHash(params, TEST_SECRET);
  assert.match(hash, /^[0-9A-F]{64}$/, 'vpc_SecureHash phải là chuỗi HEX in hoa 64 ký tự');

  const signed = { ...params, vpc_SecureHash: hash };
  assert.strictEqual(OnePayService.verifySecureHash(signed, TEST_SECRET), true, 'VERIFY: PASS');

  // Sửa đổi trái phép số tiền -> chữ ký phải bị từ chối ngay lập tức
  const tampered = { ...signed, vpc_Amount: '999' };
  assert.strictEqual(OnePayService.verifySecureHash(tampered, TEST_SECRET), false, 'TAMPER TEST: PASS');

  // Kiểm tra giải mã vpc_Amount (/ 100)
  assert.strictEqual(OnePayService.getAmountVnd({ vpc_Amount: '155250000' }), 1552500);
  assert.strictEqual(OnePayService.getAmountVnd({ vpc_Amount: 'abc' }), -1);
});

test('2. PCI DSS Guard: Từ chối 400 nếu client cố tình gửi số thẻ (card_number / pan / cvv / expiry)', async () => {
  seedBooking({ id: 'BLPCI001' });

  await assert.rejects(
    () =>
      visaService.createVisaPaymentIntent({
        body: {
          booking_id: 'BLPCI001',
          card_number: '4111111111111111',
          cvv: '123'
        }
      }),
    (err) => {
      assert.strictEqual(err.status, 400);
      assert.strictEqual(err.errorCode, 'FORBIDDEN_CARD_DATA');
      return true;
    }
  );

  // Kiểm tra sanitizeGatewayPayload loại bỏ vpc_CardNum và ẩn vpc_SecureHash
  const cleaned = visaValidator.sanitizeGatewayPayload({
    vpc_MerchTxnRef: 'BLPCI001-AAAA',
    vpc_CardNum: '400000xxxxxx0002',
    vpc_SecureHash: 'AABBCC',
    cvv: '999'
  });
  assert.strictEqual(cleaned.vpc_CardNum, undefined);
  assert.strictEqual(cleaned.cvv, undefined);
  assert.strictEqual(cleaned.vpc_SecureHash, '[VERIFIED_HASH_REDACTED]');
});

test('3. Create Intent + Idempotency: Tính đúng tiền Cọc 50% và Trả 100% (giảm 10%) từ Server, chống tạo phiên trùng', async () => {
  // Original Suite: 1.550.000đ x 2 đêm = 3.100.000đ. Chọn pay_100 -> giảm 10% (310.000đ) -> phải thu 2.790.000đ
  seedBooking({
    id: 'BLSUITE1',
    room: 'Original Suite',
    checkin: '2026-12-15',
    checkout: '2026-12-17',
    paymentOption: 'pay_100'
  });

  const firstIntent = await visaService.createVisaPaymentIntent({
    body: {
      booking_id: 'BLSUITE1',
      payment_option: 'pay_100',
      amount: 1000 // Cố tình truyền amount giả mạo từ client -> Server phải bỏ qua!
    },
    clientIp: '::ffff:203.113.10.5'
  });

  assert.strictEqual(firstIntent.reused, false);
  assert.strictEqual(firstIntent.amount_vnd, 2790000);
  assert.ok(firstIntent.redirect_url.startsWith('https://mtf.onepay.vn/vpcpay/vpcpay.op?'));
  assert.ok(firstIntent.redirect_url.includes('vpc_Amount=279000000'), 'OnePay vpc_Amount phải nhân 100');
  assert.ok(firstIntent.redirect_url.includes('vpc_TicketNo=203.113.10.5'));

  // Gọi lần 2 liên tiếp khi đang PENDING -> tái sử dụng đúng phiên cũ (Idempotent)
  const secondIntent = await visaService.createVisaPaymentIntent({
    body: { booking_id: 'BLSUITE1', payment_option: 'pay_100' }
  });
  assert.strictEqual(secondIntent.reused, true);
  assert.strictEqual(secondIntent.merchant_txn_ref, firstIntent.merchant_txn_ref);
  assert.strictEqual(secondIntent.redirect_url, firstIntent.redirect_url);
});

test('4. Return URL vs IPN Bảo mật: Return URL KHÔNG tự đánh dấu PAID; chỉ IPN hợp lệ mới xác nhận đơn & cấp Smart-Lock PIN', async () => {
  // Banla Signature: 1.150.000đ x 2 đêm = 2.300.000đ. Cọc 50% = 1.150.000đ
  seedBooking({
    id: 'BLSIG500',
    room: 'Banla Signature',
    checkin: '2026-12-20',
    checkout: '2026-12-22',
    paymentOption: 'deposit_50',
    phone: '0988776655',
    email: 'vip@banla.vn'
  });

  const intent = await visaService.createVisaPaymentIntent({
    body: { booking_id: 'BLSIG500' }
  });
  assert.strictEqual(intent.amount_vnd, 1150000);

  // Khách quay về Return URL trước khi IPN tới -> chỉ chuyển sang trạng thái processing, KHÔNG duyệt đơn
  const returnParams = buildSignedIpnPayload({
    vpc_MerchTxnRef: intent.merchant_txn_ref,
    vpc_Amount: '115000000',
    vpc_TxnResponseCode: '0'
  });
  const redirectTarget = visaService.resolveOnePayReturnRedirect(returnParams);
  assert.ok(redirectTarget.includes('state=processing'));

  const statusBeforeIpn = visaService.getBookingPaymentStatus({
    bookingCodeRaw: 'BLSIG500',
    merchantTxnRef: intent.merchant_txn_ref
  });
  assert.strictEqual(statusBeforeIpn.payment_status, 'PENDING');
  assert.strictEqual(statusBeforeIpn.smart_lock_pin, null);

  // IPN thành công với chữ ký chuẩn và đúng số tiền
  let notifiedBooking = null;
  const ipnRes = await visaService.processOnePayWebhook({
    params: buildSignedIpnPayload({
      vpc_MerchTxnRef: intent.merchant_txn_ref,
      vpc_Amount: '115000000',
      vpc_TxnResponseCode: '0',
      vpc_TransactionNo: 'TXN_OK_500'
    }),
    onBookingConfirmed: (b) => {
      notifiedBooking = b;
    }
  });

  assert.strictEqual(ipnRes.payment_status, 'PAID');
  assert.strictEqual(ipnRes.booking_status, 'CONFIRMED');
  assert.strictEqual(ipnRes.paid_vnd, 1150000);
  assert.strictEqual(ipnRes.remaining_vnd, 1150000);
  assert.ok(notifiedBooking && /^\d{6}$/.test(notifiedBooking.smartLockPin));

  // Replay IPN lần 2 cùng mã giao dịch -> Idempotent, không cộng dồn tiền lần 2
  const replayRes = await visaService.processOnePayWebhook({
    params: buildSignedIpnPayload({
      vpc_MerchTxnRef: intent.merchant_txn_ref,
      vpc_Amount: '115000000',
      vpc_TxnResponseCode: '0',
      vpc_TransactionNo: 'TXN_OK_500'
    })
  });
  assert.strictEqual(replayRes.idempotent, true);

  const updatedBooking = visaRepo.findBookingByCode('BLSIG500');
  assert.strictEqual(updatedBooking.paidAmount, 1150000, 'Không được cộng trùng tiền khi IPN gửi lại');
  assert.strictEqual(updatedBooking.status, 'confirmed');

  // Kiểm tra bảo vệ IDOR đối với mã Smart-Lock PIN khi tra cứu trạng thái:
  // a) Không có merchant_txn_ref và không có SĐT/Email -> ẩn PIN
  const unverifiedStatus = visaService.getBookingPaymentStatus({
    bookingCodeRaw: 'BLSIG500'
  });
  assert.strictEqual(unverifiedStatus.payment_status, 'PAID');
  assert.strictEqual(unverifiedStatus.smart_lock_pin, null);
  assert.strictEqual(unverifiedStatus.pin_requires_verification, true);

  // b) Có đúng merchant_txn_ref từ phiên thanh toán -> hiển thị PIN
  const verifiedByRef = visaService.getBookingPaymentStatus({
    bookingCodeRaw: 'BLSIG500',
    merchantTxnRef: intent.merchant_txn_ref
  });
  assert.strictEqual(verifiedByRef.smart_lock_pin, updatedBooking.smartLockPin);

  // c) Hoặc xác thực đúng SĐT khách hàng -> hiển thị PIN
  const verifiedByPhone = visaService.getBookingPaymentStatus({
    bookingCodeRaw: 'BLSIG500',
    contact: '0988776655'
  });
  assert.strictEqual(verifiedByPhone.smart_lock_pin, updatedBooking.smartLockPin);
});

test('5. Bảo mật IPN: Sai chữ ký, sai số tiền, hoặc khách hủy (code 99) -> KHÔNG duyệt đơn & cho phép tạo phiên thử lại', async () => {
  seedBooking({
    id: 'BLFAIL99',
    room: 'Deluxe Twin',
    checkin: '2026-12-24',
    checkout: '2026-12-25',
    paymentOption: 'deposit_50'
  });

  // Deluxe Twin 1 đêm = 950.000đ -> cọc 50% = 475.000đ
  const intent1 = await visaService.createVisaPaymentIntent({
    body: { booking_id: 'BLFAIL99' }
  });
  assert.strictEqual(intent1.amount_vnd, 475000);

  // 5a. Giả mạo chữ ký vpc_SecureHash -> 400 INVALID_SIGNATURE
  await assert.rejects(
    () =>
      visaService.processOnePayWebhook({
        params: {
          vpc_MerchTxnRef: intent1.merchant_txn_ref,
          vpc_Amount: '47500000',
          vpc_TxnResponseCode: '0',
          vpc_TransactionNo: 'TXN_FAKE_HASH',
          vpc_SecureHash: '0'.repeat(64)
        }
      }),
    (err) => err.status === 400 && err.errorCode === 'INVALID_SIGNATURE'
  );

  assert.strictEqual(visaRepo.findBookingByCode('BLFAIL99').status, 'pending');
  assert.strictEqual(visaRepo.findBookingByCode('BLFAIL99').smartLockPin, undefined);

  // 5b. Khách thử lại sau khi phiên trước FAILED -> Phải cấp merchant_txn_ref mới
  const intent2 = await visaService.createVisaPaymentIntent({
    body: { booking_id: 'BLFAIL99' }
  });
  assert.strictEqual(intent2.reused, false);
  assert.notStrictEqual(intent2.merchant_txn_ref, intent1.merchant_txn_ref);

  // 5c. Chữ ký hợp lệ nhưng sai số tiền (trả 10.000đ thay vì 475.000đ) -> 400 AMOUNT_MISMATCH
  await assert.rejects(
    () =>
      visaService.processOnePayWebhook({
        params: buildSignedIpnPayload({
          vpc_MerchTxnRef: intent2.merchant_txn_ref,
          vpc_Amount: '1000000', // 10.000đ * 100
          vpc_TxnResponseCode: '0',
          vpc_TransactionNo: 'TXN_WRONG_AMT'
        })
      }),
    (err) => err.status === 400 && err.errorCode === 'AMOUNT_MISMATCH'
  );
  assert.strictEqual(visaRepo.findBookingByCode('BLFAIL99').status, 'pending');

  // 5d. Khách bấm hủy trên cổng OnePay (vpc_TxnResponseCode = '99') -> ghi nhận FAILED an toàn
  const intent3 = await visaService.createVisaPaymentIntent({
    body: { booking_id: 'BLFAIL99' }
  });
  const cancelRes = await visaService.processOnePayWebhook({
    params: buildSignedIpnPayload({
      vpc_MerchTxnRef: intent3.merchant_txn_ref,
      vpc_Amount: '47500000',
      vpc_TxnResponseCode: '99',
      vpc_TransactionNo: 'TXN_CANCEL_99'
    })
  });
  assert.strictEqual(cancelRes.payment_status, 'FAILED');
  assert.strictEqual(visaRepo.findBookingByCode('BLFAIL99').paymentStatus, 'UNPAID');
});

test('6. PostgreSQL Migration v3 (PGlite): Cô lập trong schema banla, khóa chặt RLS & chạy confirm_onepay_payment nguyên tử', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();

  try {
    const sqlV2 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'banla_schema_v2.sql'), 'utf8');
    const sqlV3 = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'banla_v3_onepay_visa.sql'), 'utf8');

    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
    `);
    await db.exec(sqlV2);
    await db.exec(sqlV3);

    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    // Tạo đơn bởi anon qua RPC công khai v2
    await db.exec('set role anon');
    const created = await db.query(
      'select * from public.banla_create_booking($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9)',
      ['Trần Quốc Tế', '0911222333', 'intl@example.com', 'elite', day(7), day(9), 2, 'deposit_50', 'Visa test']
    );
    const bookingCode = created.rows[0].booking_code;
    const amountDue = Number(created.rows[0].amount_due); // 1.250.000 * 2 * 50% = 1.250.000

    // anon TUYỆT ĐỐI KHÔNG đọc/ghi được payment_intents, payment_events hay gọi confirm_onepay_payment
    await assert.rejects(db.query('select * from banla.payment_intents'), /permission denied/);
    await assert.rejects(db.query('select * from banla.payment_events'), /permission denied/);
    await assert.rejects(
      db.query("select banla.confirm_onepay_payment('REF1', 'TX1', 1250000, '123456', '{}'::jsonb)"),
      /permission denied/
    );
    await db.exec('reset role');

    // service_role tạo payment_intent và xác nhận IPN nguyên tử
    await db.exec('set role service_role');
    const bRow = await db.query('select id from banla.bookings where booking_code = $1', [bookingCode]);
    const bookingUuid = bRow.rows[0].id;
    const merchRef = `${bookingCode}-ABCD1234`;

    await db.query(
      `insert into banla.payment_intents
        (booking_id, booking_code, provider, method, payment_option, amount_vnd, idempotency_key, merchant_txn_ref)
       values ($1, $2, 'ONEPAY', 'CARD', 'deposit_50', $3, $4, $5)`,
      [bookingUuid, bookingCode, amountDue, `${bookingCode}:deposit_50:${amountDue}:CARD`, merchRef]
    );

    // Sai số tiền phải bị từ chối trong CSDL
    await assert.rejects(
      db.query('select * from banla.confirm_onepay_payment($1, $2, $3, $4, $5::jsonb)', [
        merchRef,
        'ONEPAY_TX_999',
        999,
        '654321',
        JSON.stringify({ vpc_TxnResponseCode: '0' })
      ]),
      /Sai lệch số tiền IPN/
    );

    // Đúng số tiền -> duyệt đơn, ghi transactions, cấp PIN 6 số, đổi payment_method = 'visa'
    const confirmed = await db.query('select * from banla.confirm_onepay_payment($1, $2, $3, $4, $5::jsonb)', [
      merchRef,
      'ONEPAY_TX_999',
      amountDue,
      '654321',
      JSON.stringify({ vpc_TxnResponseCode: '0', vpc_Card: 'VC' })
    ]);

    assert.strictEqual(confirmed.rows[0].payment_status, 'paid');
    assert.strictEqual(confirmed.rows[0].booking_status, 'confirmed');
    assert.strictEqual(confirmed.rows[0].payment_method, 'visa');
    assert.strictEqual(confirmed.rows[0].smartlock_pin, '654321');
    assert.strictEqual(Number(confirmed.rows[0].paid_amount), amountDue);

    // Gọi lại lần 2 (Idempotent) -> không lỗi, không cộng dồn paid_amount
    const replay = await db.query('select * from banla.confirm_onepay_payment($1, $2, $3, $4, $5::jsonb)', [
      merchRef,
      'ONEPAY_TX_999',
      amountDue,
      '654321',
      JSON.stringify({ vpc_TxnResponseCode: '0' })
    ]);
    assert.strictEqual(Number(replay.rows[0].paid_amount), amountDue);

    await db.exec('reset role');
  } finally {
    await db.close();
  }
});

test('7. Express Route & Middleware Guard: Chặn truy cập tĩnh /backend, /skills, /supabase -> 404 & chạy trọn luồng Router', async () => {
  const { app } = require('../server');
  const { Duplex } = require('node:stream');

  // Hàm gọi trực tiếp Express app không cần mở cổng mạng (hoạt động trong mọi môi trường sandbox)
  function invokeExpress(method, url, bodyObj = null) {
    return new Promise((resolve, reject) => {
      const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
      const socket = new Duplex({
        read() {},
        write(_chunk, _enc, cb) { cb(); }
      });
      socket.remoteAddress = '127.0.0.1';

      const http = require('node:http');
      const req = new http.IncomingMessage(socket);
      req.method = method;
      req.url = url;
      req.headers = {
        host: 'banlaboutiquedalat.com',
        ...(bodyObj
          ? {
              'content-type': 'application/json',
              'content-length': String(Buffer.byteLength(bodyStr))
            }
          : {})
      };

      const res = new http.ServerResponse(req);
      const chunks = [];
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);

      res.write = (chunk, encoding, cb) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        return origWrite(chunk, encoding, cb);
      };
      res.end = (chunk, encoding, cb) => {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding));
        origEnd(chunk, encoding, cb);
        const rawText = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(rawText); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.getHeaders(),
          text: rawText,
          json
        });
      };

      try {
        app.handle(req, res, reject);
        if (bodyObj) {
          req.push(bodyStr);
        }
        req.push(null);
      } catch (err) {
        reject(err);
      }
    });
  }

  // 7a. Chặn tuyệt đối truy cập tĩnh vào thư mục backend, skills, supabase, shared
  for (const blockedPath of [
    '/backend/modules/payments/onepay.service.js',
    '/skills/visa-payment/SKILL.md',
    '/supabase/sql/banla_v3_onepay_visa.sql',
    '/shared/constants/rooms.js'
  ]) {
    const r = await invokeExpress('GET', blockedPath);
    assert.strictEqual(r.status, 404, `Đường dẫn nhạy cảm ${blockedPath} phải trả 404`);
  }

  // 7b. POST /api/booking từ chối nếu có trường thẻ nhạy cảm
  const badBooking = await invokeExpress('POST', '/api/booking', {
    name: 'Nguyễn Test',
    phone: '0901234567',
    card_number: '4000123456789010'
  });
  assert.strictEqual(badBooking.status, 400);
  assert.strictEqual(badBooking.json.error_code, 'FORBIDDEN_CARD_DATA');

  // 7c. POST /api/booking hợp lệ với paymentMethod = 'visa' -> POST /api/payments/visa/create-intent -> Webhook -> Return -> Status
  const created = await invokeExpress('POST', '/api/booking', {
    name: 'Lê Hoàng Quốc Tế',
    phone: '0933445566',
    email: 'lehoang@example.com',
    checkin: '2026-12-28',
    checkout: '2026-12-30',
    room: 'Élite Room',
    guests: 2,
    paymentOption: 'deposit_50',
    paymentMethod: 'visa'
  });
  assert.strictEqual(created.status, 200);
  assert.match(created.json.id, /^BL[0-9A-Z]{6}$/);
  assert.strictEqual(created.json.amount_due, 1250000);

  const intent = await invokeExpress('POST', '/api/payments/visa/create-intent', {
    booking_id: created.json.id,
    payment_option: 'deposit_50'
  });
  assert.strictEqual(intent.status, 201);
  assert.strictEqual(intent.json.amount_vnd, 1250000);

  const signedWebhook = buildSignedIpnPayload({
    vpc_MerchTxnRef: intent.json.merchant_txn_ref,
    vpc_Amount: '125000000',
    vpc_TxnResponseCode: '0',
    vpc_TransactionNo: 'TX_EXPRESS_001'
  });

  const webhookRes = await invokeExpress('POST', '/api/payments/visa/webhook', signedWebhook);
  assert.strictEqual(webhookRes.status, 200);
  assert.strictEqual(webhookRes.json.payment_status, 'PAID');

  const returnQs = new URLSearchParams(signedWebhook).toString();
  const returnRes = await invokeExpress('GET', `/api/payments/onepay/return?${returnQs}`);
  assert.strictEqual(returnRes.status, 302);
  assert.ok(String(returnRes.headers.location).includes('state=success'));

  const statusRes = await invokeExpress(
    'GET',
    `/api/payments/${created.json.id}/status?merchant_txn_ref=${encodeURIComponent(intent.json.merchant_txn_ref)}`
  );
  assert.strictEqual(statusRes.status, 200);
  assert.strictEqual(statusRes.json.payment_status, 'PAID');
  assert.match(statusRes.json.smart_lock_pin, /^\d{6}$/);
});

