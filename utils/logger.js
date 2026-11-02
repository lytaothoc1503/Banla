/**
 * BANLA BOUTIQUE HOTEL — SECURE LOGGER & ERROR SANITIZER
 * Implements Step 2 (04. Xóa hết debug log, 05. Giữ kín secret, 06. Không show lỗi chi tiết)
 */

const isProd = process.env.NODE_ENV === 'production';

// Mask các trường nhạy cảm nếu vô tình in ra
const SENSITIVE_KEYS = ['key', 'admin_key', 'token', 'secret', 'password', 'pin', 'smartlock_pin', 'authorization'];

function redactSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;
  try {
    const copy = Array.isArray(data) ? [...data] : { ...data };
    for (const k of Object.keys(copy)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        copy[k] = '***REDACTED***';
      } else if (typeof copy[k] === 'object' && copy[k] !== null) {
        copy[k] = redactSensitiveData(copy[k]);
      }
    }
    return copy;
  } catch {
    return '[Unserializable Data]';
  }
}

const logger = {
  info: (msg, meta) => {
    if (meta) {
      console.log(`[INFO] ${msg}`, redactSensitiveData(meta));
    } else {
      console.log(`[INFO] ${msg}`);
    }
  },
  warn: (msg, meta) => {
    if (meta) {
      console.warn(`[WARN] ${msg}`, redactSensitiveData(meta));
    } else {
      console.warn(`[WARN] ${msg}`);
    }
  },
  error: (msg, err) => {
    // 04: Trên Production không dump full stack trace ra stdout
    if (isProd) {
      console.error(`[ERROR] ${msg}: ${err && err.message ? err.message : String(err)}`);
    } else {
      console.error(`[ERROR] ${msg}`, err);
    }
  },
  debug: (msg, meta) => {
    // 04: Trên Production tuyệt đối câm lặng debug logs
    if (!isProd) {
      console.debug(`[DEBUG] ${msg}`, meta ? redactSensitiveData(meta) : '');
    }
  }
};

/**
 * 06: Chuẩn hóa phản hồi lỗi cho Client — Không lộ stack trace hay lỗi SQL
 */
function sanitizeClientError(err, defaultMsg = 'Yêu cầu không hợp lệ hoặc đã xảy ra sự cố xử lý.') {
  if (!err) return { success: false, message: defaultMsg };

  // Nếu là lỗi validation chủ động
  if (err.isUserError && err.message) {
    return { success: false, message: err.message };
  }

  return {
    success: false,
    message: defaultMsg
  };
}

module.exports = {
  logger,
  redactSensitiveData,
  sanitizeClientError
};

