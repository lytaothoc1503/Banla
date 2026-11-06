/**
 * BANLA BOUTIQUE HOTEL — UNIFIED REAL-DATA BOOKING & TRANSACTION REPOSITORY
 * Khắc phục D5, D8, D10, D11, G4 (docs/database_audit.md & docs/known_logic_gaps.md):
 *   - Kết nối trực tiếp Supabase PostgreSQL (`schema: banla`, `service_role`) khi đã cấu hình khóa trong `.env`.
 *   - Lưu trữ đồng bộ nguyên tử (Atomic Write + In-process Mutex) xuống `data/bookings.json`,
 *     `data/transactions.json` và `banla_payment_module/data/payment_sessions.json`.
 *   - Chống đặt trùng phòng theo `inventory` & khoảng ngày lưu trú (`holdExpiresAt` tự giải phóng sau 30 phút).
 *   - Chống cộng tiền trùng lặp (Idempotency theo `gatewayTxnId`).
 *   - Tính toán tài chính số nguyên VND chính xác (không biến cọc 50% thành trả đủ 100%).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logger } = require('../../utils/logger');
const { getSupabaseConfig, getServiceRoleClient } = require('../../utils/supabase/node');
const {
  CANONICAL_ROOMS,
  resolveRoom,
  calculateStayPricing,
  normalizePaymentOption,
  normalizePaymentMethod
} = require('../../shared/constants/rooms');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DEFAULT_HOLD_MINUTES = 30;

// Hàng đợi tuần tự dùng chung trên toàn tiến trình để loại bỏ race-condition ghi file
let mutexQueue = Promise.resolve();
function withDataMutex(fn) {
  const next = mutexQueue.then(fn, fn);
  mutexQueue = next.catch(() => {});
  return next;
}

function getStorePaths() {
  const bookingsFile = process.env.BOOKINGS_FILE
    ? path.resolve(process.env.BOOKINGS_FILE)
    : path.join(PROJECT_ROOT, 'data', 'bookings.json');

  const baseDir = path.dirname(bookingsFile);
  const transactionsFile = process.env.TRANSACTIONS_FILE
    ? path.resolve(process.env.TRANSACTIONS_FILE)
    : path.join(baseDir, 'transactions.json');

  const sessionsFile = process.env.PAYMENT_SESSIONS_FILE
    ? path.resolve(process.env.PAYMENT_SESSIONS_FILE)
    : (process.env.BOOKINGS_FILE
        ? path.join(baseDir, 'payment_sessions.json')
        : path.join(PROJECT_ROOT, 'banla_payment_module', 'data', 'payment_sessions.json'));

  return { bookingsFile, transactionsFile, sessionsFile };
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (err) {
    logger.error(`Lỗi đọc file dữ liệu (${path.basename(filePath)}):`, err);
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

function getStorageInfo() {
  const cfg = getSupabaseConfig();
  return {
    mode: cfg.hasServiceRole ? 'supabase_banla' : 'local_json_real',
    supabaseConfigured: cfg.hasServiceRole,
    supabaseUrl: cfg.url
  };
}

function cleanBookingCode(codeOrId) {
  return String(codeOrId || '')
    .trim()
    .replace(/^#+/, '')
    .replace(/^BANLA[_\-\s]+/i, '')
    .trim();
}

function matchesBookingCode(booking, codeOrId) {
  if (!booking || !codeOrId) return false;
  const target = cleanBookingCode(codeOrId).toLowerCase();
  if (!target) return false;
  return (
    String(booking.id || '').toLowerCase() === target ||
    String(booking.bookingCode || '').toLowerCase() === target ||
    String(booking.booking_code || '').toLowerCase() === target
  );
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/[^0-9]/g, '');
}

/**
 * Chuẩn hóa tài chính và trường dữ liệu cho 1 bản ghi đơn đặt phòng (từ cả Supabase snake_case hoặc JSON camelCase)
 */
