require('./utils/env').loadEnvFiles();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const {
  verifyPassword,
  safeTimingCompare,
  generateExpiringToken,
  verifyExpiringToken,
  getSecureCookieDirectives,
  maskPhoneNumber,
  maskEmailAddress
} = require('./utils/security');

const { logger, sanitizeClientError } = require('./utils/logger');
const {
  resolveRoom,
  normalizePaymentOption,
  normalizePaymentMethod
} = require('./shared/constants/rooms');
const bookingRepository = require('./backend/repositories/booking.repository');
const { findForbiddenCardField } = require('./backend/modules/payments/visa.validator');
const { createVisaPaymentRouter } = require('./backend/modules/payments/visa.routes');

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
const limiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
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
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-key, x-admin-token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else if (origins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-admin-key, x-admin-token');
    return res.status(204).end();
  }
  next();
});

const bookingLimiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Bạn đã gửi quá nhiều yêu cầu đặt phòng. Vui lòng thử lại sau.' }
});

// BƯỚC 3: Rule 10 — Rate limit tra cứu đơn chống quét brute-force IDOR
const lookupLimiter = isTestEnv ? (req, res, next) => next() : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Bạn đã thực hiện quá nhiều lượt tra cứu. Vui lòng thử lại sau.' }
});

// BƯỚC 3: Rules 07 & 08 — Giới hạn dung lượng tải lên (10KB JSON max)
app.use(express.json({ limit: '10kb' }));

// BƯỚC 2: Rule 05 & 08 — Chặn truy cập file mã nguồn và nội bộ nhạy cảm
app.use((req, res, next) => (
  /^\/(data|node_modules|test|docs|scripts|utils|backend|skills|shared|preview|backup|supabase|banla_payment_module\/(backend|database|data)|\.)|^\/(server\.js|package(-lock)?\.json|skills-lock\.json|supabase_schema\.sql|skill\.md)$/i.test(req.path)
    ? res.status(404).end()
    : next()
));

app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// BƯỚC 7: Rule 19 — Endpoint kiểm tra sức khỏe hệ thống & chế độ CSDL thực tế
app.get('/api/health', (req, res) => {
  const storage = bookingRepository.getStorageInfo();
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'banla-boutique-hotel',
    storageMode: storage.mode,
    supabaseConfigured: storage.supabaseConfigured
  });
});

// In-memory cache cho rooms.json
let roomsCache = null;
function getRoomsData() {
  if (!roomsCache) {
    roomsCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'rooms.json'), 'utf8'));
  }
  return roomsCache;
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// API: Danh sách 7 hạng phòng niêm yết
app.get('/api/rooms', (req, res) => {
  res.json(getRoomsData());
});

// API: Kiểm tra phòng trống & tính giá thực tế theo khoảng ngày
app.get('/api/rooms/availability', async (req, res) => {
  try {
    const checkin = typeof req.query.check_in === 'string' ? req.query.check_in.trim() : '';
    const checkout = typeof req.query.check_out === 'string' ? req.query.check_out.trim() : '';
    const guests = Math.max(1, Math.min(20, Math.trunc(Number(req.query.guests) || 1)));

    if ((checkin || checkout) && (!isDate(checkin) || !isDate(checkout) || checkout <= checkin)) {
      return res.status(400).json({
        success: false,
        message: 'Ngày nhận phòng (check_in) và trả phòng (check_out) không hợp lệ.'
      });
    }

    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const rooms = await bookingRepository.listRoomsWithAvailability({
      checkin,
      checkout,
      guests,
      roomsList
    });

    res.json({
      success: true,
      check_in: checkin || null,
      check_out: checkout || null,
      guests,
      rooms
    });
  } catch (err) {
    logger.error('Lỗi kiểm tra phòng trống:', err);
    res.status(500).json({ success: false, message: 'Không thể kiểm tra tình trạng phòng lúc này.' });
  }
});

// BƯỚC 3: Rule 09 — Validate nghiêm ngặt toàn bộ dữ liệu User gửi lên ở Server
function validateBooking(b) {
  const errors = [];
  const body = (b && typeof b === 'object') ? b : {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(body.name || body.guest_name).replace(/[\r\n]+/g, ' ');
  const email = str(body.email || body.guest_email);
  const phone = str(body.phone || body.guest_phone);
  const checkin = str(body.checkin || body.check_in);
  const checkout = str(body.checkout || body.check_out);

  if (name.length < 2 || name.length > 100) errors.push('Vui lòng nhập họ tên hợp lệ.');
  if (!phone && !email) errors.push('Vui lòng nhập số điện thoại hoặc email.');
  if (phone && !/^[+0-9 ().-]{8,20}$/.test(phone)) errors.push('Số điện thoại không hợp lệ.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email không hợp lệ.');
  if (checkin || checkout) {
    if (!isDate(checkin) || !isDate(checkout)) errors.push('Ngày nhận/trả phòng không hợp lệ.');
    else if (checkout <= checkin) errors.push('Ngày trả phòng phải sau ngày nhận phòng.');
  }
  if (body.room !== undefined && (typeof body.room !== 'string' || body.room.length > 100)) {
    errors.push('Loại phòng không hợp lệ.');
  }

  let guests = null;
  if (body.guests !== undefined && body.guests !== '') {
    guests = Number(body.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
      errors.push('Số khách phải từ 1 đến 20.');
    }
  }

  // Validate source (direct / ota / admin)
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
      checkin,
      checkout,
      room: str(body.room || body.room_id),
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
    subject: `Yêu cầu đặt phòng mới: ${booking.name.replace(/[\r\n]+/g, ' ')}`,
    text: JSON.stringify(booking, null, 2)
  });
  return true;
}

