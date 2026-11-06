/**
 * BANLA BOUTIQUE HOTEL — VISA / ONEPAY APPLICATION SERVICE (BUSINESS LOGIC LAYER)
 * Điều phối toàn bộ nghiệp vụ:
 * 1. Tạo phiên thanh toán OnePay Hosted Checkout (giá tính 100% ở Server, chống tạo trùng).
 * 2. Xác minh chữ ký `vpc_SecureHash` + đối chiếu số tiền + chống replay trên IPN/Webhook.
 * 3. Xử lý Return URL an toàn (KHÔNG tự ý đánh dấu đã trả tiền nếu chưa qua IPN xác thực).
 * 4. Tra cứu trạng thái giao dịch có bảo vệ mã Smart-Lock PIN khỏi tấn công dò mã (IDOR).
 */
'use strict';

const OnePayService = require('./onepay.service');
const repo = require('./visa.repository');
const { validateCreateIntentRequest, validateBookingCode } = require('./visa.validator');
const { resolveRoom, calculateStayPricing, normalizePaymentOption } = require('../../../shared/constants/rooms');
const { logger } = require('../../../utils/logger');

function cleanDigits(str) {
  return String(str || '').replace(/[^0-9]/g, '');
}

function doesContactMatchBooking(booking, rawContact) {
  if (!booking || !rawContact) return false;
  const contact = String(rawContact).trim().toLowerCase();
  if (!contact) return false;

  if (contact.includes('@')) {
    return Boolean(booking.email) && String(booking.email).trim().toLowerCase() === contact;
  }

  const targetPhone = cleanDigits(contact);
  if (targetPhone.length < 8) return false;
  const bookingPhone = cleanDigits(booking.phone);
  if (!bookingPhone) return false;
  return (
    bookingPhone === targetPhone ||
    bookingPhone.endsWith(targetPhone) ||
    targetPhone.endsWith(bookingPhone)
  );
}

/**
 * Tính toán lại số tiền cần thanh toán trên Server dựa trên thông tin phòng & số đêm lưu trú
 */
function computeAuthoritativePayableVnd(booking, paymentOptionOverride = null, roomsCatalog = null) {
  const roomObj = resolveRoom(booking.room, roomsCatalog);
  const unitPriceVnd = Number(booking.unitPrice) > 0 ? Number(booking.unitPrice) : roomObj.price;

  let nights = Number(booking.nights) || 1;
  if (booking.checkin && booking.checkout) {
    const diffDays = Math.round((Date.parse(booking.checkout) - Date.parse(booking.checkin)) / 86400000);
    if (diffDays >= 1 && diffDays <= 60) nights = diffDays;
  }

  const effectiveOption = normalizePaymentOption(paymentOptionOverride || booking.paymentOption || 'deposit_50');
  return {
    roomObj,
    pricing: calculateStayPricing({
      unitPriceVnd,
      nights,
      paymentOption: effectiveOption
    })
  };
}

/**
 * 1. Tạo phiên thanh toán thẻ quốc tế Visa / Mastercard / Amex / JCB qua OnePay
 */