function normalizeBookingRecord(raw, roomsList = CANONICAL_ROOMS) {
  if (!raw || typeof raw !== 'object') return null;

  const matchedRoom = resolveRoom(raw.roomCode || raw.room_code || raw.room || raw.room_id, roomsList);
  const roomCode = String(matchedRoom.code || matchedRoom.id || 'signature');
  const roomDisplay = String(raw.room || raw.room_name || raw.room_id || matchedRoom.name || 'Banla Signature');

  const checkin = raw.checkin || raw.check_in ? String(raw.checkin || raw.check_in).slice(0, 10) : '';
  const checkout = raw.checkout || raw.check_out ? String(raw.checkout || raw.check_out).slice(0, 10) : '';

  let nights = Math.trunc(Number(raw.nights) || 0);
  if (nights < 1 && checkin && checkout) {
    const diff = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    if (diff >= 1) nights = diff;
  }
  if (nights < 1) nights = 1;

  const unitPrice = Math.trunc(Number(raw.unitPrice ?? raw.unit_price ?? matchedRoom.price) || 1150000);
  const paymentOption = normalizePaymentOption(raw.paymentOption || raw.payment_option || 'deposit_50');
  const paymentMethod = normalizePaymentMethod(raw.paymentMethod || raw.payment_method || 'vietqr');

  const computedPricing = calculateStayPricing({
    unitPriceVnd: unitPrice,
    nights,
    paymentOption
  });

  const totalPrice = Math.trunc(Number(raw.totalPrice ?? raw.total_amount) || computedPricing.subtotalVnd);
  const discountAmount = Math.trunc(
    raw.discountAmount !== undefined || raw.discount_amount !== undefined
      ? Number(raw.discountAmount ?? raw.discount_amount) || 0
      : (paymentOption === 'pay_100' ? Math.round(totalPrice * 0.10) : 0)
  );
  const netPayableTotal = Math.max(0, totalPrice - discountAmount);
  const depositAmount = Math.trunc(
    Number(raw.depositAmount ?? raw.amount_due) ||
      (paymentOption === 'pay_100' ? netPayableTotal : Math.round(totalPrice * 0.50))
  );

  // Chuẩn hóa trạng thái thanh toán giữa PostgreSQL ('pending'|'paid'|'refunded') và API ('UNPAID'|'PAID'|...)
  const rawPayStatus = String(raw.paymentStatus || raw.payment_status || 'UNPAID').trim().toUpperCase();
  let paymentStatus = 'UNPAID';
  if (rawPayStatus === 'PAID') paymentStatus = 'PAID';
  else if (rawPayStatus === 'DEPOSIT_PAID') paymentStatus = 'DEPOSIT_PAID';
  else if (rawPayStatus === 'PROCESSING') paymentStatus = 'PROCESSING';
  else if (rawPayStatus === 'REFUNDED') paymentStatus = 'REFUNDED';

  let paidAmount = Math.trunc(Number(raw.paidAmount ?? raw.paid_amount) || 0);
  // Chỉ suy luận cho bản ghi cũ thiếu paidAmount: dùng đúng depositAmount thay vì biến cọc 50% thành 100% (G4)
  if (paidAmount === 0 && (paymentStatus === 'PAID' || paymentStatus === 'DEPOSIT_PAID')) {
    paidAmount = depositAmount > 0 ? depositAmount : netPayableTotal;
  }

  const remainingAmount = Math.max(0, netPayableTotal - paidAmount);
  const feeRate = 0.015;
  const gatewayFee = Math.round(paidAmount * feeRate);
  const netAmount = Math.max(0, paidAmount - gatewayFee);

  const rawStatus = String(raw.status || raw.booking_status || 'pending').trim().toLowerCase();
  const status = ['pending', 'confirmed', 'completed', 'cancelled'].includes(rawStatus)
    ? rawStatus
    : 'pending';

  const id = String(raw.bookingCode || raw.booking_code || raw.id || '').trim() || '';
  const bookingCode = String(raw.bookingCode || raw.booking_code || id).toUpperCase();

  return {
    ...raw,
    dbUuid: raw.dbUuid || (typeof raw.id === 'string' && raw.id.includes('-') ? raw.id : null),
    id: id || bookingCode,
    bookingCode,
    name: String(raw.name ?? raw.guest_name ?? '').trim(),
    phone: String(raw.phone ?? raw.guest_phone ?? '').trim(),
    email: String(raw.email ?? raw.guest_email ?? '').trim(),
    room: roomDisplay,
    roomCode,
    checkin,
    checkout,
    guests: raw.guests !== null && raw.guests !== undefined ? Number(raw.guests) : null,
    nights,
    unitPrice,
    totalPrice,
    paymentOption,
    paymentMethod,
    discountAmount,
    depositAmount,
    remainingAmount,
    paidAmount,
    gatewayFee,
    netAmount,
    status,
    paymentStatus,
    smartLockPin: raw.smartLockPin ?? raw.smartlock_pin ?? null,
    source: raw.source || 'direct',
    message: String(raw.message ?? raw.note ?? ''),
    holdExpiresAt: raw.holdExpiresAt || raw.hold_expires_at || null,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || null,
    paidAt: raw.paidAt || raw.paid_at || null,
    approvedAt: raw.approvedAt || raw.approved_at || null,
    approvedBy: raw.approvedBy || raw.approved_by || null
  };
}