// API: Tạo đơn đặt phòng thực tế (giá tính 100% phía Server, chống đặt trùng phòng D10)
app.post('/api/booking', bookingLimiter, async (req, res) => {
  const forbiddenCardField = findForbiddenCardField(req.body);
  if (forbiddenCardField) {
    return res.status(400).json({
      success: false,
      error_code: 'FORBIDDEN_CARD_DATA',
      errors: [`Hệ thống không nhận trường dữ liệu thẻ (${forbiddenCardField}).`],
      message: `Banla không thu thập hoặc lưu trữ thông tin thẻ (${forbiddenCardField}).`
    });
  }

  const otaApiKey = process.env.OTA_API_KEY;
  const reqApiKey = req.headers['x-api-key'];
  const rawSource = typeof req.body?.source === 'string' ? req.body.source.trim().toLowerCase() : '';

  if (otaApiKey) {
    const isOta = rawSource === 'ota' || Boolean(reqApiKey);
    if (isOta && (!reqApiKey || !safeTimingCompare(reqApiKey, otaApiKey))) {
      return res.status(401).json({ success: false, message: 'API key không hợp lệ hoặc thiếu (x-api-key).' });
    }
  }

  const { errors, booking } = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ success: false, errors, message: errors.join(' ') });

  const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
  const rawPaymentOption = req.body?.paymentOption || req.body?.payment_option || req.body?.payment_plan || 'deposit_50';
  const rawPaymentMethod = req.body?.paymentMethod || req.body?.payment_method || 'vietqr';

  let record;
  try {
    record = await bookingRepository.createBooking(
      {
        ...booking,
        paymentOption: normalizePaymentOption(rawPaymentOption),
        paymentMethod: normalizePaymentMethod(rawPaymentMethod)
      },
      { roomsList }
    );
  } catch (err) {
    if (err && (err.status === 400 || err.status === 409)) {
      return res.status(err.status).json({
        success: false,
        error_code: err.code || 'BOOKING_CONFLICT',
        errors: [err.message],
        message: err.message
      });
    }
    logger.error('Lưu booking lỗi', err);
    return res.status(500).json({
      success: false,
      message: 'Có lỗi khi lưu yêu cầu. Vui lòng gọi điện/Zalo cho Banla.'
    });
  }

  maybeSendEmail(record).catch((err) => logger.error('Gửi email lỗi', err));
  res.json({
    success: true,
    id: record.id,
    booking_code: record.bookingCode,
    room: record.room,
    room_code: record.roomCode,
    nights: record.nights,
    payment_method: record.paymentMethod,
    payment_option: record.paymentOption,
    total_amount: record.totalPrice,
    discount_amount: record.discountAmount,
    amount_due: record.depositAmount,
    remaining_amount: record.remainingAmount,
    hold_expires_at: record.holdExpiresAt,
    message: 'Đã khởi tạo đơn đặt phòng thành công.'
  });
});

function verifyBookingContactMatch(booking, rawContact) {
  const contact = String(rawContact || '').trim().toLowerCase();
  if (!booking || !contact) return { provided: false, validFormat: false, matched: false };

  const isEmail = contact.includes('@');
  if (isEmail) {
    const bEmailClean = String(booking.email || '').trim().toLowerCase();
    return {
      provided: true,
      validFormat: true,
      matched: Boolean(bEmailClean && bEmailClean === contact)
    };
  }

  const cleanPhone = (p) => String(p || '').replace(/[^0-9]/g, '');
  const targetPhone = cleanPhone(contact);
  if (targetPhone.length < 8) {
    return { provided: true, validFormat: false, matched: false };
  }
  const bPhoneClean = cleanPhone(booking.phone);
  const matched = Boolean(
    bPhoneClean &&
      (bPhoneClean === targetPhone ||
        bPhoneClean.endsWith(targetPhone) ||
        targetPhone.endsWith(bPhoneClean))
  );
  return { provided: true, validFormat: true, matched };
}

