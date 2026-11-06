/**
 * BANLA BOUTIQUE HOTEL — VISA / ONEPAY REPOSITORY (DATA ACCESS LAYER)
 * Quản lý lưu trữ nguyên tử (Atomic File + In-process Mutex Lock) cho:
 *   - `bookings.json`
 *   - `payments.json` (phiên thanh toán / payment_intents)
 *   - `payment_events.json` (nhật ký kiểm toán webhook / IPN chống xử lý trùng)
 * Đồng thời hỗ trợ đồng bộ sang Supabase (`schema: banla`, `service_role`) khi được cấu hình.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../../utils/logger');
const { sanitizeGatewayPayload } = require('./visa.validator');
const { withDataMutex } = require('../../repositories/booking.repository');

// Dùng chung một hàng đợi khóa tuần tự trên toàn tiến trình để đồng bộ an toàn với Booking/VietQR/Admin
function withMutex(fn) {
  return withDataMutex(fn);
}

function getDataPaths() {
  const bookingsFile = process.env.BOOKINGS_FILE
    ? path.resolve(process.env.BOOKINGS_FILE)
    : path.join(__dirname, '..', '..', '..', 'data', 'bookings.json');
  const baseDir = path.dirname(bookingsFile);

  const paymentsFile = process.env.PAYMENTS_FILE
    ? path.resolve(process.env.PAYMENTS_FILE)
    : path.join(baseDir, 'payments.json');

  const eventsFile = process.env.PAYMENT_EVENTS_FILE
    ? path.resolve(process.env.PAYMENT_EVENTS_FILE)
    : path.join(baseDir, 'payment_events.json');

  return { bookingsFile, paymentsFile, eventsFile };
}

function readJsonArraySafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8').trim();
    if (!content) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error(`Lỗi đọc file dữ liệu thanh toán (${path.basename(filePath)})`, err);
    return [];
  }
}

function writeJsonArrayAtomic(filePath, list) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

function matchesBookingIdentifier(booking, codeOrId) {
  if (!booking || !codeOrId) return false;
  const target = String(codeOrId).trim().replace(/^#+/, '').toLowerCase();
  return (
    String(booking.id || '').toLowerCase() === target ||
    String(booking.bookingCode || '').toLowerCase() === target ||
    String(booking.booking_code || '').toLowerCase() === target
  );
}

/**
 * Tìm đơn đặt phòng theo mã đặt phòng
 */
function findBookingByCode(bookingCode) {
  const { bookingsFile } = getDataPaths();
  const list = readJsonArraySafe(bookingsFile);
  return list.find((b) => matchesBookingIdentifier(b, bookingCode)) || null;
}

/**
 * Tìm phiên thanh toán theo khóa chống tạo trùng (idempotency_key)
 */
function findPaymentByIdempotencyKey(idempotencyKey) {
  const { paymentsFile } = getDataPaths();
  const list = readJsonArraySafe(paymentsFile);
  return list.find((p) => p && p.idempotencyKey === idempotencyKey) || null;
}

/**
 * Tìm phiên thanh toán theo mã tham chiếu giao dịch OnePay (`vpc_MerchTxnRef`)
 */
function findPaymentByMerchantTxnRef(merchantTxnRef) {
  if (!merchantTxnRef) return null;
  const { paymentsFile } = getDataPaths();
  const list = readJsonArraySafe(paymentsFile);
  return list.find((p) => p && p.merchantTxnRef === merchantTxnRef) || null;
}

/**
 * Lấy giao dịch thanh toán gần nhất của một đơn đặt phòng
 */
function findLatestPaymentByBookingCode(bookingCode) {
  const { paymentsFile } = getDataPaths();
  const list = readJsonArraySafe(paymentsFile);
  const target = String(bookingCode || '').trim().toLowerCase();
  const matches = list.filter(
    (p) =>
      p &&
      (String(p.bookingCode || '').toLowerCase() === target ||
        String(p.bookingId || '').toLowerCase() === target)
  );
  if (!matches.length) return null;
  matches.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return matches[0];
}