function toSupabaseBookingRow(record) {
  const cleanPhone = normalizePhoneDigits(record.phone);
  if (!record.checkin || !record.checkout || cleanPhone.length < 8) {
    return null;
  }
  const rawPin = String(record.smartLockPin || '').replace(/[^0-9]/g, '');
  const dbPin =
    rawPin.length === 6 &&
    record.paymentStatus === 'PAID' &&
    (record.status === 'confirmed' || record.status === 'completed')
      ? rawPin
      : null;

  return {
    booking_code: String(record.bookingCode || record.id).toUpperCase(),
    guest_name: record.name,
    guest_phone: cleanPhone.slice(0, 15),
    guest_email: record.email || null,
    room_code: record.roomCode,
    guests: Math.max(1, Math.min(20, Number(record.guests) || 2)),
    check_in: record.checkin,
    check_out: record.checkout,
    unit_price: record.unitPrice,
    total_amount: record.totalPrice,
    payment_option: record.paymentOption === 'pay_100' ? 'pay_100' : 'deposit_50',
    payment_method: record.paymentMethod === 'visa' ? 'visa' : 'vietqr',
    discount_amount: record.discountAmount,
    amount_due: record.depositAmount,
    paid_amount: Math.min(record.paidAmount, Math.max(0, record.totalPrice - record.discountAmount)),
    payment_status:
      record.paymentStatus === 'PAID' || record.paymentStatus === 'DEPOSIT_PAID'
        ? 'paid'
        : record.paymentStatus === 'REFUNDED'
          ? 'refunded'
          : 'pending',
    booking_status: record.status,
    smartlock_pin: dbPin,
    source: ['direct', 'ota', 'admin'].includes(record.source) ? record.source : 'direct',
    note: String(record.message || '').slice(0, 1000),
    hold_expires_at: record.holdExpiresAt || null,
    paid_at: record.paidAt || null,
    approved_at: record.approvedAt || null,
    approved_by: record.approvedBy || null
  };
}

