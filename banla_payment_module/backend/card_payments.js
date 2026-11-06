/**
 * Thanh toán thẻ Visa / tín dụng / ghi nợ qua trang host của PayPal và OnePay.
 * Banla không nhận, không log, không lưu số thẻ, ngày hết hạn hay CVV.
 * Chỉ lưu mã đơn cổng, số tiền, loại tiền, trạng thái và metadata không nhạy cảm.
 * Đơn chỉ được ghi nhận đã thanh toán sau khi đối chiếu đúng số tiền, loại tiền và mã đơn.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { logger } = require('../../utils/logger');

const CURRENCY = 'VND';
const CHECKOUT_REUSE_MS = 15 * 60 * 1000;
const RECORD_FIELDS = [
  'id', 'bookingId', 'provider', 'providerOrderId', 'providerCaptureId',
  'orderInfo', 'amount', 'currency', 'status', 'redirectUrl',
  'createdAt', 'updatedAt', 'expiresAt', 'paidAt'
];
const FORBIDDEN_KEY = /^(pan|cardnumber|card_number|card_no|cardnum|ccnumber|cc_number|cvv|cvc|cid|expiry|expiration|exp_month|exp_year|expmonth|expyear|vpc_cardnum|vpc_cardnumber)$/i;

class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.isUserError = true;
    this.status = status;
  }
}

let fetchImpl = (...args) => globalThis.fetch(...args);
let tokenCache = { key: '', token: '', exp: 0 };
let tail = Promise.resolve();

function setFetch(fn) {
  fetchImpl = fn || ((...args) => globalThis.fetch(...args));
  tokenCache = { key: '', token: '', exp: 0 };
}

function withLock(fn) {
  const run = tail.then(fn, fn);
  tail = run.then(() => undefined, () => undefined);
  return run;
}

function paymentMode() {
  const mode = String(process.env.CARD_PAYMENT_MODE || 'sandbox').trim().toLowerCase();
  return mode === 'live' ? 'live' : 'sandbox';
}

function paymentsFile() {
  return process.env.CARD_PAYMENTS_FILE
    || path.join(__dirname, '..', '..', 'data', 'card_payments.json');
}

function bookingsFile() {
  return process.env.BOOKINGS_FILE
    || path.join(__dirname, '..', '..', 'data', 'bookings.json');
}

function readArray(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const content = fs.readFileSync(file, 'utf8').trim();
    if (!content) return [];
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.error('Đọc dữ liệu thanh toán thẻ lỗi', err);
    return [];
  }
}

function writeArray(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function pickRecord(record) {
  const out = {};
  for (const key of RECORD_FIELDS) {
    if (record[key] !== undefined && record[key] !== null) out[key] = record[key];
  }
  return out;
}

function containsForbiddenCardField(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) return true;
    if (containsForbiddenCardField(child)) return true;
  }
  return false;
}

function invoiceAmount(booking) {
  const n = Number(booking && booking.depositAmount);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

function orderInfoFromBooking(id) {
  const clean = String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 34);
  if (!clean) throw new PaymentError('Mã đơn không hợp lệ.');
  return clean;
}

function newPaymentId() {
  return `p${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function findBooking(bookingId) {
  const id = String(bookingId || '').replace(/^#+/, '').trim().toLowerCase();
  if (!id) return null;
  return readArray(bookingsFile()).find((b) => b && String(b.id).toLowerCase() === id) || null;
}

function isSettled(booking) {
  if (!booking) return false;
  const status = booking.paymentStatus;
  return (status === 'PAID' || status === 'DEPOSIT_PAID') && Number(booking.paidAmount) > 0;
}

function amountsEqual(expectedAmount, expectedCurrency, paidValue, paidCurrency) {
  if (String(expectedCurrency || '').toUpperCase() !== String(paidCurrency || '').toUpperCase()) return false;
  const norm = (value) => {
    const s = String(value).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const [whole, frac = ''] = s.split('.');
    if ([...frac].some((digit) => digit !== '0')) return null;
    return whole.replace(/^0+(?=\d)/, '') || '0';
  };
  const left = norm(expectedAmount);
  const right = norm(paidValue);
  return left !== null && left === right;
}

function invoiceToVpcAmount(amount) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const vpc = `${amount}00`;
  if (vpc.length > 12) return null;
  return vpc;
}

function vpcAmountToMajor(vpcAmount) {
  const s = String(vpcAmount || '');
  if (!/^\d{3,12}$/.test(s) || !s.endsWith('00')) return null;
  const major = Number(s.slice(0, -2));
  if (!Number.isSafeInteger(major) || major <= 0) return null;
  return major;
}

function hmacKey(secret) {
  const trimmed = String(secret || '').trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex');
  }
  return Buffer.from(trimmed, 'utf8');
}

function signOnePay(params, secret) {
  const keys = Object.keys(params)
    .filter((key) => (key.startsWith('vpc_') || key.startsWith('user_'))
      && key !== 'vpc_SecureHash'
      && key !== 'vpc_SecureHashType'
      && params[key] !== undefined
      && params[key] !== null
      && String(params[key]).length > 0)
    .sort();
  const data = keys.map((key) => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', hmacKey(secret)).update(data, 'utf8').digest('hex').toUpperCase();
}

function safeEqualHex(a, b) {
  const left = Buffer.from(String(a || '').toUpperCase());
  const right = Buffer.from(String(b || '').toUpperCase());
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function onepayCreds() {
  const live = paymentMode() === 'live';
  const merchant = String(process.env[live ? 'ONEPAY_LIVE_MERCHANT' : 'ONEPAY_SANDBOX_MERCHANT'] || '').trim();
  const access = String(process.env[live ? 'ONEPAY_LIVE_ACCESS_CODE' : 'ONEPAY_SANDBOX_ACCESS_CODE'] || '').trim();
  const hashKey = String(process.env[live ? 'ONEPAY_LIVE_HASH_KEY' : 'ONEPAY_SANDBOX_HASH_KEY'] || '').trim();
  if (!merchant || !access || !hashKey) {
    throw new PaymentError('Cổng OnePay chưa được cấu hình. Banla không thu thập số thẻ.', 503);
  }
  return { merchant, access, hashKey };
}

function onepayEndpoint() {
  const live = paymentMode() === 'live';
  const fallback = live
    ? 'https://onepay.vn/paygate/vpcpay.op'
    : 'https://mtf.onepay.vn/paygate/vpcpay.op';
  const override = String(process.env[live ? 'ONEPAY_LIVE_URL' : 'ONEPAY_SANDBOX_URL'] || '').trim();
  const chosen = override || fallback;
  let url;
  try {
    url = new URL(chosen);
  } catch {
    throw new PaymentError('Địa chỉ OnePay không hợp lệ.', 503);
  }
  const host = url.hostname.toLowerCase();
  const allowed = live ? host === 'onepay.vn' : host === 'mtf.onepay.vn';
  if (url.protocol !== 'https:' || !allowed) {
    throw new PaymentError('Địa chỉ OnePay không hợp lệ.', 503);
  }
  return url.toString();
}

function assertGatewayUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentError('Địa chỉ cổng thanh toán không hợp lệ.', 502);
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new PaymentError('Địa chỉ cổng thanh toán không hợp lệ.', 502);
  }
  const host = url.hostname.toLowerCase();
  const live = paymentMode() === 'live';
  const paypalOk = live
    ? (host === 'www.paypal.com' || host === 'paypal.com')
    : (host === 'www.sandbox.paypal.com' || host === 'sandbox.paypal.com');
  const onepayOk = live ? host === 'onepay.vn' : host === 'mtf.onepay.vn';
  if (!paypalOk && !onepayOk) {
    throw new PaymentError('Địa chỉ cổng thanh toán không hợp lệ.', 502);
  }
  return url.toString();
}

function isAllowedGatewayUrl(raw) {
  try {
    assertGatewayUrl(raw);
    return true;
  } catch {
    return false;
  }
}

function publicBase() {
  const raw = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (!raw) {
    throw new PaymentError('Thiếu PUBLIC_BASE_URL để tạo đường dẫn quay lại từ cổng thanh toán.', 503);
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new PaymentError('PUBLIC_BASE_URL không hợp lệ.', 503);
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new PaymentError('PUBLIC_BASE_URL không hợp lệ.', 503);
  }
  if (paymentMode() === 'live' && url.protocol !== 'https:') {
    throw new PaymentError('Chế độ live yêu cầu PUBLIC_BASE_URL dùng HTTPS.', 503);
  }
  return url.origin;
}

function ticketNo(ip) {
  const value = String(ip || '').replace(/^::ffff:/, '').trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value) && value.length <= 15) return value;
  throw new PaymentError('Không xác định được địa chỉ kết nối để mở OnePay.', 400);
}

function savePayment(record) {
  const payments = readArray(paymentsFile());
  const clean = pickRecord(record);
  const idx = payments.findIndex((item) => item.id === clean.id);
  if (idx === -1) payments.push(clean);
  else payments[idx] = clean;
  writeArray(paymentsFile(), payments);
  return clean;
}

function loadPayment(id) {
  return readArray(paymentsFile()).find((item) => item.id === id) || null;
}

function loadByProviderOrder(provider, providerOrderId) {
  return readArray(paymentsFile()).find((item) => item.provider === provider && item.providerOrderId === providerOrderId) || null;
}

function activePending(bookingId, provider) {
  const now = Date.now();
  return readArray(paymentsFile()).find((item) => item.bookingId === bookingId
    && item.provider === provider
    && item.status === 'PENDING'
    && item.redirectUrl
    && Date.parse(item.expiresAt) > now) || null;
}

function applyBookingPaid(payment) {
  const list = readArray(bookingsFile());
  const idx = list.findIndex((item) => item && String(item.id).toLowerCase() === String(payment.bookingId).toLowerCase());
  if (idx === -1) return null;
  const booking = list[idx];
  const due = invoiceAmount(booking);
  if (due !== payment.amount) return null;
  if (isSettled(booking) && Number(booking.paidAmount) !== payment.amount) return null;
  const full = booking.paymentOption === 'pay_100';
  booking.paymentStatus = full ? 'PAID' : 'DEPOSIT_PAID';
  booking.paidAmount = payment.amount;
  booking.paidAt = payment.paidAt;
  booking.status = 'confirmed';
  booking.cardPayment = {
    provider: payment.provider,
    providerOrderId: payment.providerOrderId,
    providerCaptureId: payment.providerCaptureId,
    amount: payment.amount,
    currency: payment.currency,
    status: 'PAID'
  };
  list[idx] = booking;
  writeArray(bookingsFile(), list);
  return booking;
}

function setPaymentStatus(paymentId, status) {
  const current = loadPayment(paymentId);
  if (!current || current.status === 'PAID') return current;
  current.status = status;
  current.updatedAt = new Date().toISOString();
  return savePayment(current);
}

function markPaid(paymentId, captureId) {
  const current = loadPayment(paymentId);
  if (!current) return { outcome: 'invalid' };
  if (current.status === 'PAID') {
    const booking = findBooking(current.bookingId);
    if (booking && !isSettled(booking)) applyBookingPaid(current);
    return { outcome: 'paid', payment: current };
  }
  if (!/^[A-Za-z0-9]+$/.test(String(captureId || ''))) {
    return { outcome: 'failed', payment: setPaymentStatus(paymentId, 'FAILED') };
  }
  const booking = findBooking(current.bookingId);
  if (!booking || invoiceAmount(booking) !== current.amount || current.currency !== CURRENCY) {
    return { outcome: 'mismatch', payment: setPaymentStatus(paymentId, 'AMOUNT_MISMATCH') };
  }
  if (isSettled(booking)) {
    const sameCapture = booking.cardPayment
      && booking.cardPayment.providerCaptureId === String(captureId);
    if (sameCapture && Number(booking.paidAmount) === current.amount) {
      current.status = 'PAID';
      current.providerCaptureId = String(captureId);
      current.paidAt = booking.paidAt || new Date().toISOString();
      current.updatedAt = current.paidAt;
      return { outcome: 'paid', payment: savePayment(current) };
    }
    return { outcome: 'already_settled', payment: setPaymentStatus(paymentId, 'NOT_APPLIED') };
  }
  current.status = 'PAID';
  current.providerCaptureId = String(captureId);
  current.paidAt = new Date().toISOString();
  current.updatedAt = current.paidAt;
  const saved = savePayment(current);
  const applied = applyBookingPaid(saved);
  if (!applied) {
    saved.status = 'AMOUNT_MISMATCH';
    saved.paidAt = undefined;
    return { outcome: 'mismatch', payment: savePayment(saved) };
  }
  return { outcome: 'paid', payment: saved };
}

function requireBooking(bookingId) {
  const booking = findBooking(bookingId);
  if (!booking) throw new PaymentError('Không tìm thấy đơn để thanh toán.', 404);
  const amount = invoiceAmount(booking);
  if (!amount) throw new PaymentError('Đơn chưa có số tiền cần thanh toán.', 409);
  if (isSettled(booking)) {
    throw new PaymentError('Đơn đã được thanh toán. Banla không mở thêm phiên thẻ.', 409);
  }
  return { booking, amount, currency: CURRENCY };
}

async function createCheckout({ provider, bookingId, clientIp }) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized !== 'paypal' && normalized !== 'onepay') {
    throw new PaymentError('Chọn PayPal hoặc OnePay. Banla không nhận số thẻ trên website.');
  }
  const prepared = await withLock(() => {
    const { booking, amount, currency } = requireBooking(bookingId);
    const pending = activePending(booking.id, normalized);
    if (pending && pending.amount === amount && isAllowedGatewayUrl(pending.redirectUrl)) {
      return {
        reuse: {
          provider: normalized,
          redirectUrl: pending.redirectUrl,
          amount: pending.amount,
          currency: pending.currency,
          bookingId: booking.id,
          paymentId: pending.id
        }
      };
    }
    const paymentId = newPaymentId();
    const orderInfo = orderInfoFromBooking(booking.id);
    return { booking, amount, currency, paymentId, orderInfo };
  });
  if (prepared.reuse) return prepared.reuse;

  const redirect = normalized === 'paypal'
    ? await createPayPalCheckout(prepared, clientIp)
    : createOnePayCheckout(prepared, clientIp);

  return withLock(() => {
    const again = requireBooking(prepared.booking.id);
    if (again.amount !== prepared.amount) {
      throw new PaymentError('Số tiền hóa đơn đã đổi. Vui lòng mở lại thanh toán.', 409);
    }
    const pending = activePending(prepared.booking.id, normalized);
    if (pending && pending.amount === again.amount && isAllowedGatewayUrl(pending.redirectUrl)) {
      return {
        provider: normalized,
        redirectUrl: pending.redirectUrl,
        amount: pending.amount,
        currency: pending.currency,
        bookingId: prepared.booking.id,
        paymentId: pending.id
      };
    }
    if (!/^[A-Za-z0-9]+$/.test(redirect.providerOrderId)) {
      throw new PaymentError('Mã giao dịch cổng thanh toán không hợp lệ.', 502);
    }
    const now = new Date();
    const record = savePayment({
      id: prepared.paymentId,
      bookingId: prepared.booking.id,
      provider: normalized,
      providerOrderId: redirect.providerOrderId,
      orderInfo: prepared.orderInfo,
      amount: prepared.amount,
      currency: prepared.currency,
      status: 'PENDING',
      redirectUrl: redirect.redirectUrl,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CHECKOUT_REUSE_MS).toISOString()
    });
    logger.info('Đã tạo phiên thanh toán thẻ', { provider: normalized, paymentId: record.id, bookingId: record.bookingId });
    return {
      provider: normalized,
      redirectUrl: record.redirectUrl,
      amount: record.amount,
      currency: record.currency,
      bookingId: record.bookingId,
      paymentId: record.id
    };
  });
}

function createOnePayCheckout(prepared, clientIp) {
  const creds = onepayCreds();
  const base = publicBase();
  const returnUrl = `${base}/api/payments/onepay/return`;
  if (returnUrl.length > 128) {
    throw new PaymentError('PUBLIC_BASE_URL quá dài cho đường dẫn trả về của OnePay.', 503);
  }
  const vpcAmount = invoiceToVpcAmount(prepared.amount);
  if (!vpcAmount) throw new PaymentError('Số tiền hóa đơn không hợp lệ.', 409);
  const params = {
    vpc_Version: '2',
    vpc_Currency: CURRENCY,
    vpc_Command: 'pay',
    vpc_AccessCode: creds.access,
    vpc_Merchant: creds.merchant,
    vpc_Locale: 'vn',
    vpc_ReturnURL: returnUrl,
    vpc_MerchTxnRef: prepared.paymentId,
    vpc_OrderInfo: prepared.orderInfo,
    vpc_Amount: vpcAmount,
    vpc_TicketNo: ticketNo(clientIp),
    vpc_CardList: 'INTERNATIONAL',
    AgainLink: base.slice(0, 64),
    Title: 'Banla Boutique'
  };
  const redirectUrl = new URL(onepayEndpoint());
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, String(value));
  }
  redirectUrl.searchParams.set('vpc_SecureHash', signOnePay(params, creds.hashKey));
  return {
    providerOrderId: prepared.paymentId,
    redirectUrl: assertGatewayUrl(redirectUrl.toString())
  };
}

function paypalCreds() {
  const live = paymentMode() === 'live';
  const clientId = String(process.env[live ? 'PAYPAL_LIVE_CLIENT_ID' : 'PAYPAL_SANDBOX_CLIENT_ID'] || '').trim();
  const clientSecret = String(process.env[live ? 'PAYPAL_LIVE_CLIENT_SECRET' : 'PAYPAL_SANDBOX_CLIENT_SECRET'] || '').trim();
  const webhookId = String(process.env[live ? 'PAYPAL_LIVE_WEBHOOK_ID' : 'PAYPAL_SANDBOX_WEBHOOK_ID'] || '').trim();
  if (!clientId || !clientSecret) {
    throw new PaymentError('Cổng PayPal chưa được cấu hình. Banla không thu thập số thẻ.', 503);
  }
  return { clientId, clientSecret, webhookId };
}

function paypalApiBase() {
  return paymentMode() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function paypalCurrency() {
  const configured = String(process.env.PAYPAL_CURRENCY || '').trim().toUpperCase();
  if (configured && configured !== CURRENCY) {
    throw new PaymentError('PayPal đang cấu hình loại tiền khác hóa đơn. Banla không tự đổi tỷ giá. Dùng OnePay để thanh toán đúng số tiền VND.', 409);
  }
  return CURRENCY;
}

async function payFetch(url, options = {}) {
  return fetchImpl(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) });
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function paypalIssue(data) {
  return String(data?.details?.[0]?.issue || data?.name || '');
}

async function paypalToken() {
  const { clientId, clientSecret } = paypalCreds();
  const cacheKey = `${paymentMode()}:${clientId}`;
  if (tokenCache.key === cacheKey && tokenCache.token && tokenCache.exp > Date.now() + 5000) {
    return tokenCache.token;
  }
  const res = await payFetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await readJson(res);
  if (!res.ok || typeof data.access_token !== 'string' || !data.access_token) {
    throw new PaymentError('Không kết nối được PayPal. Banla không thu thập số thẻ.', 502);
  }
  tokenCache = {
    key: cacheKey,
    token: data.access_token,
    exp: Date.now() + (Number(data.expires_in) || 60) * 1000
  };
  return data.access_token;
}

async function createPayPalCheckout(prepared) {
  const currency = paypalCurrency();
  const value = String(prepared.amount);
  const base = publicBase();
  const token = await paypalToken();
  const body = {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: prepared.paymentId,
      custom_id: prepared.booking.id,
      invoice_id: prepared.paymentId,
      description: `Banla ${prepared.orderInfo}`.slice(0, 127),
      amount: { currency_code: currency, value }
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'Banla Boutique Hotel',
          locale: 'vi-VN',
          landing_page: 'GUEST_CHECKOUT',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
          return_url: `${base}/api/payments/paypal/return`,
          cancel_url: `${base}/api/payments/paypal/cancel`
        }
      }
    }
  };
  const res = await payFetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': prepared.paymentId,
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  const data = await readJson(res);
  if (!res.ok || !data.id) {
    if (/CURRENCY/i.test(paypalIssue(data))) {
      throw new PaymentError('PayPal không nhận loại tiền của hóa đơn này. Banla không tự đổi tỷ giá. Quý khách thanh toán đúng số tiền VND qua OnePay.', 409);
    }
    throw new PaymentError('Không tạo được phiên PayPal. Quý khách thử lại hoặc chọn OnePay. Banla không thu thập số thẻ.', 502);
  }
  const echoed = data.purchase_units?.[0]?.amount;
  if (echoed && !amountsEqual(prepared.amount, currency, echoed.value, echoed.currency_code)) {
    throw new PaymentError('PayPal không giữ đúng số tiền hóa đơn. Banla không xác nhận thanh toán.', 502);
  }
  const link = (data.links || []).find((item) => item.rel === 'payer-action')
    || (data.links || []).find((item) => item.rel === 'approve');
  if (!link?.href) {
    throw new PaymentError('PayPal không trả về trang thanh toán. Banla không thu thập số thẻ.', 502);
  }
  return {
    providerOrderId: String(data.id),
    redirectUrl: assertGatewayUrl(link.href)
  };
}

async function capturePayPalOrder(orderId) {
  if (!/^[A-Za-z0-9]+$/.test(orderId)) {
    throw new PaymentError('Mã đơn PayPal không hợp lệ.', 400);
  }
  const token = await paypalToken();
  const res = await payFetch(`${paypalApiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }
  });
  const data = await readJson(res);
  if (res.status === 422 && paypalIssue(data) === 'ORDER_ALREADY_CAPTURED') {
    const existing = await payFetch(`${paypalApiBase()}/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const order = await readJson(existing);
    if (!existing.ok) throw new PaymentError('PayPal chưa xác nhận giao dịch. Đơn chưa được thanh toán.', 409);
    return order;
  }
  if (!res.ok) throw new PaymentError('PayPal chưa xác nhận giao dịch. Đơn chưa được thanh toán.', 409);
  return data;
}

function evaluatePayPalOrder(order, record) {
  if (!order || order.id !== record.providerOrderId) return { type: 'invalid' };
  const unit = (order.purchase_units || []).find((item) => item.invoice_id === record.id) || order.purchase_units?.[0];
  if (!unit) return { type: 'invalid' };
  if (unit.invoice_id && unit.invoice_id !== record.id) return { type: 'mismatch' };
  if (unit.custom_id && unit.custom_id !== record.bookingId) return { type: 'mismatch' };
  const capture = unit.payments?.captures?.[0];
  if (!capture || capture.status !== 'COMPLETED') return { type: 'failed' };
  if (capture.invoice_id && capture.invoice_id !== record.id) return { type: 'mismatch' };
  if (capture.custom_id && capture.custom_id !== record.bookingId) return { type: 'mismatch' };
  if (!amountsEqual(record.amount, record.currency, capture.amount?.value, capture.amount?.currency_code)) {
    return { type: 'mismatch' };
  }
  return { type: 'paid', captureId: capture.id };
}

async function settlePayPalReturn(token) {
  if (!token || !/^[A-Za-z0-9]+$/.test(token)) return { outcome: 'invalid' };
  const snapshot = await withLock(() => loadByProviderOrder('paypal', token));
  if (!snapshot) return { outcome: 'invalid' };
  if (snapshot.status === 'PAID') return { outcome: 'paid', payment: snapshot };
  if (snapshot.status === 'AMOUNT_MISMATCH') return { outcome: 'mismatch', payment: snapshot };
  const booking = findBooking(snapshot.bookingId);
  if (isSettled(booking)) return { outcome: 'already_settled', payment: snapshot };
  let order;
  try {
    order = await capturePayPalOrder(token);
  } catch (err) {
    logger.warn('PayPal chưa capture được giao dịch', { paymentId: snapshot.id });
    return { outcome: 'failed', payment: snapshot };
  }
  const verdict = evaluatePayPalOrder(order, snapshot);
  return withLock(() => applyVerdict(snapshot.id, verdict));
}

async function cancelPayPal(token) {
  if (token && /^[A-Za-z0-9]+$/.test(token)) {
    await withLock(() => {
      const payment = loadByProviderOrder('paypal', token);
      if (payment && payment.status === 'PENDING') setPaymentStatus(payment.id, 'CANCELLED');
    });
  }
  return { outcome: 'cancel' };
}

function paypalCertAllowed(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'api.paypal.com'
      || host === 'api-m.paypal.com'
      || host === 'api.sandbox.paypal.com'
      || host === 'api-m.sandbox.paypal.com';
  } catch {
    return false;
  }
}

async function verifyPayPalWebhook(event, headers) {
  const { webhookId } = paypalCreds();
  if (!webhookId) {
    throw new PaymentError('Webhook PayPal chưa được cấu hình.', 503);
  }
  const transmissionId = headers['paypal-transmission-id'];
  const transmissionTime = headers['paypal-transmission-time'];
  const transmissionSig = headers['paypal-transmission-sig'];
  const authAlgo = headers['paypal-auth-algo'];
  const certUrl = headers['paypal-cert-url'];
  if (!transmissionId || !transmissionTime || !transmissionSig || !authAlgo || !certUrl || !paypalCertAllowed(certUrl)) {
    throw new PaymentError('Thiếu chữ ký webhook PayPal.', 401);
  }
  const token = await paypalToken();
  const res = await payFetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event
    })
  });
  const data = await readJson(res);
  if (!res.ok || data.verification_status !== 'SUCCESS') {
    throw new PaymentError('Chữ ký webhook PayPal không hợp lệ.', 401);
  }
}

async function settlePayPalWebhook(event, headers) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new PaymentError('Payload không hợp lệ.', 400);
  }
  await verifyPayPalWebhook(event, headers || {});
  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') {
    return { ok: true, ignored: true };
  }
  const resource = event.resource || {};
  if (resource.status !== 'COMPLETED') return { ok: true, ignored: true };
  const invoiceId = typeof resource.invoice_id === 'string' ? resource.invoice_id : '';
  const orderId = resource.supplementary_data?.related_ids?.order_id;
  const payment = await withLock(() => {
    const byInvoice = invoiceId ? loadPayment(invoiceId) : null;
    const byOrder = orderId ? loadByProviderOrder('paypal', orderId) : null;
    if (byInvoice && byOrder && byInvoice.id !== byOrder.id) return null;
    return byInvoice || byOrder;
  });
  if (!payment || payment.provider !== 'paypal') return { ok: true, ignored: true };
  if (invoiceId && payment.id !== invoiceId) return { ok: true, ignored: true };
  if (orderId && payment.providerOrderId !== orderId) return { ok: true, ignored: true };
  if (resource.custom_id && resource.custom_id !== payment.bookingId) {
    await withLock(() => setPaymentStatus(payment.id, 'AMOUNT_MISMATCH'));
    return { ok: true, outcome: 'mismatch' };
  }
  const amountOk = amountsEqual(payment.amount, payment.currency, resource.amount?.value, resource.amount?.currency_code);
  if (!amountOk) {
    await withLock(() => setPaymentStatus(payment.id, 'AMOUNT_MISMATCH'));
    return { ok: true, outcome: 'mismatch' };
  }
  const applied = await withLock(() => markPaid(payment.id, resource.id));
  return { ok: true, outcome: applied.outcome };
}

function readNotification(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const entries = Object.entries(source);
  if (entries.length === 0 || entries.length > 60) return null;
  const params = {};
  for (const [key, value] of entries) {
    if (!/^[A-Za-z0-9_]+$/.test(key) || typeof value !== 'string' || value.length > 500) return null;
    params[key] = value;
  }
  return params;
}

async function settleOnePay(params) {
  let creds;
  try {
    creds = onepayCreds();
  } catch (err) {
    if (err.isUserError) return { outcome: 'unconfigured' };
    throw err;
  }
  const hash = params.vpc_SecureHash;
  if (!hash || !safeEqualHex(hash, signOnePay(params, creds.hashKey))) {
    return { outcome: 'invalid' };
  }
  if (params.vpc_Merchant && params.vpc_Merchant !== creds.merchant) return { outcome: 'invalid' };
  const payment = await withLock(() => loadPayment(params.vpc_MerchTxnRef));
  if (!payment || payment.provider !== 'onepay') return { outcome: 'invalid' };
  if (params.vpc_OrderInfo && params.vpc_OrderInfo !== payment.orderInfo) {
    return { outcome: 'invalid' };
  }
  if (payment.status === 'PAID') return { outcome: 'paid', payment };
  const code = params.vpc_TxnResponseCode;
  if (code !== '0') {
    const outcome = code === '99' ? 'cancel' : 'failed';
    const updated = await withLock(() => setPaymentStatus(payment.id, outcome === 'cancel' ? 'CANCELLED' : 'FAILED'));
    return { outcome, payment: updated };
  }
  const major = vpcAmountToMajor(params.vpc_Amount);
  const currency = String(params.vpc_CurrencyCode || '').toUpperCase();
  const idsOk = params.vpc_MerchTxnRef === payment.providerOrderId;
  const amountOk = major !== null && amountsEqual(payment.amount, payment.currency, major, currency);
  if (!idsOk || !amountOk || !params.vpc_TransactionNo) {
    const updated = await withLock(() => setPaymentStatus(payment.id, 'AMOUNT_MISMATCH'));
    return { outcome: 'mismatch', payment: updated };
  }
  return withLock(() => markPaid(payment.id, params.vpc_TransactionNo));
}

function applyVerdict(paymentId, verdict) {
  if (verdict.type === 'paid') return markPaid(paymentId, verdict.captureId);
  if (verdict.type === 'mismatch') {
    return { outcome: 'mismatch', payment: setPaymentStatus(paymentId, 'AMOUNT_MISMATCH') };
  }
  if (verdict.type === 'failed') {
    return { outcome: 'failed', payment: setPaymentStatus(paymentId, 'FAILED') };
  }
  return { outcome: 'invalid' };
}

module.exports = {
  PaymentError,
  createCheckout,
  settleOnePay,
  settlePayPalReturn,
  cancelPayPal,
  settlePayPalWebhook,
  readNotification,
  signOnePay,
  amountsEqual,
  invoiceToVpcAmount,
  vpcAmountToMajor,
  isAllowedGatewayUrl,
  containsForbiddenCardField,
  paymentMode,
  setFetch
};
