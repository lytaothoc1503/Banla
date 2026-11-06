const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banla-real-cutover-'));
const tmpBookingsFile = path.join(tmpDir, 'bookings.json');

process.env.NODE_ENV = 'test';
process.env.BOOKINGS_FILE = tmpBookingsFile;
process.env.BANLA_WEBHOOK_SECRET = 'real_cutover_webhook_secret_2026_secure';
process.env.ADMIN_KEY = 'REAL_CUTOVER_ADMIN_KEY_2026_SECURE';
process.env.ADMIN_SESSION_SECRET = 'real_cutover_session_secret_32bytes_minimum_ok';

const { app } = require('../server');
const { Duplex } = require('node:stream');
const http = require('node:http');

const base = 'http://127.0.0.1';

function fetch(input, init = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(String(input), 'http://127.0.0.1');
    const method = (init.method || 'GET').toUpperCase();
    const rawBody = init.body !== undefined && init.body !== null ? String(init.body) : '';
    const socket = new Duplex({
      read() {},
      write(_c, _e, cb) { cb(); }
    });
    socket.remoteAddress = '127.0.0.1';

    const headers = {};
    if (init.headers) {
      for (const [k, v] of Object.entries(init.headers)) {
        headers[k.toLowerCase()] = String(v);
      }
    }
    headers.host = headers.host || u.host || '127.0.0.1';
    if (rawBody && !headers['content-length']) {
      headers['content-length'] = String(Buffer.byteLength(rawBody));
    }

    const req = new http.IncomingMessage(socket);
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = headers;

    const res = new http.ServerResponse(req);
    const chunks = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = (chunk, enc, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), enc));
      return origWrite(chunk, enc, cb);
    };
    res.end = (chunk, enc, cb) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), enc));
      origEnd(chunk, enc, cb);
      const textStr = Buffer.concat(chunks).toString('utf8');
      const resHeaders = res.getHeaders();
      resolve({
        status: res.statusCode,
        ok: res.statusCode >= 200 && res.statusCode < 300,
        headers: {
          get(name) {
            const v = resHeaders[String(name || '').toLowerCase()];
            return Array.isArray(v) ? v.join(', ') : (v !== undefined ? String(v) : null);
          }
        },
        text: async () => textStr,
        json: async () => JSON.parse(textStr)
      });
    };

    try {
      app.handle(req, res, reject);
      if (rawBody) req.push(rawBody);
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}

before(() => {
  fs.writeFileSync(tmpBookingsFile, '[]\n', 'utf8');
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('1. Kiểm toán kho dữ liệu runtime: Sạch 100% dữ liệu giả / mock BL9821, BL7342, BL3519, 0965999999', () => {
  const prodBookingsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'bookings.json'), 'utf8'));
  assert.ok(Array.isArray(prodBookingsRaw), 'data/bookings.json phải là mảng JSON');
  assert.strictEqual(prodBookingsRaw.length, 0, 'data/bookings.json không được chứa đơn giả');

  const prodSessionsRaw = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'banla_payment_module', 'data', 'payment_sessions.json'), 'utf8')
  );
  assert.deepStrictEqual(prodSessionsRaw, {}, 'payment_sessions.json không được chứa phiên QR giả');

  const filesToCheck = [
    'admin.html',
    'script.js',
    'phieu.js',
    'phieu.html',
    'banla_payment_module/frontend/banla-priority-modal.js',
    'banla_payment_module/frontend/index.html',
    'banla_payment_module/database/banla_migration.sql',
    'supabase/sql/banla_production_master.sql'
  ];

  const bannedPatterns = ['BL9821', 'BL7342', 'BL3519', 'INITIAL_BOOKINGS', '0965999999', 'BALA9821'];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const banned of bannedPatterns) {
      assert.ok(!content.includes(banned), `File ${rel} vẫn còn chuỗi mock cấm: ${banned}`);
    }
  }
});

