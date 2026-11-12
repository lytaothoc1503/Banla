'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.BanlaConciergeKnowledge = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/**
 * Bộ tri thức lễ tân Banla — dùng chung cho Express /api/chat và banla-concierge.js (sao chép đồng bộ).
 * Chỉ nêu chính sách đang có trên form/web: Cọc 50%, Thanh toán 100% giảm 10%, The Roof 15%.
 * Không nêu ưu đãi "đặt sớm 14 ngày" (chưa áp dụng trên form).
 */

const HOTLINE = '0296.9996.999';
const HOTLINE_ALT = '0352554863';
const FANPAGE = 'https://www.facebook.com/Banlaboutiquedalat/';

function normalizeVi(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWord(q, word) {
  return new RegExp('(?:^|\\s)' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)').test(q);
}

function wantsFamilyWithChild(q) {
  const hasAdults =
    q.includes('2 nguoi lon') ||
    hasWord(q, '2 nl') ||
    q.includes('vo chong') ||
    q.includes('gia dinh nho');
  const hasChild =
    q.includes('1 be') ||
    q.includes('1 tre') ||
    q.includes('em be') ||
    q.includes('con nho') ||
    q.includes('co be') ||
    q.includes('co tre') ||
    (q.includes('gia dinh nho') && !q.includes('4 nguoi'));
  if (q.includes('2 nguoi lon') && (q.includes('1 be') || q.includes('1 tre') || q.includes('em be') || q.includes('con nho'))) {
    return true;
  }
  if (hasWord(q, '2 nl') && (q.includes('1 be') || q.includes('1 tre') || q.includes('be'))) return true;
  if (q.includes('gia dinh nho')) return true;
  if (q.includes('vo chong') && hasChild) return true;
  if (q.includes('3 nguoi') && (q.includes('be') || q.includes('tre') || q.includes('gia dinh'))) return true;
  return false;
}

function wantsGroup(q) {
  return (
    q.includes('4 nguoi') ||
    q.includes('4 khach') ||
    q.includes('5 nguoi') ||
    q.includes('6 nguoi') ||
    q.includes('nhom ban') ||
    q.includes('connecting') ||
    q.includes('thong nhau') ||
    (q.includes('gia dinh') && !wantsFamilyWithChild(q) && (q.includes('dong') || q.includes('lon') || q.includes('nhieu')))
  );
}

function wantsPaymentOrPin(q) {
  return (
    q.includes('vietqr') ||
    q.includes('dat coc') ||
    q.includes('tien coc') ||
    q.includes('coc 50') ||
    hasWord(q, 'coc') ||
    q.includes('thanh toan') ||
    q.includes('chuyen khoan') ||
    q.includes('dau do') ||
    q.includes('phieu xac nhan') ||
    q.includes('smart lock') ||
    q.includes('smartlock') ||
    hasWord(q, 'pin') ||
    q.includes('khoa thong minh') ||
    (q.includes('khoa') && (q.includes('pin') || q.includes('smart') || q.includes('cua')))
  );
}

function wantsRoof(q) {
  return (
    q.includes('roof') ||
    q.includes('tang thuong') ||
    q.includes('cafe') ||
    q.includes('ca phe') ||
    q.includes('cocktail') ||
    q.includes('wine') ||
    q.includes('ruou vang') ||
    hasWord(q, 'bar')
  );
}

function wantsLocation(q) {
  return (
    q.includes('san bay') ||
    q.includes('lien khuong') ||
    q.includes('dia chi') ||
    q.includes('o dau') ||
    q.includes('duong di') ||
    q.includes('bao xa') ||
    q.includes('ho xuan huong') ||
    q.includes('cho da lat') ||
    q.includes('cho dem') ||
    q.includes('nha trang') ||
    q.includes('xe dua don') ||
    q.includes('do xe') ||
    q.includes('dau xe') ||
    q.includes('bai xe')
  );
}

function wantsSchedule(q) {
  return (
    q.includes('check in') ||
    q.includes('checkin') ||
    q.includes('check out') ||
    q.includes('checkout') ||
    q.includes('nhan phong') ||
    q.includes('tra phong') ||
    q.includes('doi lich') ||
    q.includes('huy phong') ||
    q.includes('gio nhan') ||
    q.includes('gio tra') ||
    (q.includes('may gio') && (q.includes('nhan') || q.includes('tra') || q.includes('check')))
  );
}

function wantsAmenities(q) {
  return (
    q.includes('an sang') ||
    q.includes('bua sang') ||
    q.includes('buffet') ||
    q.includes('tien nghi') ||
    q.includes('wifi') ||
    q.includes('mui huong') ||
    q.includes('tinh dau')
  );
}

function wantsPrices(q) {
  return (
    q.includes('bang gia') ||
    q.includes('gia phong') ||
    q.includes('bao nhieu') ||
    q.includes('hang phong') ||
    q.includes('cac phong') ||
    q.includes('7 phong') ||
    q.includes('7 hang') ||
    q.includes('uu dai') ||
    q.includes('khuyen mai') ||
    q.includes('giam gia') ||
    (hasWord(q, 'gia') && !wantsPaymentOrPin(q))
  );
}

function isGreeting(q) {
  return /^(xin chao|chao|hi|hello|alo|banla oi|shop oi|ad oi|le tan)(\s|$)/.test(q) && q.split(' ').length <= 4;
}

function replyForChiMya(q) {
  if (!q.includes('mya')) return '';
  if (q.includes('du kien') || q.includes('du dinh') || q.includes('ke hoach')) {
    return (
      'Dạ **Chị Mya dự kiến** ghé Đà Lạt thì Banla giữ sẵn góc ấm nhất. Anh chủ nhà đang trêu: "Chị Mya chốt ngày chưa, hay để Banla đợi thêm một tách trà?"\n' +
      'Phòng nhận từ **14:00**, trả trước **12:00**. Chị Mya chọn ngày tại #contact là Banla trải giường liền ạ.'
    );
  }
  if (q.includes('tim phong') || q.includes('phong tai') || (q.includes('phong') && q.includes('dau'))) {
    return (
      'Dạ **Chị Mya đang tìm phòng** thì tìm đúng **Banla Boutique Hotel**, **47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt**. Banla mách nhỏ: phòng tường olive **Banla Signature** hợp Chị Mya — yên, trần gỗ, có chỗ ngồi uống trà.\n' +
      'Đặt giúp Chị Mya tại #contact nhé ạ.'
    );
  }
  if (q.includes('an com') || q.includes('an sang') || q.includes('doi bung')) {
    return (
      'Dạ Banla hỏi lại cho vui: **Chị Mya ăn cơm chưa?** Bếp Banla có phở, bánh mì xíu mại và cà phê rang xay. Chưa ăn thì ghé bàn ấm; ăn rồi thì lên **The Roof** uống gì nóng, phố núi đang lạnh.\n' +
      'Banla không để Chị Mya đói đâu ạ.'
    );
  }
  if (q.includes('giau') || q.includes('nhieu tien')) {
    return (
      'Dạ Banla không đếm ví ai hết. **Chị Mya giàu chưa** thì Banla chỉ thấy Chị Mya giàu sự chiều chuộng: trả đủ trên web được **giảm 10%**, đồ uống **The Roof giảm 15%**. Giàu một chuyến Đà Lạt ấm là đủ làm anh chủ nhà chịu thua ạ.'
    );
  }
  return (
    'Dạ Banla nghe tới **Chị Mya** là cười trước đã. Chị Mya cần phòng, bữa ăn hay chỉ muốn bị trêu một câu, Banla đều có lời.\n' +
    'Hỏi tiếp đi ạ, hoặc đặt giúp Chị Mya tại #contact.'
  );
}

function buildSmartConciergeReply(question) {
  const raw = String(question || '').trim();
  const q = normalizeVi(raw);

  if (!q) {
    return (
      'Dạ Banla Boutique Hotel Đà Lạt kính chào quý khách! **Ngoài lạnh. Trong ấm.**\n' +
      'Banla sẵn sàng tư vấn **hạng phòng**, **giá 700.000 – 1.240.000 ₫/đêm**, **The Roof**, đường đi và **đặt cọc VietQR**.\n' +
      'Quý khách đang đi Đà Lạt mấy người ạ?'
    );
  }

  const myaReply = replyForChiMya(q);
  if (myaReply) return myaReply;

  if (isGreeting(q)) {
    return (
      'Dạ Banla Boutique Hotel Đà Lạt kính chào quý khách! **Ngoài lạnh. Trong ấm.**\n' +
      'Banla có thể tư vấn nhanh cho quý khách về:\n' +
      '- **7 hạng phòng & bảng giá** (700.000 ₫ – 1.240.000 ₫/đêm)\n' +
      '- Gợi ý phòng cho **cặp đôi, gia đình có bé nhỏ, nhóm 4 người**\n' +
      '- Khung giờ & ưu đãi 15% tại **The Roof Café & Cocktail Bar**\n' +
      '- Cách **đặt cọc VietQR** & nhận **Phiếu dấu đỏ + Mã Smart-Lock PIN 6 số**\n' +
      'Quý khách đang dự định đi Đà Lạt mấy người ạ?'
    );
  }

  if (wantsFamilyWithChild(q)) {
    return (
      'Dạ với **2 người lớn và 1 bé**, Banla có **5 hạng phòng** đúng chuẩn sức chứa **2 NL + 1 trẻ**:\n' +
      '- **Élite Room (30m² · 1.060.000 ₫/đêm)**: Gác mái gỗ trầm, có **bồn tắm nằm**, góc thư giãn riêng.\n' +
      '- **Original Suite (35m² · 1.150.000 ₫/đêm)**: Rộng nhất, có khu tiếp khách cho bé.\n' +
      '- **Banla Signature (28m² · 970.000 ₫/đêm)**: Tường xanh olive, trần gỗ ấm, yên tĩnh.\n' +
      '- **Highland Room (28m² · 880.000 ₫/đêm)**: Trần gỗ cao thoáng, giường King.\n' +
      '- **Deluxe Balcony (20m² · 790.000 ₫/đêm)**: Tiết kiệm, ban công riêng thoáng sáng.\n\n' +
      'Quý khách đặt tại #contact — chọn **Cọc 50%** hoặc **Thanh toán 100% giảm 10%** ạ!'
    );
  }

  if (wantsGroup(q)) {
    return (
      'Dạ với gia đình hoặc nhóm bạn **4 – 6 khách**, lựa chọn lý tưởng tại Banla là:\n' +
      '- **Connecting Room (35m² · 1.240.000 ₫/đêm)**: **2 không gian thông nhau**, sức chứa **4 người lớn + 1–2 trẻ**.\n' +
      '- Nhóm 2–3 bạn muốn giường riêng có thể chọn **Deluxe Twin (22m² · 2 giường đơn · 700.000 ₫/đêm)**.\n\n' +
      'Quý khách đặt giữ phòng tại #contact nhé ạ!'
    );
  }

  if (q.includes('elite') || q.includes('gac mai') || q.includes('bon tam')) {
    return (
      'Dạ **Élite Room** là hạng phòng gác mái biểu tượng của Banla:\n' +
      '- **Diện tích & Sức chứa**: 30m² · 2 người lớn + 1 trẻ\n' +
      '- **Giá niêm yết**: **1.060.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **954.000 ₫/đêm**)\n' +
      '- **Nổi bật**: Trần gỗ trầm, giường lớn, góc thư giãn và **bồn tắm nằm**.\n' +
      'Quý khách đặt tại #contact để giữ phòng ạ!'
    );
  }

  if (q.includes('signature') || q.includes('olive')) {
    return (
      'Dạ **Banla Signature**:\n' +
      '- **Diện tích & Sức chứa**: 28m² · 2 người lớn + 1 trẻ\n' +
      '- **Giá niêm yết**: **970.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **873.000 ₫/đêm**)\n' +
      '- **Nổi bật**: Tường xanh olive, trần gỗ ấm, bố cục yên tĩnh.\n' +
      'Quý khách chọn **Banla Signature** tại #contact nhé ạ!'
    );
  }

  if (q.includes('highland') || q.includes('huong nui')) {
    return (
      'Dạ **Highland Room**:\n' +
      '- **Diện tích & Sức chứa**: 28m² · 2 người lớn + 1 trẻ\n' +
      '- **Giá niêm yết**: **880.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **792.000 ₫/đêm**)\n' +
      '- **Nổi bật**: Trần gỗ cao thoáng, giường King, cửa sổ đón nắng sớm.\n' +
      'Mời quý khách đặt tại #contact ạ!'
    );
  }

  if (q.includes('suite') || q.includes('original suite')) {
    return (
      'Dạ **Original Suite**:\n' +
      '- **Diện tích & Sức chứa**: 35m² · 2 người lớn + 1 trẻ\n' +
      '- **Giá niêm yết**: **1.150.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **1.035.000 ₫/đêm**)\n' +
      '- **Nổi bật**: Suite rộng, bàn làm việc, khu tiếp khách ấm cúng.\n' +
      'Quý khách đặt giữ phòng tại #contact nhé ạ!'
    );
  }

  if (q.includes('twin') || q.includes('2 giuong') || q.includes('hai giuong')) {
    return (
      'Dạ **Deluxe Twin**:\n' +
      '- **Diện tích & Sức chứa**: 22m² · 2–3 người lớn (2 giường đơn)\n' +
      '- **Giá niêm yết**: **700.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **630.000 ₫/đêm**)\n' +
      'Quý khách đặt ngay tại #contact ạ!'
    );
  }

  if (q.includes('balcony') || q.includes('ban cong')) {
    return (
      'Dạ **Deluxe Balcony**:\n' +
      '- **Diện tích & Sức chứa**: 20m² · 2 người lớn + 1 trẻ\n' +
      '- **Giá niêm yết**: **790.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **711.000 ₫/đêm**)\n' +
      '- **Nổi bật**: Ban công riêng hướng phố núi, ánh sáng tự nhiên.\n' +
      'Mời quý khách đặt tại #contact ạ!'
    );
  }

  if (wantsRoof(q)) {
    return (
      'Dạ **The Roof by Banla** trên tầng thượng, tầm nhìn phố núi mờ sương:\n' +
      '- **Café & Trà nóng**: **08:00 – 16:00** hàng ngày\n' +
      '- **Cocktail & Wine Bar**: **16:00 – 00:00** hàng ngày\n' +
      '- **Đặc quyền khách lưu trú đặt trên website**: giảm **15%** đồ uống tại The Roof; gói từ **3 đêm** được tặng **02 đồ uống** chào mừng (tuỳ tình trạng phục vụ).\n' +
      'Quý khách đặt phòng tại #contact để nhận ưu đãi nhé!'
    );
  }

  if (wantsPaymentOrPin(q)) {
    return (
      'Dạ quy trình **Đặt phòng – VietQR – Phiếu Dấu Đỏ & Smart-Lock PIN** tại Banla:\n' +
      '- **Bước 1**: Điền #contact — chọn **Cọc 50%** (phần còn lại trả khi check-in) hoặc **Thanh toán 100% (giảm ngay 10%)**.\n' +
      '- **Bước 2**: Quét VietQR **MB Bank · STK 0352554863 — BANLA BOUTIQUE HOTEL**, nội dung `BANLA_MÃĐƠN`.\n' +
      '- **Bước 3**: Gửi biên lai qua Fanpage Facebook Banla. Sau đối soát, nhận **Phiếu dấu đỏ** và **mã Smart-Lock PIN 6 số** (hiệu lực **14:00 check-in → 12:00 check-out**).\n' +
      '- **Thẻ Visa, Mastercard, JCB, Amex, Apple Pay, Google Pay, Samsung Pay hoặc QR**: bấm **Thanh toán an toàn qua PayPal**, **OnePay** hoặc **9Pay** (nút 9Pay chỉ hiện khi khách sạn đã bật cổng). Số thẻ chỉ nhập trên trang của cổng. Banla không thu thập hoặc lưu số thẻ, ngày hết hạn hay mã CVV.'
    );
  }

  if (wantsLocation(q)) {
    return (
      'Dạ vị trí và di chuyển đến **Banla Boutique Hotel Đà Lạt**:\n' +
      '- **Địa chỉ**: **47 Nguyễn Đình Chiểu, Phường 9, TP. Đà Lạt** (khu yên tĩnh, có chỗ đậu xe).\n' +
      '- **Trung tâm**: khoảng **5–7 phút** tới **Hồ Xuân Hương, Vườn Hoa Thành Phố, Chợ Đêm Đà Lạt**.\n' +
      '- **Sân bay Liên Khương**: khoảng **30 km (~35 phút)**. Lễ tân hỗ trợ đặt xe đưa đón và limousine **Đà Lạt – Nha Trang (135 km qua đèo Khánh Lê)**.\n' +
      'Cần chỉ đường hoặc đặt xe: Hotline **' +
      HOTLINE +
      ' – ' +
      HOTLINE_ALT +
      '** ạ!'
    );
  }

  if (wantsSchedule(q)) {
    return (
      'Dạ quy định giờ nhận – trả phòng tại Banla:\n' +
      '- **Check-in**: từ **14:00** (PIN Smart-Lock kích hoạt từ 14:00).\n' +
      '- **Check-out**: trước **12:00**.\n' +
      '- **Nhận sớm / Đổi lịch**: lưu trú từ **3 đêm** có thể hỗ trợ nhận sớm từ **12:00** (tuỳ phòng trống). Đổi ngày vui lòng báo trước tối thiểu **72 giờ** qua Hotline **' +
      HOTLINE +
      '** hoặc Fanpage Facebook Banla.'
    );
  }

  if (wantsAmenities(q)) {
    return (
      'Dạ tiện nghi tại Banla Boutique Hotel:\n' +
      '- **Bữa sáng**: phở, bánh mì xíu mại, món Á – Âu, cà phê rang xay.\n' +
      '- **Boutique**: Smart-Lock PIN 6 số, WiFi miễn phí, nước nóng; hương gỗ ấm tại sảnh.\n' +
      '- **The Roof**: giảm **15%** đồ uống cho khách đặt trên website.\n' +
      'Quý khách đặt tại #contact hoặc gọi **' +
      HOTLINE +
      '** ạ!'
    );
  }

  if (wantsPrices(q)) {
    return (
      'Dạ **bảng giá niêm yết 7 hạng phòng** tại Banla Boutique Hotel Đà Lạt:\n' +
      '- **Deluxe Twin** (22m² · 2–3 NL · 2 giường đơn): **700.000 ₫/đêm**\n' +
      '- **Deluxe Balcony** (20m² · 2 NL + 1 trẻ · Ban công): **790.000 ₫/đêm**\n' +
      '- **Highland Room** (28m² · 2 NL + 1 trẻ · Trần gỗ cao): **880.000 ₫/đêm**\n' +
      '- **Banla Signature** (28m² · 2 NL + 1 trẻ · Xanh olive): **970.000 ₫/đêm**\n' +
      '- **Élite Room** (30m² · 2 NL + 1 trẻ · Gác mái, bồn tắm): **1.060.000 ₫/đêm**\n' +
      '- **Original Suite** (35m² · 2 NL + 1 trẻ · Suite rộng): **1.150.000 ₫/đêm**\n' +
      '- **Connecting Room** (35m² · 4 NL + 1–2 trẻ · 2 phòng thông nhau): **1.240.000 ₫/đêm**\n\n' +
      '**Ưu đãi đặt trên website**: **Thanh toán 100% giảm 10%** qua VietQR; khách lưu trú giảm **15%** đồ uống tại **The Roof**. Đặt tại #contact ạ!'
    );
  }

  return (
    'Dạ cảm ơn quý khách đã quan tâm đến **Banla Boutique Hotel Đà Lạt** (47 Nguyễn Đình Chiểu, Phường 9)!\n' +
    '- **7 hạng phòng**: **700.000 ₫ – 1.240.000 ₫/đêm** (từ 2 khách đến nhóm 4–6 khách).\n' +
    '- **Đặt trực tiếp**: **Cọc 50%** hoặc **Thanh toán 100% giảm 10%**; ưu đãi **15%** tại The Roof.\n' +
    '- **Sau đối soát VietQR**: Phiếu dấu đỏ + **Smart-Lock PIN 6 số**.\n\n' +
    'Quý khách đặt tại #contact hoặc Hotline **' +
    HOTLINE +
    ' – ' +
    HOTLINE_ALT +
    '** / [Fanpage Banla 24/7](' +
    FANPAGE +
    ') ạ!'
  );
}


  return {
    HOTLINE: HOTLINE,
    HOTLINE_ALT: HOTLINE_ALT,
    FANPAGE: FANPAGE,
    normalizeVi: normalizeVi,
    buildSmartConciergeReply: buildSmartConciergeReply
  };
});