async function upsertBookingToSupabaseSafe(record) {
  const sb = getServiceRoleClient();
  if (!sb) return null;
  const row = toSupabaseBookingRow(record);
  if (!row) return null;

  try {
    const { data, error } = await sb
      .from('bookings')
      .upsert(row, { onConflict: 'booking_code' })
      .select('*')
      .maybeSingle();
    if (error) {
      logger.warn('Đồng bộ Supabase banla.bookings cảnh báo:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    logger.warn('Kết nối Supabase banla.bookings thất bại, giữ bản ghi JSON cục bộ:', err.message);
    return null;
  }
}

/**
 * Đọc toàn bộ danh sách đơn đặt phòng (ưu tiên Supabase `banla.bookings` nếu có `service_role`, ngược lại đọc JSON)
 */
async function listBookings({ roomsList = CANONICAL_ROOMS } = {}) {
  const { bookingsFile } = getStorePaths();
  const sb = getServiceRoleClient();

  if (sb) {
    try {
      const { data, error } = await sb
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        const normalized = data.map((r) => normalizeBookingRecord(r, roomsList)).filter(Boolean);
        writeJsonAtomic(bookingsFile, normalized);
        return normalized;
      }
      if (error) {
        logger.warn('Đọc Supabase banla.bookings lỗi, chuyển sang kho JSON cục bộ:', error.message);
      }
    } catch (err) {
      logger.warn('Lỗi mạng khi đọc Supabase banla.bookings:', err.message);
    }
  }

  const localRaw = readJsonSafe(bookingsFile, []);
  return localRaw.map((r) => normalizeBookingRecord(r, roomsList)).filter(Boolean);
}

/**
 * Đọc nhanh đồng bộ từ kho JSON cục bộ (dùng cho các hàm kiểm tra tức thời)
 */
function listBookingsSync({ roomsList = CANONICAL_ROOMS } = {}) {
  const { bookingsFile } = getStorePaths();
  const localRaw = readJsonSafe(bookingsFile, []);
  return localRaw.map((r) => normalizeBookingRecord(r, roomsList)).filter(Boolean);
}

async function findBookingByCode(codeOrId, { roomsList = CANONICAL_ROOMS } = {}) {
  const clean = cleanBookingCode(codeOrId);
  if (!clean) return null;

  const sb = getServiceRoleClient();
  if (sb) {
    try {
      const { data, error } = await sb
        .from('bookings')
        .select('*')
        .eq('booking_code', clean.toUpperCase())
        .maybeSingle();
      if (!error && data) {
        return normalizeBookingRecord(data, roomsList);
      }
    } catch (_) {}
  }

  const list = listBookingsSync({ roomsList });
  return list.find((b) => matchesBookingCode(b, clean)) || null;
}

function findBookingByCodeSync(codeOrId, { roomsList = CANONICAL_ROOMS } = {}) {
  const clean = cleanBookingCode(codeOrId);
  if (!clean) return null;
  const list = listBookingsSync({ roomsList });
  return list.find((b) => matchesBookingCode(b, clean)) || null;
}

/**
 * Kiểm tra tình trạng phòng trống thực tế (D10) theo số lượng phòng vật lý (`inventory`) và khoảng ngày `[checkin, checkout)`
 */
function checkRoomAvailabilitySync({
  roomQuery,
  checkin,
  checkout,
  guests = 1,
  excludeBookingId = null,
  bookingsList = null,
  roomsList = CANONICAL_ROOMS
}) {
  const matchedRoom = resolveRoom(roomQuery, roomsList);
  const roomCode = String(matchedRoom.code || matchedRoom.id || 'signature');
  const inventory = Math.max(0, Math.trunc(Number(matchedRoom.inventory ?? 1)));
  const maxGuests = Math.max(1, Math.trunc(Number(matchedRoom.maxGuests ?? 3)));
  const reqGuests = Math.max(1, Math.trunc(Number(guests) || 1));
  const isCapacityOk = reqGuests <= maxGuests;

  if (!checkin || !checkout || checkout <= checkin) {
    return {
      room: matchedRoom,
      roomCode,
      inventory,
      taken: 0,
      availableUnits: inventory,
      isCapacityOk,
      available: inventory > 0 && isCapacityOk
    };
  }

  const list = Array.isArray(bookingsList) ? bookingsList : listBookingsSync({ roomsList });
  const nowMs = Date.now();

  const taken = list.filter((b) => {
    if (!b || b.roomCode !== roomCode) return false;
    if (excludeBookingId && matchesBookingCode(b, excludeBookingId)) return false;
    if (b.status !== 'pending' && b.status !== 'confirmed') return false;
    if (!b.checkin || !b.checkout) return false;
    // Kiểm tra giao nhau của 2 khoảng nửa mở [checkin, checkout): ngày trả đơn trước == ngày nhận đơn sau là HỢP LỆ
    if (!(b.checkin < checkout && b.checkout > checkin)) return false;

    const isPaidOrConfirmed =
      b.status === 'confirmed' ||
      b.paymentStatus === 'PAID' ||
      b.paymentStatus === 'DEPOSIT_PAID';
    const hasActiveHold = b.holdExpiresAt ? Date.parse(b.holdExpiresAt) > nowMs : false;

    return isPaidOrConfirmed || hasActiveHold;
  }).length;

  const availableUnits = Math.max(0, inventory - taken);
  return {
    room: matchedRoom,
    roomCode,
    inventory,
    taken,
    availableUnits,
    isCapacityOk,
    available: availableUnits > 0 && isCapacityOk
  };
}

async function listRoomsWithAvailability({
  checkin = '',
  checkout = '',
  guests = 1,
  roomsList = CANONICAL_ROOMS
} = {}) {
  const bookings = await listBookings({ roomsList });
  let nights = 1;
  if (checkin && checkout && checkout > checkin) {
    const diff = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    if (diff >= 1) nights = diff;
  }

  return roomsList.map((room) => {
    const avail = checkRoomAvailabilitySync({
      roomQuery: room.id || room.code || room.name,
      checkin,
      checkout,
      guests,
      bookingsList: bookings,
      roomsList
    });
    const depositPricing = calculateStayPricing({
      unitPriceVnd: room.price,
      nights,
      paymentOption: 'deposit_50'
    });
    const fullPricing = calculateStayPricing({
      unitPriceVnd: room.price,
      nights,
      paymentOption: 'pay_100'
    });

    return {
      ...room,
      code: avail.roomCode,
      inventory: avail.inventory,
      takenUnits: avail.taken,
      availableUnits: avail.availableUnits,
      isCapacityOk: avail.isCapacityOk,
      isAvailable: avail.available,
      nights,
      pricing: {
        deposit_50: depositPricing,
        pay_100: fullPricing
      }
    };
  });
}

function generateUniqueBookingCode(existingList) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = 'BL' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!existingList.some((b) => matchesBookingCode(b, candidate))) {
      return candidate;
    }
  }
  return 'BL' + Date.now().toString(36).toUpperCase().slice(-6).padStart(6, '0');
}

