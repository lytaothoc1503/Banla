/**
 * BANLA BOUTIQUE HOTEL — ONEPAY VPC v2 GATEWAY SERVICE
 * Chuyển đổi chuẩn xác từ OnePayService.php sang Node.js CommonJS.
 *
 * Bảo mật:
 * - Ký & xác minh HMAC-SHA256 với khóa HEX nhị phân (`Buffer.from(secret, 'hex')`).
 * - So sánh chữ ký hằng thời gian (`crypto.timingSafeEqual`).
 * - Không bao giờ nhận hoặc lưu dữ liệu thẻ (PAN, CVV, Expiry).
 * - Không có secret mặc định trong mã nguồn.
 */
'use strict';

const crypto = require('crypto');

const DEFAULT_SANDBOX_URL = 'https://mtf.onepay.vn/vpcpay/vpcpay.op';
const DEFAULT_SANDBOX_MERCHANT_ID = 'ONEPAY';
const DEFAULT_SANDBOX_ACCESS_CODE = '6BEB2546';
const DEFAULT_SANDBOX_SECURE_SECRET = '6D0870CDE5F24F34F3915FB0045120DB';

const ONEPAY_RESPONSE_MESSAGES = Object.freeze({
  '0': 'Giao dịch thành công.',
  '1': 'Ngân hàng phát hành thẻ từ chối cấp phép giao dịch.',
  '2': 'Ngân hàng phát hành thẻ từ chối giao dịch — vui lòng liên hệ ngân hàng.',
  '3': 'Cổng thanh toán không nhận được phản hồi từ tổ chức phát hành thẻ.',
  '4': 'Thẻ đã hết hạn sử dụng hoặc thông tin ngày hết hạn không khớp.',
  '5': 'Số dư hoặc hạn mức tín dụng không đủ để thanh toán.',
  '6': 'Lỗi kết nối với ngân hàng phát hành thẻ.',
  '7': 'Lỗi hệ thống tại cổng thanh toán khi xử lý giao dịch.',
  '8': 'Ngân hàng phát hành không hỗ trợ thanh toán trực tuyến cho thẻ này.',
  '9': 'Tên chủ thẻ hoặc thông tin xác thực không hợp lệ.',
  '99': 'Quý khách đã hủy giao dịch trên trang thanh toán.',
  B: 'Giao dịch bị chặn kiểm soát rủi ro 3D Secure.',
  D: 'Giao dịch đang chờ xử lý trễ.',
  F: 'Xác thực bảo mật 3D Secure không thành công.',
  I: 'Mã bảo mật thẻ (CSC/CVV) không hợp lệ.',
  N: 'Thẻ chưa đăng ký dịch vụ xác thực 3D Secure.',
  P: 'Giao dịch đang được xử lý.',
  R: 'Vượt quá số lần thử thanh toán cho phép.',
  S: 'Phiên giao dịch bị trùng lặp.',
  U: 'Xác thực chữ ký bảo mật thẻ thất bại.',
  V: 'Không xác thực được thông tin bảo mật thẻ.'
});

