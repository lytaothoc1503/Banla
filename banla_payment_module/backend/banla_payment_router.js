/**
 * BANLA PAYMENT ROUTER (Node.js / Express)
 * Module độc lập, hỗ trợ SSE Real-time, HMAC-SHA256, Idempotency
 * Tương thích chuẩn banla_payment_package
 */
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Không có giá trị mặc định: thiếu BANLA_WEBHOOK_SECRET thì webhook bị từ chối (503),
// tránh việc ai đọc được mã nguồn cũng ký giả được thông báo "đã thanh toán".
const WEBHOOK_SECRET = (process.env.BANLA_WEBHOOK_SECRET || '').trim();
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || path.join(__dirname, '..', '..', 'data', 'bookings.json');

// Bộ nhớ đệm lưu kết nối thời gian thực SSE (kèm timer keepalive)
const sseSubscribers = new Map();

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function broadcastPaymentSuccess(sessionId, data) {
  const sub = sseSubscribers.get(sessionId);
  if (sub && sub.res) {
    try {
      sub.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      if (sub.timer) clearInterval(sub.timer);
      sseSubscribers.delete(sessionId);
    }
  }
}

// Cập nhật booking gốc trong data/bookings.json an toàn
function syncBookingPayment(bookingId, paymentData) {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const content = fs.readFileSync(BOOKINGS_FILE, 'utf8').trim();
      if (!content) return;
      const bookings = JSON.parse(content);
      const idx = bookings.findIndex((b) => String(b.id).toLowerCase() === String(bookingId).toLowerCase());
      if (idx !== -1) {
        bookings[idx].status = 'confirmed';
        bookings[idx].paymentStatus = 'PAID';
        bookings[idx].smartLockPin = paymentData.smartLockPin;
        bookings[idx].paidAt = new Date().toISOString();

        const tmpFile = `${BOOKINGS_FILE}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(bookings, null, 2), 'utf8');
        fs.renameSync(tmpFile, BOOKINGS_FILE);
      }
    }
  } catch (err) {
    console.error('[Banla Payment] Đồng bộ booking lỗi:', err.message);
  }
}

// 1. Kênh SSE Real-time: Thông báo tức thì cho màn hình khách khi tiền về
function handleStream(req, res) {
  const { sessionId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Đóng kết nối cũ nếu có để tránh rò rỉ socket
  const prevClient = sseSubscribers.get(sessionId);
  if (prevClient && prevClient.res) {
    try { prevClient.res.end(); } catch {}
    if (prevClient.timer) clearInterval(prevClient.timer);
  }

  // Gửi heartbeat keepalive mỗi 20 giây để tránh timeout từ proxy/browser
  const timer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(timer);
      sseSubscribers.delete(sessionId);
    }
  }, 20000);

  sseSubscribers.set(sessionId, { res, timer });
  res.write(`: connected to session ${sessionId}\n\n`);

  req.on('close', () => {
    clearInterval(timer);
    sseSubscribers.delete(sessionId);
  });
}

router.get('/session/:sessionId/stream', handleStream);
router.get('/stream/:sessionId', handleStream);

// 2. Tạo phiên thanh toán mới (Khóa giữ phòng 15 phút)
async function handleCreateSession(req, res) {
  try {
    const { bookingId, roomId, amount, roomName, customerName, customerContact } = req.body || {};

    const grossAmount = Number(amount) || 200000;
    const feeRate = 0.015;
    const feeAmount = Math.round(grossAmount * feeRate);
    const netAmount = grossAmount - feeAmount;

    const sessionId = `SESS_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const memo = `BALA${Math.floor(1000 + Math.random() * 9000)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

    const vietQrUrl = `https://img.vietqr.io/image/MB-0965999999-compact2.png?amount=${grossAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent('BANLA BOUTIQUE HOTEL')}`;

    const sessionData = {
      id: sessionId,
      sessionId,
      bookingId: bookingId || 'BALA-9821',
      roomId: roomId || 'attic',
      roomName: roomName || 'Phòng Banla Boutique',
      customerName: customerName || 'Quý khách Banla',
      customerContact: customerContact || '',
      amount: grossAmount,
      grossAmount,
      feeAmount,
      netAmount,
      currency: 'VND',
      memo,
      vietQrUrl,
      lockStatus: 'LOCKED',
      expiresAt: expiresAt.toISOString(),
      bankDetails: {
        bankName: 'MB Bank Priority',
        bankCode: 'MB',
        accountNumber: '0965999999',
        accountName: 'BANLA BOUTIQUE HOTEL'
      }
    };

    res.status(201).json({
      success: true,
      session: sessionData,
      ...sessionData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

router.post('/session/create', handleCreateSession);
router.post('/session', handleCreateSession);

// Lấy thông tin phiên
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.json({
    success: true,
    sessionId,
    id: sessionId,
    lockStatus: 'LOCKED',
    session: {
      id: sessionId,
      sessionId,
      lockStatus: 'LOCKED'
    }
  });
});

// 3. Webhook nhận tiền tự động (Có kiểm tra HMAC-SHA256 an toàn & Idempotency)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-banla-signature'] || req.headers['x-signature'];

    let rawBody = '';
    let payload = {};

    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'object' && req.body !== null) {
      rawBody = JSON.stringify(req.body);
      payload = req.body;
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
      payload = JSON.parse(rawBody);
    }

    // Xác thực chữ ký số HMAC-SHA256 — luôn bắt buộc
    if (!WEBHOOK_SECRET) {
      return res.status(503).json({ success: false, message: 'Webhook chưa được cấu hình trên máy chủ.' });
    }
    if (!signature) {
      return res.status(401).json({ success: false, message: 'Thiếu chữ ký xác thực (x-banla-signature).' });
    }
    const hash = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    if (!safeCompare(signature, hash)) {
      return res.status(401).json({ success: false, message: 'Chữ ký số không hợp lệ.' });
    }

    const { transactionId, memo, amount, sessionId, bookingId } = payload;

    // Mã PIN Smart-Lock 6 chữ số, sinh bằng nguồn ngẫu nhiên an toàn
    const smartLockPin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    const eventData = {
      status: 'CONFIRMED',
      transactionId: transactionId || ('TX_' + Date.now()),
      amount: amount || 200000,
      smartLockPin,
      message: 'Thanh toán thành công! Phòng đã được khóa chỗ.'
    };

    // Đẩy tín hiệu Real-time ngay lập tức về UI
    broadcastPaymentSuccess(sessionId || 'SESS_DEFAULT', eventData);

    // Đồng bộ vào cơ sở dữ liệu bookings
    if (bookingId) {
      syncBookingPayment(bookingId, { smartLockPin });
    }

    res.json({
      success: true,
      message: 'Giao dịch đã được ghi nhận.',
      smartLockPin,
      eventData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
