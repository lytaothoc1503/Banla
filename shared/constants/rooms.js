/**
 * BANLA BOUTIQUE HOTEL — SHARED ROOM CATALOG & PRICING RULES
 * Nguồn chân lý dùng chung cho tính giá phòng phía Server (số nguyên VND).
 * Không bao giờ tin giá tiền do client gửi lên.
 */
'use strict';

const CANONICAL_ROOMS = Object.freeze([
  { id: 'elite', code: 'elite', name: 'Élite Room', price: 1250000, maxGuests: 3, inventory: 1 },
  { id: 'signature', code: 'signature', name: 'Banla Signature', price: 1150000, maxGuests: 3, inventory: 1 },
  { id: 'highland', code: 'highland', name: 'Highland Room', price: 1100000, maxGuests: 3, inventory: 1 },
  { id: 'connecting', code: 'connecting', name: 'Connecting Room', price: 1850000, maxGuests: 6, inventory: 1 },
  { id: 'twin', code: 'twin', name: 'Deluxe Twin', price: 950000, maxGuests: 3, inventory: 1 },
  { id: 'suite', code: 'suite', name: 'Original Suite', price: 1550000, maxGuests: 3, inventory: 1 },
  { id: 'balcony', code: 'balcony', name: 'Deluxe Balcony', price: 980000, maxGuests: 3, inventory: 1 }
]);

const ROOM_ALIASES = Object.freeze({
  elite: 'elite',
  'élite room': 'elite',
  'elite room': 'elite',
  'attic room': 'elite',
  signature: 'signature',
  'banla signature': 'signature',
  highland: 'highland',
  'highland room': 'highland',
  'king room hướng núi': 'highland',
  connecting: 'connecting',
  'connecting room': 'connecting',
  twin: 'twin',
  deluxe_twin: 'twin',
  'deluxe twin': 'twin',
  suite: 'suite',
  original_suite: 'suite',
  'original suite': 'suite',
  'suite hướng núi': 'suite',
  'suite room': 'suite',
  balcony: 'balcony',
  deluxe_balcony: 'balcony',
  'deluxe balcony': 'balcony',
  'deluxe với ban công': 'balcony',
  'balcony room': 'balcony'
});

/**
 * Chuẩn hóa lựa chọn giữ phòng sang 'deposit_50' hoặc 'pay_100'
 */
function normalizePaymentOption(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'pay_100' || v === 'full_100' || v === '100') {
    return 'pay_100';
  }
  return 'deposit_50';
}

/**
 * Chuẩn hóa phương thức thanh toán sang 'vietqr' hoặc 'visa'
 */
function normalizePaymentMethod(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'visa' || v === 'card' || v === 'onepay' || v === 'international_card') {
    return 'visa';
  }
  return 'vietqr';
}

/**
 * Tìm hạng phòng theo mã hoặc tên hiển thị (hỗ trợ cả alias từ schema OnePay/cũ)
 */
function resolveRoom(roomQuery, customRoomsList = null) {
  const list = Array.isArray(customRoomsList) && customRoomsList.length > 0
    ? customRoomsList
    : CANONICAL_ROOMS;

  const q = String(roomQuery || '').trim().toLowerCase();
  if (!q) {
    return list.find((r) => r.id === 'signature') || CANONICAL_ROOMS[1];
  }

  const aliasId = ROOM_ALIASES[q];
  if (aliasId) {
    const byAlias = list.find((r) => String(r.id || r.code).toLowerCase() === aliasId);
    if (byAlias) return byAlias;
  }

  const direct = list.find((r) => {
    const rId = String(r.id || r.code || '').toLowerCase();
    const rName = String(r.name || '').toLowerCase();
    return rId === q || rName === q || (rId && q.includes(rId));
  });

  return direct || list.find((r) => r.id === 'signature') || CANONICAL_ROOMS[1];
}

/**
 * Tính toán giá phòng bằng số nguyên VND trên Server:
 * - deposit_50 (DEPOSIT_50): Cọc trước 50%, 50% còn lại thanh toán khi check-in, không giảm giá.
 * - pay_100 (FULL_100): Thanh toán trước 100%, ưu đãi giảm ngay 10% tổng tiền phòng.
 */
function calculateStayPricing({ unitPriceVnd, nights, paymentOption }) {
  const unitPrice = Math.trunc(Number(unitPriceVnd) || 1150000);
  const safeNights = Math.max(1, Math.min(60, Math.trunc(Number(nights) || 1)));
  const normalizedOption = normalizePaymentOption(paymentOption);

  if (unitPrice <= 0) {
    throw new Error('Đơn giá phòng không hợp lệ.');
  }

  const subtotalVnd = unitPrice * safeNights;

  if (normalizedOption === 'pay_100') {
    const discountVnd = Math.round(subtotalVnd * 0.10);
    const amountDueVnd = Math.max(0, subtotalVnd - discountVnd);
    return {
      unitPriceVnd: unitPrice,
      nights: safeNights,
      paymentOption: 'pay_100',
      paymentPlanCode: 'FULL_100',
      subtotalVnd,
      discountVnd,
      totalAfterDiscountVnd: amountDueVnd,
      depositVnd: amountDueVnd,
      amountDueVnd,
      remainingVnd: 0
    };
  }

  const depositVnd = Math.round(subtotalVnd * 0.50);
  const remainingVnd = Math.max(0, subtotalVnd - depositVnd);
  return {
    unitPriceVnd: unitPrice,
    nights: safeNights,
    paymentOption: 'deposit_50',
    paymentPlanCode: 'DEPOSIT_50',
    subtotalVnd,
    discountVnd: 0,
    totalAfterDiscountVnd: subtotalVnd,
    depositVnd,
    amountDueVnd: depositVnd,
    remainingVnd
  };
}

module.exports = {
  CANONICAL_ROOMS,
  ROOM_ALIASES,
  normalizePaymentOption,
  normalizePaymentMethod,
  resolveRoom,
  calculateStayPricing
};
