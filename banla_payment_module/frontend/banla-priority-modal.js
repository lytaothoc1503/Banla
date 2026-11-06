/**
 * BANLA PRIORITY MODAL SDK (Real-Data Verified Edition)
 * Giao diện MB Bank Priority (Đen Carbon - Bạc Titanium - Vàng Ánh Kim)
 * Khắc phục G1: Tuyệt đối KHÔNG tin dữ liệu `localStorage` để xác nhận thanh toán.
 * Chỉ mở trạng thái ĐÃ XÁC THỰC CSDL khi Server API hoặc kênh SSE xác nhận đơn ở trạng thái PAID.
 */
(function (window) {
  'use strict';

  const VN_BANKS = [
    { code: 'MB', name: 'MB Bank', scheme: 'mbbank://' },
    { code: 'VCB', name: 'Vietcombank', scheme: 'vietcombank://' },
    { code: 'TCB', name: 'Techcombank', scheme: 'techcombank://' },
    { code: 'VPB', name: 'VPBank', scheme: 'vpbankneo://' },
    { code: 'BIDV', name: 'BIDV', scheme: 'bidvsmartbanking://' },
    { code: 'ACB', name: 'ACB', scheme: 'acbapp://' },
    { code: 'CTG', name: 'VietinBank', scheme: 'vietinbankipay://' },
    { code: 'VBA', name: 'Agribank', scheme: 'agribankemobilebanking://' },
    { code: 'MSB', name: 'MSB', scheme: 'msb://' },
    { code: 'TPB', name: 'TPBank', scheme: 'tpbank://' },
    { code: 'STB', name: 'Sacombank', scheme: 'sacombankpay://' },
    { code: 'VIB', name: 'VIB', scheme: 'myvib2://' },
    { code: 'SHB', name: 'SHB', scheme: 'shbmobile://' },
    { code: 'HDB', name: 'HDBank', scheme: 'hdbank://' },
    { code: 'SEAB', name: 'SeABank', scheme: 'seabank://' },
    { code: 'EIB', name: 'Eximbank', scheme: 'eximbank://' }
  ];

  let currentSession = null;
  let sseConnection = null;
  let pollInterval = null;

  function getRootPrefix() {
    const p = window.location.pathname || '';
    if (p.includes('/phong/') || p.includes('/lien-he/') || p.includes('/khach-san/')) {
      const segs = p.split('/').filter(Boolean);
      if (p.includes('/khach-san/banla-boutique-hotel')) return '../../';
      if (segs.length >= 2) return '../';
    }
    return '';
  }

  function injectStyles() {
    if (document.getElementById('banla-priority-css')) return;
    const style = document.createElement('style');
    style.id = 'banla-priority-css';
    style.innerHTML = `
      .banla-priority-checkout {
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(15, 23, 20, 0.85); backdrop-filter: blur(10px);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #E2E8F0; padding: 16px;
      }
      .banla-priority-box {
        background: radial-gradient(circle at 50% 0%, #1F2D28 0%, #111614 100%);
        border: 1px solid rgba(212, 175, 55, 0.4); border-radius: 20px;
        width: 100%; max-width: 520px; max-height: 92vh; overflow-y: auto;
        padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.75); position: relative;
      }
      .banla-gold-text {
        background: linear-gradient(135deg, #F5E5C9 0%, #D4AF37 50%, #AA8022 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 700;
      }
      .banla-gold-btn {
        background: linear-gradient(135deg, #ECC880 0%, #D4AF37 50%, #9E7D23 100%);
        color: #111614; font-weight: 700; border: none; cursor: pointer; border-radius: 10px;
        transition: all 0.2s; font-family: inherit;
      }
      .banla-gold-btn:hover { opacity: 0.94; transform: translateY(-1px); }
      .banla-fb-btn {
        background: #1877F2; color: #fff; font-weight: 600; border: none; cursor: pointer;
        border-radius: 10px; text-decoration: none; display: inline-flex; align-items: center;
        justify-content: center; gap: 6px; transition: opacity 0.2s; font-family: inherit;
      }
      .banla-fb-btn:hover { opacity: 0.92; }
      .banla-input {
        width: 100%; background: #181E1C; border: 1px solid rgba(255,255,255,0.14);
        color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 13px; box-sizing: border-box;
      }
      .banla-input:focus { outline: none; border-color: #D4AF37; }
      .banla-bank-item {
        background: #18221F; border: 1px solid rgba(255,255,255,0.08); padding: 8px 10px;
        border-radius: 10px; cursor: pointer; transition: all 0.2s; text-align: left;
      }
      .banla-bank-item:hover { border-color: rgba(212, 175, 55, 0.55); background: #22302B; }
      .banla-copy-btn {
        background: rgba(212, 175, 55, 0.16); border: 1px solid rgba(212, 175, 55, 0.4);
        color: #D4AF37; font-size: 10.5px; padding: 2px 8px; border-radius: 6px; cursor: pointer;
        margin-left: 6px; font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function copyText(txt, btnEl) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => {
        if (btnEl) {
          const orig = btnEl.textContent;
          btnEl.textContent = 'Đã chép!';
          setTimeout(() => { btnEl.textContent = orig; }, 1600);
        }
      });
    }
  }

  function getSavedBankConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem('BANLA_SUPABASE_CONFIG') || '{}');
      return {
        bankId: cfg.bankId || 'MB',
        accountNo: cfg.accountNo || '0352554863',
        accountName: cfg.accountName || 'BANLA BOUTIQUE HOTEL'
      };
    } catch {
      return { bankId: 'MB', accountNo: '0352554863', accountName: 'BANLA BOUTIQUE HOTEL' };
    }
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (sseConnection) {
      try { sseConnection.close(); } catch {}
      sseConnection = null;
    }
  }

  // CHỈ kiểm tra trạng thái thực tế từ Máy chủ (TUYỆT ĐỐI KHÔNG đọc localStorage để tránh giả mạo G1)
  async function checkRealtimeStatus(bookingCode, contactHint) {
    const clean = String(bookingCode || '').replace(/^#+/, '').trim().toUpperCase();
    if (!clean) return null;
    const root = getRootPrefix();

    try {
      let detailUrl = `${root}api/booking/detail?id=${encodeURIComponent(clean)}`;
      if (contactHint) detailUrl += `&contact=${encodeURIComponent(contactHint)}`;
      const res = await fetch(detailUrl, { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        const b = data && data.booking;
        if (b && (b.paymentStatus === 'PAID' || b.paymentStatus === 'DEPOSIT_PAID' || b.payment_status === 'paid')) {
          return b;
        }
      }
    } catch (_) {}

    // Fallback cho GitHub Pages tĩnh nếu đã chạy Supabase RPC công khai và có SĐT khách
    if (contactHint && window.BANLA_SUPABASE_URL && window.BANLA_SUPABASE_ANON_KEY) {
      try {
        const sbRes = await fetch(`${window.BANLA_SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/banla_booking_status`, {
          method: 'POST',
          headers: {
            apikey: window.BANLA_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.BANLA_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            p_booking_code: clean,
            p_guest_phone: String(contactHint)
          })
        });
        if (sbRes.ok) {
          const rows = await sbRes.json();
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row && row.payment_status === 'paid') {
            return row;
          }
        }
      } catch (_) {}
    }

    return null;
  }

  function openModal(options = {}) {
    injectStyles();
    stopPolling();

    const rawCode = String(options.bookingId || '').replace(/^#+/, '').trim().toUpperCase();
    const amount = Math.trunc(Number(options.amount) || 0);
    if (!rawCode || amount <= 0) {
      alert('Không thể mở cổng thanh toán VietQR vì thiếu mã đặt phòng hoặc số tiền thực tế từ hệ thống.');
      return;
    }

    const bankCfg = getSavedBankConfig();
    const bookingId = rawCode;
    const memo = options.memo || ('BANLA_' + rawCode);
    const bankId = options.bankId || bankCfg.bankId || 'MB';
    const accountNo = options.accountNo || bankCfg.accountNo || '0352554863';
    const accountName = options.accountName || bankCfg.accountName || 'BANLA BOUTIQUE HOTEL';
    const sessionId = options.sessionId || '';
    const guestContact = options.guestPhone || options.guestEmail || '';

    const totalAmount = Math.trunc(Number(options.totalAmount) || amount);
    const discountAmount = Math.trunc(Number(options.discountAmount) || 0);
    const remainingAmount = Math.trunc(Number(options.remainingAmount) || 0);
    const paymentOption = options.paymentOption || (discountAmount > 0 ? 'pay_100' : 'deposit_50');

    const vietQrUrl =
      options.vietQrUrl ||
      `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

    currentSession = {
      bookingId,
      amount,
      totalAmount,
      discountAmount,
      remainingAmount,
      paymentOption,
      memo,
      bankId,
      accountNo,
      accountName,
      sessionId,
      guestContact,
      vietQrUrl,
      isVerifiedPaid: false,
      onSuccess: options.onSuccess || function () {}
    };

    let modal = document.getElementById('banlaPriorityModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'banlaPriorityModal';
      modal.className = 'banla-priority-checkout';
      document.body.appendChild(modal);
    }

    const baseDir = getRootPrefix();
    let slipUrl = `${baseDir}phieu.html?ma=${encodeURIComponent(bookingId)}`;
    if (guestContact) {
      slipUrl += `&contact=${encodeURIComponent(guestContact)}`;
    }

    function renderModalContent(isPaid = false) {
      modal.innerHTML = `
        <div class="banla-priority-box">
          <button onclick="BanlaPayment.close()" aria-label="Đóng" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:20px;">✕</button>

          <div style="text-align:center;margin-bottom:12px;">
            <div style="font-size:11px;letter-spacing:2px;color:#D4AF37;font-weight:700;">BANLA DIRECT BOOKING & VIETQR</div>
            <h3 style="margin:4px 0 0;font-size:19px;color:#fff;">
              ${isPaid ? '🎉 Thanh Toán Đã Được Xác Thực!' : 'Thanh Toán Đặt Phòng Banla'}
            </h3>
            <div style="margin-top:6px;">
              ${isPaid ? `
                <span style="background:rgba(34,197,94,0.18);border:1px solid #22c55e;color:#4ade80;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">
                  ✓ ĐÃ XÁC THỰC CSDL THÀNH CÔNG (MÃ ĐÃ DUYỆT)
                </span>
              ` : `
                <span style="background:rgba(217,119,6,0.15);border:1px solid #d97706;color:#fbbf24;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;">
                  ⏳ ĐANG CHỜ THANH TOÁN & ĐỐI SOÁT CSDL
                </span>
              `}
            </div>
          </div>

          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.32);border-radius:14px;padding:12px 14px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:11.5px;color:#94A3B8;">MÃ BOOKING: <strong style="color:#fff;">#${currentSession.bookingId}</strong></div>
                <div style="font-size:11.5px;color:#94A3B8;margin-top:4px;">
                  Nội dung CK: <strong style="color:#D4AF37;font-family:monospace;">${currentSession.memo}</strong>
                  <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.memo}', this)">Chép</button>
                </div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:10px;color:#94A3B8;font-weight:600;">
                  ${currentSession.paymentOption === 'pay_100' ? 'THANH TOÁN 100% (GIẢM 10%)' : 'CỌC 50% GIỮ PHÒNG'}
                </div>
                <div class="banla-gold-text" style="font-size:19px;">${currentSession.amount.toLocaleString('vi-VN')} đ</div>
              </div>
            </div>
            ${currentSession.paymentOption === 'pay_100' ? `
              <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11.5px;color:#4ade80;display:flex;justify-content:space-between;">
                <span>Ưu đãi thanh toán 100%:</span>
                <strong>Đã giảm 10% (-${currentSession.discountAmount.toLocaleString('vi-VN')} đ)</strong>
              </div>
            ` : `
              <div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(255,255,255,0.1);font-size:11.5px;color:#94A3B8;display:flex;justify-content:space-between;">
                <span>Tổng giá trị đơn: ${currentSession.totalAmount.toLocaleString('vi-VN')} đ</span>
                <span>Còn lại khi check-in: <strong style="color:#fff;">${currentSession.remainingAmount.toLocaleString('vi-VN')} đ</strong></span>
              </div>
            `}
          </div>

          ${!isPaid ? `
            <div style="display:flex;gap:6px;margin:10px 0;">
              <button id="banlaTabQr" onclick="BanlaPayment.switchTab('qr')" style="flex:1;padding:8px 6px;border-radius:8px;background:rgba(212,175,55,0.2);color:#D4AF37;border:1px solid rgba(212,175,55,0.3);cursor:pointer;font-size:11.5px;font-weight:600;">Quét VietQR</button>
              <button id="banlaTabVisa" onclick="BanlaPayment.switchTab('visa')" style="flex:1;padding:8px 6px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:11.5px;font-weight:600;">💳 Thẻ Tín Dụng Visa</button>
              <button id="banlaTabBank" onclick="BanlaPayment.switchTab('bank')" style="flex:1;padding:8px 6px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:11.5px;">App Ngân Hàng</button>
            </div>

            <div id="banlaQrSec" style="text-align:center;">
              <div style="margin:4px auto 8px;padding:8px;background:#fff;border-radius:12px;display:inline-block;border:2px solid #D4AF37;">
                <img src="${currentSession.vietQrUrl}" alt="VietQR Banla Boutique" width="190" height="190" style="display:block;max-width:190px;height:auto;">
              </div>
              <div style="font-size:12px;color:#E2E8F0;line-height:1.5;">
                <div>Ngân hàng: <strong>${currentSession.bankId}</strong> · STK: <strong style="color:#D4AF37;">${currentSession.accountNo}</strong>
                  <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.accountNo}', this)">Chép STK</button>
                </div>
                <div>Chủ TK: <strong style="color:#fff;">${currentSession.accountName}</strong></div>
              </div>
            </div>

            <div id="banlaVisaSec" style="display:none;background:rgba(255,255,255,0.03);border:1px solid rgba(212,175,55,0.28);border-radius:12px;padding:14px;text-align:center;">
              <div style="display:flex;justify-content:center;gap:6px;margin-bottom:8px;">
                <span style="background:#1e3a8a;color:#fff;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:4px;letter-spacing:0.6px;">VISA</span>
                <span style="background:#991b1b;color:#fff;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:4px;letter-spacing:0.6px;">MASTERCARD</span>
                <span style="background:#065f46;color:#fff;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:4px;letter-spacing:0.6px;">JCB</span>
                <span style="background:#0369a1;color:#fff;font-size:10.5px;font-weight:800;padding:3px 9px;border-radius:4px;letter-spacing:0.6px;">AMEX</span>
              </div>
              <p style="font-size:12px;color:#E2E8F0;line-height:1.5;margin:0 0 12px;">
                Thanh toán trực tuyến an toàn bằng <strong>Thẻ Tín Dụng / Ghi Nợ Quốc Tế</strong> qua cổng bảo mật <strong>OnePay 3D Secure</strong>. Banla tuyệt đối không lưu thông tin thẻ (PCI DSS).
              </p>
              <button type="button" id="banlaBtnPayVisa" onclick="BanlaPayment.payWithVisa(this)" class="banla-gold-btn" style="padding:11px 14px;font-size:13px;">
                🔒 Thanh Toán Thẻ Quốc Tế (${currentSession.amount.toLocaleString('vi-VN')} đ)
              </button>
              <div id="banlaVisaError" style="display:none;margin-top:8px;font-size:11.5px;color:#fca5a5;"></div>
            </div>

            <div id="banlaBankSec" style="display:none;">
              <input type="text" id="banlaSearchInput" oninput="BanlaPayment.searchBank(this.value)" placeholder="Gõ tên ngân hàng (MB, VCB, TCB, ACB...)" class="banla-input" style="margin-bottom:10px;">
              <div id="banlaBankList" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-height:165px;overflow-y:auto;"></div>
            </div>

            <div style="margin-top:12px;background:linear-gradient(135deg, rgba(24,119,242,0.22) 0%, rgba(212,175,55,0.12) 100%);border:1.5px solid #1877F2;border-radius:12px;padding:12px;text-align:left;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:15px;">📸</span>
                <strong style="color:#60A5FA;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">QUY TRÌNH XÁC THỰC THANH TOÁN:</strong>
              </div>
              <p style="margin:0 0 8px;font-size:12px;color:#F1F5F9;line-height:1.45;">
                Sau khi chuyển khoản VietQR, hệ thống sẽ tự động cập nhật ngay khi ngân hàng báo có, hoặc quý khách <strong>gửi ảnh biên lai qua Facebook Banla</strong> để Lễ tân duyệt nhanh và cấp <strong>Phiếu xác nhận Dấu Đỏ cùng Mã PIN Smart-Lock 6 số</strong>.
              </p>
              <a href="https://www.facebook.com/Banlaboutiquedalat/" target="_blank" rel="noopener" class="banla-fb-btn" style="width:100%;padding:9px;font-size:12.5px;box-sizing:border-box;font-weight:700;">
                👉 Gửi biên lai qua Facebook để xác nhận chính thức
              </a>
            </div>

            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
              <a href="${slipUrl}" target="_blank" class="banla-gold-btn" style="padding:10px;font-size:12px;text-align:center;text-decoration:none;display:block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#E2E8F0;">
                📄 Xem Phiếu Yêu Cầu Đặt Phòng (#${currentSession.bookingId}) - Chờ thanh toán
              </a>
              <div style="font-size:11px;color:#94A3B8;text-align:center;">
                Hotline hỗ trợ 24/7: <strong>0296.9996.999 - 0352554863</strong> · Email: concact@banlaboutiquedalat.com
              </div>
            </div>
          ` : `
            <div style="background:rgba(34,197,94,0.1);border:1.5px solid #22c55e;border-radius:12px;padding:16px;text-align:center;margin:14px 0;">
              <div style="font-size:32px;margin-bottom:6px;">🛡️</div>
              <h4 style="color:#22c55e;margin:0 0 6px;font-size:16px;">ĐƠN ĐÃ ĐƯỢC DUYỆT & ĐỐI SOÁT CSDL</h4>
              <p style="font-size:12.5px;color:#F1F5F9;margin:0 0 12px;line-height:1.5;">
                Giao dịch của quý khách đã được ghi nhận trên cơ sở dữ liệu máy chủ Banla. Quý khách có thể mở và in ngay <strong>Phiếu xác nhận dịch vụ chính thức có Con Dấu Đỏ</strong>.
              </p>
              <a href="${slipUrl}" target="_blank" class="banla-gold-btn" style="padding:12px;font-size:13.5px;text-align:center;text-decoration:none;display:block;font-weight:700;">
                🏆 Xem & In Phiếu Xác Nhận Dấu Đỏ & Mã Smart-Lock PIN
              </a>
            </div>
          `}
        </div>
      `;

      if (!isPaid) {
        renderBanks(VN_BANKS);
      }
    }

    function handleVerifiedSuccess(verifiedData) {
      if (!currentSession || currentSession.isVerifiedPaid) return;
      stopPolling();
      currentSession.isVerifiedPaid = true;
      renderModalContent(true);
      if (typeof currentSession.onSuccess === 'function') {
        currentSession.onSuccess(verifiedData);
      }
    }

    renderModalContent(false);

    // Kênh 1: Lắng nghe SSE thời gian thực từ máy chủ (theo sessionId hoặc bookingId)
    if (typeof window.EventSource === 'function') {
      try {
        const streamKey = sessionId || bookingId;
        sseConnection = new EventSource(`${baseDir}api/banla/stream/${encodeURIComponent(streamKey)}`);
        sseConnection.onmessage = async function (ev) {
          try {
            const payload = JSON.parse(ev.data || '{}');
            if (payload && payload.status === 'CONFIRMED') {
              const verified = await checkRealtimeStatus(bookingId, guestContact);
              handleVerifiedSuccess(verified || payload);
            }
          } catch (_) {}
        };
        sseConnection.onerror = function () {
          if (sseConnection) {
            try { sseConnection.close(); } catch {}
            sseConnection = null;
          }
        };
      } catch (_) {}
    }

    // Kênh 2: Polling đối chiếu trực tiếp CSDL máy chủ mỗi 3 giây
    pollInterval = setInterval(async () => {
      const verified = await checkRealtimeStatus(bookingId, guestContact);
      if (verified) {
        handleVerifiedSuccess(verified);
      }
    }, 3000);
  }

  function renderBanks(list) {
    const box = document.getElementById('banlaBankList');
    if (!box) return;
    box.innerHTML = '';
    list.forEach(b => {
      const btn = document.createElement('div');
      btn.className = 'banla-bank-item';
      btn.onclick = () => { window.location.href = b.scheme; };
      btn.innerHTML = `
        <div style="color:#D4AF37;font-size:10px;font-weight:700;">${b.code}</div>
        <div style="color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.name}</div>
      `;
      box.appendChild(btn);
    });
  }

  function closeModal() {
    stopPolling();
    const modal = document.getElementById('banlaPriorityModal');
    if (modal) modal.remove();
  }

  window.BanlaPayment = {
    open: openModal,
    close: closeModal,
    copy: copyText,
    switchTab: function (tab) {
      const tabQr = document.getElementById('banlaTabQr');
      const tabVisa = document.getElementById('banlaTabVisa');
      const tabBank = document.getElementById('banlaTabBank');
      const secQr = document.getElementById('banlaQrSec');
      const secVisa = document.getElementById('banlaVisaSec');
      const secBank = document.getElementById('banlaBankSec');
      if (!secQr || !secBank) return;

      secQr.style.display = tab === 'qr' ? 'block' : 'none';
      if (secVisa) secVisa.style.display = tab === 'visa' ? 'block' : 'none';
      secBank.style.display = tab === 'bank' ? 'block' : 'none';

      [tabQr, tabVisa, tabBank].forEach(t => {
        if (t) {
          t.style.background = 'none';
          t.style.color = '#94A3B8';
          t.style.border = 'none';
        }
      });

      const activeBtn = tab === 'qr' ? tabQr : (tab === 'visa' ? tabVisa : tabBank);
      if (activeBtn) {
        activeBtn.style.background = 'rgba(212,175,55,0.2)';
        activeBtn.style.color = '#D4AF37';
        activeBtn.style.border = '1px solid rgba(212,175,55,0.3)';
      }
    },
    payWithVisa: async function (btnEl) {
      if (!currentSession || !currentSession.bookingId) return;
      const errBox = document.getElementById('banlaVisaError');
      if (errBox) {
        errBox.style.display = 'none';
        errBox.textContent = '';
      }
      const origText = btnEl ? btnEl.textContent : '';
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = 'Đang kết nối cổng bảo mật OnePay 3D Secure...';
      }
      try {
        const res = await fetch(`${getRootPrefix()}api/payments/visa/create-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: currentSession.bookingId,
            payment_option: currentSession.paymentOption || 'deposit_50'
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.redirect_url) {
          window.location.assign(data.redirect_url);
          return;
        }
        if (errBox) {
          errBox.style.display = 'block';
          errBox.textContent = data.message || 'Cổng thanh toán thẻ quốc tế chưa sẵn sàng. Quý khách vui lòng chọn tab Quét VietQR.';
        }
      } catch (_) {
        if (errBox) {
          errBox.style.display = 'block';
          errBox.textContent = 'Không thể kết nối máy chủ thanh toán thẻ. Quý khách vui lòng chuyển sang tab Quét VietQR.';
        }
      }
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = origText;
      }
    },
    searchBank: function (q) {
      const keyword = (q || '').toLowerCase().trim();
      const filtered = VN_BANKS.filter(b =>
        b.code.toLowerCase().includes(keyword) || b.name.toLowerCase().includes(keyword)
      );
      renderBanks(filtered);
    }
  };
})(window);
