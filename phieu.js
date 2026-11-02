/**
 * Phiếu xác nhận dịch vụ chính thức Banla Boutique Hotel Đà Lạt
 * Thiết kế khổ ngang chuẩn A4, hiển thị con dấu đỏ mộc tròn và chữ ký đại diện
 */
(function () {
  const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const vnd = (n) => (Number(n) > 0 ? new Intl.NumberFormat('vi-VN').format(Number(n)) + ' đ' : '0 đ');
  const vd = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s.split('-').reverse().join('/') : (s || ''));

  function calculateNights(cin, cout) {
    if (!cin || !cout) return 1;
    const diff = Math.round((new Date(cout) - new Date(cin)) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }

  // Tạo Con dấu đỏ mộc tròn SVG của Banla Boutique Hotel
  function renderRedSealSvg(bookingCode, dateStr) {
    const today = dateStr || new Date().toLocaleDateString('vi-VN');
    return `
      <svg class="banla-seal-svg" viewBox="0 0 200 200" width="150" height="150" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <!-- Đường dẫn cung trên cho text -->
          <path id="sealTopArc" d="M 24,100 A 76,76 0 1,1 176,100" fill="none" />
          <!-- Đường dẫn cung dưới cho text -->
          <path id="sealBottomArc" d="M 176,100 A 76,76 0 1,1 24,100" fill="none" />
        </defs>

        <!-- Vành tròn ngoài kép -->
        <circle cx="100" cy="100" r="95" fill="none" stroke="#cf222e" stroke-width="4.5" stroke-dasharray="0" opacity="0.95" />
        <circle cx="100" cy="100" r="88" fill="none" stroke="#cf222e" stroke-width="1.6" opacity="0.9" />

        <!-- Cung tròn trên: Tên khách sạn -->
        <text fill="#cf222e" font-size="13" font-family="'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif" font-weight="800" letter-spacing="1.5px">
          <textPath href="#sealTopArc" startOffset="50%" text-anchor="middle">
            BANLA BOUTIQUE HOTEL
          </textPath>
        </text>

        <!-- Cung tròn dưới: Địa phương & Xác nhận -->
        <text fill="#cf222e" font-size="11.5" font-family="'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif" font-weight="700" letter-spacing="2px">
          <textPath href="#sealBottomArc" startOffset="50%" text-anchor="middle">
            ★ ĐÀ LẠT - XÁC NHẬN ★
          </textPath>
        </text>

        <!-- Vòng tròn tâm -->
        <circle cx="100" cy="100" r="54" fill="none" stroke="#cf222e" stroke-width="1.8" stroke-dasharray="3,2" opacity="0.8" />

        <!-- Biểu tượng và nội dung ở giữa con dấu -->
        <g fill="#cf222e" text-anchor="middle" font-family="'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif">
          <!-- Ngôi sao nhỏ -->
          <path d="M 100,64 L 103,71 L 110,72 L 105,77 L 106,84 L 100,80 L 94,84 L 95,77 L 90,72 L 97,71 Z" fill="#cf222e" />
          <text x="100" y="103" font-size="16" font-weight="900" letter-spacing="1px">ĐÃ DUYỆT</text>
          <text x="100" y="119" font-size="10.5" font-weight="700" letter-spacing="0.5px">MÃ: ${esc(bookingCode || 'BANLA')}</text>
          <text x="100" y="132" font-size="9" font-weight="500" opacity="0.9">${esc(today)}</text>
        </g>
      </svg>
    `;
  }

  window.BanlaSlip = function (d) {
    const total = Number(d.totalPrice || d.total) || 1200000;
    const paid = Number(d.paidAmount || d.paid) || 0;
    const remain = Math.max(0, total - paid);
    const nights = calculateNights(d.checkin, d.checkout);
    const isPaid = (d.paymentStatus === 'PAID') || (paid >= total && total > 0);
    const isDeposit = (d.paymentStatus === 'DEPOSIT_PAID') || (paid > 0 && !isPaid);

    let statusBadgeText = 'ĐÃ XÁC NHẬN PHÒNG';
    let statusBadgeColor = '#2A3F38'; // pine
    if (isPaid) {
      statusBadgeText = 'ĐÃ THANH TOÁN ĐỦ (100%)';
      statusBadgeColor = '#1e7e34';
    } else if (isDeposit) {
      statusBadgeText = `ĐÃ ĐẶT CỌC (${vnd(paid)})`;
      statusBadgeColor = '#B8612E'; // ember
    }

    const sealSvg = renderRedSealSvg(d.id || d.bookingId || d.code, d.verifiedDate);

    return `
      <div class="banla-slip-container" id="banlaSlipPrint">
        <!-- Khung viền kép sang trọng phong cách Highland Heritage -->
        <div class="banla-slip-inner">
          
          <!-- Header Phiếu -->
          <div class="slip-header">
            <div class="slip-brand">
              <div class="slip-logo-badge">
                <span class="logo-text">BANLA</span>
                <span class="logo-sub">BOUTIQUE HOTEL · ĐÀ LẠT</span>
              </div>
              <div class="slip-hotel-meta">
                <p><strong>Địa chỉ:</strong> 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt</p>
                <p><strong>Hotline:</strong> 0296.9996.999 - 0352554863 · <strong>Fanpage:</strong> Banla Boutique Hotel 24/7</p>
              </div>
            </div>

            <div class="slip-title-box">
              <h1 class="slip-title">PHIẾU XÁC NHẬN DỊCH VỤ</h1>
              <p class="slip-title-en">OFFICIAL SERVICE CONFIRMATION</p>
              <div class="slip-code-pill">
                <span>MÃ ĐẶT PHÒNG:</span>
                <strong>#${esc(d.id || d.bookingId || d.code || 'BL888')}</strong>
              </div>
              <div class="slip-status-pill" style="background: ${statusBadgeColor};">
                ${statusBadgeText}
              </div>
            </div>
          </div>

          <hr class="slip-divider" />

          <!-- Thông tin 2 cột: Khách hàng & Lưu trú -->
          <div class="slip-grid-2">
            <!-- Cột 1: Thông tin khách -->
            <div class="slip-box">
              <h3 class="slip-box-title">01. THÔNG TIN KHÁCH HÀNG</h3>
              <table class="slip-table">
                <tr>
                  <td class="col-label">Họ và tên:</td>
                  <td class="col-val"><strong>${esc(d.name || 'Quý khách')}</strong></td>
                </tr>
                <tr>
                  <td class="col-label">Điện thoại:</td>
                  <td class="col-val">${esc(d.phone || d.phoneMasked || '0296.9996.999')}</td>
                </tr>
                <tr>
                  <td class="col-label">Email:</td>
                  <td class="col-val">${esc(d.email || d.emailMasked || 'Chưa cung cấp')}</td>
                </tr>
                <tr>
                  <td class="col-label">Số khách:</td>
                  <td class="col-val">${esc(d.guests || 2)} người</td>
                </tr>
                <tr>
                  <td class="col-label">Ghi chú:</td>
                  <td class="col-val">${esc(d.message || d.note || 'Không có')}</td>
                </tr>
              </table>
            </div>

            <!-- Cột 2: Thông tin phòng & Lưu trú -->
            <div class="slip-box">
              <h3 class="slip-box-title">02. THÔNG TIN PHÒNG NGHỈ</h3>
              <table class="slip-table">
                <tr>
                  <td class="col-label">Hạng phòng:</td>
                  <td class="col-val"><strong style="color: #B8612E;">${esc(d.room || 'Deluxe Room')}</strong></td>
                </tr>
                <tr>
                  <td class="col-label">Thời gian lưu trú:</td>
                  <td class="col-val"><strong>${vd(d.checkin)}</strong> → <strong>${vd(d.checkout)}</strong> (${nights} đêm)</td>
                </tr>
                <tr>
                  <td class="col-label">Giờ nhận phòng:</td>
                  <td class="col-val">Từ <strong>14:00</strong> ngày ${vd(d.checkin)}</td>
                </tr>
                <tr>
                  <td class="col-label">Giờ trả phòng:</td>
                  <td class="col-val">Trước <strong>12:00</strong> ngày ${vd(d.checkout)}</td>
                </tr>
                ${d.smartLockPin ? `
                <tr class="smartlock-row">
                  <td class="col-label" style="background:#FFF3E0;color:#B8612E;font-weight:700;">Smart-Lock PIN:</td>
                  <td class="col-val" style="background:#FFF8E1;color:#B8612E;font-size:16px;">
                    <strong>${esc(d.smartLockPin)}</strong>
                    <span style="font-size:11px;color:#666;font-weight:normal;display:block;">(Nhập mã và bấm phím # tại cửa phòng)</span>
                  </td>
                </tr>
                ` : ''}
              </table>
            </div>
          </div>

          <!-- Thông tin Thanh toán & Đối soát chi tiết -->
          <div class="slip-box slip-financials" style="margin-top: 14px;">
            <h3 class="slip-box-title">03. CHI TIẾT THANH TOÁN & ĐỐI SOÁT DỊCH VỤ</h3>
            <div class="finance-grid">
              <div class="finance-item">
                <span class="f-label">Tổng giá trị đơn:</span>
                <span class="f-val"><strong>${vnd(total)}</strong></span>
              </div>
              <div class="finance-item">
                <span class="f-label">Đã thanh toán / Cọc:</span>
                <span class="f-val" style="color: #1e7e34;"><strong>${vnd(paid)}</strong></span>
              </div>
              <div class="finance-item">
                <span class="f-label">Còn lại thanh toán tại quầy:</span>
                <span class="f-val" style="color: ${remain > 0 ? '#d92d20' : '#1e7e34'};">
                  <strong>${remain > 0 ? vnd(remain) : 'ĐÃ HOÀN TẤT'}</strong>
                </span>
              </div>
              <div class="finance-item">
                <span class="f-label">Hình thức:</span>
                <span class="f-val">Chuyển khoản VietQR / Trực tiếp</span>
              </div>
            </div>
          </div>

          <!-- Phần Chữ ký và Con dấu đỏ mộc tròn chính thức -->
          <div class="slip-footer-sign">
            <div class="sign-note">
              <p><strong>* Lưu ý nhận phòng:</strong></p>
              <ul>
                <li>Quý khách vui lòng xuất trình CCCD hoặc hộ chiếu của người đại diện khi nhận phòng.</li>
                <li>Hỗ trợ nhận phòng sớm hoặc trả phòng trễ tùy thuộc vào tình trạng phòng thực tế của khách sạn.</li>
                <li>Quý khách có thể liên hệ Fanpage Facebook Banla hoặc Hotline bất cứ lúc nào để được hỗ trợ 24/7.</li>
              </ul>
            </div>

            <!-- Khung đóng dấu và chữ ký -->
            <div class="sign-seal-box">
              <div class="sign-title">ĐẠI DIỆN BANLA BOUTIQUE HOTEL</div>
              <div class="sign-role">Bộ phận Lễ tân & Đặt phòng (Đã duyệt)</div>
              
              <!-- Khu vực hiển thị con dấu đỏ đè lên chữ ký -->
              <div class="seal-and-sig-area">
                <!-- Chữ ký số mô phỏng -->
                <div class="signature-img">
                  <svg viewBox="0 0 200 60" width="160" height="50" style="opacity: 0.85;">
                    <path d="M 15,35 Q 35,10 55,30 T 95,25 Q 120,40 145,15 T 180,35" fill="none" stroke="#1d2b2e" stroke-width="2.2" stroke-linecap="round"/>
                    <path d="M 40,42 Q 80,48 130,44" fill="none" stroke="#1d2b2e" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                  <div class="signer-name">Banla Management</div>
                </div>

                <!-- Con dấu đỏ SVG xoay nhẹ -->
                <div class="seal-overlay">
                  ${sealSvg}
                </div>
              </div>
            </div>
          </div>

          <!-- Chân trang bảo đảm -->
          <div class="slip-bottom-bar">
            <span>Phiếu điện tử có giá trị tương đương văn bản xác nhận chính thức.</span>
            <span>Hotline 24/7: 0296.9996.999 - 0352554863</span>
            <span>https://banlaboutiquehotel.com</span>
          </div>

        </div>
      </div>
    `;
  };
})();
