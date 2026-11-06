/**
 * BANLA BOUTIQUE HOTEL — VISA / ONEPAY INPUT VALIDATOR & PCI DSS GUARD
 * Tuyệt đối từ chối mọi request có dấu hiệu gửi dữ liệu thẻ thô (PAN, CVV, Expiry)
 * về máy chủ Banla.
 */
'use strict';

const FORBIDDEN_CARD_KEYS = new Set([
  'cardnumber',
  'pan',
  'primaryaccountnumber',
  'cvv',
  'cvc',
  'cvv2',
  'csc',
  'securitycode',
  'cardexpiry',
  'expiry',
  'expirydate',
  'expirationdate',
  'expmonth',
  'expyear',
  'pinblock',
  'trackdata',
  'magneticstripe'
]);

function normalizeKeyName(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Kiểm tra đệ quy payload client gửi lên để chặn đứng việc truyền số thẻ / CVV / Expiry.
 * Trả về tên trường vi phạm đầu tiên nếu phát hiện, ngược lại trả về null.
 */
function findForbiddenCardField(payload, depth = 0) {
  if (!payload || typeof payload !== 'object' || depth > 5) return null;

  for (const [key, value] of Object.entries(payload)) {
    const normalized = normalizeKeyName(key);
    if (FORBIDDEN_CARD_KEYS.has(normalized)) {
      return key;
    }
    if (value && typeof value === 'object') {
      const nested = findForbiddenCardField(value, depth + 1);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Loại bỏ các trường nhạy cảm của cổng thanh toán trước khi ghi vào nhật ký / CSDL
 * (Ví dụ: `vpc_CardNum` che số thẻ, `vpc_SecureHash` chữ ký phiên).
 */
function sanitizeGatewayPayload(params) {
  if (!params || typeof params !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    const norm = normalizeKeyName(key);
    if (FORBIDDEN_CARD_KEYS.has(norm) || norm === 'vpccardnum' || norm === 'cardnum') {
      continue;
    }
    if (key === 'vpc_SecureHash') {
      clean[key] = '[VERIFIED_HASH_REDACTED]';
      continue;
    }
    clean[key] = typeof value === 'string' ? value.slice(0, 512) : value;
  }
  return clean;
}

function validateBookingCode(rawCode) {
  const code = String(rawCode || '').trim().replace(/^#+/, '').toUpperCase();
  if (!/^[A-Z0-9_-]{4,64}$/.test(code)) {
    return { valid: false, code: '' };
  }
  return { valid: true, code };
}

function validateCreateIntentRequest({ body = {}, query = {} }) {
  const forbiddenInBody = findForbiddenCardField(body);
  if (forbiddenInBody) {
    return {
      valid: false,
      status: 400,
      errorCode: 'FORBIDDEN_CARD_DATA',
      message: `Hệ thống Banla tuân thủ chuẩn PCI DSS và tuyệt đối không nhận trường dữ liệu thẻ (${forbiddenInBody}). Quý khách chỉ nhập thẻ trực tiếp trên trang cổng thanh toán bảo mật.`
    };
  }

  const forbiddenInQuery = findForbiddenCardField(query);
  if (forbiddenInQuery) {
    return {
      valid: false,
      status: 400,
      errorCode: 'FORBIDDEN_CARD_DATA',
      message: `Hệ thống Banla tuyệt đối không nhận trường dữ liệu thẻ (${forbiddenInQuery}).`
    };
  }

  const rawBookingCode = body.booking_id || body.bookingId || body.booking_code || body.bookingCode || query.booking_code || query.booking_id || '';
  const { valid: codeOk, code: bookingCode } = validateBookingCode(rawBookingCode);
  if (!codeOk) {
    return {
      valid: false,
      status: 400,
      errorCode: 'INVALID_BOOKING_CODE',
      message: 'Mã đặt phòng (booking_id / booking_code) không hợp lệ hoặc bị thiếu.'
    };
  }

  const rawPlan = body.payment_option || body.paymentOption || body.payment_plan || body.paymentPlan || '';
  if (rawPlan !== '') {
    const p = String(rawPlan).trim().toLowerCase();
    if (!['deposit_50', 'pay_100', 'full_100'].includes(p)) {
      return {
        valid: false,
        status: 422,
        errorCode: 'INVALID_PAYMENT_OPTION',
        message: 'Hình thức thanh toán không hợp lệ. Chỉ chấp nhận deposit_50 hoặc pay_100.'
      };
    }
  }

  return {
    valid: true,
    bookingCode,
    paymentOptionOverride: rawPlan ? String(rawPlan).trim() : null
  };
}

module.exports = {
  FORBIDDEN_CARD_KEYS,
  findForbiddenCardField,
  sanitizeGatewayPayload,
  validateBookingCode,
  validateCreateIntentRequest
};

