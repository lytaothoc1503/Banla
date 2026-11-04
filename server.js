const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const {
  hashPassword,
  verifyPassword,
  safeTimingCompare,
  generateExpiringToken,
  verifyExpiringToken,
  getSecureCookieDirectives,
  maskPhoneNumber,
  maskEmailAddress,
  validateUploadPayload
} = require('./utils/security');

const { logger, sanitizeClientError } = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// SECURITY CHECKLIST (QUY TRÌNH BẢO MẬT 7 BƯỚC — 19 TIÊU CHUẨN VÀNG)
// ============================================================================

// BƯỚC 4: Khóa phía trình duyệt & Headers bảo mật (Rules 12, 13)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  xFrameOptions: { action: 'sameorigin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Rule 12: Bắt buộc chuyển hướng HTTPS trong môi trường Production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// BƯỚC 1: Rate limit chung chống DDoS / abuse (Rule 02)
const isTestEnv = process.env.NODE_ENV === 'test';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }
});
app.use(limiter);

// Rule 02: Rate limit nghiêm ngặt cho đăng nhập Admin
const adminLoginLimiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Quá nhiều lần đăng nhập quản trị thất bại. Vui lòng thử lại sau 15 phút.' }
});

// BƯỚC 5: Rule 15 — CORS chỉ cho phép domain cần thiết (whitelist)
app.use((req, res, next) => {
  const allowed = process.env.OTA_ALLOWED_ORIGINS || '*';
  const origins = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader('Vary', 'Origin');
    if (origins.includes('*') || origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-key, x-admin-token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else if (origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-key, x-admin-token');
    return res.status(204).end();
  }
  next();
});

// Stricter limit for booking API
const bookingLimiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Bạn đã gửi quá nhiều yêu cầu đặt phòng. Vui lòng thử lại sau.' }
});

// BƯỚC 3: Rule 10 — Rate limit tra cứu đơn chống quét brute-force IDOR
const lookupLimiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { success: false, message: 'Bạn đã thực hiện quá nhiều lượt tra cứu. Vui lòng thử lại sau.' }
});

// BƯỚC 3: Rules 07 & 08 — Giới hạn dung lượng tải lên (10KB JSON max)
app.use(express.json({ limit: '10kb' }));

// BƯỚC 2: Rule 05 & 08 — Chặn truy cập file mã nguồn và nội bộ nhạy cảm
app.use((req, res, next) => (
  /^\/(data|node_modules|test|docs|scripts|utils|banla_payment_module\/(backend|database)|\.)|^\/(server\.js|package(-lock)?\.json|skills-lock\.json|supabase_schema\.sql|skill\.md)$/i.test(req.path)
    ? res.status(404).end()
    : next()
));

app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// BƯỚC 7: Rule 19 — Endpoint kiểm tra sức khỏe hệ thống (Health Check)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'banla-boutique-hotel'
  });
});

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
    logger.error('Lỗi đọc dữ liệu an toàn:', err);
  }
  return [];
}