test('2. PostgreSQL Thật (PGlite): Master Migration `banla_production_master.sql` + RLS + RPC đặt phòng & thanh toán', async () => {
  const db = new PGlite();
  try {
    // Khởi tạo các role chuẩn của Supabase trên PostgreSQL thật
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN CREATE ROLE authenticator NOINHERIT; END IF;
      END $$;
      -- Giả lập bảng của dự án webmoi trong public để chứng minh banla cách ly 100%
      CREATE TABLE public.webmoi_keep_untouched (id serial primary key, title text);
      INSERT INTO public.webmoi_keep_untouched (title) VALUES ('safe');
    `);

    const masterSql = fs.readFileSync(
      path.join(ROOT, 'supabase', 'sql', 'banla_production_master.sql'),
      'utf8'
    );

    // Chạy lần 1 và chạy lại lần 2 để chứng minh tính Idempotent 100%
    await db.exec(masterSql);
    await db.exec(masterSql);

    // Kiểm tra bảng public của webmoi nguyên vẹn và không có bảng banla nào lọt vào public
    const pubTables = await db.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    assert.deepStrictEqual(
      pubTables.rows.map((r) => r.tablename),
      ['webmoi_keep_untouched'],
      'Tuyệt đối không được tạo bảng Banla trong schema public'
    );

    // Kiểm tra đủ 7 bảng trong schema banla và đều bật RLS
    const banlaTables = await db.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'banla'
      ORDER BY tablename
    `);
    const expectedTables = [
      'bookings',
      'payment_events',
      'payment_intents',
      'payment_sessions',
      'rooms',
      'smartlock_access',
      'transactions'
    ];
    assert.deepStrictEqual(
      banlaTables.rows.map((r) => r.tablename),
      expectedTables
    );
    for (const row of banlaTables.rows) {
      assert.strictEqual(row.rowsecurity, true, `Bảng banla.${row.tablename} bắt buộc bật RLS`);
    }

    // Kiểm tra anon bị chặn đọc trực tiếp bảng banla.bookings (chống lộ PII & PIN)
    await assert.rejects(
      async () => {
        await db.exec(`
          BEGIN;
          SET LOCAL ROLE anon;
          SELECT * FROM banla.bookings;
          COMMIT;
        `);
      },
      /permission denied/i,
      'Role anon không được phép SELECT trực tiếp bảng banla.bookings'
    );
    await db.exec('ROLLBACK;');

    const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

    // Role anon được phép gọi RPC kiểm tra phòng trống & tạo đơn đặt phòng thật
    await db.exec('SET ROLE anon');
    const createdRes = await db.query(
      `SELECT * FROM public.banla_create_booking($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10)`,
      [
        'Nguyễn Minh Khôi',
        '0918223344',
        'minhkhoi@example.com',
        'suite',
        day(10),
        day(12),
        2,
        'pay_100',
        'Check-in buổi chiều',
        'vietqr'
      ]
    );
    assert.strictEqual(createdRes.rows.length, 1);
    const created = createdRes.rows[0];
    assert.match(created.booking_code, /^BL[0-9A-F]{6}$/);
    assert.strictEqual(Number(created.total_amount), 3100000); // 1.550.000 * 2 đêm
    assert.strictEqual(Number(created.discount_amount), 310000); // Giảm 10%
    assert.strictEqual(Number(created.amount_due), 2790000);
    assert.strictEqual(Number(created.remaining_at_checkin), 0);

    // Chặn đặt trùng hạng phòng Original Suite (inventory = 1) trong cùng khoảng ngày
    await assert.rejects(
      async () => {
        await db.query(
          `SELECT * FROM public.banla_create_booking($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10)`,
          ['Khách Đặt Trùng', '0909112233', null, 'suite', day(11), day(13), 2, 'deposit_50', null, 'vietqr']
        );
      },
      /hết phòng/i
    );
    await db.exec('RESET ROLE');

    // Đối soát thanh toán qua RPC service_role `banla.record_payment` + `banla.approve_booking` -> cấp PIN 6 số & đồng bộ smartlock_access
    await db.exec('SET ROLE service_role');
    const payRes = await db.query(
      `SELECT * FROM banla.record_payment($1, 2790000, 'MB_TXN_REAL_001', 'MB', 'webhook', 'vietqr_webhook')`,
      [created.booking_code]
    );
    assert.strictEqual(payRes.rows[0].payment_status, 'paid');
    assert.strictEqual(Number(payRes.rows[0].paid_amount), 2790000);

    // Gửi lặp cùng gateway_txn_id -> Idempotent (không cộng dồn tiền lần 2)
    const dupPayRes = await db.query(
      `SELECT * FROM banla.record_payment($1, 2790000, 'MB_TXN_REAL_001', 'MB', 'webhook', 'vietqr_webhook')`,
      [created.booking_code]
    );
    assert.strictEqual(Number(dupPayRes.rows[0].paid_amount), 2790000);

    const approveRes = await db.query(
      `SELECT * FROM banla.approve_booking($1, '686868', 'vietqr_webhook')`,
      [created.booking_code]
    );
    assert.strictEqual(approveRes.rows[0].booking_status, 'confirmed');
    assert.strictEqual(approveRes.rows[0].smartlock_pin, '686868');

    const lockRows = await db.query(
      `SELECT pin_code, is_active FROM banla.smartlock_access WHERE booking_code = $1`,
      [created.booking_code]
    );
    assert.strictEqual(lockRows.rows.length, 1);
    assert.strictEqual(lockRows.rows[0].pin_code, '686868');
    assert.strictEqual(lockRows.rows[0].is_active, true);
    await db.exec('RESET ROLE');

    // Tra cứu qua RPC `public.banla_booking_status`: sai SĐT trả rỗng, đúng SĐT trả đúng mã PIN 6 số
    await db.exec('SET ROLE anon');
    const wrongPhoneLookup = await db.query(
      `SELECT * FROM public.banla_booking_status($1, '0999000111')`,
      [created.booking_code]
    );
    assert.strictEqual(wrongPhoneLookup.rows.length, 0);

    const rightPhoneLookup = await db.query(
      `SELECT * FROM public.banla_booking_status($1, '0918223344')`,
      [created.booking_code]
    );
    assert.strictEqual(rightPhoneLookup.rows.length, 1);
    assert.strictEqual(rightPhoneLookup.rows[0].smartlock_pin, '686868');
    await db.exec('RESET ROLE');
  } finally {
    await db.close();
  }
});

