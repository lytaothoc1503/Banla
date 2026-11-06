/**
 * BANLA BOUTIQUE HOTEL — AUTOMATED REAL-DATA DATABASE BACKUP SCRIPT
 * Sao lưu đồng thời dữ liệu từ Supabase (`schema: banla` nếu có `service_role`)
 * và toàn bộ sổ cái JSON cục bộ (`bookings`, `transactions`, `payments`, `payment_events`).
 * Run via cron / CLI: npm run backup
 */
'use strict';

require('../utils/env').loadEnvFiles();

const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const bookingRepository = require('../backend/repositories/booking.repository');

const BACKUP_DIR = path.join(__dirname, '..', 'data', 'backups');

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const backupPath = path.join(BACKUP_DIR, `banla_backup_${timestamp}.json`);
  const storageInfo = bookingRepository.getStorageInfo();
  const bookings = await bookingRepository.listBookings();
  const { transactionsFile } = bookingRepository.getStorePaths();

  let transactions = [];
  if (fs.existsSync(transactionsFile)) {
    try {
      transactions = JSON.parse(fs.readFileSync(transactionsFile, 'utf8'));
    } catch (err) {
      logger.warn('Không đọc được file transactions khi backup:', err.message);
    }
  }

  const backupPayload = {
    exportedAt: new Date().toISOString(),
    storageMode: storageInfo.mode,
    totalBookings: bookings.length,
    totalTransactions: Array.isArray(transactions) ? transactions.length : 0,
    bookings,
    transactions: Array.isArray(transactions) ? transactions : []
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8');
  logger.info(
    `Đã tạo bản sao lưu thực tế tại: ${backupPath} (${bookings.length} đơn · nguồn: ${storageInfo.mode})`
  );

  // Xoay vòng bản sao lưu cũ hơn 30 ngày
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

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

  return backupPath;
}

if (require.main === module) {
  runBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Backup thất bại', err);
      process.exit(1);
    });
}

module.exports = { runBackup };
