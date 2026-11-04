/* Banla × Gemini — Trợ lý lễ tân AI "Bàn Là".
   Ưu tiên kết nối:
     1. Backend nội bộ `/api/chat` (khi chạy trên Node.js Express server)
     2. Supabase Edge Function `banla-gemini` (khi đã deploy lên Supabase)
     3. Bộ tri thức thông minh tích hợp sẵn `BANLA_SMART_CONCIERGE` (luôn hoạt động 24/7 trên cả GitHub Pages / banlaboutiquedalat.com mà không bao giờ báo lỗi "Trợ lý AI tạm thời chưa sẵn sàng"). */
(function () {
  'use strict';

  var HOTLINE = '0296.9996.999';
  var HOTLINE_ALT = '0352554863';
  var FANPAGE = 'https://www.facebook.com/Banlaboutiquedalat/';
  var STORE_KEY = 'banla_concierge_history_v1';
  var SUGGESTIONS = [
    'Phòng nào hợp cho 2 người lớn và 1 bé?',
    'Bảng giá 7 hạng phòng tại Banla?',
    'Giờ mở cửa và ưu đãi The Roof?',
    'Cách đặt cọc VietQR & nhận mã PIN Smart-Lock?',
    'Từ sân bay Liên Khương về khách sạn bao xa?'
  ];

  /* Bộ dữ liệu chính thức chuẩn xác 100% của Banla Boutique Hotel Đà Lạt */
  var ROOMS_CATALOG = [
    {
      code: 'elite',
      name: 'Élite Room (Phòng Gác Mái)',
      area: '30m²',
      capacity: '2 người lớn + 1 trẻ',
      maxGuests: 3,
      price: 1250000,
      priceText: '1.250.000 ₫/đêm',
      highlights: 'Gác mái gỗ trầm ấm cúng, bồn tắm nằm thư giãn, giường lớn và góc đọc sách riêng.'
    },
    {
      code: 'signature',
      name: 'Banla Signature',
      area: '28m²',
      capacity: '2 người lớn + 1 trẻ',
      maxGuests: 3,
      price: 1150000,
      priceText: '1.150.000 ₫/đêm',
      highlights: 'Tường xanh olive thanh lịch, trần gỗ ấm, không gian yên tĩnh và cân đối.'
    },
    {
      code: 'highland',
      name: 'Highland Room',
      area: '28m²',
      capacity: '2 người lớn + 1 trẻ',
      maxGuests: 3,
      price: 1100000,
      priceText: '1.100.000 ₫/đêm',
      highlights: 'Trần gỗ cao thoáng, giường King êm ái, cửa sổ đón nắng sớm cao nguyên.'
    },
    {
      code: 'connecting',
      name: 'Connecting Room (Phòng Gia Đình Thông Nhau)',
      area: '35m²',
      capacity: '4 người lớn + 1–2 trẻ',
      maxGuests: 6,
      price: 1850000,
      priceText: '1.850.000 ₫/đêm',
      highlights: '2 không gian phòng thông nhau tiện lợi, phù hợp gia đình hoặc nhóm bạn 4–6 người.'
    },
    {
      code: 'twin',
      name: 'Deluxe Twin (2 Giường Đơn)',
      area: '22m²',
      capacity: '2–3 người lớn',
      maxGuests: 3,
      price: 950000,
      priceText: '950.000 ₫/đêm',
      highlights: '2 giường đơn êm ái, gọn gàng, tối ưu chi phí cho bạn bè hoặc đồng nghiệp.'
    },
    {
      code: 'suite',
      name: 'Original Suite',
      area: '35m²',
      capacity: '2 người lớn + 1 trẻ',
      maxGuests: 3,
      price: 1550000,
      priceText: '1.550.000 ₫/đêm',
      highlights: 'Hạng Suite rộng rãi nhất cho cặp đôi/gia đình nhỏ, có bàn làm việc và khu tiếp khách riêng.'
    },
    {
      code: 'balcony',
      name: 'Deluxe Balcony',
      area: '20m²',
      capacity: '2 người lớn + 1 trẻ',
      maxGuests: 3,
      price: 980000,
      priceText: '980.000 ₫/đêm',
      highlights: 'Ban công riêng nhìn ra phố núi, ngập tràn ánh sáng tự nhiên để thưởng trà ngắm sương.'
    }
  ];

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

  /* Trí tuệ lễ tân nội bộ (Smart Knowledge Engine) — Trả lời tức thì, chuẩn xác 100% dữ liệu thật */
  function generateLocalConciergeReply(question) {
    var raw = String(question || '').trim();
    var q = normalizeVi(raw);

    // 1. Chào hỏi
    if (/^(xin chao|chao|hi|hello|alo|banla oi|shop oi|ad oi|le tan)(\s|$)/.test(q) && q.split(' ').length <= 4) {
      return 'Dạ Banla Boutique Hotel Đà Lạt kính chào quý khách! **Ngoài lạnh. Trong ấm.**\n' +
        'Banla có thể tư vấn nhanh cho quý khách về:\n' +
        '- **7 hạng phòng & bảng giá** (950.000 ₫ – 1.850.000 ₫/đêm)\n' +
        '- Gợi ý phòng cho **cặp đôi, gia đình có bé nhỏ, nhóm 4 người**\n' +
        '- Khung giờ & ưu đãi 15% tại **The Roof Café & Cocktail Bar**\n' +
        '- Cách **đặt cọc VietQR** & nhận **Phiếu dấu đỏ + Mã Smart-Lock PIN 6 số**\n' +
        'Quý khách đang dự định đi Đà Lạt mấy người ạ?';
    }

    // 2. Tư vấn phòng cho 2 người lớn và 1 bé (hoặc gia đình nhỏ 3 người)
    if (
      (q.indexOf('2 nguoi lon') !== -1 && (q.indexOf('1 be') !== -1 || q.indexOf('1 tre') !== -1 || q.indexOf('em be') !== -1 || q.indexOf('con nho') !== -1)) ||
      q.indexOf('2 nl') !== -1 ||
      (q.indexOf('gia dinh nho') !== -1) ||
      (q.indexOf('vo chong') !== -1 && (q.indexOf('be') !== -1 || q.indexOf('con') !== -1))
    ) {
      return 'Dạ với **2 người lớn và 1 bé**, Banla có **5 hạng phòng** đúng chuẩn sức chứa **2 NL + 1 trẻ**, rất ấm áp và thoải mái ạ:\n' +
        '- **Élite Room (30m² · 1.250.000 ₫/đêm)**: Phòng gác mái gỗ trầm đặc trưng, có **bồn tắm nằm** và góc thư giãn riêng (được các gia đình có bé yêu thích nhất).\n' +
        '- **Original Suite (35m² · 1.550.000 ₫/đêm)**: Không gian rộng rãi nhất, có khu vực tiếp khách thoải mái cho bé vui chơi.\n' +
        '- **Banla Signature (28m² · 1.150.000 ₫/đêm)**: Tông xanh olive dịu mắt, trần gỗ ấm và yên tĩnh.\n' +
        '- **Highland Room (28m² · 1.100.000 ₫/đêm)**: Trần gỗ cao thoáng, giường King êm ái đón nắng sớm.\n' +
        '- **Deluxe Balcony (20m² · 980.000 ₫/đêm)**: Tiết kiệm, có ban công riêng thoáng sáng.\n\n' +
        'Quý khách có thể chọn phòng và đặt ngay tại #contact (chọn **Cọc 50%** hoặc **Thanh toán 100% giảm 10%**) ạ!';
    }

    // 3. Tư vấn phòng cho 4 người / gia đình đông / nhóm bạn
    if (
      q.indexOf('4 nguoi') !== -1 ||
      q.indexOf('4 khach') !== -1 ||
      q.indexOf('5 nguoi') !== -1 ||
      q.indexOf('6 nguoi') !== -1 ||
      q.indexOf('nhom ban') !== -1 ||
      q.indexOf('connecting') !== -1 ||
      q.indexOf('thong nhau') !== -1 ||
      (q.indexOf('gia dinh') !== -1 && q.indexOf('1 be') === -1)
    ) {
      return 'Dạ với gia đình hoặc nhóm bạn **4 – 6 khách**, lựa chọn lý tưởng nhất tại Banla là:\n' +
        '- **Connecting Room (35m² · 1.850.000 ₫/đêm)**: Thiết kế **2 không gian phòng thông nhau** tiện lợi, sức chứa **4 người lớn + 1–2 trẻ**, vừa gắn kết vừa đảm bảo sự riêng tư.\n' +
        '- Ngoài ra nếu đi nhóm 2–3 bạn muốn nằm giường riêng, quý khách có thể chọn **Deluxe Twin (22m² · 2 giường đơn · 950.000 ₫/đêm)**.\n\n' +
        'Quý khách bấm vào #contact để đặt giữ phòng sớm nhé ạ!';
    }

    // 4. Hỏi cụ thể về từng hạng phòng (Élite, Signature, Highland, Suite, Twin, Balcony)
    if (q.indexOf('elite') !== -1 || q.indexOf('gac mai') !== -1 || q.indexOf('bon tam') !== -1) {
      return 'Dạ **Élite Room** là hạng phòng gác mái biểu tượng của Banla ạ:\n' +
        '- **Diện tích & Sức chứa**: 30m² · 2 người lớn + 1 trẻ\n' +
        '- **Giá niêm yết**: **1.250.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **1.125.000 ₫/đêm**)\n' +
        '- **Điểm nổi bật**: Trần gỗ trầm ấm áp, giường lớn, góc thư giãn riêng và **bồn tắm nằm** thư giãn.\n' +
        'Quý khách có thể đặt ngay tại #contact để giữ căn gác mái đẹp nhất ạ!';
    }

    if (q.indexOf('signature') !== -1 || q.indexOf('olive') !== -1) {
      return 'Dạ **Banla Signature** mang đậm tinh thần nghệ thuật tối giản của Banla:\n' +
        '- **Diện tích & Sức chứa**: 28m² · 2 người lớn + 1 trẻ\n' +
        '- **Giá niêm yết**: **1.150.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **1.035.000 ₫/đêm**)\n' +
        '- **Điểm nổi bật**: Tường xanh olive thanh lịch, trần gỗ ấm và bố cục mở yên tĩnh.\n' +
        'Quý khách chọn hạng **Banla Signature** tại #contact nhé ạ!';
    }

    if (q.indexOf('highland') !== -1 || q.indexOf('huong nui') !== -1) {
      return 'Dạ **Highland Room** rất hợp với quý khách thích không gian thoáng đãng:\n' +
        '- **Diện tích & Sức chứa**: 28m² · 2 người lớn + 1 trẻ\n' +
        '- **Giá niêm yết**: **1.100.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **990.000 ₫/đêm**)\n' +
        '- **Điểm nổi bật**: Trần gỗ cao thoáng với ánh đèn vàng ấm, giường King êm ái và cửa sổ đón nắng sớm.\n' +
        'Mời quý khách đặt phòng tại #contact ạ!';
    }

    if (q.indexOf('suite') !== -1 || q.indexOf('original') !== -1 || q.indexOf('lam viec') !== -1) {
      return 'Dạ **Original Suite** là hạng phòng rộng rãi và sang trọng cho cặp đôi hoặc khách công tác:\n' +
        '- **Diện tích & Sức chứa**: 35m² · 2 người lớn + 1 trẻ\n' +
        '- **Giá niêm yết**: **1.550.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **1.395.000 ₫/đêm**)\n' +
        '- **Điểm nổi bật**: Không gian Suite rộng, bàn làm việc riêng, khu vực tiếp khách ấm cúng.\n' +
        'Quý khách đặt giữ phòng tại #contact nhé ạ!';
    }

    if (q.indexOf('twin') !== -1 || q.indexOf('2 giuong') !== -1 || q.indexOf('hai giuong') !== -1) {
      return 'Dạ **Deluxe Twin** là lựa chọn tiết kiệm và tiện nghi cho bạn bè hoặc đồng nghiệp:\n' +
        '- **Diện tích & Sức chứa**: 22m² · 2–3 người lớn (2 giường đơn êm ái)\n' +
        '- **Giá niêm yết**: **950.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **855.000 ₫/đêm**)\n' +
        'Quý khách có thể đặt ngay tại #contact ạ!';
    }

    if (q.indexOf('balcony') !== -1 || q.indexOf('ban cong') !== -1) {
      return 'Dạ **Deluxe Balcony** dành cho quý khách thích ngồi ban công thưởng trà ngắm sương sớm:\n' +
        '- **Diện tích & Sức chứa**: 20m² · 2 người lớn + 1 trẻ\n' +
        '- **Giá niêm yết**: **980.000 ₫/đêm** (Thanh toán 100% giảm 10% còn **882.000 ₫/đêm**)\n' +
        '- **Điểm nổi bật**: Ban công riêng hướng phố núi thoáng đãng, tràn ngập ánh sáng tự nhiên.\n' +
        'Mời quý khách đặt tại #contact ạ!';
    }

    // 5. The Roof (Café & Cocktail Wine Bar)
    if (q.indexOf('roof') !== -1 || q.indexOf('tang thuong') !== -1 || q.indexOf('cafe') !== -1 || q.indexOf('ca phe') !== -1 || q.indexOf('cocktail') !== -1 || q.indexOf('wine') !== -1 || q.indexOf('ruou vang') !== -1 || q.indexOf('bar') !== -1) {
      return 'Dạ **The Roof by Banla** nằm trên tầng thượng của khách sạn với tầm nhìn trọn phố núi mờ sương ạ:\n' +
        '- **Café & Trà nóng**: **08:00 – 16:00** hàng ngày\n' +
        '- **Cocktail & Wine Bar**: **16:00 – 00:00** hàng ngày\n' +
        '- **Đặc quyền khách lưu trú**: Giảm trực tiếp **15% tổng hóa đơn đồ uống** tại The Roof khi đặt phòng trên website (và tặng 02 đồ uống chào mừng cho gói nghỉ dưỡng từ 3 đêm).\n' +
        'Quý khách đặt phòng tại #contact để nhận ngay ưu đãi nhé!';
    }

    // 6. Đặt cọc VietQR, Thanh toán, Phiếu dấu đỏ, Smart-Lock PIN
    if (q.indexOf('vietqr') !== -1 || q.indexOf('dat coc') !== -1 || q.indexOf('coc') !== -1 || q.indexOf('thanh toan') !== -1 || q.indexOf('chuyen khoan') !== -1 || q.indexOf('dau do') !== -1 || q.indexOf('phieu') !== -1 || q.indexOf('pin') !== -1 || q.indexOf('smart lock') !== -1 || q.indexOf('smartlock') !== -1 || q.indexOf('khoa') !== -1) {
      return 'Dạ quy trình **Đặt phòng – VietQR – Nhận Phiếu Dấu Đỏ & Mã Smart-Lock** tại Banla rất minh bạch và nhanh gọn:\n' +
        '- **Bước 1**: Điền thông tin tại #contact và chọn **Cọc 50% tổng đơn** (50% còn lại trả khi check-in) hoặc **Thanh toán 100% (được giảm ngay 10%)**.\n' +
        '- **Bước 2**: Hệ thống tạo mã VietQR ngân hàng **MB Bank (STK 0352554863 — BANLA BOUTIQUE HOTEL)** tự điền sẵn số tiền & nội dung `BANLA_MÃĐƠN`.\n' +
        '- **Bước 3**: Quý khách gửi ảnh biên lai qua Fanpage Facebook Banla. Ngay khi đối soát xong, hệ thống cấp **Phiếu xác nhận có Dấu Đỏ chính thức** và **Mã Smart-Lock PIN 6 số** (hiệu lực 14:00 Check-in → 12:00 Check-out).';
    }

    // 7. Đường đi, địa chỉ, khoảng cách sân bay Liên Khương, Hồ Xuân Hương, Nha Trang, TP.HCM
    if (q.indexOf('san bay') !== -1 || q.indexOf('lien khuong') !== -1 || q.indexOf('dia chi') !== -1 || q.indexOf('o dau') !== -1 || q.indexOf('duong di') !== -1 || q.indexOf('bao xa') !== -1 || q.indexOf('ho xuan huong') !== -1 || q.indexOf('cho da lat') !== -1 || q.indexOf('cho dem') !== -1 || q.indexOf('nha trang') !== -1 || q.indexOf('xe dua don') !== -1) {
      return 'Dạ thông tin vị trí và di chuyển đến **Banla Boutique Hotel Đà Lạt**:\n' +
        '- **Địa chỉ**: **47 Nguyễn Đình Chiểu, Phường 9, TP. Đà Lạt** (khu phố yên tĩnh, có chỗ đậu xe).\n' +
        '- **Kết nối trung tâm**: Chỉ **5–7 phút** di chuyển tới **Hồ Xuân Hương, Vườn Hoa Thành Phố và Chợ Đêm Đà Lạt**.\n' +
        '- **Từ sân bay Liên Khương**: Khoảng **30 km (~35 phút đi ô tô)**. Lễ tân Banla có hỗ trợ đặt xe đưa đón sân bay và xe limousine tuyến **Đà Lạt – Nha Trang (135 km qua đèo Khánh Lê)**.\n' +
        'Quý khách cần hỗ trợ chỉ đường hoặc đặt xe vui lòng gọi **' + HOTLINE + ' – ' + HOTLINE_ALT + '** ạ!';
    }

    // 8. Giờ nhận phòng / trả phòng / đổi lịch / hủy phòng
    if (q.indexOf('check in') !== -1 || q.indexOf('checkin') !== -1 || q.indexOf('check out') !== -1 || q.indexOf('checkout') !== -1 || q.indexOf('nhan phong') !== -1 || q.indexOf('tra phong') !== -1 || q.indexOf('doi lich') !== -1 || q.indexOf('huy phong') !== -1 || q.indexOf('gio giấc') !== -1 || q.indexOf('may gio') !== -1) {
      return 'Dạ quy định giờ nhận – trả phòng tại Banla Boutique Hotel:\n' +
        '- **Giờ nhận phòng (Check-in)**: Từ **14:00** (mã khóa Smart-Lock PIN 6 số tự động kích hoạt từ 14:00).\n' +
        '- **Giờ trả phòng (Check-out)**: Trước **12:00 trưa**.\n' +
        '- **Nhận phòng sớm / Đổi lịch**: Khách ở từ 3 đêm được hỗ trợ nhận phòng sớm từ 12:00 (tùy phòng trống). Quý khách cần đổi ngày lưu trú vui lòng báo trước tối thiểu **72 giờ** qua Hotline **' + HOTLINE + '** hoặc Fanpage Facebook Banla 24/7 ạ.';
    }

    // 9. Bữa sáng / tiện nghi / mùi hương
    if (q.indexOf('an sang') !== -1 || q.indexOf('bua sang') !== -1 || q.indexOf('buffet') !== -1 || q.indexOf('tien nghi') !== -1 || q.indexOf('wifi') !== -1 || q.indexOf('mui huong') !== -1 || q.indexOf('tinh dau') !== -1) {
      return 'Dạ tại Banla Boutique Hotel, quý khách được tận hưởng trọn vẹn các tiện ích đặc trưng:\n' +
        '- **Ẩm thực sáng Đà Lạt**: Phở nóng, bánh mì xíu mại, món Á – Âu, bánh ngọt, trái cây Đà Lạt và cà phê rang xay nguyên chất.\n' +
        '- **Không gian hương thơm**: Sảnh và hành lang luôn thoang thoảng hương gỗ trầm ấm; khách được tùy chọn mùi hương dầu gội yêu thích.\n' +
        '- **Tiện nghi chuẩn Boutique**: Khóa thông minh **Smart-Lock PIN 6 số** 24/7, WiFi tốc độ cao miễn phí, nước nóng trung tâm và ưu đãi 15% tại **The Roof**.';
    }

    // 10. Bảng giá tổng hợp / tất cả các phòng / khuyến mãi
    if (q.indexOf('gia') !== -1 || q.indexOf('bao nhieu') !== -1 || q.indexOf('hang phong') !== -1 || q.indexOf('cac phong') !== -1 || q.indexOf('7 phong') !== -1 || q.indexOf('uu dai') !== -1 || q.indexOf('khuyen mai') !== -1 || q.indexOf('giam gia') !== -1) {
      return 'Dạ **bảng giá niêm yết 7 hạng phòng** tại Banla Boutique Hotel Đà Lạt:\n' +
        '- **Deluxe Twin** (22m² · 2–3 NL · 2 giường đơn): **950.000 ₫/đêm**\n' +
        '- **Deluxe Balcony** (20m² · 2 NL + 1 trẻ · Ban công): **980.000 ₫/đêm**\n' +
        '- **Highland Room** (28m² · 2 NL + 1 trẻ · Trần gỗ cao): **1.100.000 ₫/đêm**\n' +
        '- **Banla Signature** (28m² · 2 NL + 1 trẻ · Xanh olive): **1.150.000 ₫/đêm**\n' +
        '- **Élite Room** (30m² · 2 NL + 1 trẻ · Gác mái, bồn tắm): **1.250.000 ₫/đêm**\n' +
        '- **Original Suite** (35m² · 2 NL + 1 trẻ · Suite rộng): **1.550.000 ₫/đêm**\n' +
        '- **Connecting Room** (35m² · 4 NL + 1–2 trẻ · 2 phòng thông nhau): **1.850.000 ₫/đêm**\n\n' +
        '**Ưu đãi đặt trực tiếp**: Giảm ngay **10%** khi chọn Thanh toán 100% qua VietQR và giảm **15%** đồ uống tại **The Roof**. Đặt ngay tại #contact ạ!';
    }

    // 11. Câu trả lời tổng quát khi câu hỏi mở (vẫn đầy đủ thông tin hữu ích, không bao giờ báo lỗi)
    return 'Dạ cảm ơn quý khách đã quan tâm đến **Banla Boutique Hotel Đà Lạt** (47 Nguyễn Đình Chiểu, Phường 9)!\n' +
      '- **7 hạng phòng boutique**: Giá từ **950.000 ₫ – 1.850.000 ₫/đêm** (Sức chứa từ 2 khách, gia đình 2 NL + 1 bé đến nhóm 4–6 khách).\n' +
      '- **Ưu đãi đặt trực tiếp**: Cọc 50% giữ phòng hoặc **Thanh toán 100% giảm ngay 10%**, tặng kèm **ưu đãi 15% tại The Roof Café & Cocktail Bar**.\n' +
      '- **Nhận phòng thông minh**: Nhận ngay **Phiếu xác nhận Dấu Đỏ** và **Mã Smart-Lock PIN 6 số** sau khi đối soát VietQR.\n\n' +
      'Quý khách có thể đặt phòng trực tiếp tại #contact hoặc liên hệ **Hotline ' + HOTLINE + ' – ' + HOTLINE_ALT + '** / [Fanpage Banla 24/7](' + FANPAGE + ') để lễ tân hỗ trợ ngay ạ!';
  }

  function readConfig(name) {
    try { return window[name] || localStorage.getItem(name) || ''; } catch (e) { return window[name] || ''; }
  }

  function supabaseEndpoint() {
    var direct = readConfig('BANLA_GEMINI_ENDPOINT');
    if (direct) return direct;
    var sb = readConfig('BANLA_SUPABASE_URL');
    return sb ? sb.replace(/\/+$/, '') + '/functions/v1/banla-gemini' : '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Định dạng tối giản & an toàn: escape trước, rồi mới thêm **đậm**, gạch đầu dòng, link nội bộ. */
  function formatReply(text) {
    var html = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[Fanpage Banla 24\/7\]\((https:\/\/www\.facebook\.com\/Banlaboutiquedalat\/)\)/g, '<a href="$1" target="_blank" rel="noopener" class="bc-link">Fanpage Banla 24/7</a>')
      .replace(/^\s*[-*•]\s+(.*)$/gm, '<span class="bc-li">$1</span>')
      .replace(/#contact/g, '<a href="#contact" class="bc-link" data-bc-close>mục Đặt phòng</a>');
    return html.replace(/\n/g, '<br>');
  }

  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]').slice(-12); } catch (e) { history = []; }

  function saveHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-12))); } catch (e) { /* ignore */ }
  }

  /* ---------- Giao diện ---------- */
  var root = document.createElement('div');
  root.className = 'bc-root';
  root.innerHTML =
    '<button type="button" class="bc-launcher" aria-expanded="false" aria-controls="bcPanel">' +
      '<span class="bc-launcher-dot" aria-hidden="true"></span>' +
      '<span class="bc-launcher-text">Hỏi lễ tân AI</span>' +
    '</button>' +
    '<section class="bc-panel" id="bcPanel" role="dialog" aria-modal="false" aria-labelledby="bcTitle" hidden>' +
      '<header class="bc-head">' +
        '<div class="bc-avatar" aria-hidden="true">B</div>' +
        '<div class="bc-head-copy">' +
          '<h2 class="bc-title" id="bcTitle">Bàn Là · Lễ tân AI</h2>' +
          '<p class="bc-sub">Banla Boutique Hotel · Hỗ trợ 24/7</p>' +
        '</div>' +
        '<button type="button" class="bc-close" aria-label="Đóng trợ lý">&times;</button>' +
      '</header>' +
      '<div class="bc-log" role="log" aria-live="polite"></div>' +
      '<div class="bc-chips"></div>' +
      '<form class="bc-form">' +
        '<label class="bc-sr" for="bcInput">Câu hỏi của quý khách</label>' +
        '<textarea id="bcInput" class="bc-input" rows="1" maxlength="800" placeholder="Hỏi về phòng, giá, The Roof, đường đi..."></textarea>' +
        '<button type="submit" class="bc-send" aria-label="Gửi câu hỏi">➤</button>' +
      '</form>' +
      '<p class="bc-note">Tư vấn theo dữ liệu chính thức của Banla. Xác nhận phòng trống qua Hotline ' + HOTLINE + ' - ' + HOTLINE_ALT + '.</p>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.bc-launcher');
  var panel = root.querySelector('.bc-panel');
  var closeBtn = root.querySelector('.bc-close');
  var log = root.querySelector('.bc-log');
  var chips = root.querySelector('.bc-chips');
  var form = root.querySelector('.bc-form');
  var input = root.querySelector('.bc-input');
  var sendBtn = root.querySelector('.bc-send');
  var busy = false;

  function addBubble(role, text, isError) {
    var el = document.createElement('div');
    el.className = 'bc-msg ' + (role === 'user' ? 'bc-user' : 'bc-bot') + (isError ? ' bc-error' : '');
    el.innerHTML = role === 'user' ? escapeHtml(text).replace(/\n/g, '<br>') : formatReply(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function renderChips() {
    chips.innerHTML = '';
    if (history.length > 1) return;
    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bc-chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

  function renderHistory() {
    log.innerHTML = '';
    addBubble('model', 'Xin chào quý khách! Banla có thể tư vấn **hạng phòng**, **giá**, **The Roof**, đường đi và cách **đặt cọc VietQR**. Quý khách cần hỗ trợ gì ạ?');
    history.forEach(function (m) { addBubble(m.role, m.text); });
    renderChips();
  }

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!log.childElementCount) renderHistory();
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    launcher.focus();
  }

  launcher.addEventListener('click', function () { if (panel.hidden) { openPanel(); } else { closePanel(); } });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
  log.addEventListener('click', function (e) { if (e.target.closest('[data-bc-close]')) closePanel(); });

  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });

  function tryFetchJson(url, options, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = window.setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, timeoutMs || 6000);

      var fetchOpts = {};
      for (var k in options) {
        if (Object.prototype.hasOwnProperty.call(options, k)) fetchOpts[k] = options[k];
      }
      if (controller) fetchOpts.signal = controller.signal;

      fetch(url, fetchOpts)
        .then(function (res) {
          window.clearTimeout(timer);
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var err = new Error((data && data.error) || ('HTTP ' + res.status));
              err.status = res.status;
              throw err;
            }
            return data;
          });
        })
        .then(resolve)
        .catch(function (err) {
          window.clearTimeout(timer);
          reject(err);
        });
    });
  }

  function ask(raw) {
    var text = String(raw || '').trim().slice(0, 800);
    if (!text || busy) return;
    input.value = '';
    input.style.height = 'auto';
    chips.innerHTML = '';
    history.push({ role: 'user', text: text });
    addBubble('user', text);
    saveHistory();

    busy = true;
    sendBtn.disabled = true;
    var typing = addBubble('model', '…');
    typing.classList.add('bc-typing');

    var payload = JSON.stringify({ mode: 'chat', messages: history });

    // Bước 1: Thử gọi `/api/chat` trên Express Server (nếu đang chạy backend Node)
    tryFetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }, 3500)
      .catch(function () {
        // Bước 2: Thử gọi Supabase Edge Function `banla-gemini` (nếu đã deploy)
        var sbUrl = supabaseEndpoint();
        if (!sbUrl) throw new Error('no_edge_endpoint');
        var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
        var headers = { 'Content-Type': 'application/json' };
        if (key) { headers.apikey = key; headers.Authorization = 'Bearer ' + key; }
        return tryFetchJson(sbUrl, {
          method: 'POST',
          headers: headers,
          body: payload
        }, 5000);
      })
      .then(function (data) {
        var reply = String((data && data.reply) || '').trim();
        if (!reply) reply = generateLocalConciergeReply(text);
        return reply;
      })
      .catch(function () {
        // Bước 3: Fallback mượt mà sang Trí tuệ Lễ tân Nội bộ (Smart Knowledge Engine)
        // Đảm bảo trên GitHub Pages / banlaboutiquedalat.com luôn trả lời ngay lập tức, chuẩn xác 100%
        return generateLocalConciergeReply(text);
      })
      .then(function (reply) {
        typing.remove();
        history.push({ role: 'model', text: reply });
        saveHistory();
        addBubble('model', reply);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  // Экспорт helper cho kiểm thử tự động nếu cần
  window.BanlaConcierge = {
    ask: ask,
    replyLocal: generateLocalConciergeReply,
    rooms: ROOMS_CATALOG
  };
})();
