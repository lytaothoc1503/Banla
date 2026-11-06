/**
 * BANLA PAYMENT ROUTER (Node.js / Express — Real-Data Production Ready)
 * Hỗ trợ:
 *   - Phiên khóa giữ phòng VietQR 15 phút gắn chặt với số tiền thực tế từ CSDL (`amount_due`).
 *   - Kênh SSE Real-time theo cả `sessionId` lẫn `bookingCode`.
 *   - Webhook ngân hàng (SePay / Casso / VietQR nội bộ) ký HMAC-SHA256 an toàn,
 *     tự bóc tách mã `BANLA_BLxxxxxx` từ nội dung chuyển khoản và chống cộng trùng (`transactionId`).
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const bookingRepository = require('../../backend/repositories/booking.repository');
const { resolveRoom } = require('../../shared/constants/rooms');

const router = express.Router();

// Bộ nhớ đệm lưu kết nối thời gian thực SSE (hỗ trợ đăng ký theo sessionId hoặc bookingCode)
const sseSubscribers = new Map();

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function broadcastPaymentSuccess(keys, data) {
  const uniqueKeys = [...new Set((Array.isArray(keys) ? keys : [keys]).filter(Boolean))];
  for (const key of uniqueKeys) {
    const sub = sseSubscribers.get(key);
    if (sub && sub.res) {
      try {
        sub.res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        if (sub.timer) clearInterval(sub.timer);
        sseSubscribers.delete(key);
      }
    }
  }
}

function extractBookingCodeFromMemo(text) {
  if (typeof text !== 'string' || !text.trim()) return '';
  const m = text.match(/BANLA[_\-\s]*(BL[0-9A-Z]{4,12})/i);
  if (m && m[1]) return m[1].toUpperCase();
  const direct = text.match(/\b(BL[0-9A-Z]{6,10})\b/i);
  return direct && direct[1] ? direct[1].toUpperCase() : '';
}

// 1. Kênh SSE Real-time: Thông báo tức thì cho màn hình khách khi tiền về và đã xác thực CSDL
function handleStream(req, res) {
  const rawKey = String(req.params.sessionId || '').trim();
  if (!rawKey) return res.status(400).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const prevClient = sseSubscribers.get(rawKey);
  if (prevClient && prevClient.res) {
    try { prevClient.res.end(); } catch {}
    if (prevClient.timer) clearInterval(prevClient.timer);
  }

  const timer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(timer);
      sseSubscribers.delete(rawKey);
    }
  }, 20000);

  sseSubscribers.set(rawKey, { res, timer });
  res.write(`: connected to ${rawKey}\n\n`);

  req.on('close', () => {
    clearInterval(timer);
    sseSubscribers.delete(rawKey);
  });
}

router.get('/session/:sessionId/stream', handleStream);
router.get('/stream/:sessionId', handleStream);

// 2. Tạo phiên thanh toán VietQR mới (Khóa giữ phòng 15 phút, lấy giá chuẩn từ CSDL nếu đơn tồn tại)
async function handleCreateSession(req, res) {
  try {
    const { bookingId, roomId, amount, roomName, customerName, customerContact } = req.body || {};

    const cleanBookingId = bookingRepository.cleanBookingCode(bookingId).toUpperCase();
    if (!cleanBookingId || !/^BL[0-9A-Z_-]{3,20}$/i.test(cleanBookingId)) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu hoặc sai định dạng mã đặt phòng (bookingId) khi tạo phiên VietQR.'
      });
    }

    const existingBooking = await bookingRepository.findBookingByCode(cleanBookingId);
    if (existingBooking && existingBooking.paymentStatus === 'PAID') {
      return res.status(409).json({
        success: false,
        message: `Đơn đặt phòng #${existingBooking.bookingCode} đã được thanh toán trước đó.`
      });
    }

    let grossAmount = 0;
    if (existingBooking) {
      // Bắt buộc dùng số tiền thực tế phải thu từ CSDL, KHÔNG tin số tiền do trình duyệt gửi lên
      const expectedDue = existingBooking.depositAmount || existingBooking.totalPrice;
      grossAmount = Math.max(0, Math.trunc(expectedDue - (existingBooking.paidAmount || 0)));
    } else {
      const parsedAmount = Math.trunc(Number(amount));
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Số tiền thanh toán không hợp lệ.'
        });
      }
      grossAmount = parsedAmount;
    }

    const matchedRoom = resolveRoom(
      (existingBooking && (existingBooking.roomCode || existingBooking.room)) || roomId || roomName
    );
    const feeRate = 0.015;
    const feeAmount = Math.round(grossAmount * feeRate);
    const netAmount = Math.max(0, grossAmount - feeAmount);

    const sessionId = `SESS_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const memo = `BANLA_${cleanBookingId}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const bankCode = (process.env.BANLA_BANK_CODE || 'MB').trim();
    const accountNumber = (process.env.BANLA_BANK_ACCOUNT || '0352554863').trim();
    const accountName = (process.env.BANLA_BANK_ACCOUNT_NAME || 'BANLA BOUTIQUE HOTEL').trim();

    const vietQrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(accountNumber)}-compact2.png?amount=${grossAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

    const sessionData = {
      id: sessionId,
      sessionId,
      bookingId: existingBooking ? existingBooking.bookingCode : cleanBookingId,
      roomId: matchedRoom.code,
      roomName: (existingBooking && existingBooking.room) || roomName || matchedRoom.name,
      customerName: (existingBooking && existingBooking.name) || customerName || 'Quý khách Banla',
      customerContact: (existingBooking && existingBooking.phone) || customerContact || '',
      amount: grossAmount,
      grossAmount,
      totalAmount: existingBooking ? existingBooking.totalPrice : grossAmount,
      discountAmount: existingBooking ? existingBooking.discountAmount : 0,
      remainingAmount: existingBooking
        ? Math.max(0, existingBooking.totalPrice - existingBooking.discountAmount - grossAmount - (existingBooking.paidAmount || 0))
        : 0,
      paymentOption: existingBooking ? existingBooking.paymentOption : 'deposit_50',
      feeAmount,
      netAmount,
      currency: 'VND',
      memo,
      vietQrUrl,
      lockStatus: 'LOCKED',
      expiresAt: expiresAt.toISOString(),
      bankDetails: {
        bankName: bankCode === 'MB' ? 'MB Bank Priority' : bankCode,
        bankCode,
        accountNumber,
        accountName
      }
    };

    await bookingRepository.savePaymentSession(sessionData);

    res.status(201).json({
      success: true,
      session: sessionData,
      ...sessionData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Không thể khởi tạo phiên thanh toán VietQR.' });
  }
}

router.post('/session/create', handleCreateSession);
router.post('/session', handleCreateSession);

// Lấy thông tin phiên thực tế từ kho lưu trữ
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = bookingRepository.getPaymentSessionSync(sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      message: 'Không tìm thấy phiên thanh toán hoặc phiên đã hết hạn.'
    });
  }
  const safeSession = { ...session };
  delete safeSession.customerContact;
  delete safeSession.smartlockPinCode;

  res.json({
    success: true,
    sessionId: safeSession.sessionId,
    id: safeSession.id,
    lockStatus: safeSession.lockStatus,
    session: safeSession
  });
});

// 3. Webhook nhận tiền tự động (HMAC-SHA256 + Idempotency + Đồng bộ CSDL thật)
router.post('/webhook', async (req, res) => {
  try {
    const webhookSecret = (process.env.BANLA_WEBHOOK_SECRET || '').trim();
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

    if (!webhookSecret) {
      return res.status(503).json({ success: false, message: 'Webhook chưa được cấu hình trên máy chủ.' });
    }
    if (!signature) {
      return res.status(401).json({ success: false, message: 'Thiếu chữ ký xác thực (x-banla-signature).' });
    }
    const hash = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!safeCompare(String(signature), hash)) {
      return res.status(401).json({ success: false, message: 'Chữ ký số không hợp lệ.' });
    }

    const rawAmount = payload.amount ?? payload.transferAmount;
    const parsedAmount = Math.trunc(Number(rawAmount));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền giao dịch webhook không hợp lệ.' });
    }

    const memoText = String(payload.memo || payload.content || payload.description || '');
    const resolvedBookingCode =
      bookingRepository.cleanBookingCode(payload.bookingId) || extractBookingCodeFromMemo(memoText);

    const candidatePin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const gatewayTxnId = String(
      payload.transactionId ||
      payload.referenceCode ||
      payload.id ||
      `VQ_${resolvedBookingCode || 'NA'}_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`
    );

    const strictAmount = process.env.BANLA_STRICT_WEBHOOK_AMOUNT === 'true';
    let finalPin = candidatePin;
    let duplicate = false;
    let paidAmount = parsedAmount;

    if (resolvedBookingCode) {
      const txResult = await bookingRepository.recordPaymentTransaction({
        bookingId: resolvedBookingCode,
        amount: parsedAmount,
        gatewayTxnId,
        bankCode: String(payload.gateway || payload.bankCode || 'MB').slice(0, 30),
        source: 'webhook',
        recordedBy: 'vietqr_webhook',
        smartLockPin: candidatePin,
        autoConfirm: true,
        strictAmount,
        rawPayload: payload
      });
      finalPin = txResult.smartLockPin || candidatePin;
      duplicate = txResult.duplicate;
      if (txResult.booking && txResult.booking.paidAmount !== undefined) {
        paidAmount = Number(txResult.booking.paidAmount);
      }
    }

    const eventData = {
      status: 'CONFIRMED',
      duplicate,
      bookingId: resolvedBookingCode || null,
      transactionId: gatewayTxnId,
      amount: parsedAmount,
      paidAmount,
      smartLockPin: finalPin,
      message: 'Thanh toán đã được đối soát thành công trên CSDL!'
    };

    broadcastPaymentSuccess(
      [payload.sessionId, resolvedBookingCode ? resolvedBookingCode.toUpperCase() : null],
      eventData
    );

    res.json({
      success: true,
      duplicate,
      paidAmount,
      message: duplicate ? 'Giao dịch đã được ghi nhận trước đó (Idempotent).' : 'Giao dịch đã được ghi nhận.',
      smartLockPin: finalPin,
      eventData
    });
  } catch (error) {
    if (error && error.status === 409) {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xử lý webhook thanh toán.' });
  }
});

module.exports = router;
