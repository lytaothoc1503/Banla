const { test } = require('node:test');
const assert = require('node:assert');

const {
  hashPassword,
  verifyPassword,
  safeTimingCompare,
  generateExpiringToken,
  verifyExpiringToken,
  maskPhoneNumber,
  maskEmailAddress,
  validateUploadPayload
} = require('../utils/security');

const { redactSensitiveData, sanitizeClientError } = require('../utils/logger');

// BƯỚC 1: TÀI KHOẢN & XÁC THỰC
test('Bảo mật 01: Hash mật khẩu và kiểm tra timing-safe', () => {
  const password = 'BanlaSecretPassword2026!';
  const hash = hashPassword(password);
  assert.ok(hash.startsWith('scrypt$'), 'Hash phải có định dạng scrypt');

  // Mật khẩu đúng
  assert.strictEqual(verifyPassword(password, hash), true);

  // Mật khẩu sai
  assert.strictEqual(verifyPassword('WrongPassword', hash), false);

  // So sánh an toàn thời gian
  assert.strictEqual(safeTimingCompare('token123', 'token123'), true);
  assert.strictEqual(safeTimingCompare('token123', 'token456'), false);
});

test('Bảo mật 03: Token phiên có thời hạn hết hạn an toàn (Expiring Session Tokens)', () => {
  const secret = 'test-secret-salt-2026';
  const token = generateExpiringToken('admin', secret, 8);
  assert.ok(token && typeof token === 'string');

  const verified = verifyExpiringToken(token, secret);
  assert.strictEqual(verified.valid, true);
  assert.strictEqual(verified.subject, 'admin');
  assert.ok(verified.expiresAt > Date.now());

  // Token sai secret
  const wrongSecret = verifyExpiringToken(token, 'wrong-secret');
  assert.strictEqual(wrongSecret.valid, false);

  // Token hết hạn (-1 giờ)
  const expiredToken = generateExpiringToken('admin', secret, -1);
  const expiredCheck = verifyExpiringToken(expiredToken, secret);
  assert.strictEqual(expiredCheck.valid, false);
  assert.ok(expiredCheck.error.includes('hết hạn'));
});

// BƯỚC 2: ĐỪNG TỰ LỘ ĐỒ
test('Bảo mật 04: Tự động che giấu trường nhạy cảm trong logs (Redact Sensitive Data)', () => {
  const rawLog = {
    user: 'admin',
    password: 'SuperSecretPassword',
    key: 'BANLA8888',
    token: 'jwt.token.here',
    pin: '123456'
  };
  const redacted = redactSensitiveData(rawLog);
  assert.strictEqual(redacted.password, '***REDACTED***');
  assert.strictEqual(redacted.key, '***REDACTED***');
  assert.strictEqual(redacted.token, '***REDACTED***');
  assert.strictEqual(redacted.pin, '***REDACTED***');
  assert.strictEqual(redacted.user, 'admin');
});

test('Bảo mật 06: Chuẩn hóa lỗi cho Client không để lộ stack trace', () => {
  const internalErr = new Error('Database connection failed at postgres://user:pass@127.0.0.1:5432/db');
  const clientResponse = sanitizeClientError(internalErr);
  assert.strictEqual(clientResponse.success, false);
  assert.strictEqual(clientResponse.message, 'Yêu cầu không hợp lệ hoặc đã xảy ra sự cố xử lý.');
  assert.ok(!JSON.stringify(clientResponse).includes('postgres'));
});

// BƯỚC 3: DỮ LIỆU USER & CHỐNG IDOR
test('Bảo mật 07 & 08: Giới hạn loại file upload và dung lượng tối đa', () => {
  // File hợp lệ
  assert.strictEqual(validateUploadPayload({ mimetype: 'image/jpeg', size: 1024 * 1024 }).valid, true);
  assert.strictEqual(validateUploadPayload({ mimetype: 'application/pdf', size: 2 * 1024 * 1024 }).valid, true);

  // File nguy hiểm (executable / script)
  const maliciousFile = validateUploadPayload({ mimetype: 'application/x-msdownload', size: 1024 });
  assert.strictEqual(maliciousFile.valid, false);
  assert.ok(maliciousFile.error.includes('Định dạng file không được phép'));

  // File quá dung lượng (>5MB)
  const tooLarge = validateUploadPayload({ mimetype: 'image/png', size: 6 * 1024 * 1024 });
  assert.strictEqual(tooLarge.valid, false);
  assert.ok(tooLarge.error.includes('vượt quá giới hạn'));
});

test('Bảo mật 10: Che mờ PII chống lộ dữ liệu người dùng (IDOR Protection)', () => {
  assert.strictEqual(maskPhoneNumber('0965999888'), '096****888');
  assert.strictEqual(maskPhoneNumber('+84901234567'), '+849****567');
  assert.strictEqual(maskEmailAddress('nguyenvanan@gmail.com'), 'n***@gmail.com');
});