async function createVisaPaymentIntent({
  body = {},
  query = {},
  clientIp = '127.0.0.1',
  baseUrl = '',
  roomsCatalog = null
}) {
  const validation = validateCreateIntentRequest({ body, query });
  if (!validation.valid) {
    const err = new Error(validation.message);
    err.status = validation.status;
    err.errorCode = validation.errorCode;
    err.isUserError = true;
    throw err;
  }

  const booking = repo.findBookingByCode(validation.bookingCode);
  if (!booking) {
    const err = new Error('Không tìm thấy đơn đặt phòng tương ứng.');
    err.status = 404;
    err.errorCode = 'BOOKING_NOT_FOUND';
    err.isUserError = true;
    throw err;
  }

  if (booking.status === 'cancelled' || booking.paymentStatus === 'REFUNDED') {
    const err = new Error('Đơn đặt phòng đã bị hủy hoặc hoàn tiền, không thể thanh toán.');
    err.status = 409;
    err.errorCode = 'BOOKING_NOT_PAYABLE';
    err.isUserError = true;
    throw err;
  }

  if (booking.paymentStatus === 'PAID') {
    const err = new Error('Đơn đặt phòng này đã được thanh toán thành công trước đó.');
    err.status = 409;
    err.errorCode = 'BOOKING_ALREADY_PAID';
    err.isUserError = true;
    throw err;
  }

  const { pricing } = computeAuthoritativePayableVnd(booking, validation.paymentOptionOverride, roomsCatalog);
  const amountVnd = pricing.amountDueVnd;

  if (amountVnd <= 0) {
    const err = new Error('Số tiền thanh toán không hợp lệ.');
    err.status = 422;
    err.errorCode = 'INVALID_AMOUNT';
    err.isUserError = true;
    throw err;
  }

  const canonicalCode = String(booking.bookingCode || booking.id).toUpperCase();

  // Kiểm tra phiên đang hoạt động để tái sử dụng (Idempotency chống bấm đúp)
  const latestPayment = repo.findLatestPaymentByBookingCode(canonicalCode);
  if (latestPayment) {
    if (latestPayment.status === 'PAID') {
      const err = new Error('Đơn đặt phòng này đã được thanh toán thành công.');
      err.status = 409;
      err.errorCode = 'BOOKING_ALREADY_PAID';
      err.isUserError = true;
      throw err;
    }

    if (
      (latestPayment.status === 'PENDING' || latestPayment.status === 'PROCESSING') &&
      latestPayment.amountVnd === amountVnd &&
      latestPayment.paymentOption === pricing.paymentOption &&
      latestPayment.rawRequest?.redirectUrl
    ) {
      return {
        reused: true,
        booking_code: canonicalCode,
        booking_id: booking.id,
        payment_id: latestPayment.id,
        payment_status: latestPayment.status,
        payment_option: latestPayment.paymentOption,
        amount_vnd: amountVnd,
        currency: 'VND',
        merchant_txn_ref: latestPayment.merchantTxnRef,
        redirect_url: latestPayment.rawRequest.redirectUrl
      };
    }
  }

  const cfg = OnePayService.getOnePayConfig(baseUrl ? { appBaseUrl: baseUrl } : {});
  const effectiveBaseUrl = String(cfg.appBaseUrl || baseUrl || '').replace(/\/+$/, '');
  const returnUrl = effectiveBaseUrl ? `${effectiveBaseUrl}/api/payments/onepay/return` : '';

  const gatewaySession = OnePayService.createPaymentUrl({
    bookingCode: canonicalCode,
    amountVnd,
    clientIp,
    returnUrl,
    configOverrides: effectiveBaseUrl ? { appBaseUrl: effectiveBaseUrl } : {}
  });

  // Nếu phiên trước đã FAILED/CANCELLED, tạo khóa idempotency mới gắn mã tham chiếu phiên mới để cho phép khách thử lại
  const baseIdempKey = `${canonicalCode}:${pricing.paymentOption}:${amountVnd}:CARD`;
  const existingByBase = repo.findPaymentByIdempotencyKey(baseIdempKey);
  const idempotencyKey =
    existingByBase && (existingByBase.status === 'FAILED' || existingByBase.status === 'CANCELLED')
      ? `${baseIdempKey}:${gatewaySession.merchantTxnRef}`
      : baseIdempKey;

  const { reused, payment } = await repo.createPaymentIntentRecord({
    bookingId: booking.id,
    bookingCode: canonicalCode,
    provider: 'ONEPAY',
    method: 'CARD',
    paymentOption: pricing.paymentOption,
    amountVnd,
    currency: 'VND',
    idempotencyKey,
    merchantTxnRef: gatewaySession.merchantTxnRef,
    redirectUrl: gatewaySession.redirectUrl,
    clientIp
  });

  logger.info('Khởi tạo phiên thanh toán thẻ OnePay thành công', {
    payment_id: payment.id,
    booking_code: canonicalCode,
    merchant_txn_ref: payment.merchantTxnRef,
    amount_vnd: amountVnd,
    reused
  });

  return {
    reused,
    booking_code: canonicalCode,
    booking_id: booking.id,
    payment_id: payment.id,
    payment_status: payment.status,
    payment_option: payment.paymentOption,
    amount_vnd: amountVnd,
    currency: 'VND',
    merchant_txn_ref: payment.merchantTxnRef,
    redirect_url: payment.rawRequest?.redirectUrl || gatewaySession.redirectUrl
  };
}