// BƯỚC 3: Rule 10 — Tra cứu đơn có xác thực Mã Đơn + SĐT/Email chống IDOR
app.get('/api/booking/lookup', lookupLimiter, async (req, res) => {
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const id = bookingRepository.cleanBookingCode(rawId);
  const rawContact = typeof req.query.contact === 'string' ? req.query.contact.trim() : '';

  if (!id || !rawContact) {
    return res.status(400).json({
      success: false,
      message: 'Vui lòng cung cấp cả Mã đặt phòng (id) và Số điện thoại/Email (contact) để xác thực.'
    });
  }

  const isEmail = rawContact.includes('@');
  const targetPhone = rawContact.replace(/[^0-9]/g, '');
  if (!isEmail && targetPhone.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Số điện thoại tra cứu phải có ít nhất 8 chữ số để đảm bảo tính bảo mật.'
    });
  }

  const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
  const found = await bookingRepository.findBookingByCode(id, { roomsList });
  const check = verifyBookingContactMatch(found, rawContact);

  if (!found || !check.matched) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy thông tin đặt phòng khớp với mã và thông tin liên hệ cung cấp.'
    });
  }

  const isPaidAndApproved =
    (found.paymentStatus === 'PAID' || found.paymentStatus === 'DEPOSIT_PAID') &&
    (found.status === 'confirmed' || found.status === 'completed');

  res.json({
    success: true,
    booking: {
      id: found.id,
      bookingCode: found.bookingCode,
      name: found.name,
      room: found.room,
      checkin: found.checkin,
      checkout: found.checkout,
      nights: found.nights,
      guests: found.guests,
      status: found.status || 'pending',
      paymentStatus: found.paymentStatus || 'UNPAID',
      paymentOption: found.paymentOption,
      paymentMethod: found.paymentMethod,
      totalPrice: found.totalPrice,
      discountAmount: found.discountAmount,
      depositAmount: found.depositAmount,
      paidAmount: found.paidAmount,
      remainingAmount: found.remainingAmount,
      smartLockPin: isPaidAndApproved ? (found.smartLockPin || null) : null,
      createdAt: found.createdAt,
      source: found.source || 'direct',
      phoneMasked: maskPhoneNumber(found.phone),
      emailMasked: maskEmailAddress(found.email)
    }
  });
});

// ==========================================
// ADMIN DASHBOARD & RECONCILIATION AUTH
// ==========================================
const ADMIN_SECRET_KEY = (process.env.ADMIN_KEY || '').trim();
const ADMIN_CONFIGURED = ADMIN_SECRET_KEY.length >= 12;
const ADMIN_SESSION_SECRET =
  (process.env.ADMIN_SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

if (!ADMIN_CONFIGURED) {
  logger.warn('ADMIN_KEY chưa được cấu hình (hoặc ngắn hơn 12 ký tự) — API quản trị bị khóa.');
}

function readCookieValue(req, cookieName) {
  const header = req.headers && req.headers.cookie;
  if (!header || typeof header !== 'string') return '';
  const parts = header.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === cookieName) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return '';
}

function isRequestAdminAuthenticated(req) {
  if (!ADMIN_CONFIGURED) return false;
  const reqKey = req.headers['x-admin-key'] || req.query.key || (req.body && req.body.key);
  const reqToken = req.headers['x-admin-token'] || readCookieValue(req, 'banla_admin_session');

  const isKeyValid = Boolean(reqKey && safeTimingCompare(String(reqKey), ADMIN_SECRET_KEY));
  const isTokenValid = Boolean(reqToken && verifyExpiringToken(String(reqToken), ADMIN_SESSION_SECRET).valid);
  return isKeyValid || isTokenValid;
}

function adminNotConfigured(res) {
  return res.status(503).json({
    success: false,
    message: 'Trang quản trị chưa được cấu hình trên máy chủ.'
  });
}

function requireAdminAuth(req, res, next) {
  if (!ADMIN_CONFIGURED) return adminNotConfigured(res);
  if (!isRequestAdminAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      message: 'Mã xác thực quản trị (Admin Key) không hợp lệ hoặc phiên đã hết hạn.'
    });
  }
  next();
}

// API: Chi tiết đặt phòng cho trang Phiếu xác nhận (`phieu.html`) & Polling trạng thái
// Khắc phục lỗ hổng lộ Smart-Lock PIN khi không có `contact` hoặc quyền Admin!
app.get('/api/booking/detail', lookupLimiter, async (req, res) => {
  const rawId = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const id = bookingRepository.cleanBookingCode(rawId);
  const rawContact = typeof req.query.contact === 'string' ? req.query.contact.trim() : '';
  const isAdmin = isRequestAdminAuthenticated(req);

  if (!id) {
    return res.status(400).json({ success: false, message: 'Thiếu mã đặt phòng (id).' });
  }

  const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
  const found = await bookingRepository.findBookingByCode(id, { roomsList });

  if (!found) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin đặt phòng.' });
  }

  let isContactVerified = false;
  if (!isAdmin && rawContact) {
    const check = verifyBookingContactMatch(found, rawContact);
    if (!check.matched) {
      return res.status(403).json({
        success: false,
        message: 'Thông tin xác thực số điện thoại hoặc email không khớp với đơn đặt phòng.'
      });
    }
    isContactVerified = true;
  }

  const canRevealPin = Boolean(isAdmin || isContactVerified);
  const hasIssuedPin = Boolean(found.smartLockPin);

  res.json({
    success: true,
    booking: {
      id: found.id,
      bookingCode: found.bookingCode,
      name: found.name,
      phone: !canRevealPin ? maskPhoneNumber(found.phone) : (found.phone || ''),
      email: !canRevealPin ? maskEmailAddress(found.email) : (found.email || ''),
      room: found.room,
      roomCode: found.roomCode,
      checkin: found.checkin,
      checkout: found.checkout,
      nights: found.nights,
      guests: found.guests || 2,
      status: found.status || 'pending',
      paymentStatus: found.paymentStatus || 'UNPAID',
      paymentOption: found.paymentOption || 'deposit_50',
      paymentMethod: found.paymentMethod || 'vietqr',
      unitPrice: found.unitPrice,
      totalPrice: found.totalPrice,
      discountAmount: found.discountAmount,
      depositAmount: found.depositAmount,
      remainingAmount: found.remainingAmount,
      paidAmount: found.paidAmount,
      smartLockPin: canRevealPin ? (found.smartLockPin || null) : null,
      pinProtected: Boolean(hasIssuedPin && !canRevealPin),
      createdAt: found.createdAt,
      paidAt: found.paidAt || null,
      source: found.source || 'direct',
      message: canRevealPin ? (found.message || '') : ''
    }
  });
});

