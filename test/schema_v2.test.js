// Kiểm thử schema v2 trên Postgres thật (PGlite chạy Postgres bằng WASM, không cần cài DB).
// Mô phỏng các role của Supabase: anon, authenticated, service_role (có BYPASSRLS như Supabase).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'sql', 'banla_schema_v2.sql'), 'utf8');
let db;

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function as(role, sql, params = []) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function createBooking(role, { name = 'Nguyễn Văn A', phone = '0901 234 567', email = 'a@example.com', room = 'signature', ci = day(10), co = day(12), guests = 2, option = 'deposit_50', note = '' } = {}) {
  const r = await as(role,
    'select * from public.banla_create_booking($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9)',
    [name, phone, email, room, ci, co, guests, option, note]);
  return r.rows[0];
}

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
  `);
  await db.exec(SQL);
});

after(async () => { if (db) await db.close(); });

test('v2: tạo đơn cọc 50% — giá do CSDL tự tính', async () => {
  const b = await createBooking('anon', { room: 'signature', ci: day(10), co: day(12), option: 'deposit_50' });
  assert.match(b.booking_code, /^BL[0-9A-Z]{6}$/);
  assert.strictEqual(Number(b.nights), 2);
  assert.strictEqual(Number(b.total_amount), 2300000);
  assert.strictEqual(Number(b.discount_amount), 0);
  assert.strictEqual(Number(b.amount_due), 1150000);
  assert.strictEqual(Number(b.remaining_at_checkin), 1150000);
});

test('v2: tạo đơn trả 100% — giảm đúng 10%', async () => {
  const b = await createBooking('anon', { room: 'suite', ci: day(20), co: day(23), option: 'pay_100' });
  assert.strictEqual(Number(b.total_amount), 4650000);
  assert.strictEqual(Number(b.discount_amount), 465000);
  assert.strictEqual(Number(b.amount_due), 4185000);
  assert.strictEqual(Number(b.remaining_at_checkin), 0);
});

test('v2 (D2/G5): anon KHÔNG đọc, sửa, xóa được bảng nào', async () => {
  await assert.rejects(as('anon', 'select * from banla.bookings'), /permission denied/);
  await assert.rejects(as('anon', "update banla.bookings set payment_status = 'paid'"), /permission denied/);
  await assert.rejects(as('anon', 'delete from banla.bookings'), /permission denied/);
  await assert.rejects(as('anon', 'select * from banla.transactions'), /permission denied/);
  await assert.rejects(as('authenticated', 'select * from banla.bookings'), /permission denied/);
});

test('v2 (D3): anon KHÔNG gọi được hàm duyệt đơn / ghi nhận tiền', async () => {
  const b = await createBooking('anon', { room: 'twin', ci: day(30), co: day(31) });
  await assert.rejects(as('anon', "select banla.approve_booking($1, '123456', 'hacker')", [b.booking_code]), /permission denied/);
  await assert.rejects(as('anon', "select banla.record_payment($1, 1, 'TX-HACK')", [b.booking_code]), /permission denied/);
  await assert.rejects(as('authenticated', "select banla.approve_booking($1, '123456', 'hacker')", [b.booking_code]), /permission denied/);
});

test('v2 (D9): từ chối dữ liệu sai', async () => {
  await assert.rejects(createBooking('anon', { ci: day(15), co: day(15) }), /Ngày trả phòng phải sau/);
  await assert.rejects(createBooking('anon', { ci: day(-2), co: day(1) }), /Ngày nhận phòng đã qua/);
  await assert.rejects(createBooking('anon', { room: 'khong-co' }), /Hạng phòng không tồn tại/);
  await assert.rejects(createBooking('anon', { guests: 4, room: 'twin', ci: day(40), co: day(41) }), /vượt sức chứa/);
  await assert.rejects(createBooking('anon', { phone: '123' }), /Số điện thoại không hợp lệ/);
  await assert.rejects(createBooking('anon', { option: 'free' }), /Phương thức thanh toán không hợp lệ/);
  await assert.rejects(createBooking('anon', { name: 'A' }), /Họ tên không hợp lệ/);
});

test('v2 (D10): chống đặt trùng phòng, cho phép nối tiếp, giải phóng khi hết giữ chỗ', async () => {
  const first = await createBooking('anon', { room: 'balcony', ci: day(50), co: day(53) });
  assert.ok(first.booking_code);
  await assert.rejects(createBooking('anon', { room: 'balcony', ci: day(52), co: day(54) }), /đã hết phòng/);
  // Ngày nhận = ngày trả của đơn trước → hợp lệ
  const next = await createBooking('anon', { room: 'balcony', ci: day(53), co: day(55) });
  assert.ok(next.booking_code);
  // Đơn đầu hết hạn giữ chỗ mà chưa thanh toán → phòng được giải phóng
  await db.query("update banla.bookings set hold_expires_at = now() - interval '1 minute' where booking_code = $1", [first.booking_code]);
  const again = await createBooking('anon', { room: 'balcony', ci: day(50), co: day(52) });
  assert.ok(again.booking_code);
});

test('v2 (G2): tra đơn cần đúng mã + đúng SĐT; chưa trả tiền thì không có PIN', async () => {
  const b = await createBooking('anon', { phone: '0912-345-678', room: 'highland', ci: day(60), co: day(61) });
  const wrong = await as('anon', 'select * from public.banla_booking_status($1, $2)', [b.booking_code, '0999999999']);
  assert.strictEqual(wrong.rows.length, 0);
  const ok = await as('anon', 'select * from public.banla_booking_status($1, $2)', [b.booking_code.toLowerCase(), '0912345678']);
  assert.strictEqual(ok.rows.length, 1);
  assert.strictEqual(ok.rows[0].payment_status, 'pending');
  assert.strictEqual(ok.rows[0].smartlock_pin, null);
});

test('v2 (G4/D8): cọc 50% — trả thiếu vẫn pending, đủ mới paid, chống ghi trùng, duyệt mới có PIN', async () => {
  const b = await createBooking('anon', { phone: '0933000111', room: 'elite', ci: day(70), co: day(72), option: 'deposit_50' });
  const code = b.booking_code; // tổng 2.500.000, phải cọc 1.250.000

  // Duyệt khi chưa có tiền → bị từ chối
  await assert.rejects(as('service_role', "select banla.approve_booking($1, '482917', 'le_tan')", [code]), /Chưa nhận đủ tiền/);

  // Chuyển thiếu 1.000.000
  await as('service_role', "select banla.record_payment($1, 1000000, 'TX-001')", [code]);
  let s = (await as('anon', 'select * from public.banla_booking_status($1,$2)', [code, '0933000111'])).rows[0];
  assert.strictEqual(s.payment_status, 'pending');
  assert.strictEqual(Number(s.paid_amount), 1000000);

  // Webhook gửi lại cùng mã giao dịch → không cộng lần 2
  await as('service_role', "select banla.record_payment($1, 1000000, 'TX-001')", [code]);
  s = (await as('anon', 'select * from public.banla_booking_status($1,$2)', [code, '0933000111'])).rows[0];
  assert.strictEqual(Number(s.paid_amount), 1000000);

  // Chuyển nốt 250.000 → đủ cọc → paid, nhưng CHƯA có PIN vì chưa duyệt
  await as('service_role', "select banla.record_payment($1, 250000, 'TX-002')", [code]);
  s = (await as('anon', 'select * from public.banla_booking_status($1,$2)', [code, '0933000111'])).rows[0];
  assert.strictEqual(s.payment_status, 'paid');
  assert.strictEqual(Number(s.paid_amount), 1250000);
  assert.strictEqual(Number(s.remaining_amount), 1250000, 'Cọc 50%: còn 50% trả khi nhận phòng, không bị ghi thành 100%');
  assert.strictEqual(s.smartlock_pin, null);

  // Duyệt → có PIN
  await as('service_role', "select banla.approve_booking($1, '482917', 'le_tan')", [code]);
  s = (await as('anon', 'select * from public.banla_booking_status($1,$2)', [code, '0933000111'])).rows[0];
  assert.strictEqual(s.booking_status, 'confirmed');
  assert.strictEqual(s.smartlock_pin, '482917');

  // Không cho ghi vượt tổng tiền
  await assert.rejects(as('service_role', "select banla.record_payment($1, 1250001, 'TX-003')", [code]), /vượt tổng giá trị/);
  // Cùng mã giao dịch không được dùng cho đơn khác
  const other = await createBooking('anon', { room: 'connecting', ci: day(80), co: day(81), guests: 4 });
  await assert.rejects(as('service_role', "select banla.record_payment($1, 1000, 'TX-001')", [other.booking_code]), /đã được ghi cho đơn khác/);
});

test('v2: ràng buộc CSDL cấm gắn PIN cho đơn chưa thanh toán (kể cả sửa tay)', async () => {
  const b = await createBooking('anon', { room: 'twin', ci: day(90), co: day(91) });
  await assert.rejects(
    db.query("update banla.bookings set smartlock_pin = '111111' where booking_code = $1", [b.booking_code]),
    /bookings_pin_requires_paid/
  );
});

test('v2: hủy đơn xóa PIN và giải phóng phòng', async () => {
  const b = await createBooking('anon', { room: 'suite', ci: day(100), co: day(102), phone: '0977000222', option: 'pay_100' });
  await as('service_role', "select banla.record_payment($1, 2790000, 'TX-SUITE')", [b.booking_code]);
  await as('service_role', "select banla.approve_booking($1, '765432', 'le_tan')", [b.booking_code]);
  await as('service_role', "select banla.cancel_booking($1, 'Khách đổi lịch')", [b.booking_code]);
  const s = (await as('anon', 'select * from public.banla_booking_status($1,$2)', [b.booking_code, '0977000222'])).rows[0];
  assert.strictEqual(s.booking_status, 'cancelled');
  assert.strictEqual(s.smartlock_pin, null);
  const again = await createBooking('anon', { room: 'suite', ci: day(100), co: day(102) });
  assert.ok(again.booking_code);
});

test('v2: chạy lại file schema lần 2 không lỗi (idempotent)', async () => {
  await db.exec(SQL);
  const r = await db.query('select count(*)::int as n from banla.rooms');
  assert.strictEqual(r.rows[0].n, 7);
});