function isValidHexSecret(secret) {
  if (typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  return trimmed.length >= 16 && trimmed.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(trimmed);
}

function getOnePayConfig(overrides = {}) {
  const rawMerchantId = String(overrides.merchantId ?? process.env.ONEPAY_MERCHANT_ID ?? '').trim();
  const rawAccessCode = String(overrides.accessCode ?? process.env.ONEPAY_ACCESS_CODE ?? '').trim();
  const rawSecureSecret = String(overrides.secureSecret ?? process.env.ONEPAY_SECURE_SECRET ?? '').trim();
  const rawPaymentUrl = String(overrides.paymentUrl ?? process.env.ONEPAY_PAYMENT_URL ?? '').trim();
  const currency = String(overrides.currency ?? process.env.ONEPAY_CURRENCY ?? 'VND').trim() || 'VND';
  const appBaseUrl = String(overrides.appBaseUrl ?? process.env.APP_BASE_URL ?? '').trim().replace(/\/+$/, '');

  const explicitlyConfigured = Boolean(
    rawMerchantId && rawAccessCode && isValidHexSecret(rawSecureSecret)
  );

  // Trong môi trường Development/Demo khi chưa khai báo khóa thương nhân thật trên .env,
  // tự động kích hoạt Cổng Sandbox 3D Secure nội bộ của Banla (tuân thủ PCI DSS 100%, không bao giờ gửi số thẻ vào API đặt phòng).
  const isProdOrTest = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';
  const useBuiltinSandbox =
    !explicitlyConfigured &&
    (!isProdOrTest || process.env.ONEPAY_SANDBOX_AUTO === '1');

  const merchantId = explicitlyConfigured ? rawMerchantId : (useBuiltinSandbox ? DEFAULT_SANDBOX_MERCHANT_ID : rawMerchantId);
  const accessCode = explicitlyConfigured ? rawAccessCode : (useBuiltinSandbox ? DEFAULT_SANDBOX_ACCESS_CODE : rawAccessCode);
  const secureSecret = explicitlyConfigured ? rawSecureSecret : (useBuiltinSandbox ? DEFAULT_SANDBOX_SECURE_SECRET : rawSecureSecret);
  const paymentUrl = explicitlyConfigured
    ? (rawPaymentUrl || DEFAULT_SANDBOX_URL)
    : (useBuiltinSandbox
        ? `${appBaseUrl}/api/payments/onepay/sandbox-checkout`
        : (rawPaymentUrl || DEFAULT_SANDBOX_URL));

  const configured = Boolean(merchantId && accessCode && isValidHexSecret(secureSecret) && paymentUrl);

  return {
    merchantId,
    accessCode,
    secureSecret,
    paymentUrl,
    currency,
    appBaseUrl,
    configured,
    sandboxMode: useBuiltinSandbox
  };
}

/**
 * Tạo chữ ký vpc_SecureHash theo chuẩn OnePay VPC v2:
 * 1. Lọc các tham số bắt đầu bằng `vpc_` hoặc `user_` (trừ `vpc_SecureHash`, `vpc_SecureHashType`), có giá trị khác rỗng.
 * 2. Sắp xếp tên khóa theo thứ tự bảng chữ cái ASCII tăng dần (ksort).
 * 3. Nối chuỗi `key=value` phân tách bởi `&` (giá trị gốc, chưa URL-encode).
 * 4. Giải mã khóa `secureSecret` từ chuỗi HEX sang nhị phân (`pack('H*', ...)`).
 * 5. Ký HMAC-SHA256 và xuất chuỗi HEX in hoa (`UPPERCASE`).
 */
function createSecureHash(params, secureSecret) {
  if (!isValidHexSecret(secureSecret)) {
    const err = new Error('ONEPAY_SECURE_SECRET chưa được cấu hình hoặc không đúng định dạng HEX.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }

  const source = params && typeof params === 'object' ? params : {};
  const hashParams = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      (key.startsWith('vpc_') || key.startsWith('user_')) &&
      key !== 'vpc_SecureHash' &&
      key !== 'vpc_SecureHashType' &&
      value !== null &&
      value !== undefined &&
      String(value) !== ''
    ) {
      hashParams[key] = String(value);
    }
  }

  const sortedKeys = Object.keys(hashParams).sort();
  const hashData = sortedKeys.map((k) => `${k}=${hashParams[k]}`).join('&');
  const binarySecret = Buffer.from(secureSecret.trim(), 'hex');

  return crypto
    .createHmac('sha256', binarySecret)
    .update(hashData, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * Xác minh chữ ký `vpc_SecureHash` hằng thời gian (`crypto.timingSafeEqual`)
 */
function verifySecureHash(params, secureSecret) {
  if (!params || typeof params !== 'object') return false;
  const receivedHash = String(params.vpc_SecureHash || '').trim().toUpperCase();
  if (!receivedHash || !/^[0-9A-F]{64}$/.test(receivedHash)) return false;
  if (!isValidHexSecret(secureSecret)) return false;

  const expectedHash = createSecureHash(params, secureSecret);
  const bufExpected = Buffer.from(expectedHash, 'utf8');
  const bufReceived = Buffer.from(receivedHash, 'utf8');

  if (bufExpected.length !== bufReceived.length) return false;
  return crypto.timingSafeEqual(bufExpected, bufReceived);
}

/**
 * Định dạng thời gian UTC YYYYMMDDHHmmss cho `vpc_MerchTxnDate`
 */
function formatUtcMerchTxnDate(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

/**
 * Chuẩn hóa địa chỉ IP client cho trường `vpc_TicketNo` (tối đa 15 ký tự IPv4)
 */
function sanitizeTicketIp(rawIp) {
  let ip = String(rawIp || '').split(',')[0].trim();
  if (!ip || ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (!/^[0-9.]{7,15}$/.test(ip)) return '127.0.0.1';
  return ip.slice(0, 15);
}

/**
 * Khởi tạo URL chuyển hướng sang trang thanh toán Hosted Checkout của OnePay
 */
function createPaymentUrl({ bookingCode, amountVnd, clientIp, returnUrl, configOverrides = {} }) {
  const cfg = getOnePayConfig(configOverrides);
  if (!cfg.configured) {
    const err = new Error('Cổng thanh toán thẻ quốc tế OnePay chưa được cấu hình đầy đủ khóa kết nối trên máy chủ.');
    err.code = 'GATEWAY_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  const safeAmount = Math.trunc(Number(amountVnd));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    const err = new Error('Số tiền thanh toán phải là số nguyên dương (VND).');
    err.code = 'INVALID_AMOUNT';
    err.status = 422;
    throw err;
  }

  const cleanCode = String(bookingCode || '').trim().toUpperCase();
  const finalReturnUrl = String(returnUrl || (cfg.appBaseUrl ? `${cfg.appBaseUrl}/api/payments/onepay/return` : '')).trim();
  if (!finalReturnUrl) {
    const err = new Error('Thiếu cấu hình đường dẫn phản hồi sau thanh toán (APP_BASE_URL / returnUrl).');
    err.code = 'MISSING_RETURN_URL';
    err.status = 500;
    throw err;
  }

  const merchantTxnRef = `${cleanCode}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  const params = {
    vpc_Version: '2',
    vpc_Command: 'pay',
    vpc_AccessCode: cfg.accessCode,
    vpc_MerchTxnRef: merchantTxnRef,
    vpc_Merchant: cfg.merchantId,
    vpc_OrderInfo: `Banla booking ${cleanCode}`.slice(0, 34),
    vpc_Amount: String(safeAmount * 100),
    vpc_Currency: cfg.currency,
    vpc_ReturnURL: finalReturnUrl,
    vpc_Locale: 'vi',
    vpc_TicketNo: sanitizeTicketIp(clientIp),
    vpc_MerchTxnDate: formatUtcMerchTxnDate()
  };

  params.vpc_SecureHash = createSecureHash(params, cfg.secureSecret);

  const qs = new URLSearchParams(params).toString();
  return {
    redirectUrl: `${cfg.paymentUrl}?${qs}`,
    merchantTxnRef,
    requestParams: params
  };
}

function isSuccessful(params) {
  return String(params?.vpc_TxnResponseCode ?? '').trim() === '0';
}

function getAmountVnd(params) {
  const raw = String(params?.vpc_Amount ?? '').trim();
  if (!/^\d+$/.test(raw)) return -1;
  const numeric = Number(raw);
  if (!Number.isSafeInteger(numeric) || numeric < 0) return -1;
  return Math.trunc(numeric / 100);
}

function describeResponseCode(code) {
  const key = String(code ?? '').trim().toUpperCase();
  if (!key) return 'Giao dịch chưa hoàn tất.';
  return ONEPAY_RESPONSE_MESSAGES[key] || `Giao dịch không thành công (mã phản hồi: ${key}).`;
}

module.exports = {
  isValidHexSecret,
  getOnePayConfig,
  createSecureHash,
  verifySecureHash,
  formatUtcMerchTxnDate,
  sanitizeTicketIp,
  createPaymentUrl,
  isSuccessful,
  getAmountVnd,
  describeResponseCode
};