/**
 * Kiểm tra sự kiện webhook/IPN đã được xử lý trước đó hay chưa
 */
function hasProcessedEvent(providerEventId, eventType = 'ONEPAY_IPN') {
  if (!providerEventId) return false;
  const { eventsFile } = getDataPaths();
  const events = readJsonArraySafe(eventsFile);
  return events.some(
    (e) =>
      e &&
      e.providerEventId === String(providerEventId) &&
      e.eventType === eventType &&
      e.signatureValid === true &&
      e.amountMatch === true
  );
}

/**
 * Tạo mới phiên thanh toán và chuyển trạng thái booking sang đang chờ cổng thanh toán
 */
async function createPaymentIntentRecord({
  bookingId,
  bookingCode,
  provider = 'ONEPAY',
  method = 'CARD',
  paymentOption = 'deposit_50',
  amountVnd,
  currency = 'VND',
  idempotencyKey,
  merchantTxnRef,
  redirectUrl,
  clientIp
}) {
  return withMutex(async () => {
    const { bookingsFile, paymentsFile } = getDataPaths();
    const payments = readJsonArraySafe(paymentsFile);

    // Kiểm tra lại idempotency bên trong mutex để chống race-condition
    const existing = payments.find((p) => p && p.idempotencyKey === idempotencyKey);
    if (existing && existing.status !== 'FAILED' && existing.status !== 'CANCELLED') {
      return { reused: true, payment: existing };
    }

    const now = new Date().toISOString();
    const record = {
      id: `PAY_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      bookingId: String(bookingId),
      bookingCode: String(bookingCode).toUpperCase(),
      provider,
      method,
      paymentOption,
      amountVnd: Math.trunc(Number(amountVnd)),
      currency,
      status: 'PENDING',
      idempotencyKey,
      merchantTxnRef,
      providerTxnId: null,
      rawRequest: {
        redirectUrl,
        clientIp: String(clientIp || '').slice(0, 45),
        createdAt: now
      },
      rawResponse: null,
      createdAt: now,
      updatedAt: now
    };

    payments.push(record);
    writeJsonArrayAtomic(paymentsFile, payments);

    // Đánh dấu đơn đang trong luồng thanh toán thẻ
    const bookings = readJsonArraySafe(bookingsFile);
    const bIdx = bookings.findIndex((b) => matchesBookingIdentifier(b, bookingCode));
    if (bIdx !== -1) {
      bookings[bIdx].paymentMethod = 'visa';
      if (!bookings[bIdx].paymentStatus || bookings[bIdx].paymentStatus === 'UNPAID') {
        bookings[bIdx].paymentStatus = 'PROCESSING';
      }
      bookings[bIdx].updatedAt = now;
      writeJsonArrayAtomic(bookingsFile, bookings);
    }

    await syncIntentToSupabaseSafe(record).catch((err) =>
      logger.warn('Bỏ qua đồng bộ payment_intent lên Supabase:', err.message)
    );

    return { reused: false, payment: record };
  });
}

/**
 * Ghi log kiểm toán sự kiện IPN / Webhook (ẩn dữ liệu nhạy cảm)
 */
async function logPaymentEvent({
  paymentId,
  bookingId,
  eventType = 'ONEPAY_IPN',
  providerEventId = null,
  signatureValid = false,
  amountMatch = false,
  payload = {}
}) {
  return withMutex(async () => {
    const { eventsFile } = getDataPaths();
    const events = readJsonArraySafe(eventsFile);
    const entry = {
      id: `EVT_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      paymentId: paymentId || null,
      bookingId: bookingId || null,
      eventType,
      providerEventId: providerEventId ? String(providerEventId) : null,
      signatureValid: Boolean(signatureValid),
      amountMatch: Boolean(amountMatch),
      payload: sanitizeGatewayPayload(payload),
      createdAt: new Date().toISOString()
    };
    events.push(entry);
    writeJsonArrayAtomic(eventsFile, events);
    return entry;
  });
}