// Đăng nhập Admin & cấp Session Cookie HttpOnly 8 giờ
app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  if (!ADMIN_CONFIGURED) return adminNotConfigured(res);
  const { key } = req.body || {};
  if (key && verifyPassword(String(key).trim(), ADMIN_SECRET_KEY)) {
    const sessionToken = generateExpiringToken('admin', ADMIN_SESSION_SECRET, 8);
    res.cookie('banla_admin_session', sessionToken, getSecureCookieDirectives(8 * 3600 * 1000));

    return res.json({
      success: true,
      message: 'Đăng nhập trang quản trị Banla thành công!',
      token: sessionToken,
      expiresIn: 8 * 3600,
      storage: bookingRepository.getStorageInfo()
    });
  }
  return res.status(401).json({ success: false, message: 'Mã PIN quản trị không chính xác.' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('banla_admin_session', { path: '/' });
  res.json({ success: true, message: 'Đã đăng xuất phiên quản trị an toàn.' });
});

// Lấy danh sách toàn bộ đơn đặt phòng thực tế
app.get('/api/admin/bookings', requireAdminAuth, async (req, res) => {
  try {
    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const list = await bookingRepository.listBookings({ roomsList });
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const storage = bookingRepository.getStorageInfo();

    res.json({
      success: true,
      storageMode: storage.mode,
      supabaseConfigured: storage.supabaseConfigured,
      bookings: list
    });
  } catch (err) {
    logger.error('Admin lỗi lấy danh sách', err);
    res.status(500).json({ success: false, message: 'Không thể tải danh sách đơn đặt phòng.' });
  }
});

