const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10kb' }));
// Không public dữ liệu booking, mã nguồn server, cấu hình
app.use((req, res, next) => (/^\/(data|node_modules|test|docs|\.)|^\/(server\.js|package(-lock)?\.json)$/i.test(req.path) ? res.status(404).end() : next()));
app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// API: Get all rooms
app.get('/api/rooms', (req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  res.json(data);
});

// API: Booking inquiry — validate, lưu data/bookings.json, gửi email nếu có SMTP
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || path.join(__dirname, 'data', 'bookings.json');
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

function validateBooking(b = {}) {
  const errors = [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(b.name).replace(/[\r\n]+/g, ' '), email = str(b.email), phone = str(b.phone);
  if (name.length < 2 || name.length > 100) errors.push('Vui lòng nhập họ tên hợp lệ.');
  if (!phone && !email) errors.push('Vui lòng nhập số điện thoại hoặc email.');
  if (phone && !/^[+0-9 ().-]{8,20}$/.test(phone)) errors.push('Số điện thoại không hợp lệ.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email không hợp lệ.');
  if (b.checkin || b.checkout) {
    if (!isDate(b.checkin) || !isDate(b.checkout)) errors.push('Ngày nhận/trả phòng không hợp lệ.');
    else if (b.checkout <= b.checkin) errors.push('Ngày trả phòng phải sau ngày nhận phòng.');
  }
  if (b.room !== undefined && (typeof b.room !== 'string' || b.room.length > 100)) errors.push('Loại phòng không hợp lệ.');
  let guests = null;
  if (b.guests !== undefined && b.guests !== '') {
    guests = Number(b.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) errors.push('Số khách phải từ 1 đến 20.');
  }
  return { errors, booking: { name, email, phone, checkin: b.checkin || '', checkout: b.checkout || '',
    room: str(b.room), guests, message: str(b.message || b.note).slice(0, 1000) } };
}

async function maybeSendEmail(booking) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BOOKING_NOTIFY_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !BOOKING_NOTIFY_TO) return false;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return false; }
  const t = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  await t.sendMail({ from: process.env.SMTP_FROM || SMTP_USER, to: BOOKING_NOTIFY_TO,
    subject: `Yêu cầu đặt phòng mới: ${booking.name}`, text: JSON.stringify(booking, null, 2) });
  return true;
}

app.post('/api/booking', async (req, res) => {
  const { errors, booking } = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors, message: errors.join(' ') });
  const record = { id: Date.now().toString(36), createdAt: new Date().toISOString(), ...booking };
  try {
    fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
    const list = fs.existsSync(BOOKINGS_FILE) ? JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8')) : [];
    list.push(record);
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('Lưu booking lỗi:', err);
    return res.status(500).json({ success: false, message: 'Có lỗi khi lưu yêu cầu. Vui lòng gọi điện/Zalo cho Banla.' });
  }
  maybeSendEmail(record).catch((err) => console.error('Gửi email lỗi:', err.message));
  res.json({ success: true, id: record.id, message: 'Đã nhận yêu cầu. Banla sẽ liên hệ sớm.' });
});

app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).end();
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Banla server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, validateBooking };