function writeBookingsSafe(list) {
  fs.mkdirSync(path.dirname(BOOKINGS_FILE), { recursive: true });
  const tmpFile = `${BOOKINGS_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmpFile, BOOKINGS_FILE);
}

// BƯỚC 3: Rule 09 — Validate nghiêm ngặt toàn bộ dữ liệu User gửi lên ở Server
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

  // BƯỚC 1: Rule 01 & 04 — So sánh an toàn thời gian (timing-safe)
  if (otaApiKey) {
    const isOta = rawSource === 'ota' || Boolean(reqApiKey);
    if (isOta && (!reqApiKey || !safeTimingCompare(reqApiKey, otaApiKey))) {
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
    logger.error('Lưu booking lỗi', err);
    return res.status(500).json({ success: false, message: 'Có lỗi khi lưu yêu cầu. Vui lòng gọi điện/Zalo cho Banla.' });
  }

  maybeSendEmail(record).catch((err) => logger.error('Gửi email lỗi', err));
  res.json({ success: true, id: record.id, message: 'Đã nhận yêu cầu. Banla sẽ liên hệ sớm.' });
});

// BƯỚC 3: Rule 10 — Tự thử nghiệm & Chống lộ lọt dữ liệu IDOR qua tra cứu đơn
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

  // Bảo mật: Chống brute-force IDOR bằng cách yêu cầu số điện thoại >= 8 chữ số
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
      phoneMasked: maskPhoneNumber(found.phone),
      emailMasked: maskEmailAddress(found.email)
    }
  });
});

// API: Chi tiết đặt phòng đầy đủ (cho trang Phiếu xác nhận phieu.html)
app.get('/api/booking/detail', lookupLimiter, (req, res) => {
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const id = rawId.replace(/^#+/, '').trim();
  const rawContact = typeof req.query.contact === 'string' ? req.query.contact.trim() : '';
  const contact = rawContact.toLowerCase();
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  const adminToken = req.headers['x-admin-token'];

  const isKeyValid = adminKey && ADMIN_CONFIGURED && safeTimingCompare(String(adminKey), ADMIN_SECRET_KEY);
  const isTokenValid = adminToken && verifyExpiringToken(adminToken, ADMIN_SESSION_SECRET).valid;
  const isAdmin = isKeyValid || isTokenValid;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đặt phòng (id).' });
  }

  const list = readBookingsSafe();
  const found = list.find((b) => b && String(b.id).toLowerCase() === id.toLowerCase());

  if (!found) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin đặt phòng.' });
  }

  // Nếu không phải admin, yêu cầu xác thực contact hoặc che giấu PII
  if (!isAdmin) {
    if (contact) {
      const isEmail = contact.includes('@');
      const cleanPhone = (p) => (p || '').replace(/[^0-9]/g, '');
      const targetPhone = cleanPhone(contact);
      let match = false;
      if (isEmail) {
        match = (found.email || '').trim().toLowerCase() === contact;
      } else if (targetPhone.length >= 8) {
        const bPhoneClean = cleanPhone(found.phone);
        match = bPhoneClean === targetPhone || bPhoneClean.endsWith(targetPhone) || targetPhone.endsWith(bPhoneClean);
      }
      if (!match) {
        return res.status(403).json({ success: false, message: 'Thông tin xác thực số điện thoại/email không khớp.' });
      }
    }
  }

  res.json({
    success: true,
    booking: {
      id: found.id,
      name: found.name,
      phone: !isAdmin ? maskPhoneNumber(found.phone) : (found.phone || ''),
      email: !isAdmin ? maskEmailAddress(found.email) : (found.email || ''),
      room: found.room || 'Banla Deluxe Room',
      checkin: found.checkin,
      checkout: found.checkout,
      guests: found.guests || 2,
      status: found.status || 'pending',
      paymentStatus: found.paymentStatus || 'UNPAID',
      totalPrice: Number(found.totalPrice) || 1200000,
      paidAmount: Number(found.paidAmount) || (found.paymentStatus === 'PAID' ? (Number(found.totalPrice) || 1200000) : 0),
      smartLockPin: found.smartLockPin || null,
      createdAt: found.createdAt,
      source: found.source || 'direct',
      message: found.message || ''
    }
  });
});

// ==========================================
// ADMIN DASHBOARD & RECONCILIATION APIS
// ==========================================
// Không còn mã mặc định: ADMIN_KEY bắt buộc đặt trong .env (tối thiểu 12 ký tự).
// Nếu thiếu, mọi API quản trị trả 503 thay vì chấp nhận một mã công khai trong mã nguồn.
const ADMIN_SECRET_KEY = (process.env.ADMIN_KEY || '').trim();
const ADMIN_CONFIGURED = ADMIN_SECRET_KEY.length >= 12;
const ADMIN_SESSION_SECRET = (process.env.ADMIN_SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');
if (!ADMIN_CONFIGURED) {
  logger.warn('ADMIN_KEY chưa được cấu hình (hoặc ngắn hơn 12 ký tự) — API quản trị bị khóa.');
}

function adminNotConfigured(res) {
  return res.status(503).json({
    success: false,
    message: 'Trang quản trị chưa được cấu hình trên máy chủ.'
  });
}

function requireAdminAuth(req, res, next) {
  if (!ADMIN_CONFIGURED) return adminNotConfigured(res);
  const reqKey = req.headers['x-admin-key'] || req.query.key || (req.body && req.body.key);
  const reqToken = req.headers['x-admin-token'];

  const isKeyValid = reqKey && safeTimingCompare(String(reqKey), ADMIN_SECRET_KEY);
  const isTokenValid = reqToken && verifyExpiringToken(reqToken, ADMIN_SESSION_SECRET).valid;

  if (!isKeyValid && !isTokenValid) {
    return res.status(401).json({
      success: false,
      message: 'Mã xác thực quản trị (Admin Key) không hợp lệ hoặc phiên đã hết hạn.'
    });
  }
  next();
}

// BƯỚC 1: Rules 01, 02, 03 & BƯỚC 4: Rule 14 — Kiểm tra mã khóa đăng nhập Admin & Cấp Session Token 8h
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!ADMIN_CONFIGURED) return adminNotConfigured(res);
  const { key } = req.body || {};
  if (key && verifyPassword(String(key).trim(), ADMIN_SECRET_KEY)) {
    const sessionToken = generateExpiringToken('admin', ADMIN_SESSION_SECRET, 8);

    // Rule 14: Cookie HttpOnly + Secure + SameSite=Strict
    res.cookie('banla_admin_session', sessionToken, getSecureCookieDirectives(8 * 3600 * 1000));

    return res.json({
      success: true,
      message: 'Đăng nhập trang quản trị Banla thành công!',
      token: sessionToken,
      expiresIn: 8 * 3600
    });
  }
  return res.status(401).json({ success: false, message: 'Mã PIN quản trị không chính xác.' });
});

// BƯỚC 1: Rule 03 — Thu hồi phiên và đăng xuất Admin
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('banla_admin_session', { path: '/' });
  res.json({ success: true, message: 'Đã đăng xuất phiên quản trị an toàn.' });
});

// Helper: tính toán chuẩn hóa tài chính cho 1 đơn
function normalizeFinancials(b) {
  const totalPrice = Number(b.totalPrice) || 1500000;
  let paidAmount = Number(b.paidAmount) || 0;
  if (b.paymentStatus === 'PAID' && paidAmount === 0) {
    paidAmount = totalPrice;
  } else if (b.paymentStatus === 'DEPOSIT_PAID' && paidAmount === 0) {
    paidAmount = Math.round(totalPrice * 0.3); // mặc định cọc 30%
  }
  const feeRate = 0.015; // 1.5% phí cổng thanh toán / gateway fee
  const gatewayFee = Math.round(paidAmount * feeRate);
  const netAmount = Math.max(0, paidAmount - gatewayFee);

  return {
    ...b,
    totalPrice,
    paidAmount,
    gatewayFee,
    netAmount
  };
}

// 2. Lấy danh sách toàn bộ đơn đặt phòng (Real-time)
app.get('/api/admin/bookings', requireAdminAuth, (req, res) => {
  try {
    const list = readBookingsSafe();
    const normalized = list.map(normalizeFinancials);
    normalized.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ success: true, bookings: normalized });
  } catch (err) {
    logger.error('Admin lỗi lấy danh sách', err);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách đơn đặt phòng.' });
  }
});

// 3. Thống kê đối soát tài chính (Gross vs Net, Tổng đơn)
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  try {
    const list = readBookingsSafe().map(normalizeFinancials);
    const total = list.length;
    const pending = list.filter((b) => b.status === 'pending').length;
    const confirmed = list.filter((b) => b.status === 'confirmed').length;
    const completed = list.filter((b) => b.status === 'completed').length;
    const cancelled = list.filter((b) => b.status === 'cancelled').length;

    let grossRevenue = 0;
    let totalGatewayFee = 0;
    let netRevenue = 0;
    let activePinsCount = 0;

    list.forEach((b) => {
      if (b.status !== 'cancelled') {
        grossRevenue += b.paidAmount || 0;
        totalGatewayFee += b.gatewayFee || 0;
        netRevenue += b.netAmount || 0;
      }
      if (b.smartLockPin) {
        activePinsCount++;
      }
    });

    res.json({
      success: true,
      stats: {
        total,
        pending,
        confirmed,
        completed,
        cancelled,
        grossRevenue,
        gatewayFee: totalGatewayFee,
        netRevenue,
        activeSmartLocks: activePinsCount
      }
    });
  } catch (err) {
    logger.error('Admin lỗi thống kê', err);
    res.status(500).json({ success: false, message: 'Lỗi tính toán số liệu thống kê.' });
  }
});

// 4. Cập nhật thông tin đơn & trạng thái thanh toán
app.post('/api/admin/booking/update', requireAdminAuth, (req, res) => {
  const { id, status, paymentStatus, paidAmount, totalPrice, room, message } = req.body || {};
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn đặt phòng.' });

  try {
    const list = readBookingsSafe();
    const idx = list.findIndex((b) => b && String(b.id).toLowerCase() === String(id).toLowerCase());
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt phòng.' });
    }

    if (status !== undefined) list[idx].status = status;
    if (paymentStatus !== undefined) list[idx].paymentStatus = paymentStatus;
    if (paidAmount !== undefined) list[idx].paidAmount = Number(paidAmount);
    if (totalPrice !== undefined) list[idx].totalPrice = Number(totalPrice);
    if (room !== undefined) list[idx].room = room;
    if (message !== undefined) list[idx].message = message;

    list[idx] = normalizeFinancials(list[idx]);
    writeBookingsSafe(list);

    res.json({ success: true, message: 'Cập nhật đơn thành công!', booking: list[idx] });
  } catch (err) {
    logger.error('Admin lỗi cập nhật đơn', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật đơn.' });
  }
});

// 5. Cấp lại hoặc đổi mã PIN Smart-Lock cho khách
app.post('/api/admin/booking/smartlock', requireAdminAuth, (req, res) => {
  const { id, customPin } = req.body || {};
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn đặt phòng.' });

  try {
    const list = readBookingsSafe();
    const idx = list.findIndex((b) => b && String(b.id).toLowerCase() === String(id).toLowerCase());
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt phòng.' });
    }

    // Sinh mã PIN dạng *xxxx# hoặc lấy mã custom nếu hợp lệ
    let pin = '';
    if (customPin && /^\*?[0-9]{4,6}#?$/.test(customPin.trim())) {
      pin = customPin.trim();
      if (!pin.startsWith('*')) pin = '*' + pin;
      if (!pin.endsWith('#')) pin = pin + '#';
    } else {
      const random4 = Math.floor(1000 + Math.random() * 9000);
      pin = `*${random4}#`;
    }

    list[idx].smartLockPin = pin;
    if (list[idx].status === 'pending') {
      list[idx].status = 'confirmed';
    }
    list[idx] = normalizeFinancials(list[idx]);
    writeBookingsSafe(list);

    res.json({
      success: true,
      message: `Đã cấp mã Smart-Lock PIN ${pin} thành công cho đơn #${id}`,
      pin,
      booking: list[idx]
    });
  } catch (err) {
    logger.error('Admin lỗi cấp PIN Smart-lock', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cấp mã PIN Smart-Lock.' });
  }
});

// Banla Priority Payment Module Router
const banlaPaymentRouter = require('./banla_payment_module/backend/banla_payment_router');
app.use('/api/banla', banlaPaymentRouter);

// BƯỚC 2: Rule 06 — Bắt lỗi 404 cho tài nguyên không tồn tại
app.use((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(404).end();
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// BƯỚC 2: Rule 06 — Trình bắt lỗi hệ thống toàn cục không để lộ stack trace ra ngoài
app.use((err, req, res, next) => {
  res.status(err.status || 500).json(sanitizeClientError(err, 'Yêu cầu không hợp lệ hoặc đã xảy ra lỗi xử lý trên máy chủ.'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Banla server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, validateBooking, getRoomsData };