/**
 * Tạo mới đơn đặt phòng thực tế (có kiểm tra chống đặt trùng phòng & lưu nguyên tử)
 */
async function createBooking(
  payload,
  { roomsList = CANONICAL_ROOMS, skipAvailabilityCheck = false } = {}
) {
  return withDataMutex(async () => {
    const { bookingsFile } = getStorePaths();
    const rawList = readJsonSafe(bookingsFile, []);
    const normalizedList = rawList.map((r) => normalizeBookingRecord(r, roomsList)).filter(Boolean);

    const matchedRoom = resolveRoom(payload.room, roomsList);
    const checkin = payload.checkin || '';
    const checkout = payload.checkout || '';

    if (!skipAvailabilityCheck && checkin && checkout) {
      const avail = checkRoomAvailabilitySync({
        roomQuery: matchedRoom.id || matchedRoom.code || matchedRoom.name,
        checkin,
        checkout,
        guests: payload.guests || 1,
        bookingsList: normalizedList,
        roomsList
      });
      if (!avail.isCapacityOk) {
        const err = new Error(
          `Số khách (${payload.guests}) vượt quá sức chứa tối đa của hạng phòng ${matchedRoom.name} (tối đa ${matchedRoom.maxGuests} khách).`
        );
        err.status = 400;
        err.code = 'CAPACITY_EXCEEDED';
        throw err;
      }
      if (avail.availableUnits <= 0) {
        const err = new Error(
          `Hạng phòng ${matchedRoom.name} đã hết phòng trong khoảng ngày ${checkin} → ${checkout}. Vui lòng chọn ngày khác hoặc hạng phòng khác.`
        );
        err.status = 409;
        err.code = 'ROOM_UNAVAILABLE';
        throw err;
      }
    }

    let nights = 1;
    if (checkin && checkout) {
      const diff = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
      if (diff >= 1) nights = diff;
    }

    const paymentOption = normalizePaymentOption(payload.paymentOption || 'deposit_50');
    const paymentMethod = normalizePaymentMethod(payload.paymentMethod || 'vietqr');
    const unitPrice = Math.trunc(Number(payload.unitPrice || matchedRoom.price) || 1150000);

    const pricing = calculateStayPricing({
      unitPriceVnd: unitPrice,
      nights,
      paymentOption
    });

    const requestedCode = cleanBookingCode(payload.bookingCode || payload.id).toUpperCase();
    const bookingCode =
      requestedCode &&
      /^BL[0-9A-Z]{4,12}$/.test(requestedCode) &&
      !normalizedList.some((b) => matchesBookingCode(b, requestedCode))
        ? requestedCode
        : generateUniqueBookingCode(normalizedList);

    const now = new Date().toISOString();
    const totalPrice =
      payload.totalPrice !== undefined && Number(payload.totalPrice) > 0
        ? Math.trunc(Number(payload.totalPrice))
        : pricing.subtotalVnd;
    const discountAmount =
      payload.discountAmount !== undefined
        ? Math.trunc(Number(payload.discountAmount) || 0)
        : (paymentOption === 'pay_100' ? Math.round(totalPrice * 0.10) : 0);
    const depositAmount =
      payload.depositAmount !== undefined && Number(payload.depositAmount) > 0
        ? Math.trunc(Number(payload.depositAmount))
        : (paymentOption === 'pay_100' ? Math.max(0, totalPrice - discountAmount) : Math.round(totalPrice * 0.50));
    const paidAmount = Math.max(0, Math.trunc(Number(payload.paidAmount) || 0));
    const paymentStatus =
      payload.paymentStatus ||
      (paidAmount >= depositAmount && depositAmount > 0 ? 'PAID' : 'UNPAID');
    const status = payload.status || 'pending';

    const holdExpiresAt =
      checkin && checkout && paymentStatus === 'UNPAID' && status === 'pending'
        ? new Date(Date.now() + DEFAULT_HOLD_MINUTES * 60 * 1000).toISOString()
        : null;

    const record = normalizeBookingRecord(
      {
        id: bookingCode,
        bookingCode,
        createdAt: now,
        updatedAt: now,
        status,
        paymentStatus,
        paymentMethod,
        paymentOption,
        unitPrice,
        nights,
        totalPrice,
        discountAmount,
        depositAmount,
        paidAmount,
        remainingAmount: Math.max(0, totalPrice - discountAmount - paidAmount),
        smartLockPin: payload.smartLockPin || null,
        holdExpiresAt,
        name: payload.name,
        email: payload.email || '',
        phone: payload.phone || '',
        checkin,
        checkout,
        room: payload.room || matchedRoom.name,
        roomCode: matchedRoom.code || matchedRoom.id,
        guests: payload.guests !== undefined ? payload.guests : null,
        source: payload.source || 'direct',
        message: payload.message || '',
        paidAt: paymentStatus === 'PAID' ? now : null,
        approvedAt: status === 'confirmed' ? now : null,
        approvedBy: payload.approvedBy || null
      },
      roomsList
    );

    rawList.push(record);
    writeJsonAtomic(bookingsFile, rawList);

    const sbRow = await upsertBookingToSupabaseSafe(record);
    if (sbRow && sbRow.id) {
      record.dbUuid = sbRow.id;
    }

    return record;
  });
}