/**
 * Đánh dấu phiên thanh toán thất bại (chỉ cập nhật khi phiên chưa ở trạng thái PAID)
 */
async function markPaymentFailed(paymentId, rawResponse = {}, failureReason = '') {
  return withMutex(async () => {
    const { bookingsFile, paymentsFile } = getDataPaths();
    const payments = readJsonArraySafe(paymentsFile);
    const idx = payments.findIndex((p) => p && p.id === paymentId);
    if (idx === -1) return null;

    if (payments[idx].status === 'PAID') {
      return payments[idx];
    }

    const now = new Date().toISOString();
    payments[idx].status = 'FAILED';
    payments[idx].failureReason = failureReason || null;
    payments[idx].rawResponse = sanitizeGatewayPayload(rawResponse);
    payments[idx].updatedAt = now;
    writeJsonArrayAtomic(paymentsFile, payments);

    // Đưa trạng thái thanh toán của booking về UNPAID (nếu chưa thanh toán thành công bởi phiên khác)
    const bookings = readJsonArraySafe(bookingsFile);
    const bIdx = bookings.findIndex((b) => matchesBookingIdentifier(b, payments[idx].bookingCode));
    if (bIdx !== -1 && bookings[bIdx].paymentStatus !== 'PAID') {
      bookings[bIdx].paymentStatus = 'UNPAID';
      bookings[bIdx].updatedAt = now;
      writeJsonArrayAtomic(bookingsFile, bookings);
    }

    return payments[idx];
  });
}

/**
 * Xác nhận thanh toán thành công nguyên tử:
 * - Cập nhật `payments.status = 'PAID'`
 * - Cập nhật `bookings.paymentStatus = 'PAID'`, `bookings.status = 'confirmed'`
 * - Cộng `paidAmount`, tính lại `remainingAmount`
 * - Sinh mã `smartLockPin` 6 chữ số ngẫu nhiên an toàn (`crypto.randomInt`) nếu chưa có
 */
async function confirmPaymentAndBooking({
  paymentId,
  providerTxnId,
  amountVnd,
  rawResponse = {}
}) {
  return withMutex(async () => {
    const { bookingsFile, paymentsFile } = getDataPaths();
    const payments = readJsonArraySafe(paymentsFile);
    const pIdx = payments.findIndex((p) => p && p.id === paymentId);
    if (pIdx === -1) {
      const err = new Error('Không tìm thấy phiên thanh toán.');
      err.status = 404;
      throw err;
    }

    const payment = payments[pIdx];
    const bookings = readJsonArraySafe(bookingsFile);
    const bIdx = bookings.findIndex((b) => matchesBookingIdentifier(b, payment.bookingCode));
    if (bIdx === -1) {
      const err = new Error('Không tìm thấy đơn đặt phòng tương ứng với phiên thanh toán.');
      err.status = 404;
      throw err;
    }

    // Chống ghi nhận trùng lặp (Idempotent)
    if (payment.status === 'PAID') {
      return {
        alreadyPaid: true,
        payment,
        booking: bookings[bIdx]
      };
    }

    const now = new Date().toISOString();
    const sanitizedRaw = sanitizeGatewayPayload(rawResponse);

    payment.status = 'PAID';
    payment.providerTxnId = providerTxnId ? String(providerTxnId) : null;
    payment.rawResponse = sanitizedRaw;
    payment.paidAt = now;
    payment.updatedAt = now;

    const booking = bookings[bIdx];
    const paidIncrement = Math.trunc(Number(amountVnd));
    const totalPrice = Math.trunc(Number(booking.totalPrice || booking.total_amount || paidIncrement));
    const discountAmount = Math.trunc(Number(booking.discountAmount || 0));
    const netPayableTotal = Math.max(0, totalPrice - discountAmount);
    const previousPaid = booking.paymentStatus === 'PAID' ? Math.trunc(Number(booking.paidAmount || 0)) : 0;
    const newPaidAmount = Math.min(netPayableTotal, previousPaid + paidIncrement);
    const remainingAmount = Math.max(0, netPayableTotal - newPaidAmount);

    const existingPin = booking.smartLockPin || booking.smartlock_pin || '';
    const smartLockPin = /^\d{6}$/.test(String(existingPin))
      ? String(existingPin)
      : String(crypto.randomInt(0, 1000000)).padStart(6, '0');

    booking.status = 'confirmed';
    booking.paymentStatus = 'PAID';
    booking.paymentMethod = 'visa';
    booking.paidAmount = newPaidAmount;
    booking.remainingAmount = remainingAmount;
    booking.smartLockPin = smartLockPin;
    booking.paidAt = now;
    booking.confirmedAt = now;
    booking.updatedAt = now;

    writeJsonArrayAtomic(paymentsFile, payments);
    writeJsonArrayAtomic(bookingsFile, bookings);

    await syncConfirmToSupabaseSafe({
      merchantTxnRef: payment.merchantTxnRef,
      providerTxnId: payment.providerTxnId,
      amountVnd: paidIncrement,
      smartLockPin,
      rawPayload: sanitizedRaw
    }).catch((err) => logger.warn('Bỏ qua đồng bộ xác nhận OnePay lên Supabase:', err.message));

    return {
      alreadyPaid: false,
      payment,
      booking
    };
  });
}

