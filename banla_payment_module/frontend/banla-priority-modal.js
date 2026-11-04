/**
 * BANLA PRIORITY MODAL SDK (Plug & Play)
 * Giao diện MB Bank Priority (Đen Carbon - Bạc Titanium - Vàng Ánh Kim)
 * Bộ lọc >20 ngân hàng, VietQR động chuẩn cú pháp BANLA_{BOOKING_CODE}, mở Phiếu Dấu Đỏ & Fanpage 24/7
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

    let pollInterval = null;

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function checkRealtimeStatus(bookingCode) {
    const clean = String(bookingCode).replace(/^#+/, '').toUpperCase();
    try {
      // 1. Kiểm tra LocalStorage
      const raw = localStorage.getItem('BANLA_BOOKINGS_STORE');
      if (raw) {
        const list = JSON.parse(raw);
        const item = list.find(b => String(b.id || b.booking_code).toUpperCase() === clean);
        if (item && (item.payment_status === 'paid' || item.paymentStatus === 'PAID')) {
          return item;
        }
      }
    } catch (e) {}

    // 2. Kiểm tra Backend API (/api/booking/detail) nếu có kết nối máy chủ
    try {
      const res = await fetch('/api/booking/detail?id=' + encodeURIComponent(clean));
      if (res.ok) {
        const data = await res.json();
        const b = data && data.booking;
        if (b && (b.paymentStatus === 'PAID' || b.payment_status === 'paid')) {
          try {
            const raw = localStorage.getItem('BANLA_BOOKINGS_STORE');
            const list = raw ? JSON.parse(raw) : [];
            const idx = Array.isArray(list)
              ? list.findIndex(x => String(x.id || x.booking_code).toUpperCase() === clean)
              : -1;
            if (idx !== -1) {
              list[idx].payment_status = 'paid';
              list[idx].paymentStatus = 'PAID';
              list[idx].booking_status = 'confirmed';
              list[idx].status = 'confirmed';
              if (b.smartLockPin) list[idx].smartlock_pin = b.smartLockPin;
              localStorage.setItem('BANLA_BOOKINGS_STORE', JSON.stringify(list));
            }
          } catch (err) {}
          return b;
        }
      }
    } catch (e) {}

    return null;
  }

  function openModal(options = {}) {
    injectStyles();
    stopPolling();

    const bankCfg = getSavedBankConfig();
    const rawCode = String(options.bookingId || 'BL9821').replace(/^#+/, '').toUpperCase();
    const bookingId = rawCode;
    const memo = options.memo || ('BANLA_' + rawCode);
    const bankId = options.bankId || bankCfg.bankId || 'MB';
    const accountNo = options.accountNo || bankCfg.accountNo || '0352554863';
    const accountName = options.accountName || bankCfg.accountName || 'BANLA BOUTIQUE HOTEL';
    const sessionId = options.sessionId || ('SESS_' + Date.now());

    const amount = Number(options.amount) || 1150000;
    const totalAmount = Number(options.totalAmount) || amount;
    const discountAmount = Number(options.discountAmount) || 0;
    const remainingAmount = Number(options.remainingAmount) || 0;
    const paymentOption = options.paymentOption || (discountAmount > 0 ? 'pay_100' : 'deposit_50');

    const vietQrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

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

    const baseDir = window.location.pathname.includes('/phong/') || window.location.pathname.includes('/lien-he/') || window.location.pathname.includes('/khach-san/')
      ? '../'
      : '';
    const slipUrl = `${baseDir}phieu.html?ma=${encodeURIComponent(bookingId)}`;

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
                  ⏳ ĐANG CHỜ THANH TOÁN (PENDING)
                </span>
              `}
            </div>
          </div>

          <!-- Bảng tóm tắt khoản tiền -->
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
                <span>Còn lại thanh toán khi check-in: <strong style="color:#fff;">${currentSession.remainingAmount.toLocaleString('vi-VN')} đ</strong></span>
              </div>
            `}
          </div>

          ${!isPaid ? `
            <div style="display:flex;gap:8px;margin:10px 0;">
              <button id="banlaTabQr" onclick="BanlaPayment.switchTab('qr')" style="flex:1;padding:8px;border-radius:8px;background:rgba(212,175,55,0.2);color:#D4AF37;border:1px solid rgba(212,175,55,0.3);cursor:pointer;font-size:12px;font-weight:600;">Quét mã VietQR</button>
              <button id="banlaTabBank" onclick="BanlaPayment.switchTab('bank')" style="flex:1;padding:8px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:12px;">Mở App Ngân Hàng</button>
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

            <div id="banlaBankSec" style="display:none;">
              <input type="text" id="banlaSearchInput" oninput="BanlaPayment.searchBank(this.value)" placeholder="Gõ tên ngân hàng (MB, VCB, TCB, ACB...)" class="banla-input" style="margin-bottom:10px;">
              <div id="banlaBankList" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-height:165px;overflow-y:auto;"></div>
            </div>

            <!-- BƯỚC QUAN TRỌNG: GỬI BIÊN LAI QUA FB ĐỂ ĐỐI SOÁT CSDL -->
            <div style="margin-top:12px;background:linear-gradient(135deg, rgba(24,119,242,0.22) 0%, rgba(212,175,55,0.12) 100%);border:1.5px solid #1877F2;border-radius:12px;padding:12px;text-align:left;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:15px;">📸</span>
                <strong style="color:#60A5FA;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">QUY TRÌNH XÁC THỰC THANH TOÁN:</strong>
              </div>
              <p style="margin:0 0 8px;font-size:12px;color:#F1F5F9;line-height:1.45;">
                Sau khi chuyển khoản VietQR, quý khách vui lòng <strong>chụp ảnh biên lai giao dịch thành công và gửi qua Facebook Banla</strong>. Đội ngũ Lễ tân sẽ đối soát trên CSDL ngân hàng, duyệt đơn và xuất <strong>Phiếu xác nhận dịch vụ có Dấu Đỏ chính thức cùng Mã PIN Smart-Lock</strong>.
              </p>
              <a href="https://www.facebook.com/Banlaboutiquedalat/" target="_blank" rel="noopener" class="banla-fb-btn" style="width:100%;padding:9px;font-size:12.5px;box-sizing:border-box;font-weight:700;">
                👉 Gửi biên lai qua Facebook để xác nhận chính thức
              </a>
            </div>

            <!-- Nút xem phiếu CHỜ THANH TOÁN (Không dấu đỏ) -->
            <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
              <a href="${slipUrl}" target="_blank" class="banla-gold-btn" style="padding:10px;font-size:12px;text-align:center;text-decoration:none;display:block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#E2E8F0;">
                📄 Xem Phiếu Yêu Cầu Đặt Phòng (#${currentSession.bookingId}) - Chờ thanh toán
              </a>
              <div style="font-size:11px;color:#94A3B8;text-align:center;">
                Hotline hỗ trợ 24/7: <strong>0296.9996.999 - 0352554863</strong> · Email: concact@banlaboutiquedalat.com
              </div>
            </div>
          ` : `
            <!-- GIAO DIỆN KHI ĐÃ ĐƯỢC CSDL CHỨNG MINH LÀ ĐÃ THANH TOÁN THẬT -->
            <div style="background:rgba(34,197,94,0.1);border:1.5px solid #22c55e;border-radius:12px;padding:16px;text-align:center;margin:14px 0;">
              <div style="font-size:32px;margin-bottom:6px;">🛡️</div>
              <h4 style="color:#22c55e;margin:0 0 6px;font-size:16px;">ĐƠN ĐÃ ĐƯỢC DUYỆT & ĐỐI SOÁT CSDL</h4>
              <p style="font-size:12.5px;color:#F1F5F9;margin:0 0 12px;line-height:1.5;">
                Giao dịch của bạn đã được ghi nhận trên cơ sở dữ liệu. Bây giờ bạn có thể mở và in <strong>Phiếu xác nhận dịch vụ chính thức có Con Dấu Đỏ</strong> của Banla Boutique Hotel.
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

    renderModalContent(false);

    // Bắt đầu lắng nghe / polling CSDL thời gian thực
    pollInterval = setInterval(async () => {
      const verified = await checkRealtimeStatus(bookingId);
      if (verified) {
        stopPolling();
        currentSession.isVerifiedPaid = true;
        renderModalContent(true);
        if (typeof currentSession.onSuccess === 'function') {
          currentSession.onSuccess(verified);
        }
      }
    }, 2500);
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
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }
  }

  window.BanlaPayment = {
    open: openModal,
    close: closeModal,
    copy: copyText,
    switchTab: function (tab) {
      const tabQr = document.getElementById('banlaTabQr');
      const tabBank = document.getElementById('banlaTabBank');
      const secQr = document.getElementById('banlaQrSec');
      const secBank = document.getElementById('banlaBankSec');
      if (!secQr || !secBank) return;

      secQr.style.display = tab === 'qr' ? 'block' : 'none';
      secBank.style.display = tab === 'bank' ? 'block' : 'none';

      [tabQr, tabBank].forEach(t => {
        if (t) {
          t.style.background = 'none';
          t.style.color = '#94A3B8';
          t.style.border = 'none';
        }
      });

      const activeBtn = tab === 'qr' ? tabQr : tabBank;
      if (activeBtn) {
        activeBtn.style.background = 'rgba(212,175,55,0.2)';
        activeBtn.style.color = '#D4AF37';
        activeBtn.style.border = '1px solid rgba(212,175,55,0.3)';
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
