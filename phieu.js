/**
 * Phiếu xác nhận dịch vụ chính thức Banla Boutique Hotel Đà Lạt (ES6+ Module / Global)
 * Dùng chung cho cả Modal Preview trong admin.html và trang độc lập phieu.html.
 * Thiết kế con dấu mộc tròn vector màu đỏ chữ "BANLA BOUTIQUE HOTEL - ĐÃ THANH TOÁN" xoay nghiêng 12 độ chân thực.
 */
(function () {
  'use strict';

  const esc = (x) =>
    String(x ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));

  const vnd = (n) =>
    Number(n) > 0 ? new Intl.NumberFormat('vi-VN').format(Math.round(Number(n))) + ' đ' : '0 đ';

  function formatDateDisplay(val) {
    if (!val) return '';
    const str = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str.split('-').reverse().join('/');
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    }
    return str;
  }

  function calculateNights(cin, cout) {
    if (!cin || !cout) return 1;
    const d1 = new Date(cin);
    const d2 = new Date(cout);
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 1;
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 1;
  }

  /**
   * Tạo Con dấu mộc tròn vector SVG màu đỏ chữ:
   * "BANLA BOUTIQUE HOTEL - ĐÃ THANH TOÁN" xoay góc nghiêng 12 độ chân thực
   */
  
  /**
   * Tạo Con dấu MỘC NƯỚC MỜ (Màu xám/cam):
   * "BANLA BOUTIQUE HOTEL - CHỜ ĐỐI SOÁT" (PENDING)
   * Tuyệt đối KHÔNG DÙNG DẤU ĐỎ khi CSDL chưa chứng minh thanh toán thành công!
   */
  function renderPendingSealSvg(bookingCode) {
    const cleanCode = String(bookingCode || 'BANLA').replace(/^#+/, '').toUpperCase();
    return `
      <svg width="150" height="150" viewBox="0 0 200 200" style="transform: rotate(-10deg); opacity: 0.72; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.08));">
        <!-- Vòng tròn ngoài nét đứt màu cam đất -->
        <circle cx="100" cy="100" r="92" fill="none" stroke="#b8612e" stroke-width="2.5" stroke-dasharray="6,4"/>
        <circle cx="100" cy="100" r="84" fill="none" stroke="#b8612e" stroke-width="1.2"/>

        <!-- Chữ cong phía trên -->
        <path id="pendingArcTop" d="M 22,100 A 78,78 0 0,1 178,100" fill="none"/>
        <text fill="#b8612e" font-size="11" font-weight="700" letter-spacing="2.2" font-family="'Figtree', sans-serif">
          <textPath href="#pendingArcTop" startOffset="50%" text-anchor="middle">
            BANLA BOUTIQUE HOTEL
          </textPath>
        </text>

        <!-- Chữ cong phía dưới -->
        <path id="pendingArcBottom" d="M 178,100 A 78,78 0 0,1 22,100" fill="none"/>
        <text fill="#b8612e" font-size="9" font-weight="600" letter-spacing="2" font-family="'Figtree', sans-serif">
          <textPath href="#pendingArcBottom" startOffset="50%" text-anchor="middle">
            CHỜ ĐỐI SOÁT THANH TOÁN
          </textPath>
        </text>

        <!-- Khung chữ nhật ở giữa -->
        <rect x="25" y="80" width="150" height="40" rx="4" fill="#FFF7ED" stroke="#b8612e" stroke-width="1.8"/>
        <text x="100" y="98" fill="#b8612e" font-size="12" font-weight="800" text-anchor="middle" letter-spacing="1.5" font-family="'Figtree', sans-serif">
          CHƯA THANH TOÁN
        </text>
        <text x="100" y="112" fill="#78350f" font-size="8.5" font-weight="600" text-anchor="middle" letter-spacing="1" font-family="monospace">
          #${cleanCode} · PROFORMA
        </text>
      </svg>
    `;
  }

  function renderRedSealSvg(bookingCode, dateStr) {
    const today = dateStr || new Date().toLocaleDateString('vi-VN');
    const cleanCode = String(bookingCode || 'BANLA').replace(/^#+/, '').toUpperCase();
    return `
      <svg class="banla-seal-svg" viewBox="0 0 220 220" width="156" height="156" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Con dấu xác nhận Banla Boutique Hotel - Đã thanh toán">
        <defs>
          <!-- Đường dẫn cung tròn trên -->
          <path id="banlaSealTopArc" d="M 26,110 A 84,84 0 1,1 194,110" fill="none" />
          <!-- Đường dẫn cung tròn dưới -->
          <path id="banlaSealBottomArc" d="M 194,110 A 84,84 0 1,1 26,110" fill="none" />
        </defs>

        <!-- Vành tròn ngoài kép chuẩn mộc đỏ doanh nghiệp -->
        <circle cx="110" cy="110" r="103" fill="rgba(207, 34, 46, 0.03)" stroke="#cf222e" stroke-width="4.5" opacity="0.96" />
        <circle cx="110" cy="110" r="96" fill="none" stroke="#cf222e" stroke-width="1.6" opacity="0.92" />

        <!-- Chữ cung trên: BANLA BOUTIQUE HOTEL -->
        <text fill="#cf222e" font-size="13.2" font-family="'Figtree', 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif" font-weight="800" letter-spacing="1.8px">
          <textPath href="#banlaSealTopArc" startOffset="50%" text-anchor="middle">
            BANLA BOUTIQUE HOTEL
          </textPath>
        </text>

        <!-- Chữ cung dưới: ★ ĐÃ THANH TOÁN ★ -->
        <text fill="#cf222e" font-size="12.5" font-family="'Figtree', 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif" font-weight="800" letter-spacing="2px">
          <textPath href="#banlaSealBottomArc" startOffset="50%" text-anchor="middle">
            ★ ĐÃ THANH TOÁN ★
          </textPath>
        </text>

        <!-- Vòng tròn tâm đứt nét -->
        <circle cx="110" cy="110" r="61" fill="none" stroke="#cf222e" stroke-width="1.8" stroke-dasharray="4,2.5" opacity="0.88" />

        <!-- Nội dung trung tâm con dấu -->
        <g fill="#cf222e" text-anchor="middle" font-family="'Figtree', 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif">
          <path d="M 110,66 L 113.5,74 L 122,75 L 115.5,80.5 L 117.2,89 L 110,84.5 L 102.8,89 L 104.5,80.5 L 98,75 L 106.5,74 Z" fill="#cf222e" />
          <text x="110" y="106" font-size="13.5" font-weight="900" letter-spacing="0.6px">ĐÃ THANH TOÁN</text>
          <text x="110" y="121" font-size="9.5" font-weight="800" letter-spacing="0.5px">BANLA BOUTIQUE HOTEL</text>
          <text x="110" y="135" font-size="10" font-weight="700">MÃ: ${esc(cleanCode)}</text>
          <text x="110" y="148" font-size="8.8" font-weight="600" opacity="0.9">${esc(today)}</text>
        </g>
      </svg>
    `;
  }

  function injectSlipStyles() {
    if (document.getElementById('banla-slip-shared-css')) return;
    const st = document.createElement('style');
    st.id = 'banla-slip-shared-css';
    st.textContent = `
      .banla-slip-container {
        background: #FAF7F2;
        min-width: 920px;
        max-width: 1000px;
        margin: 0 auto;
        box-shadow: 0 12px 34px rgba(25, 38, 34, 0.12);
        border-radius: 8px;
        padding: 14px;
        color: #192622;
        font-family: 'Figtree', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .banla-slip-inner {
        border: 2px solid #2a3f38;
        outline: 1px solid #D4AF37;
        outline-offset: -6px;
        padding: 24px 30px 20px;
        background: #FFFFFF;
        position: relative;
      }
      .banla-slip-inner .slip-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 20px;
      }
      .banla-slip-inner .slip-brand { flex: 1; }
      .banla-slip-inner .slip-logo-badge {
        display: inline-block;
        border-bottom: 2px solid #b8612e;
        padding-bottom: 4px;
        margin-bottom: 8px;
      }
      .banla-slip-inner .logo-text {
        font-family: 'Fraunces', Georgia, serif;
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 3px;
        color: #2a3f38;
        display: block;
        line-height: 1;
      }
      .banla-slip-inner .logo-sub {
        font-size: 10px;
        letter-spacing: 2px;
        color: #b8612e;
        font-weight: 700;
        display: block;
        margin-top: 3px;
      }
      .banla-slip-inner .slip-hotel-meta {
        font-size: 11.5px;
        color: #4A5568;
        line-height: 1.5;
        margin-top: 6px;
      }
      .banla-slip-inner .slip-title-box { text-align: right; }
      .banla-slip-inner .slip-title {
        font-family: 'Fraunces', Georgia, serif;
        font-size: 22px;
        font-weight: 700;
        color: #2a3f38;
        letter-spacing: 0.8px;
        margin-bottom: 2px;
      }
      .banla-slip-inner .slip-title-en {
        font-size: 10px;
        letter-spacing: 1.5px;
        color: #718096;
        margin-bottom: 8px;
      }
      .banla-slip-inner .slip-code-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #f2f5f6;
        border: 1px solid #dfe6e8;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
      }
      .banla-slip-inner .slip-code-pill strong {
        color: #b8612e;
        font-size: 14px;
        letter-spacing: 1px;
      }
      .banla-slip-inner .slip-status-pill {
        display: inline-block;
        margin-top: 6px;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.5px;
        padding: 4px 12px;
        border-radius: 20px;
      }
      .banla-slip-inner .slip-divider {
        border: 0;
        height: 1px;
        background: #E2E8F0;
        margin: 14px 0;
      }
      .banla-slip-inner .slip-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }
      .banla-slip-inner .slip-box {
        background: #FAF7F2;
        border: 1px solid #E2D9CC;
        border-radius: 6px;
        padding: 13px 16px;
      }
      .banla-slip-inner .slip-box-title {
        font-size: 11.5px;
        font-weight: 700;
        color: #2a3f38;
        letter-spacing: 0.8px;
        border-bottom: 1px solid #E2D9CC;
        padding-bottom: 6px;
        margin-bottom: 9px;
      }
      .banla-slip-inner .slip-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12.5px;
      }
      .banla-slip-inner .slip-table td {
        padding: 4.5px 4px;
        vertical-align: top;
      }
      .banla-slip-inner .col-label { width: 38%; color: #4A5568; }
      .banla-slip-inner .col-val { color: #192622; }
      .banla-slip-inner .finance-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        text-align: center;
      }
      .banla-slip-inner .finance-item {
        background: #fff;
        border: 1px dashed #CBD5E0;
        border-radius: 6px;
        padding: 9px 8px;
      }
      .banla-slip-inner .f-label {
        display: block;
        font-size: 11px;
        color: #718096;
        margin-bottom: 3px;
      }
      .banla-slip-inner .f-val { font-size: 13.5px; }
      .banla-slip-inner .slip-footer-sign {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-top: 16px;
        gap: 28px;
      }
      .banla-slip-inner .sign-note {
        flex: 1.25;
        font-size: 11px;
        color: #4A5568;
        background: #F8FAFC;
        border-left: 3px solid #2a3f38;
        padding: 10px 14px;
        border-radius: 0 4px 4px 0;
      }
      .banla-slip-inner .sign-note ul { margin-left: 16px; margin-top: 4px; }
      .banla-slip-inner .sign-note li { margin-bottom: 3px; }
      .banla-slip-inner .sign-seal-box {
        flex: 0.85;
        text-align: center;
        position: relative;
      }
      .banla-slip-inner .sign-title {
        font-size: 12px;
        font-weight: 700;
        color: #2a3f38;
        letter-spacing: 0.5px;
      }
      .banla-slip-inner .sign-role {
        font-size: 10.5px;
        color: #718096;
        margin-top: 2px;
      }
      .banla-slip-inner .seal-and-sig-area {
        position: relative;
        height: 115px;
        margin-top: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .banla-slip-inner .signature-img {
        position: relative;
        z-index: 1;
        text-align: center;
      }
      .banla-slip-inner .signer-name {
        font-size: 11px;
        font-style: italic;
        color: #2D3748;
        margin-top: -4px;
      }
      .banla-slip-inner .seal-overlay {
        position: absolute;
        top: -14px;
        right: 12px;
        z-index: 2;
        transform: rotate(-12deg);
        pointer-events: none;
        filter: drop-shadow(0 2px 5px rgba(207, 34, 46, 0.18));
      }
      .banla-slip-inner .slip-bottom-bar {
        margin-top: 14px;
        padding-top: 9px;
        border-top: 1px solid #E2E8F0;
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        color: #718096;
      }
    `;
    document.head.appendChild(st);
  }

  window.BanlaSlip = function (d = {}) {
    injectSlipStyles();

    const code = d.booking_code || d.code || d.id || d.bookingId || 'BL8888';
    const guestName = d.guest_name || d.name || 'Quý khách';
    const guestPhone = d.guest_phone || d.phone || d.phoneMasked || '0296.9996.999';
    const guestEmail = d.guest_email || d.email || d.emailMasked || 'Chưa cung cấp';
    const roomName = d.room_id || d.room || 'Deluxe Room';
    const checkInRaw = d.check_in || d.checkin || '';
    const checkOutRaw = d.check_out || d.checkout || '';
    const checkInStr = formatDateDisplay(checkInRaw);
    const checkOutStr = formatDateDisplay(checkOutRaw);
    const nights = calculateNights(checkInRaw, checkOutRaw);
    const guests = d.guests || 2;
    const note = d.note || d.message || 'Không có';
    const pin = d.smartlock_pin || d.smartLockPin || '';

    const total = Number(d.total_amount ?? d.totalPrice ?? d.total) || 1500000;
    const payStatus = String(d.payment_status || d.paymentStatus || 'pending').toLowerCase();
    const paidAmountNum = Number(d.paid_amount ?? d.paidAmount ?? 0);
    // CƠ SỞ DỮ LIỆU CHỨNG MINH THỰC TẾ:
    // Phải có payment_status = 'paid' hoặc đã nhận được khoản thanh toán/đối soát thật
    const isPaid = payStatus === 'paid' || (paidAmountNum > 0 && d.booking_status === 'confirmed');
    const isFullPaid = isPaid && (paidAmountNum >= total || d.payment_option === 'pay_100' || d.paymentOption === 'pay_100');
    const isDepositPaid = isPaid && !isFullPaid;

    const paid = isPaid ? (paidAmountNum > 0 ? paidAmountNum : total) : 0;
    const remain = Math.max(0, total - paid);
    const refCode = d.reference_code || `BANLA_${String(code).replace(/^#+/, '').toUpperCase()}`;

    let slipMainTitle = 'PHIẾU XÁC NHẬN DỊCH VỤ';
    let slipSubTitle = 'BOOKING CONFIRMATION SLIP';
    let statusBadgeText = '✓ ĐÃ THANH TOÁN ĐỦ (100%)';
    let statusBadgeColor = '#15803d';

    if (isFullPaid) {
      slipMainTitle = 'PHIẾU XÁC NHẬN DỊCH VỤ';
      slipSubTitle = 'OFFICIAL BOOKING CONFIRMATION';
      statusBadgeText = '✓ ĐÃ THANH TOÁN ĐỦ (100%)';
      statusBadgeColor = '#15803d';
    } else if (isDepositPaid) {
      slipMainTitle = 'PHIẾU XÁC NHẬN ĐẶT CỌC';
      slipSubTitle = 'DEPOSIT CONFIRMATION SLIP';
      statusBadgeText = `✓ ĐÃ CỌC 50% (${vnd(paid)})`;
      statusBadgeColor = '#b8612e';
    } else {
      // CHƯA CÓ CƠ SỞ DỮ LIỆU CHỨNG MINH THANH TOÁN:
      slipMainTitle = 'PHIẾU YÊU CẦU ĐẶT PHÒNG';
      slipSubTitle = 'BOOKING REQUEST - CHỜ ĐỐI SOÁT';
      statusBadgeText = '⏳ CHỜ THANH TOÁN & ĐỐI SOÁT';
      statusBadgeColor = '#d97706';
    }

    // CHỈ ĐÓNG DẤU ĐỎ KHI VÀ CHỈ KHI CSDL ĐÃ XÁC THỰC LÀ ĐÃ THANH TOÁN (PAID)!
    const sealSvg = isPaid ? renderRedSealSvg(code, d.verifiedDate) : renderPendingSealSvg(code);

    return `
      <div class="banla-slip-container" id="banlaSlipPrint">
        <div class="banla-slip-inner">
          <div class="slip-header">
            <div class="slip-brand">
              <div class="slip-logo-badge">
                <span class="logo-text">BANLA</span>
                <span class="logo-sub">BOUTIQUE HOTEL · ĐÀ LẠT</span>
              </div>
              <div class="slip-hotel-meta">
                <p><strong>Địa chỉ:</strong> 47 Nguyễn Đình Chiểu, Phường 9, Đà Lạt, Lâm Đồng</p>
                <p><strong>Hotline 24/7:</strong> 0296.9996.999 - 0352554863 · <strong>Email:</strong> concact@banlaboutiquedalat.com · <strong>Fanpage:</strong> Banla Boutique Hotel</p>
              </div>
            </div>

            <div class="slip-title-box">
              <h1 class="slip-title">${slipMainTitle}</h1>
              <p class="slip-title-en">${slipSubTitle}</p>
              <div class="slip-code-pill">
                <span>MÃ BOOKING:</span>
                <strong>#${esc(String(code).replace(/^#+/, ''))}</strong>
              </div>
              <div>
                <span class="slip-status-pill" style="background: ${statusBadgeColor};">
                  ${statusBadgeText}
                </span>
              </div>
            </div>
          </div>

          <hr class="slip-divider" />

          <div class="slip-grid-2">
            <div class="slip-box">
              <h3 class="slip-box-title">01. THÔNG TIN KHÁCH HÀNG</h3>
              <table class="slip-table">
                <tr>
                  <td class="col-label">Họ và tên khách:</td>
                  <td class="col-val"><strong>${esc(guestName)}</strong></td>
                </tr>
                <tr>
                  <td class="col-label">Số điện thoại:</td>
                  <td class="col-val">${esc(guestPhone)}</td>
                </tr>
                <tr>
                  <td class="col-label">Địa chỉ Email:</td>
                  <td class="col-val">${esc(guestEmail)}</td>
                </tr>
                <tr>
                  <td class="col-label">Số lượng khách:</td>
                  <td class="col-val">${esc(guests)} người</td>
                </tr>
                <tr>
                  <td class="col-label">Yêu cầu đặc biệt:</td>
                  <td class="col-val">${esc(note)}</td>
                </tr>
              </table>
            </div>

            <div class="slip-box">
              <h3 class="slip-box-title">02. CHI TIẾT PHÒNG & KHÓA THÔNG MINH</h3>
              <table class="slip-table">
                <tr>
                  <td class="col-label">Hạng phòng:</td>
                  <td class="col-val"><strong style="color: #b8612e;">${esc(roomName)}</strong></td>
                </tr>
                <tr>
                  <td class="col-label">Thời gian lưu trú:</td>
                  <td class="col-val"><strong>${esc(checkInStr)}</strong> → <strong>${esc(checkOutStr)}</strong> (${nights} đêm)</td>
                </tr>
                <tr>
                  <td class="col-label">Nhận / Trả phòng:</td>
                  <td class="col-val">Check-in từ <strong>14:00</strong> · Check-out trước <strong>12:00</strong></td>
                </tr>
                <tr>
                  <td class="col-label" style="background:#FFF8E1;color:#b8612e;font-weight:700;">Mã Smart-Lock PIN:</td>
                  <td class="col-val" style="background:#FFFDF5;color:#b8612e;">
                    ${isPaid && pin ? `
                      <strong style="font-size:16px;letter-spacing:2px;font-family:monospace;color:#15803d;">${esc(pin)}</strong>
                      <span style="font-size:10.5px;color:#15803d;display:block;font-weight:600;">✓ Đã kích hoạt (Hiệu lực: ${esc(checkInStr)} 14:00 → ${esc(checkOutStr)} 12:00)</span>
                    ` : `
                      <strong style="font-size:13px;color:#cf222e;font-family:sans-serif;">⏳ Chưa kích hoạt (Chờ đối soát thanh toán)</strong>
                      <span style="font-size:10.5px;color:#718096;display:block;">Mã PIN 6 số sẽ tự động kích hoạt ngay sau khi gửi biên lai qua Facebook Banla & được duyệt.</span>
                    `}
                  </td>
                </tr>
              </table>
            </div>
          </div>

          <div class="slip-box" style="margin-top: 14px;">
            <h3 class="slip-box-title">03. CHI TIẾT THANH TOÁN & ĐỐI SOÁT VIETQR</h3>
            <div class="finance-grid">
              <div class="finance-item">
                <span class="f-label">Tổng chi phí lưu trú:</span>
                <span class="f-val"><strong>${vnd(total)}</strong></span>
              </div>
              <div class="finance-item">
                <span class="f-label">Đã thanh toán:</span>
                <span class="f-val" style="color: #15803d;"><strong>${vnd(paid)}</strong></span>
              </div>
              <div class="finance-item">
                <span class="f-label">Còn lại khi nhận phòng:</span>
                <span class="f-val" style="color: ${remain > 0 ? '#cf222e' : '#15803d'};">
                  <strong>${remain > 0 ? vnd(remain) : '0 đ (Đã thanh toán đủ)'}</strong>
                </span>
              </div>
              <div class="finance-item">
                <span class="f-label">Mã đối soát giao dịch:</span>
                <span class="f-val"><strong style="font-family:monospace;color:#2a3f38;">${esc(refCode)}</strong></span>
              </div>
            </div>
          </div>

          <div class="slip-footer-sign">
            <div class="sign-note">
              <p><strong>* Quy định & Hướng dẫn nhận phòng tại Banla:</strong></p>
              <ul>
                <li>Quý khách vui lòng xuất trình Phiếu xác nhận này cùng CCCD/Hộ chiếu tại quầy Lễ tân hoặc sử dụng mã Smart-Lock PIN 6 số để mở cửa phòng trong thời gian hiệu lực.</li>
                <li>Hỗ trợ dịch vụ 24/7 qua Fanpage Facebook Banla Boutique Hotel hoặc Hotline <strong>0296.9996.999 - 0352554863</strong>.</li>
              </ul>
            </div>

            <div class="sign-seal-box">
              <div class="sign-title">XÁC NHẬN CỦA BANLA BOUTIQUE HOTEL</div>
              <div class="sign-role">Bộ phận Quản lý & Đối soát Đặt phòng</div>
              <div class="seal-and-sig-area">
                <div class="signature-img">
                  <svg viewBox="0 0 200 60" width="160" height="50" style="opacity: 0.85;">
                    <path d="M 18,36 Q 38,10 58,32 T 98,24 Q 124,42 148,14 T 182,34" fill="none" stroke="#192622" stroke-width="2.2" stroke-linecap="round"/>
                    <path d="M 38,44 Q 85,50 138,44" fill="none" stroke="#192622" stroke-width="1.7" stroke-linecap="round"/>
                  </svg>
                  <div class="signer-name">Banla Management</div>
                </div>
                <div class="seal-overlay">
                  ${sealSvg}
                </div>
              </div>
            </div>
          </div>

          <div class="slip-bottom-bar">
            <span>${isPaid ? "✓ Phiếu xác nhận điện tử có đóng dấu đỏ chính thức của Banla Boutique Hotel Đà Lạt." : "⚠️ Bản tạm tính yêu cầu đặt phòng - Chưa có giá trị nhận phòng cho đến khi hoàn tất thanh toán."}</span>
            <span>Hotline 24/7: 0296.9996.999 - 0352554863</span>
          </div>
        </div>
      </div>
    `;
  };
})();