/**
 * Đồng bộ tùy chọn lên Supabase `banla.payment_intents` (chỉ chạy khi có SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 */
async function syncIntentToSupabaseSafe(payment) {
  const sbUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!sbUrl || !serviceKey) return false;

  const lookupRes = await fetch(
    `${sbUrl}/rest/v1/bookings?booking_code=eq.${encodeURIComponent(payment.bookingCode)}&select=id`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Accept-Profile': 'banla'
      }
    }
  );
  if (!lookupRes.ok) return false;
  const rows = await lookupRes.json();
  if (!Array.isArray(rows) || !rows[0]?.id) return false;

  await fetch(`${sbUrl}/rest/v1/payment_intents`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'banla',
      'Content-Profile': 'banla',
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates'
    },
    body: JSON.stringify({
      booking_id: rows[0].id,
      booking_code: payment.bookingCode,
      provider: payment.provider,
      method: payment.method,
      payment_option: payment.paymentOption,
      amount_vnd: payment.amountVnd,
      currency: payment.currency,
      status: payment.status,
      idempotency_key: payment.idempotencyKey,
      merchant_txn_ref: payment.merchantTxnRef,
      raw_request: payment.rawRequest
    })
  });
  return true;
}

async function syncConfirmToSupabaseSafe({ merchantTxnRef, providerTxnId, amountVnd, smartLockPin, rawPayload }) {
  const sbUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!sbUrl || !serviceKey) return false;

  await fetch(`${sbUrl}/rest/v1/rpc/confirm_onepay_payment`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Accept-Profile': 'banla',
      'Content-Profile': 'banla',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_merchant_txn_ref: merchantTxnRef,
      p_provider_txn_id: providerTxnId || '',
      p_amount_vnd: amountVnd,
      p_pin: smartLockPin,
      p_raw_payload: rawPayload
    })
  });
  return true;
}

module.exports = {
  getDataPaths,
  findBookingByCode,
  findPaymentByIdempotencyKey,
  findPaymentByMerchantTxnRef,
  findLatestPaymentByBookingCode,
  hasProcessedEvent,
  createPaymentIntentRecord,
  logPaymentEvent,
  markPaymentFailed,
  confirmPaymentAndBooking
};