test('3. PostgreSQL Thật (PGlite): `banla_payment_module/database/banla_migration.sql` chạy chuẩn trên `banla_schema_v2.sql`', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
    `);
    const v2Sql = fs.readFileSync(path.join(ROOT, 'supabase', 'sql', 'banla_schema_v2.sql'), 'utf8');
    const modSql = fs.readFileSync(
      path.join(ROOT, 'banla_payment_module', 'database', 'banla_migration.sql'),
      'utf8'
    );
    await db.exec(v2Sql);
    await db.exec(modSql);

    const pubTables = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    assert.strictEqual(pubTables.rows.length, 0, 'banla_migration.sql không được tạo bảng trong public');
  } finally {
    await db.close();
  }
});

test('4. Express API Dữ liệu Thật: Chống đặt trùng phòng (409), kiểm tra sức chứa (400) & API phòng trống', async () => {
  // Kiểm tra sức chứa: Banla Signature tối đa 3 khách -> gửi 6 khách phải trả 400
  const overCapRes = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Đoàn Đông Khách',
      phone: '0911223344',
      room: 'Banla Signature',
      checkin: '2027-04-10',
      checkout: '2027-04-12',
      guests: 6
    })
  });
  assert.strictEqual(overCapRes.status, 400);
  const overCapBody = await overCapRes.json();
  assert.strictEqual(overCapBody.error_code, 'CAPACITY_EXCEEDED');

  // Đặt hợp lệ phòng Highland Room từ 2027-04-10 đến 2027-04-13
  const okRes = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Lê Thanh Hà',
      phone: '0933445566',
      email: 'thanhha@example.com',
      room: 'Highland Room',
      checkin: '2027-04-10',
      checkout: '2027-04-13',
      guests: 2,
      paymentOption: 'deposit_50'
    })
  });
  assert.strictEqual(okRes.status, 200);
  const okData = await okRes.json();
  assert.strictEqual(okData.total_amount, 3300000); // 1.100.000 * 3 đêm
  assert.strictEqual(okData.amount_due, 1650000); // Cọc 50%

  // Đặt trùng ngày giao thoa (2027-04-12 -> 2027-04-14) trên Highland Room -> 409 ROOM_UNAVAILABLE
  const conflictRes = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Khách Đặt Sau',
      phone: '0944556677',
      room: 'Highland Room',
      checkin: '2027-04-12',
      checkout: '2027-04-14',
      guests: 2
    })
  });
  assert.strictEqual(conflictRes.status, 409);
  const conflictData = await conflictRes.json();
  assert.strictEqual(conflictData.error_code, 'ROOM_UNAVAILABLE');

  // Đặt nối tiếp ngày trả phòng (check-in đúng ngày 2027-04-13) -> Hợp lệ 200!
  const adjacentRes = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Khách Nối Tiếp',
      phone: '0944556688',
      room: 'Highland Room',
      checkin: '2027-04-13',
      checkout: '2027-04-15',
      guests: 2
    })
  });
  assert.strictEqual(adjacentRes.status, 200);

  // API GET /api/rooms/availability phản ánh chính xác Highland Room đã kín 2027-04-10 -> 2027-04-12
  const availRes = await fetch(
    `${base}/api/rooms/availability?check_in=2027-04-10&check_out=2027-04-12&guests=2`
  );
  assert.strictEqual(availRes.status, 200);
  const availData = await availRes.json();
  const highland = availData.rooms.find((r) => r.code === 'highland');
  assert.ok(highland);
  assert.strictEqual(highland.isAvailable, false);
  assert.strictEqual(highland.availableUnits, 0);
});

test('5. Bảo mật Smart-Lock PIN chống IDOR + Đối soát VietQR chuẩn giá Server & Idempotent Webhook', async () => {
  // 1. Tạo đơn thực tế với hình thức cọc 50% (Connecting Room: 1.850.000 * 2 đêm = 3.700.000, cọc 1.850.000)
  const bookRes = await fetch(`${base}/api/booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Phạm Quốc Bảo',
      phone: '0977889900',
      email: 'quocbao@example.com',
      room: 'Connecting Room',
      checkin: '2027-05-01',
      checkout: '2027-05-03',
      guests: 4,
      paymentOption: 'deposit_50'
    })
  });
  assert.strictEqual(bookRes.status, 200);
  const { booking_code: code } = await bookRes.json();

  // 2. Cố tình giả mạo amount: 1000 từ client khi tạo phiên VietQR -> Server BẮT BUỘC ép về 1.850.000 đ!
  const sessRes = await fetch(`${base}/api/banla/session/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: code,
      amount: 1000
    })
  });
  assert.strictEqual(sessRes.status, 201);
  const sessJson = await sessRes.json();
  assert.strictEqual(sessJson.amount, 1850000, 'Phiên QR phải lấy giá cọc chuẩn từ CSDL thay vì tin client');

  // 3. Ngân hàng bắn Webhook thực tế chỉ có nội dung chuyển khoản tự nhiên ("FT26... BANLA_BLxxxxxx ...") không truyền bookingId riêng
  const webhookBody = JSON.stringify({
    transactionId: 'FT26309REAL998877',
    amount: 1850000,
    bankCode: 'MB',
    content: `MBVCB.998877.Chuyen khoan BANLA_${code} dat phong`
  });
  const sig = crypto
    .createHmac('sha256', process.env.BANLA_WEBHOOK_SECRET)
    .update(webhookBody)
    .digest('hex');

  const whRes1 = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-banla-signature': sig
    },
    body: webhookBody
  });
  assert.strictEqual(whRes1.status, 200);
  const whData1 = await whRes1.json();
  assert.strictEqual(whData1.success, true);
  assert.strictEqual(whData1.duplicate, false);
  assert.match(whData1.smartLockPin, /^[0-9]{6}$/);

  // 4. Gửi lặp lại đúng Webhook đó lần 2 -> Không cộng dồn paidAmount thành 3.700.000!
  const whRes2 = await fetch(`${base}/api/banla/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-banla-signature': sig
    },
    body: webhookBody
  });
  assert.strictEqual(whRes2.status, 200);
  const whData2 = await whRes2.json();
  assert.strictEqual(whData2.duplicate, true);
  assert.strictEqual(whData2.paidAmount, 1850000, 'Idempotency: không được nhân đôi tiền cọc khi webhook retry');

  // 5. Mở `/api/booking/detail` KHÔNG kèm SĐT -> Ẩn mã PIN vật lý (`smartLockPin: null`, `pinProtected: true`) & che SĐT
  const publicDetailRes = await fetch(`${base}/api/booking/detail?id=${code}`);
  assert.strictEqual(publicDetailRes.status, 200);
  const publicDetail = await publicDetailRes.json();
  assert.strictEqual(publicDetail.booking.smartLockPin, null, 'Tuyệt đối không lộ PIN khi chưa xác thực SĐT/Email');
  assert.strictEqual(publicDetail.booking.pinProtected, true);
  assert.strictEqual(publicDetail.booking.paidAmount, 1850000);
  assert.strictEqual(publicDetail.booking.remainingAmount, 1850000);
  assert.ok(publicDetail.booking.phone.includes('****'));

  // 6. Truyền sai SĐT -> 403 Forbidden
  const wrongContactRes = await fetch(`${base}/api/booking/detail?id=${code}&contact=0900111222`);
  assert.strictEqual(wrongContactRes.status, 403);

  // 7. Truyền đúng SĐT khách đặt -> Mở khóa đúng mã PIN 6 số!
  const validContactRes = await fetch(`${base}/api/booking/detail?id=${code}&contact=0977889900`);
  assert.strictEqual(validContactRes.status, 200);
  const validDetail = await validContactRes.json();
  assert.strictEqual(validDetail.booking.smartLockPin, whData1.smartLockPin);
  assert.strictEqual(validDetail.booking.pinProtected, false);
});

