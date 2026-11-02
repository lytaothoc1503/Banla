const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Mock browser window and document for phieu.js
const windowMock = {};
global.window = windowMock;
global.document = {
  getElementById: () => null,
  createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
  head: { appendChild: () => {} }
};

// Load phieu.js
require('../phieu.js');

test('Xác thực logic Phiếu: Đơn chưa thanh toán (Pending) TUYỆT ĐỐI KHÔNG có dấu đỏ ĐÃ THANH TOÁN và KHÔNG lộ PIN', () => {
  const unpaidBooking = {
    id: 'BL_TEST_UNPAID',
    booking_code: 'BL_TEST_UNPAID',
    guest_name: 'Nguyễn Văn Test',
    room_id: 'Banla Signature',
    check_in: '2026-11-10',
    check_out: '2026-11-12',
    total_amount: 2300000,
    paid_amount: 0,
    payment_status: 'pending',
    booking_status: 'pending',
    smartlock_pin: ''
  };

  const html = windowMock.BanlaSlip(unpaidBooking);

  // 1. Phải là phiếu yêu cầu / tạm tính chờ thanh toán
  assert.ok(html.includes('PHIẾU YÊU CẦU ĐẶT PHÒNG'), 'Tiêu đề phải là Phiếu Yêu Cầu Đặt Phòng khi chưa thanh toán');
  assert.ok(html.includes('CHỜ THANH TOÁN & ĐỐI SOÁT'), 'Phải có nhãn Chờ thanh toán');

  // 2. Tuyệt đối KHÔNG có con dấu ĐÃ THANH TOÁN
  assert.ok(!html.includes('ĐÃ THANH TOÁN'), 'Tuyệt đối không được có chữ ĐÃ THANH TOÁN trên con dấu khi CSDL chưa xác thực');
  assert.ok(html.includes('CHƯA THANH TOÁN'), 'Dấu nước mờ phải ghi rõ CHƯA THANH TOÁN');
  assert.ok(html.includes('CHỜ ĐỐI SOÁT THANH TOÁN'), 'Dấu nước mờ phải ghi rõ CHỜ ĐỐI SOÁT THANH TOÁN');

  // 3. Mã PIN phải ở trạng thái chưa kích hoạt
  assert.ok(html.includes('Chưa kích hoạt (Chờ đối soát thanh toán)'), 'Mã Smart-Lock PIN không được cấp khi chưa thanh toán');
});

test('Xác thực logic Phiếu: Đơn ĐÃ XÁC THỰC THANH TOÁN (Paid) trong CSDL được cấp dấu đỏ và mã PIN', () => {
  const paidBooking = {
    id: 'BL_TEST_PAID',
    booking_code: 'BL_TEST_PAID',
    guest_name: 'Trần Thị Thật',
    room_id: 'Banla Signature',
    check_in: '2026-11-10',
    check_out: '2026-11-12',
    total_amount: 2300000,
    paid_amount: 2300000,
    payment_status: 'paid',
    booking_status: 'confirmed',
    smartlock_pin: '849201'
  };

  const html = windowMock.BanlaSlip(paidBooking);

  // 1. Phải là phiếu xác nhận dịch vụ chính thức
  assert.ok(html.includes('PHIẾU XÁC NHẬN DỊCH VỤ'), 'Tiêu đề là Phiếu Xác Nhận Dịch Vụ khi đã thanh toán');
  assert.ok(html.includes('ĐÃ THANH TOÁN ĐỦ (100%)'), 'Phải có nhãn Đã thanh toán');

  // 2. Phải có dấu mộc đỏ chính thức
  assert.ok(html.includes('banla-seal-svg'), 'Phải có class con dấu đỏ vector chính thức');
  assert.ok(html.includes('ĐÃ THANH TOÁN'), 'Con dấu đỏ phải mang dòng chữ ĐÃ THANH TOÁN');
  assert.ok(html.includes('BANLA BOUTIQUE HOTEL'), 'Con dấu đỏ phải mang tên Banla Boutique Hotel');

  // 3. Phải kích hoạt mã PIN Smart-Lock
  assert.ok(html.includes('849201'), 'Phải hiển thị mã PIN Smart-Lock đã kích hoạt');
  assert.ok(html.includes('Đã kích hoạt'), 'Phải có nhãn đã kích hoạt');
});
