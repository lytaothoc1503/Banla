const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

// Safe timing comparison to prevent timing attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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

// Block sensitive paths (prevent source code and sensitive data leaks)
app.use((req, res, next) => (
  /^\/(data|node_modules|test|docs|scripts|utils|banla_payment_module\/(backend|database)|\.)|^\/(server\.js|package(-lock)?\.json|skills-lock\.json)$/i.test(req.path)
    ? res.status(404).end()
    : next()
));

app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// In-memory cache for rooms.json to avoid blocking synchronous disk I/O
let roomsCache = null;
function getRoomsData() {
  if (!roomsCache) {
    roomsCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  }
  return roomsCache;
}

// API: Get all rooms
app.get('/api/rooms', (req, res) => {
  res.json(getRoomsData());
});

// API: Booking inquiry
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || path.join(__dirname, 'data', 'bookings.json');
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// Safe atomic read & write for bookings
function readBookingsSafe() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const content = fs.readFileSync(BOOKINGS_FILE, 'utf8').trim();
      if (!content) return [];
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error('[Bookings] Lỗi đọc dữ liệu:', err.message);
  }
  return [];
}

function writeBookingsSafe(list) {
  fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
  const tmpFile = `${BOOKINGS_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmpFile, BOOKINGS_FILE);
}

function validateBooking(b) {
  const errors = [];
  const body = (b && typeof b === 'object') ? b : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(body.name).replace(/[\r\n]+/g, ' ');
  const email = str(body.email);
  const phone = str(body.phone);
  if (name.length < 2 || name.length > 100) errors.push('Vui lòng nhập họ tên hợp lệ.');
  if (!phone && !email) errors.push('Vui lòng nhập số điện thoại hoặc email.');
  if (phone && !/^[+0-9 ().-]{8,20}$/.test(phone)) errors.push('Số điện thoại không hợp lệ.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email không hợp lệ.');
  if (body.checkin || body.checkout) {
    if (!isDate(body.checkin) || !isDate(body.checkout)) errors.push('Ngày nhận/trả phòng không hợp lệ.');
    else if (body.checkout <= body.checkin) errors.push('Ngày trả phòng phải sau ngày nhận phòng.');
  }
  if (body.room !== undefined && (typeof body.room !== 'string' || body.room.length > 100)) errors.push('Loại phòng không hợp lệ.');
  let guests = null;
  if (body.guests !== undefined && body.guests !== '') {
    guests = Number(body.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) errors.push('Số khách phải từ 1 đến 20.');
  }

  // Validate source (direct / ota)
  let source = 'direct';
  if (body.source !== undefined && body.source !== null && body.source !== '') {
    const s = str(body.source).toLowerCase();
    if (s !== 'direct' && s !== 'ota') {
      errors.push('Nguồn đặt phòng (source) không hợp lệ. Chỉ chấp nhận "direct" hoặc "ota".');
    } else {
      source = s;
    }
  }

  return {
    errors,
    booking: {
      name,
      email,
      phone,
      checkin: body.checkin || '',
      checkout: body.checkout || '',
      room: str(body.room),
      guests,
      source,
      message: str(body.message || body.note).slice(0, 1000)
    }
  };
}

async function maybeSendEmail(booking) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, BOOKING_NOTIFY_TO } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !BOOKING_NOTIFY_TO) return false;
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch { return false; }
  const t = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  await t.sendMail({
    from: process.env.SMTP_FROM || SMTP_USER,
    to: BOOKING_NOTIFY_TO,
    subject: `Yêu cầu đặt phòng mới: ${booking.name.replace(/[\r\n]/g, ' ')}`,
    text: JSON.stringify(booking, null, 2)
  });
  return true;
}

app.post('/api/booking', bookingLimiter, async (req, res) => {
  const otaApiKey = process.env.OTA_API_KEY;
  const reqApiKey = req.headers['x-api-key'];
  const rawSource = typeof req.body?.source === 'string' ? req.body.source.trim().toLowerCase() : '';

  // Kiểm tra API key bằng phương pháp so sánh an toàn thời gian (timing-safe)
  if (otaApiKey) {
    const isOta = rawSource === 'ota' || Boolean(reqApiKey);
    if (isOta && (!reqApiKey || !safeCompare(reqApiKey, otaApiKey))) {
      return res.status(401).json({ success: false, message: 'API key không hợp lệ hoặc thiếu (x-api-key).' });
    }
  }

  const { errors, booking } = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors, message: errors.join(' ') });
  const record = {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    status: 'pending',
    paymentStatus: 'UNPAID',
    ...booking
  };

  try {
    const list = readBookingsSafe();
    list.push(record);
    writeBookingsSafe(list);
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
  const rawContact = typeof req.query.contact === 'string' ? req.query.contact.trim() : '';
  const contact = rawContact.toLowerCase();

  if (!id || !contact) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp cả Mã đặt phòng (id) và Số điện thoại/Email (contact) để xác thực.'
    });
  }

  const isEmail = contact.includes('@');
  const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
  const targetPhone = cleanPhone(contact);

  // Bảo mật: Yêu cầu số điện thoại tra cứu phải có tối thiểu 8 chữ số để tránh brute-force 1-2 chữ số
  if (!isEmail && targetPhone.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Số điện thoại tra cứu phải có ít nhất 8 chữ số để đảm bảo tính bảo mật.'
    });
  }

  const list = readBookingsSafe();

  const found = list.find((b) => {
    if (!b || String(b.id).toLowerCase() !== id.toLowerCase()) return false;
    if (isEmail) {
      const bEmailClean = (b.email || '').trim().toLowerCase();
      return bEmailClean === contact;
    } else {
      const bPhoneClean = cleanPhone(b.phone);
      if (!bPhoneClean) return false;
      return bPhoneClean === targetPhone || bPhoneClean.endsWith(targetPhone) || targetPhone.endsWith(bPhoneClean);
    }
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
      paymentStatus: found.paymentStatus || 'UNPAID',
      smartLockPin: found.smartLockPin || null,
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

module.exports = { app, validateBooking, getRoomsData };