// Thống kê đối soát tài chính thực tế (Gross vs Net, Tổng đơn)
app.get('/api/admin/stats', requireAdminAuth, async (req, res) => {
  try {
    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const list = await bookingRepository.listBookings({ roomsList });
    const storage = bookingRepository.getStorageInfo();

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
      if (b.status !== 'cancelled' && b.paymentStatus !== 'REFUNDED') {
        grossRevenue += b.paidAmount || 0;
        totalGatewayFee += b.gatewayFee || 0;
        netRevenue += b.netAmount || 0;
      }
      if (b.smartLockPin && b.status !== 'cancelled') {
        activePinsCount++;
      }
    });

    res.json({
      success: true,
      storageMode: storage.mode,
      supabaseConfigured: storage.supabaseConfigured,
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

// Tạo đơn đặt phòng mới từ trang Quản trị Lễ tân (khách gọi điện / Fanpage / walk-in)
app.post('/api/admin/booking/create', requireAdminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { errors, booking } = validateBooking({
      name: body.name || body.guest_name,
      phone: body.phone || body.guest_phone,
      email: body.email || body.guest_email,
      checkin: body.checkin || body.check_in,
      checkout: body.checkout || body.check_out,
      room: body.room || body.room_id,
      guests: body.guests,
      source: 'direct',
      message: body.message || body.note
    });
    if (errors.length) {
      return res.status(400).json({ success: false, errors, message: errors.join(' ') });
    }

    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const rawPayStatus = String(body.paymentStatus || body.payment_status || 'UNPAID').toUpperCase();
    const paymentStatus = rawPayStatus === 'PAID' || rawPayStatus === 'PENDING'
      ? (rawPayStatus === 'PAID' ? 'PAID' : 'UNPAID')
      : rawPayStatus;
    const status = String(body.status || body.booking_status || 'pending').toLowerCase();

    let smartLockPin = null;
    const rawPin = String(body.smartLockPin || body.smartlock_pin || '').replace(/[^0-9]/g, '');
    if (rawPin.length === 6) {
      smartLockPin = rawPin;
    } else if (status === 'confirmed' && paymentStatus === 'PAID') {
      smartLockPin = String(crypto.randomInt(100000, 1000000));
    }

    const created = await bookingRepository.createBooking(
      {
        ...booking,
        bookingCode: body.bookingCode || body.booking_code,
        source: 'admin',
        paymentOption: normalizePaymentOption(body.paymentOption || body.payment_option),
        paymentMethod: normalizePaymentMethod(body.paymentMethod || body.payment_method),
        totalPrice: body.totalPrice ?? body.total_amount,
        paidAmount: body.paidAmount ?? body.paid_amount ?? 0,
        paymentStatus,
        status,
        smartLockPin,
        approvedBy: status === 'confirmed' ? 'admin' : null
      },
      { roomsList, skipAvailabilityCheck: Boolean(body.forceOverride) }
    );

    res.status(201).json({
      success: true,
      message: `Đã tạo đơn đặt phòng #${created.bookingCode} thành công!`,
      booking: created
    });
  } catch (err) {
    if (err && (err.status === 400 || err.status === 409)) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    logger.error('Admin lỗi tạo đơn mới', err);
    res.status(500).json({ success: false, message: 'Không thể tạo đơn đặt phòng mới.' });
  }
});

// Cập nhật thông tin đơn & trạng thái thanh toán từ Admin
app.post('/api/admin/booking/update', requireAdminAuth, async (req, res) => {
  const body = req.body || {};
  const id = body.id || body.booking_code || body.bookingCode;
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn đặt phòng.' });

  try {
    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const patch = {};

    if (body.name !== undefined || body.guest_name !== undefined) patch.name = body.name ?? body.guest_name;
    if (body.phone !== undefined || body.guest_phone !== undefined) patch.phone = body.phone ?? body.guest_phone;
    if (body.email !== undefined || body.guest_email !== undefined) patch.email = body.email ?? body.guest_email;
    if (body.room !== undefined || body.room_id !== undefined) patch.room = body.room ?? body.room_id;
    if (body.guests !== undefined) patch.guests = body.guests;
    if (body.checkin !== undefined || body.check_in !== undefined) patch.checkin = body.checkin ?? body.check_in;
    if (body.checkout !== undefined || body.check_out !== undefined) patch.checkout = body.checkout ?? body.check_out;
    if (body.paymentOption !== undefined || body.payment_option !== undefined) {
      patch.paymentOption = body.paymentOption ?? body.payment_option;
    }
    if (body.status !== undefined || body.booking_status !== undefined) {
      patch.status = body.status ?? body.booking_status;
    }
    if (body.paymentStatus !== undefined || body.payment_status !== undefined) {
      const ps = String(body.paymentStatus ?? body.payment_status).toUpperCase();
      patch.paymentStatus = ps === 'PENDING' ? 'UNPAID' : ps;
    }
    if (body.paidAmount !== undefined || body.paid_amount !== undefined) {
      patch.paidAmount = Number(body.paidAmount ?? body.paid_amount);
    }
    if (body.totalPrice !== undefined || body.total_amount !== undefined) {
      patch.totalPrice = Number(body.totalPrice ?? body.total_amount);
    }
    if (body.smartLockPin !== undefined || body.smartlock_pin !== undefined) {
      patch.smartLockPin = body.smartLockPin ?? body.smartlock_pin;
    }
    if (body.message !== undefined || body.note !== undefined) {
      patch.message = body.message ?? body.note;
    }
    if (patch.status === 'confirmed') {
      patch.approvedBy = 'admin';
    }

    const updated = await bookingRepository.updateBooking(id, patch, { roomsList });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt phòng.' });
    }

    res.json({ success: true, message: 'Cập nhật đơn thành công!', booking: updated });
  } catch (err) {
    logger.error('Admin lỗi cập nhật đơn', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật đơn.' });
  }
});

// Duyệt đơn nguyên tử (Ghi sổ cái giao dịch thực nhận + Cấp mã Smart-Lock PIN 6 số)
app.post('/api/admin/booking/approve', requireAdminAuth, async (req, res) => {
  const { id, amountReceived, bankCode, customPin } = req.body || {};
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn đặt phòng.' });

  try {
    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const existing = await bookingRepository.findBookingByCode(id, { roomsList });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt phòng.' });
    }
    if (existing.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Đơn đã hủy, không thể duyệt.' });
    }

    const cleanCustomPin = String(customPin || '').replace(/[^0-9]/g, '');
    const pinToUse =
      cleanCustomPin.length === 6
        ? cleanCustomPin
        : (/^[0-9]{6}$/.test(String(existing.smartLockPin || ''))
            ? String(existing.smartLockPin)
            : String(crypto.randomInt(100000, 1000000)));

    const unpaidExpected = Math.max(0, (existing.depositAmount || existing.totalPrice) - (existing.paidAmount || 0));
    const addAmount =
      amountReceived !== undefined && Number(amountReceived) >= 0
        ? Math.trunc(Number(amountReceived))
        : unpaidExpected;

    let finalBooking;
    if (addAmount > 0) {
      const txResult = await bookingRepository.recordPaymentTransaction({
        bookingId: existing.bookingCode,
        amount: addAmount,
        gatewayTxnId: `MANUAL_${existing.bookingCode}_${Date.now()}`,
        bankCode: bankCode || 'MB',
        source: 'manual',
        recordedBy: 'admin_reception',
        smartLockPin: pinToUse,
        autoConfirm: true,
        strictAmount: false,
        roomsList
      });
      finalBooking = txResult.booking;
    } else {
      finalBooking = await bookingRepository.updateBooking(
        existing.bookingCode,
        {
          status: 'confirmed',
          paymentStatus: 'PAID',
          smartLockPin: pinToUse,
          approvedBy: 'admin_reception'
        },
        { roomsList }
      );
    }

    res.json({
      success: true,
      message: `Đã duyệt đơn #${finalBooking.bookingCode} & cấp mã PIN 6 số: ${finalBooking.smartLockPin}`,
      pin: finalBooking.smartLockPin,
      booking: finalBooking
    });
  } catch (err) {
    logger.error('Admin lỗi duyệt đơn:', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi duyệt đơn đặt phòng.' });
  }
});

// Cấp lại hoặc đổi mã PIN Smart-Lock cho khách
app.post('/api/admin/booking/smartlock', requireAdminAuth, async (req, res) => {
  const { id, customPin } = req.body || {};
  if (!id) return res.status(400).json({ success: false, message: 'Thiếu mã đơn đặt phòng.' });

  try {
    const roomsList = (getRoomsData() && getRoomsData().rooms) || [];
    const existing = await bookingRepository.findBookingByCode(id, { roomsList });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đơn đặt phòng.' });
    }

    // Ưu tiên chuẩn 6 chữ số an toàn (tương thích ngược nếu caller gửi định dạng *xxxx#)
    let pin = '';
    const trimmed = typeof customPin === 'string' ? customPin.trim() : '';
    if (/^[0-9]{6}$/.test(trimmed)) {
      pin = trimmed;
    } else if (/^\*[0-9]{4,6}#$/.test(trimmed)) {
      pin = trimmed;
    } else if (/^[0-9]{4}$/.test(trimmed)) {
      pin = `*${trimmed}#`;
    } else {
      pin = String(crypto.randomInt(100000, 1000000));
    }

    const updated = await bookingRepository.updateBooking(
      existing.bookingCode,
      {
        smartLockPin: pin,
        status: existing.status === 'pending' ? 'confirmed' : existing.status,
        approvedBy: 'admin'
      },
      { roomsList }
    );

    res.json({
      success: true,
      message: `Đã cấp mã Smart-Lock PIN ${pin} thành công cho đơn #${updated.bookingCode}`,
      pin,
      booking: updated
    });
  } catch (err) {
    logger.error('Admin lỗi cấp PIN Smart-lock', err);
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cấp mã PIN Smart-Lock.' });
  }
});