test('6. Admin Tạo đơn & Duyệt đơn cọc 50% ghi nhận chính xác doanh thu + Phiếu Dấu Đỏ tính đúng giảm giá 10%', async () => {
  const adminHeaders = {
    'Content-Type': 'application/json',
    'x-admin-key': process.env.ADMIN_KEY
  };

  // Lễ tân tạo đơn mới từ Admin
  const createRes = await fetch(`${base}/api/admin/booking/create`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      guest_name: 'Đặng Thu Thảo',
      guest_phone: '0988123987',
      room_id: 'Deluxe Twin',
      guests: 2,
      check_in: '2027-06-10',
      check_out: '2027-06-12',
      payment_option: 'deposit_50'
    })
  });
  assert.strictEqual(createRes.status, 201);
  const { booking: created } = await createRes.json();
  assert.strictEqual(created.totalPrice, 1900000); // 950.000 * 2 đêm
  assert.strictEqual(created.depositAmount, 950000);
  assert.strictEqual(created.paidAmount, 0);

  // Lễ tân bấm Duyệt đơn thu cọc 50% -> paidAmount phải đúng 950.000 (không bị phóng đại thành 1.900.000 - G4)
  const approveRes = await fetch(`${base}/api/admin/booking/approve`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      id: created.bookingCode,
      bankCode: 'MB'
    })
  });
  assert.strictEqual(approveRes.status, 200);
  const approvedData = await approveRes.json();
  assert.strictEqual(approvedData.booking.paidAmount, 950000);
  assert.strictEqual(approvedData.booking.remainingAmount, 950000);
  assert.match(approvedData.pin, /^[0-9]{6}$/);

  // Kiểm tra hàm render Phiếu Dấu Đỏ `window.BanlaSlip` với đơn thanh toán 100% (-10% ưu đãi)
  global.window = global.window || {};
  global.document = global.document || {
    getElementById: () => null,
    createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
    head: { appendChild: () => {} }
  };
  require('../phieu.js');

  const pay100SlipHtml = global.window.BanlaSlip({
    booking_code: 'BL100PCT',
    guest_name: 'Khách Thanh Toán Đủ',
    room_id: 'Original Suite',
    check_in: '2027-07-01',
    check_out: '2027-07-03',
    total_amount: 3100000,
    discount_amount: 310000,
    paid_amount: 2790000,
    payment_option: 'pay_100',
    payment_status: 'paid',
    booking_status: 'confirmed',
    pinProtected: true
  });

  assert.ok(
    pay100SlipHtml.includes('0 đ (Đã hoàn tất 100%)'),
    'Đơn thanh toán 100% (-10%) phải hiển thị còn lại 0 đ thay vì đòi lại 10% giảm giá'
  );
  assert.ok(pay100SlipHtml.includes('ĐÃ THANH TOÁN ĐỦ (100%)'));
  assert.ok(
    pay100SlipHtml.includes('Đã kích hoạt — Đang ẩn bảo mật'),
    'Khi chưa nhập SĐT mở khóa, phiếu phải báo PIN đang ẩn bảo mật thay vì báo chưa kích hoạt'
  );
});
