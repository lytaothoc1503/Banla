const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Basic DDoS / abuse protection
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }
});
app.use(limiter);

// CORS middleware for OTA integration
app.use((req, res, next) => {
  const allowed = process.env.OTA_ALLOWED_ORIGINS || '*';
  const origins = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (origins.includes('*') || origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    }
  } else if (origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    return res.status(204).end();
  }
  next();
});

// Stricter limit for booking API
const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Bạn đã gửi quá nhiều yêu cầu đặt phòng. Vui lòng thử lại sau.' }
});

// Rate limit for booking lookup (chống quét brute-force IDOR)
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { success: false, message: 'Bạn đã thực hiện quá nhiều lượt tra cứu. Vui lòng thử lại sau.' }
});

app.use(express.json({ limit: '10kb' }));

// Block sensitive paths
app.use((req, res, next) => (/^\/(data|node_modules|test|docs|\.)|^\/(server\.js|package(-lock)?\.json)$/i.test(req.path) ? res.status(404).end() : next()));

app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// API: Get all rooms
app.get('/api/rooms', (req, res) => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  res.json(data);
});

// API: Booking inquiry
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

  // Validate source (direct / ota)
  let source = 'direct';
  if (b.source !== undefined && b.source !== null && b.source !== '') {
    const s = str(b.source).toLowerCase();
    if (s !== 'direct' && s !== 'ota') {
      errors.push('Nguồn đặt phòng (source) không hợp lệ. Chỉ chấp nhận "direct" hoặc "ota".');
    } else {
      source = s;
    }
  }

  return { errors, booking: { name, email, phone, checkin: b.checkin || '', checkout: b.checkout || '',
    room: str(b.room), guests, source, message: str(b.message || b.note).slice(0, 1000) } };
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

app.post('/api/booking', bookingLimiter, async (req, res) => {
  const otaApiKey = process.env.OTA_API_KEY;
  const reqApiKey = req.headers['x-api-key'];
  const rawSource = typeof req.body?.source === 'string' ? req.body.source.trim().toLowerCase() : '';

  // Kiểm tra API key nếu OTA_API_KEY được cấu hình
  if (otaApiKey) {
    const isOta = rawSource === 'ota' || Boolean(reqApiKey);
    if (isOta && (!reqApiKey || reqApiKey !== otaApiKey)) {
      return res.status(401).json({ success: false, message: 'API key không hợp lệ hoặc thiếu (x-api-key).' });
    }
  }

  const { errors, booking } = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors, message: errors.join(' ') });
  const record = { id: Date.now().toString(36), createdAt: new Date().toISOString(), status: 'pending', ...booking };
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

// API: Tra cứu thông tin đặt phòng
app.get('/api/booking/lookup', lookupLimiter, (req, res) => {
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const id = rawId.replace(/^#+/, '').trim();
  const contact = typeof req.query.contact === 'string' ? req.query.contact.trim().toLowerCase() : '';

  if (!id || !contact) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp cả Mã đặt phòng (id) và Số điện thoại/Email (contact) để xác thực.'
    });
  }

  let list = [];
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      list = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Đọc booking lỗi:', err);
    return res.status(500).json({ success: false, message: 'Lỗi hệ thống khi tra cứu dữ liệu.' });
  }

  const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
  const targetContact = cleanPhone(contact);

  const found = list.find((b) => {
    if (!b || String(b.id).toLowerCase() !== id.toLowerCase()) return false;
    const bPhoneClean = cleanPhone(b.phone);
    const bEmailClean = (b.email || '').trim().toLowerCase();
    const phoneMatches = targetContact && bPhoneClean && (bPhoneClean.endsWith(targetContact) || targetContact.endsWith(bPhoneClean));
    const emailMatches = bEmailClean && bEmailClean === contact;
    return Boolean(phoneMatches || emailMatches);
  });

  if (!found) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy thông tin đặt phòng khớp với mã và thông tin liên hệ cung cấp.'
    });
  }

  // Masking thông tin cá nhân nhạy cảm
  const maskPhone = (p) => (p && p.length >= 7 ? p.slice(0, 3) + '****' + p.slice(-3) : p ? '***' : '');
  const maskEmail = (e) => (e ? e.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '***' + c) : '');

  res.json({
    success: true,
    booking: {
      id: found.id,
      name: found.name,
      room: found.room,
      checkin: found.checkin,
      checkout: found.checkout,
      guests: found.guests,
      status: found.status || 'pending',
      createdAt: found.createdAt,
      source: found.source || 'direct',
      phoneMasked: maskPhone(found.phone),
      emailMasked: maskEmail(found.email)
    }
  });
});

// Banla Priority Payment Module Router
const banlaPaymentRouter = require('./banla_payment_module/backend/banla_payment_router');
app.use('/api/banla', banlaPaymentRouter);

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