// Banla Priority Payment Module Router (VietQR)
const banlaPaymentRouter = require('./banla_payment_module/backend/banla_payment_router');
app.use('/api/banla', banlaPaymentRouter);

// Banla International Card / Visa Payment Module Router (OnePay VPC v2)
const visaPaymentRouter = createVisaPaymentRouter({
  getRoomsData,
  onBookingConfirmed: (booking) => maybeSendEmail(booking)
});
app.use('/api/payments', visaPaymentRouter);

// Alias tương thích cho Return URL nếu cấu hình trên OnePay Portal dùng đường dẫn ngắn
app.get(['/onepay-return', '/onepay-return.php'], (req, res) => {
  const qsIdx = req.originalUrl.indexOf('?');
  const qs = qsIdx >= 0 ? req.originalUrl.slice(qsIdx) : '';
  return res.redirect(302, `/api/payments/onepay/return${qs}`);
});

// ==========================================
// BANLA AI CONCIERGE ("BÀN LÀ · LỄ TÂN AI")
// ==========================================
const HOTEL_FACTS_PROMPT = `
THÔNG TIN CHÍNH THỨC — BANLA BOUTIQUE HOTEL ĐÀ LẠT
- Địa chỉ: 47 Nguyễn Đình Chiểu, Phường 9, TP. Đà Lạt. Cách Hồ Xuân Hương, Vườn Hoa Thành Phố, Chợ Đà Lạt khoảng 5–7 phút; cách sân bay Liên Khương ~30 km (~35 phút).
- Slogan: "Ngoài lạnh. Trong ấm." — tên Banla lấy cảm hứng từ chiếc bàn là đồng xưa ủi phẳng cái se lạnh phố núi.
- Hotline 24/7: 0296.9996.999 – 0352554863. Fanpage Facebook: https://www.facebook.com/Banlaboutiquedalat/
- Email: concact@banlaboutiquedalat.com · Instagram @banla.boutiquehotel · TikTok @banlaboutiquehotel
- Nhận phòng từ 14:00, trả phòng trước 12:00. Đổi lịch/nhận phòng sớm: báo trước tối thiểu 72 giờ.
- 7 hạng phòng (giá niêm yết/đêm):
  1. Élite Room (gác mái, trần gỗ, bồn tắm nằm) — 30m², 2 NL + 1 trẻ — 1.250.000 ₫
  2. Banla Signature (tường xanh olive, trần gỗ) — 28m², 2 NL + 1 trẻ — 1.150.000 ₫
  3. Highland Room (trần gỗ cao, giường King) — 28m², 2 NL + 1 trẻ — 1.100.000 ₫
  4. Connecting Room (2 phòng thông nhau, gia đình) — 35m², 4 NL + 1–2 trẻ — 1.850.000 ₫
  5. Deluxe Twin (2 giường đơn) — 22m², 2–3 NL — 950.000 ₫
  6. Original Suite (rộng, bàn làm việc, khu tiếp khách) — 35m², 2 NL + 1 trẻ — 1.550.000 ₫
  7. Deluxe Balcony (ban công riêng hướng phố) — 20m², 2 NL + 1 trẻ — 980.000 ₫
- The Roof by Banla (tầng thượng): Café & trà 08:00–16:00; Cocktail & Wine Bar 16:00–00:00. Khách đặt trực tiếp giảm 15% đồ uống.
- Bữa sáng: phở, bánh mì xíu mại, món Á – Âu, cà phê rang xay.
- Đặt phòng trên website: chọn Cọc 50% (phần còn lại trả khi check-in) hoặc Thanh toán 100% (giảm ngay 10%). Hỗ trợ thanh toán VietQR ngân hàng MB Bank (STK 0352554863 — BANLA BOUTIQUE HOTEL, nội dung BANLA_MÃĐƠN) hoặc Thẻ quốc tế Visa/Mastercard/JCB qua OnePay 3D Secure. Sau khi đối soát sẽ nhận Phiếu xác nhận có dấu đỏ và mã Smart-Lock PIN 6 số (hiệu lực 14:00 Check-in → 12:00 Check-out).
`.trim();

