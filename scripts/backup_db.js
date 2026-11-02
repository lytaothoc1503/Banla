/**
 * BANLA BOUTIQUE HOTEL — AUTOMATED DATABASE BACKUP SCRIPT
 * Implements Step 7 (Rule 19: Bật backup tự động và theo dõi dữ liệu)
 * Run via cron: node scripts/backup_db.js
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');
const BOOKINGS_FILE = process.env.BOOKINGS_FILE || path.join(__dirname, '..', 'data', 'bookings.json');

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const backupPath = path.join(BACKUP_DIR, `banla_backup_${timestamp}.json`);

  let localData = [];
  if (fs.existsSync(BOOKINGS_FILE)) {
    try {
      localData = JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8'));
    } catch (err) {
      logger.error('Lỗi đọc file booking khi backup', err);
    }
  }

  const backupPayload = {
    exportedAt: new Date().toISOString(),
    totalBookings: localData.length,
    bookings: localData
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
  logger.info(`Đã tạo bản sao lưu thành công tại: ${backupPath} (${localData.length} đơn)`);

  // Xóa các bản sao lưu cũ hơn 30 ngày để tiết kiệm dung lượng
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const MAX_AGE_MS = 30 * 24 * 3600 * 1000; // 30 ngày

    files.forEach((f) => {
      const fullPath = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(fullPath);
        logger.info(`Đã xoay vòng xóa bản backup cũ: ${f}`);
      }
    });
  } catch (err) {
    logger.warn('Lỗi khi xoay vòng bản backup cũ', err);
  }
}

if (require.main === module) {
  runBackup().then(() => {
    process.exit(0);
  }).catch((err) => {
    logger.error('Backup thất bại', err);
    process.exit(1);
  });
}

module.exports = { runBackup };