/**
 * Cập nhật thông tin đơn đặt phòng an toàn (dành cho Admin & nội bộ)
 */
async function updateBooking(id, patch = {}, { roomsList = CANONICAL_ROOMS } = {}) {
  return withDataMutex(async () => {
    const { bookingsFile } = getStorePaths();
    const rawList = readJsonSafe(bookingsFile, []);
    const idx = rawList.findIndex((b) => matchesBookingCode(b, id));
    if (idx === -1) return null;

    const current = normalizeBookingRecord(rawList[idx], roomsList);
    const merged = { ...current };

    if (patch.name !== undefined) merged.name = String(patch.name).trim();
    if (patch.phone !== undefined) merged.phone = String(patch.phone).trim();
    if (patch.email !== undefined) merged.email = String(patch.email).trim();
    if (patch.room !== undefined) {
      merged.room = String(patch.room).trim();
      const matched = resolveRoom(merged.room, roomsList);
      merged.roomCode = matched.code || matched.id;
    }
    if (patch.guests !== undefined) merged.guests = Number(patch.guests) || 2;
    if (patch.checkin !== undefined) merged.checkin = String(patch.checkin).slice(0, 10);
    if (patch.checkout !== undefined) merged.checkout = String(patch.checkout).slice(0, 10);
    if (patch.paymentOption !== undefined) {
      merged.paymentOption = normalizePaymentOption(patch.paymentOption);
    }
    if (patch.paymentMethod !== undefined) {
      merged.paymentMethod = normalizePaymentMethod(patch.paymentMethod);
    }
    if (patch.totalPrice !== undefined) merged.totalPrice = Math.trunc(Number(patch.totalPrice) || 0);
    if (patch.discountAmount !== undefined) merged.discountAmount = Math.trunc(Number(patch.discountAmount) || 0);
    if (patch.depositAmount !== undefined) merged.depositAmount = Math.trunc(Number(patch.depositAmount) || 0);
    if (patch.paidAmount !== undefined) merged.paidAmount = Math.max(0, Math.trunc(Number(patch.paidAmount) || 0));
    if (patch.status !== undefined) merged.status = String(patch.status).toLowerCase();
    if (patch.paymentStatus !== undefined) merged.paymentStatus = String(patch.paymentStatus).toUpperCase();
    if (patch.smartLockPin !== undefined) merged.smartLockPin = patch.smartLockPin;
    if (patch.message !== undefined) merged.message = String(patch.message).slice(0, 1000);
    if (patch.approvedBy !== undefined) merged.approvedBy = patch.approvedBy;

    const now = new Date().toISOString();
    merged.updatedAt = now;
    if ((merged.paymentStatus === 'PAID' || merged.paymentStatus === 'DEPOSIT_PAID') && !merged.paidAt) {
      merged.paidAt = now;
      merged.holdExpiresAt = null;
    }
    if (merged.status === 'confirmed' && !merged.approvedAt) {
      merged.approvedAt = now;
    }
    if (merged.status === 'cancelled') {
      merged.smartLockPin = null;
      merged.holdExpiresAt = null;
    }

    const updated = normalizeBookingRecord(merged, roomsList);
    rawList[idx] = updated;
    writeJsonAtomic(bookingsFile, rawList);

    await upsertBookingToSupabaseSafe(updated);
    return updated;
  });
}

