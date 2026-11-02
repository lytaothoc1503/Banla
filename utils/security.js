/**
 * BANLA BOUTIQUE HOTEL — CORE SECURITY UTILITIES
 * Implements 7-Step Security Standard:
 * 1. Password Hashing (scrypt/Argon2-grade memory-hard derivation) & Timing-Safe Check
 * 2. Session Lifecycle & Expiring Tokens (8h max age)
 * 3. Secure Cookie Directives (HttpOnly, Secure, SameSite=Strict)
 * 4. PII Masking & Data Sanitization (Chống IDOR & rò rỉ dữ liệu)
 * 5. File Upload Whitelist & Size Validation
 */

const crypto = require('crypto');

// ----------------------------------------------------
// BƯỚC 1: TÀI KHOẢN & XÁC THỰC AN TOÀN
// ----------------------------------------------------

/**
 * 01. Hash mật khẩu bằng scrypt (chuẩn NIST, memory-hard tương đương Argon2/bcrypt)
 * @param {string} password 
 * @returns {string} format "scrypt$salt$hash"
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Mật khẩu không hợp lệ.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt}$${derivedKey.toString('hex')}`;
}

/**
 * 01. Kiểm tra mật khẩu an toàn chống Timing Attacks
 * @param {string} password 
 * @param {string} storedHash format "scrypt$salt$hash" hoặc chuỗi plain text an toàn
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  // Nếu chuỗi lưu trữ dạng scrypt hash
  if (typeof storedHash === 'string' && storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const originalHash = Buffer.from(parts[2], 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (originalHash.length !== derivedKey.length) return false;
    return crypto.timingSafeEqual(originalHash, derivedKey);
  }

  // Fallback so sánh an toàn cho mã PIN quản trị
  return safeTimingCompare(String(password), String(storedHash));
}

/**
 * So sánh an toàn thời gian chống Side-Channel / Timing Attacks
 */
function safeTimingCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 03. Tạo Token phiên có hạn dùng rõ ràng (8 giờ)
 * @param {string} subject 
 * @param {string} secret 
 * @param {number} ttlHours 
 * @returns {string} base64url signed token
 */
function generateExpiringToken(subject = 'admin', secret, ttlHours = 8) {
  const expiresAt = Date.now() + ttlHours * 3600 * 1000;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${subject}:${expiresAt}:${nonce}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * 03. Xác thực Token phiên và kiểm tra hạn sử dụng
 * @param {string} token 
 * @param {string} secret 
 * @returns {{ valid: boolean, subject?: string, expiresAt?: number, error?: string }}
 */
function verifyExpiringToken(token, secret) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Thiếu token xác thực.' };
  }
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 4) {
      return { valid: false, error: 'Cấu trúc token không đúng.' };
    }
    const [subject, expStr, nonce, sig] = parts;
    const expiresAt = Number(expStr);

    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return { valid: false, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' };
    }

    const payload = `${subject}:${expiresAt}:${nonce}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!safeTimingCompare(sig, expectedSig)) {
      return { valid: false, error: 'Chữ ký phiên không hợp lệ.' };
    }

    return { valid: true, subject, expiresAt };
  } catch (err) {
    return { valid: false, error: 'Token không hợp lệ.' };
  }
}

/**
 * 14. Thiết lập thuộc tính Cookie an toàn
 */
function getSecureCookieDirectives(maxAgeMs = 8 * 3600 * 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: maxAgeMs,
    path: '/'
  };
}

// ----------------------------------------------------
// BƯỚC 3 & 4: DỮ LIỆU & BẢO VỆ PII (CHỐNG IDOR)
// ----------------------------------------------------

/**
 * 10. Che mờ thông tin cá nhân (PII Masking)
 */
function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length < 7) return '***';
  return (hasPlus ? '+' : '') + digits.slice(0, 3) + '****' + digits.slice(-3);
}

function maskEmailAddress(email) {
  if (!email || typeof email !== 'string') return '';
  return email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '***' + c);
}

/**
 * 07 & 08. Giới hạn loại file upload và dung lượng
 */
const ALLOWED_UPLOAD_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
];
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function validateUploadPayload(file) {
  if (!file) {
    return { valid: false, error: 'Không tìm thấy file tải lên.' };
  }
  if (!ALLOWED_UPLOAD_MIMES.includes(file.mimetype)) {
    return { valid: false, error: 'Định dạng file không được phép. Chỉ chấp nhận JPG, PNG, WEBP, PDF.' };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return { valid: false, error: 'Dung lượng file vượt quá giới hạn cho phép (tối đa 5MB).' };
  }
  return { valid: true };
}

module.exports = {
  hashPassword,
  verifyPassword,
  safeTimingCompare,
  generateExpiringToken,
  verifyExpiringToken,
  getSecureCookieDirectives,
  maskPhoneNumber,
  maskEmailAddress,
  validateUploadPayload,
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_SIZE_BYTES
};