/**
 * 2. Xử lý IPN / Webhook từ cổng OnePay (nguồn chân lý duy nhất xác nhận tiền về)
 */
async function processOnePayWebhook({ params = {}, onBookingConfirmed = null }) {
  const merchantTxnRef = String(params?.vpc_MerchTxnRef || '').trim();
  const providerTxnId = params?.vpc_TransactionNo ? String(params.vpc_TransactionNo).trim() : null;

  if (!merchantTxnRef) {
    const err = new Error('Thiếu mã tham chiếu giao dịch (vpc_MerchTxnRef).');
    err.status = 400;
    err.errorCode = 'MISSING_MERCH_TXN_REF';
    err.isUserError = true;
    throw err;
  }

  const cfg = OnePayService.getOnePayConfig();
  if (!cfg.configured) {
    const err = new Error('Cổng thanh toán OnePay chưa được cấu hình khóa xác thực trên máy chủ.');
    err.status = 503;
    err.errorCode = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const signatureValid = OnePayService.verifySecureHash(params, cfg.secureSecret);
  const payment = repo.findPaymentByMerchantTxnRef(merchantTxnRef);

  if (!payment) {
    if (!signatureValid) {
      const err = new Error('Chữ ký bảo mật vpc_SecureHash không hợp lệ.');
      err.status = 400;
      err.errorCode = 'INVALID_SIGNATURE';
      err.isUserError = true;
      throw err;
    }
    logger.warn('Nhận IPN OnePay nhưng không tìm thấy phiên thanh toán', { merchant_txn_ref: merchantTxnRef });
    const err = new Error('Không tìm thấy giao dịch thanh toán tương ứng.');
    err.status = 404;
    err.errorCode = 'PAYMENT_NOT_FOUND';
    err.isUserError = true;
    throw err;
  }

  const returnedAmountVnd = OnePayService.getAmountVnd(params);
  const amountMatch = returnedAmountVnd === Number(payment.amountVnd);

  // Chống xử lý lặp nếu cùng một mã giao dịch OnePay đã được xác thực thành công trước đó
  if (signatureValid && amountMatch && providerTxnId && repo.hasProcessedEvent(providerTxnId, 'ONEPAY_IPN')) {
    return {
      idempotent: true,
      vpc_ResponseCode: '0',
      response_text: 'responsecode=1&desc=confirm-success',
      payment_status: payment.status,
      booking_code: payment.bookingCode,
      message: 'Sự kiện IPN đã được xử lý trước đó.'
    };
  }

  await repo.logPaymentEvent({
    paymentId: payment.id,
    bookingId: payment.bookingId,
    eventType: 'ONEPAY_IPN',
    providerEventId: providerTxnId,
    signatureValid,
    amountMatch,
    payload: params
  });

  if (!signatureValid) {
    await repo.markPaymentFailed(payment.id, params, 'INVALID_SIGNATURE');
    logger.warn('Cảnh báo bảo mật: Chữ ký OnePay vpc_SecureHash không hợp lệ', {
      merchant_txn_ref: merchantTxnRef
    });
    const err = new Error('Chữ ký bảo mật (vpc_SecureHash) không hợp lệ.');
    err.status = 400;
    err.errorCode = 'INVALID_SIGNATURE';
    err.isUserError = true;
    throw err;
  }

  if (!amountMatch) {
    await repo.markPaymentFailed(payment.id, params, 'AMOUNT_MISMATCH');
    logger.warn('Cảnh báo bảo mật: Sai lệch số tiền IPN OnePay', {
      merchant_txn_ref: merchantTxnRef,
      expected_vnd: payment.amountVnd,
      received_vnd: returnedAmountVnd
    });
    const err = new Error('Số tiền giao dịch trả về không khớp với đơn đặt phòng.');
    err.status = 400;
    err.errorCode = 'AMOUNT_MISMATCH';
    err.isUserError = true;
    throw err;
  }

  if (!OnePayService.isSuccessful(params)) {
    const code = String(params?.vpc_TxnResponseCode || '');
    await repo.markPaymentFailed(payment.id, params, `ONEPAY_CODE_${code}`);
    return {
      idempotent: false,
      vpc_ResponseCode: '0',
      response_text: 'responsecode=1&desc=confirm-success',
      payment_status: 'FAILED',
      booking_status: 'pending',
      booking_code: payment.bookingCode,
      reason: OnePayService.describeResponseCode(code),
      message: 'Đã ghi nhận kết quả giao dịch không thành công.'
    };
  }

  if (payment.status === 'PAID') {
    return {
      idempotent: true,
      vpc_ResponseCode: '0',
      response_text: 'responsecode=1&desc=confirm-success',
      payment_status: 'PAID',
      booking_status: 'CONFIRMED',
      booking_code: payment.bookingCode,
      message: 'Giao dịch đã ở trạng thái PAID trước đó.'
    };
  }

  const { alreadyPaid, booking } = await repo.confirmPaymentAndBooking({
    paymentId: payment.id,
    providerTxnId,
    amountVnd: payment.amountVnd,
    rawResponse: params
  });

  if (!alreadyPaid && typeof onBookingConfirmed === 'function') {
    Promise.resolve(onBookingConfirmed(booking)).catch((err) =>
      logger.error('Lỗi gửi thông báo xác nhận sau IPN OnePay', err)
    );
  }

  logger.info('Đã xác thực IPN OnePay & kích hoạt giữ phòng thành công', {
    merchant_txn_ref: merchantTxnRef,
    booking_code: payment.bookingCode,
    amount_vnd: payment.amountVnd
  });

  return {
    idempotent: alreadyPaid,
    vpc_ResponseCode: '0',
    response_text: 'responsecode=1&desc=confirm-success',
    payment_status: 'PAID',
    booking_status: 'CONFIRMED',
    booking_code: payment.bookingCode,
    paid_vnd: booking.paidAmount,
    remaining_vnd: booking.remainingAmount,
    message: 'Đã xác nhận thanh toán và giữ phòng thành công.'
  };
}

/**
 * 3. Phân giải tham số khi trình duyệt khách hàng quay về từ OnePay Return URL
 * TUYỆT ĐỐI KHÔNG đánh dấu PAID tại bước này (chỉ đọc trạng thái đã được IPN xác nhận hoặc báo đang xử lý).
 */
function resolveOnePayReturnRedirect(query = {}) {
  const merchantTxnRef = String(query?.vpc_MerchTxnRef || '').trim();
  const rawTxnCode = String(query?.vpc_TxnResponseCode || '').trim();

  if (!merchantTxnRef) {
    return '/payment-result.html?state=not_found';
  }

  const payment = repo.findPaymentByMerchantTxnRef(merchantTxnRef);
  if (!payment) {
    return `/payment-result.html?state=not_found&merchant_txn_ref=${encodeURIComponent(merchantTxnRef)}`;
  }

  const cfg = OnePayService.getOnePayConfig();
  let hashTrusted = false;
  if (cfg.configured && query.vpc_SecureHash) {
    hashTrusted = OnePayService.verifySecureHash(query, cfg.secureSecret);
  }

  let uiState = 'failed';
  if (payment.status === 'PAID') {
    uiState = 'success';
  } else if (rawTxnCode === '0' && hashTrusted) {
    uiState = 'processing';
  } else if (rawTxnCode === '0' && !query.vpc_SecureHash) {
    uiState = 'processing';
  }

  const qs = new URLSearchParams({
    booking_id: payment.bookingCode,
    merchant_txn_ref: payment.merchantTxnRef,
    state: uiState
  });
  if (rawTxnCode) {
    qs.set('txn_code', rawTxnCode.slice(0, 12));
  }

  return `/payment-result.html?${qs.toString()}`;
}

/**
 * 4. Tra cứu trạng thái thanh toán của đơn đặt phòng
 * Chỉ trả mã `smart_lock_pin` khi đơn đã `PAID` VÀ người gọi chứng minh được phiên (`merchant_txn_ref` khớp hoặc `contact` SĐT/Email khớp).
 */
function getBookingPaymentStatus({ bookingCodeRaw, merchantTxnRef = '', contact = '' }) {
  let payment = null;
  let booking = null;

  const cleanRef = String(merchantTxnRef || '').trim();
  if (cleanRef) {
    payment = repo.findPaymentByMerchantTxnRef(cleanRef);
    if (payment) {
      booking = repo.findBookingByCode(payment.bookingCode);
    }
  }

  if (!booking && bookingCodeRaw) {
    const { valid, code } = validateBookingCode(bookingCodeRaw);
    if (!valid) {
      const err = new Error('Mã đặt phòng không hợp lệ.');
      err.status = 400;
      err.errorCode = 'INVALID_BOOKING_CODE';
      err.isUserError = true;
      throw err;
    }
    booking = repo.findBookingByCode(code);
    if (booking && !payment) {
      payment = repo.findLatestPaymentByBookingCode(booking.bookingCode || booking.id);
    }
  }

  if (!booking) {
    const err = new Error('Không tìm thấy đơn đặt phòng hoặc phiên giao dịch.');
    err.status = 404;
    err.errorCode = 'BOOKING_NOT_FOUND';
    err.isUserError = true;
    throw err;
  }

  const isConfirmedPaid = booking.paymentStatus === 'PAID' && booking.status === 'confirmed';
  const refVerified = Boolean(payment && cleanRef && payment.merchantTxnRef === cleanRef);
  const contactVerified = doesContactMatchBooking(booking, contact);
  const canRevealPin = isConfirmedPaid && (refVerified || contactVerified);

  const totalPrice = Number(booking.totalPrice) || 0;
  const discountAmount = Number(booking.discountAmount) || 0;
  const paidVnd = Number(booking.paidAmount) || 0;
  const netTotal = Math.max(0, totalPrice - discountAmount);
  const remainingVnd = booking.remainingAmount !== undefined
    ? Number(booking.remainingAmount)
    : Math.max(0, netTotal - paidVnd);

  const rawCode = payment?.rawResponse?.vpc_TxnResponseCode || '';
  const failureMessage =
    payment?.status === 'FAILED'
      ? OnePayService.describeResponseCode(rawCode || '99')
      : null;

  return {
    booking_code: String(booking.bookingCode || booking.id).toUpperCase(),
    booking_id: booking.id,
    room_name: booking.room || 'Banla Signature',
    check_in: booking.checkin || '',
    check_out: booking.checkout || '',
    nights: Number(booking.nights) || 1,
    guests: Number(booking.guests) || 2,
    payment_option: booking.paymentOption || 'deposit_50',
    payment_method: booking.paymentMethod || (payment ? 'visa' : 'vietqr'),
    booking_status: isConfirmedPaid ? 'CONFIRMED' : String(booking.status || 'pending').toUpperCase(),
    payment_status: payment ? payment.status : (isConfirmedPaid ? 'PAID' : 'NOT_STARTED'),
    total_vnd: totalPrice,
    discount_vnd: discountAmount,
    amount_due_vnd: Number(booking.depositAmount) || netTotal,
    paid_vnd: paidVnd,
    remaining_vnd: remainingVnd,
    failure_message: failureMessage,
    smart_lock_pin: canRevealPin ? (booking.smartLockPin || null) : null,
    pin_requires_verification: isConfirmedPaid && !canRevealPin
  };
}

module.exports = {
  computeAuthoritativePayableVnd,
  createVisaPaymentIntent,
  processOnePayWebhook,
  resolveOnePayReturnRedirect,
  getBookingPaymentStatus
};