/**
 * Ghi nhận giao dịch thanh toán có chống trùng lặp theo `gatewayTxnId` (D8)
 */
async function recordPaymentTransaction({
  bookingId,
  amount,
  gatewayTxnId,
  bankCode = 'MB',
  source = 'webhook',
  recordedBy = 'system',
  smartLockPin = null,
  autoConfirm = true,
  strictAmount = false,
  rawPayload = null,
  roomsList = CANONICAL_ROOMS
}) {
  return withDataMutex(async () => {
    const { bookingsFile, transactionsFile, sessionsFile } = getStorePaths();
    const transactions = readJsonSafe(transactionsFile, []);
    const cleanTxId = String(gatewayTxnId || `TX_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`).trim();

    const existingTx = transactions.find((t) => t && t.gatewayTxnId === cleanTxId);
    const rawList = readJsonSafe(bookingsFile, []);
    const idx = rawList.findIndex((b) => matchesBookingCode(b, bookingId));

    if (existingTx) {
      if (idx !== -1 && !matchesBookingCode(rawList[idx], existingTx.bookingCode)) {
        const err = new Error(`Mã giao dịch ${cleanTxId} đã được gắn cho đơn đặt phòng khác.`);
        err.status = 409;
        err.code = 'DUPLICATE_TXN_DIFFERENT_BOOKING';
        throw err;
      }
      const currentBooking = idx !== -1 ? normalizeBookingRecord(rawList[idx], roomsList) : null;
      return {
        duplicate: true,
        transaction: existingTx,
        booking: currentBooking,
        smartLockPin: (currentBooking && currentBooking.smartLockPin) || existingTx.smartLockPin || smartLockPin
      };
    }

    const numericAmount = Math.trunc(Number(amount) || 0);
    const now = new Date().toISOString();
    let updatedBooking = null;
    let finalPin = smartLockPin;

    if (idx !== -1) {
      const current = normalizeBookingRecord(rawList[idx], roomsList);
      const addAmount = numericAmount > 0 ? numericAmount : current.depositAmount;
      const newPaidAmount = (current.paidAmount || 0) + addAmount;
      const meetsRequirement = !strictAmount || newPaidAmount >= current.depositAmount;

      if (meetsRequirement) {
        finalPin = current.smartLockPin || smartLockPin || String(crypto.randomInt(100000, 1000000));
      } else {
        finalPin = current.smartLockPin || null;
      }

      updatedBooking = normalizeBookingRecord(
        {
          ...current,
          paidAmount: newPaidAmount,
          paymentStatus: meetsRequirement ? 'PAID' : 'UNPAID',
          status: meetsRequirement && autoConfirm ? 'confirmed' : current.status,
          smartLockPin: finalPin,
          holdExpiresAt: null,
          paidAt: meetsRequirement ? (current.paidAt || now) : current.paidAt,
          approvedAt: meetsRequirement && autoConfirm ? (current.approvedAt || now) : current.approvedAt,
          approvedBy: meetsRequirement && autoConfirm ? (current.approvedBy || recordedBy) : current.approvedBy,
          updatedAt: now
        },
        roomsList
      );

      rawList[idx] = updatedBooking;
      writeJsonAtomic(bookingsFile, rawList);

      // Cập nhật phiên VietQR liên quan sang COMPLETED nếu có
      const sessionsMap = readJsonSafe(sessionsFile, {});
      let sessionsChanged = false;
      for (const sKey of Object.keys(sessionsMap)) {
        const s = sessionsMap[sKey];
        if (s && matchesBookingCode({ id: s.bookingId }, updatedBooking.bookingCode) && s.lockStatus === 'LOCKED') {
          s.lockStatus = 'COMPLETED';
          s.paidAt = now;
          s.smartlockPinCode = finalPin;
          s.transactionRef = cleanTxId;
          sessionsChanged = true;
        }
      }
      if (sessionsChanged) {
        writeJsonAtomic(sessionsFile, sessionsMap);
      }

      // Đồng bộ sang Supabase qua RPC `banla.record_payment` + `banla.approve_booking` nếu có service_role
      const sb = getServiceRoleClient();
      if (sb) {
        try {
          await sb.rpc('record_payment', {
            p_booking_code: updatedBooking.bookingCode,
            p_amount: addAmount,
            p_gateway_txn_id: cleanTxId,
            p_bank_code: bankCode || 'MB',
            p_source: source === 'manual' ? 'manual' : 'webhook',
            p_recorded_by: recordedBy,
            p_raw_payload: rawPayload
          });
          if (meetsRequirement && autoConfirm && finalPin && /^[0-9]{6}$/.test(String(finalPin))) {
            await sb.rpc('approve_booking', {
              p_booking_code: updatedBooking.bookingCode,
              p_pin: String(finalPin),
              p_approved_by: recordedBy || 'system'
            });
          }
        } catch (err) {
          logger.warn('Đồng bộ giao dịch sang Supabase cảnh báo:', err.message);
          await upsertBookingToSupabaseSafe(updatedBooking);
        }
      }
    }

    const txRecord = {
      id: `TXN_${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      bookingCode: updatedBooking ? updatedBooking.bookingCode : cleanBookingCode(bookingId).toUpperCase(),
      referenceCode: `BANLA_${updatedBooking ? updatedBooking.bookingCode : cleanBookingCode(bookingId).toUpperCase()}`,
      gatewayTxnId: cleanTxId,
      amount: numericAmount,
      bankCode: bankCode || 'MB',
      source: source === 'manual' ? 'manual' : 'webhook',
      recordedBy,
      smartLockPin: finalPin || null,
      createdAt: now
    };

    transactions.push(txRecord);
    writeJsonAtomic(transactionsFile, transactions);

    return {
      duplicate: false,
      transaction: txRecord,
      booking: updatedBooking,
      smartLockPin: finalPin
    };
  });
}

/**
 * Lưu và đọc phiên thanh toán VietQR thực tế (`payment_sessions.json` + Supabase `banla.payment_sessions`)
 */
async function savePaymentSession(sessionData) {
  return withDataMutex(async () => {
    const { sessionsFile } = getStorePaths();
    const sessions = readJsonSafe(sessionsFile, {});
    sessions[sessionData.sessionId] = sessionData;
    writeJsonAtomic(sessionsFile, sessions);

    const sb = getServiceRoleClient();
    if (sb) {
      try {
        await sb.from('payment_sessions').upsert(
          {
            session_id: sessionData.sessionId,
            booking_code: cleanBookingCode(sessionData.bookingId).toUpperCase(),
            room_code: resolveRoom(sessionData.roomId || sessionData.roomName).code,
            customer_name: sessionData.customerName || 'Quý khách Banla',
            customer_contact: sessionData.customerContact || '',
            gross_amount: Math.trunc(Number(sessionData.grossAmount)),
            fee_amount: Math.trunc(Number(sessionData.feeAmount) || 0),
            net_amount: Math.trunc(Number(sessionData.netAmount) || 0),
            currency: 'VND',
            memo: sessionData.memo,
            bank_code: sessionData.bankDetails?.bankCode || 'MB',
            account_number: sessionData.bankDetails?.accountNumber || '0352554863',
            vietqr_url: sessionData.vietQrUrl,
            lock_status: sessionData.lockStatus || 'LOCKED',
            expires_at: sessionData.expiresAt
          },
          { onConflict: 'memo' }
        );
      } catch (err) {
        logger.warn('Bỏ qua đồng bộ payment_sessions lên Supabase:', err.message);
      }
    }

    return sessionData;
  });
}

function getPaymentSessionSync(sessionId) {
  const { sessionsFile } = getStorePaths();
  const sessions = readJsonSafe(sessionsFile, {});
  const found = sessions[sessionId];
  if (!found) return null;

  if (found.lockStatus === 'LOCKED' && found.expiresAt && Date.parse(found.expiresAt) <= Date.now()) {
    found.lockStatus = 'EXPIRED';
  }
  return found;
}

module.exports = {
  withDataMutex,
  getStorePaths,
  getStorageInfo,
  cleanBookingCode,
  matchesBookingCode,
  normalizePhoneDigits,
  normalizeBookingRecord,
  listBookings,
  listBookingsSync,
  findBookingByCode,
  findBookingByCodeSync,
  checkRoomAvailabilitySync,
  listRoomsWithAvailability,
  createBooking,
  updateBooking,
  recordPaymentTransaction,
  savePaymentSession,
  getPaymentSessionSync
};