function normalizeViText(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSmartConciergeReply(question) {
  const q = normalizeViText(question);

  if (
    (q.includes('2 nguoi lon') && (q.includes('1 be') || q.includes('1 tre') || q.includes('em be') || q.includes('con nho'))) ||
    q.includes('2 nl') ||
    q.includes('gia dinh nho')
  ) {
    return 'Dạ với **2 người lớn và 1 bé**, Banla có **5 hạng phòng** đúng chuẩn sức chứa **2 NL + 1 trẻ**, rất ấm áp và thoải mái ạ:\n' +
      '- **Élite Room (30m² · 1.250.000 ₫/đêm)**: Phòng gác mái gỗ trầm đặc trưng, có **bồn tắm nằm** và góc thư giãn riêng.\n' +
      '- **Original Suite (35m² · 1.550.000 ₫/đêm)**: Không gian rộng rãi nhất, có khu vực tiếp khách thoải mái cho bé.\n' +
      '- **Banla Signature (28m² · 1.150.000 ₫/đêm)**: Tông xanh olive dịu mắt, trần gỗ ấm và yên tĩnh.\n' +
      '- **Highland Room (28m² · 1.100.000 ₫/đêm)**: Trần gỗ cao thoáng, giường King êm ái đón nắng sớm.\n' +
      '- **Deluxe Balcony (20m² · 980.000 ₫/đêm)**: Tiết kiệm, có ban công riêng thoáng sáng.\n\n' +
      'Quý khách có thể chọn phòng và đặt ngay tại #contact (chọn **Cọc 50%** hoặc **Thanh toán 100% giảm 10%**) ạ!';
  }

  if (q.includes('4 nguoi') || q.includes('4 khach') || q.includes('nhom ban') || q.includes('connecting') || q.includes('thong nhau')) {
    return 'Dạ với gia đình hoặc nhóm bạn **4 – 6 khách**, lựa chọn lý tưởng nhất tại Banla là:\n' +
      '- **Connecting Room (35m² · 1.850.000 ₫/đêm)**: Thiết kế **2 không gian phòng thông nhau** tiện lợi, sức chứa **4 người lớn + 1–2 trẻ**, vừa gắn kết vừa đảm bảo sự riêng tư.\n' +
      '- Ngoài ra nếu đi nhóm 2–3 bạn muốn nằm giường riêng, quý khách có thể chọn **Deluxe Twin (22m² · 2 giường đơn · 950.000 ₫/đêm)**.\n\n' +
      'Quý khách bấm vào #contact để đặt giữ phòng sớm nhé ạ!';
  }

  if (q.includes('roof') || q.includes('tang thuong') || q.includes('cafe') || q.includes('ca phe') || q.includes('cocktail') || q.includes('wine') || q.includes('bar')) {
    return 'Dạ **The Roof by Banla** nằm trên tầng thượng của khách sạn với tầm nhìn trọn phố núi mờ sương ạ:\n' +
      '- **Café & Trà nóng**: **08:00 – 16:00** hàng ngày\n' +
      '- **Cocktail & Wine Bar**: **16:00 – 00:00** hàng ngày\n' +
      '- **Đặc quyền khách lưu trú**: Giảm trực tiếp **15% tổng hóa đơn đồ uống** tại The Roof khi đặt phòng trên website.\n' +
      'Quý khách đặt phòng tại #contact để nhận ngay ưu đãi nhé!';
  }

  if (q.includes('vietqr') || q.includes('visa') || q.includes('dat coc') || q.includes('coc') || q.includes('thanh toan') || q.includes('chuyen khoan') || q.includes('dau do') || q.includes('pin') || q.includes('smart lock')) {
    return 'Dạ quy trình **Đặt phòng – Thanh toán VietQR / Thẻ Visa – Nhận Phiếu Dấu Đỏ & Mã Smart-Lock** tại Banla rất minh bạch:\n' +
      '- **Bước 1**: Điền thông tin tại #contact và chọn **Cọc 50% tổng đơn** hoặc **Thanh toán 100% (giảm ngay 10%)**.\n' +
      '- **Bước 2**: Quét mã VietQR ngân hàng **MB Bank (STK 0352554863 — BANLA BOUTIQUE HOTEL)** với nội dung `BANLA_MÃĐƠN`, hoặc thanh toán an toàn bằng **Thẻ Quốc Tế Visa/Mastercard/JCB** qua OnePay 3D Secure.\n' +
      '- **Bước 3**: Ngay khi CSDL xác thực thanh toán, hệ thống cấp **Phiếu xác nhận có Dấu Đỏ chính thức** và **Mã Smart-Lock PIN 6 số** (hiệu lực 14:00 Check-in → 12:00 Check-out).';
  }

  if (q.includes('san bay') || q.includes('lien khuong') || q.includes('dia chi') || q.includes('o dau') || q.includes('duong di') || q.includes('bao xa') || q.includes('ho xuan huong')) {
    return 'Dạ vị trí và di chuyển đến **Banla Boutique Hotel Đà Lạt**:\n' +
      '- **Địa chỉ**: **47 Nguyễn Đình Chiểu, Phường 9, TP. Đà Lạt**.\n' +
      '- **Kết nối trung tâm**: Chỉ **5–7 phút** tới **Hồ Xuân Hương, Vườn Hoa Thành Phố và Chợ Đêm Đà Lạt**.\n' +
      '- **Từ sân bay Liên Khương**: Khoảng **30 km (~35 phút đi ô tô)**. Lễ tân hỗ trợ đặt xe đưa đón sân bay và limousine tuyến **Đà Lạt – Nha Trang (135 km)** qua Hotline **0296.9996.999 – 0352554863** ạ!';
  }

  return 'Dạ **bảng giá niêm yết 7 hạng phòng** tại Banla Boutique Hotel Đà Lạt (47 Nguyễn Đình Chiểu, Phường 9):\n' +
    '- **Deluxe Twin** (22m² · 2–3 NL · 2 giường đơn): **950.000 ₫/đêm**\n' +
    '- **Deluxe Balcony** (20m² · 2 NL + 1 trẻ · Ban công): **980.000 ₫/đêm**\n' +
    '- **Highland Room** (28m² · 2 NL + 1 trẻ · Trần gỗ cao): **1.100.000 ₫/đêm**\n' +
    '- **Banla Signature** (28m² · 2 NL + 1 trẻ · Xanh olive): **1.150.000 ₫/đêm**\n' +
    '- **Élite Room** (30m² · 2 NL + 1 trẻ · Gác mái, bồn tắm): **1.250.000 ₫/đêm**\n' +
    '- **Original Suite** (35m² · 2 NL + 1 trẻ · Suite rộng): **1.550.000 ₫/đêm**\n' +
    '- **Connecting Room** (35m² · 4 NL + 1–2 trẻ · 2 phòng thông nhau): **1.850.000 ₫/đêm**\n\n' +
    'Quý khách đặt trực tiếp tại #contact được **giảm 10%** khi thanh toán 100% và **giảm 15%** tại **The Roof** ạ!';
}

app.post('/api/chat', async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
    const lastUserMsg = [...messages].reverse().find((m) => m && m.role !== 'model' && typeof m.text === 'string');
    const question = lastUserMsg
      ? lastUserMsg.text.trim().slice(0, 800)
      : String(req.body?.question || req.body?.prompt || '').trim().slice(0, 800);

    if (!question) {
      return res.status(400).json({ success: false, error: 'Thiếu câu hỏi của khách hàng.' });
    }

    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (geminiKey) {
      try {
        const model = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim();
        const contents = messages.length > 0
          ? messages
              .filter((m) => m && typeof m.text === 'string' && m.text.trim())
              .map((m) => ({
                role: m.role === 'model' ? 'model' : 'user',
                parts: [{ text: String(m.text).trim().slice(0, 800) }]
              }))
          : [{ role: 'user', parts: [{ text: question }] }];
        const gRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: `Bạn là "Bàn Là" — trợ lý lễ tân AI của Banla Boutique Hotel Đà Lạt. Trả lời ấm áp, lịch sự, ngắn gọn, xưng "Banla" và gọi khách là "quý khách". Chỉ dùng dữ liệu sau:\n${HOTEL_FACTS_PROMPT}` }] },
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
          })
        });
        if (gRes.ok) {
          const gData = await gRes.json();
          const text = (gData?.candidates?.[0]?.content?.parts || [])
            .map((p) => p.text || '')
            .join('')
            .trim();
          if (text) {
            return res.json({ success: true, source: 'gemini', reply: text, answer: text });
          }
        }
      } catch (err) {
        logger.warn('Gemini API fallback sang Smart Knowledge Engine:', err.message);
      }
    }

    const reply = buildSmartConciergeReply(question);
    return res.json({ success: true, source: 'knowledge_engine', reply, answer: reply });
  } catch (err) {
    logger.error('Lỗi /api/chat:', err);
    const fallbackReply = buildSmartConciergeReply('');
    return res.json({
      success: true,
      source: 'fallback',
      reply: fallbackReply,
      answer: fallbackReply
    });
  }
});

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
    const storage = bookingRepository.getStorageInfo();
    logger.info(`Banla server running at http://localhost:${PORT} [storage=${storage.mode}]`);
  });
}

module.exports = { app, validateBooking, getRoomsData, buildSmartConciergeReply };
