/**
 * BANLA PRIORITY MODAL SDK (Plug & Play)
 * Giao diện MB Bank Priority (Đen Carbon - Bạc Titanium - Vàng Ánh Kim)
 * Bộ lọc >20 ngân hàng, VietQR tự động, Deeplink mở app trực tiếp, SSE Real-time
 */
(function (window) {
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
    { code: 'EIB', name: 'Eximbank', scheme: 'eximbank://' },
    { code: 'DOB', name: 'DongABank', scheme: 'dongabank://' },
    { code: 'PVCB', name: 'PVcomBank', scheme: 'pvcombank://' },
    { code: 'NAB', name: 'NamABank', scheme: 'namabank://' },
    { code: 'ABB', name: 'AnBinhBank', scheme: 'abbank://' },
    { code: 'BVB', name: 'BVBank', scheme: 'digimi://' },
    { code: 'BAB', name: 'BacABank', scheme: 'bacabank://' }
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
        background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #E2E8F0;
      }
      .banla-priority-box {
        background: radial-gradient(circle at 50% 0%, #1E232A 0%, #111215 100%);
        border: 1px solid rgba(212, 175, 55, 0.35); border-radius: 20px;
        width: 95%; max-width: 520px; max-height: 92vh; overflow-y: auto;
        padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); position: relative;
      }
      .banla-gold-text {
        background: linear-gradient(135deg, #F5E5C9 0%, #D4AF37 50%, #AA8022 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;
      }
      .banla-gold-btn {
        background: linear-gradient(135deg, #ECC880 0%, #D4AF37 50%, #9E7D23 100%);
        color: #111215; font-weight: 700; border: none; cursor: pointer; border-radius: 12px;
        transition: opacity 0.2s;
      }
      .banla-gold-btn:hover { opacity: 0.92; }
      .banla-input {
        width: 100%; background: #181B22; border: 1px solid rgba(255,255,255,0.12);
        color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 13px; box-sizing: border-box;
      }
      .banla-input:focus { outline: none; border-color: #D4AF37; }
      .banla-bank-item {
        background: #1B1E26; border: 1px solid rgba(255,255,255,0.06); padding: 8px 10px;
        border-radius: 10px; cursor: pointer; transition: all 0.2s; text-align: left;
      }
      .banla-bank-item:hover { border-color: rgba(212, 175, 55, 0.5); background: #252A36; }
      .banla-copy-btn {
        background: rgba(212, 175, 55, 0.15); border: 1px solid rgba(212, 175, 55, 0.35);
        color: #D4AF37; font-size: 10px; padding: 2px 7px; border-radius: 6px; cursor: pointer;
        margin-left: 6px;
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

  function openModal(options = {}) {
    injectStyles();
    const amount = Number(options.amount) || 200000;
    const bookingId = options.bookingId || 'BALA-9821';
    const memo = options.memo || ('BALA' + String(bookingId).slice(-4).toUpperCase());
    const accountNo = options.accountNo || '0965999999';
    const accountName = options.accountName || 'BANLA BOUTIQUE HOTEL';
    const bankName = options.bankName || 'MB Bank';
    const sessionId = options.sessionId || ('SESS_' + Date.now());

    const vietQrUrl = `https://img.vietqr.io/image/MB-${accountNo}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

    currentSession = {
      bookingId,
      amount,
      memo,
      accountNo,
      accountName,
      bankName,
      sessionId,
      vietQrUrl,
      onSuccess: options.onSuccess || function() {}
    };

    let modal = document.getElementById('banlaPriorityModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'banlaPriorityModal';
      modal.className = 'banla-priority-checkout';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="banla-priority-box">
        <button onclick="BanlaPayment.close()" aria-label="Đóng" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:20px;">✕</button>

        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:11px;letter-spacing:2px;color:#D4AF37;font-weight:700;">BANLA PRIORITY CHECKOUT</div>
          <h3 style="margin:4px 0 0;font-size:19px;color:#fff;">Cổng Thanh Toán Đặc Quyền</h3>
        </div>

        <div style="background:#1B1E26;border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#94A3B8;">MÃ ĐƠN: <strong style="color:#fff;">${currentSession.bookingId}</strong></div>
            <div style="font-size:11px;color:#94A3B8;margin-top:3px;">
              Nội dung CK: <strong style="color:#D4AF37;">${currentSession.memo}</strong>
              <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.memo}', this)">Chép</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94A3B8;">SỐ TIỀN</div>
            <div class="banla-gold-text" style="font-size:19px;">${currentSession.amount.toLocaleString('vi-VN')} đ</div>
          </div>
        </div>

        <!-- Tab chuyển đổi -->
        <div style="display:flex;gap:8px;margin:14px 0;">
          <button id="banlaTabQr" onclick="BanlaPayment.switchTab('qr')" style="flex:1;padding:8px;border-radius:8px;background:rgba(212,175,55,0.2);color:#D4AF37;border:1px solid rgba(212,175,55,0.3);cursor:pointer;font-size:12px;font-weight:600;">Quét mã VietQR</button>
          <button id="banlaTabBank" onclick="BanlaPayment.switchTab('bank')" style="flex:1;padding:8px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:12px;">Mở App Ngân Hàng</button>
          <button id="banlaTabCard" onclick="BanlaPayment.switchTab('card')" style="flex:1;padding:8px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:12px;">Thẻ Quốc Tế</button>
        </div>

        <!-- Khung VietQR -->
        <div id="banlaQrSec" style="text-align:center;">
          <div style="margin:8px auto 12px;padding:8px;background:#fff;border-radius:12px;display:inline-block;border:2px solid #D4AF37;">
            <img src="${currentSession.vietQrUrl}" alt="VietQR Banla Boutique" width="200" height="200" style="display:block;max-width:200px;height:auto;">
          </div>
          <div style="font-size:12px;color:#E2E8F0;line-height:1.6;">
            <div>STK: <strong style="color:#D4AF37;">${currentSession.accountNo}</strong> (${currentSession.bankName})
              <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.accountNo}', this)">Chép STK</button>
            </div>
            <div>Chủ TK: <strong style="color:#fff;">${currentSession.accountName}</strong></div>
          </div>
          <p style="font-size:11px;color:#94A3B8;margin-top:6px;">
            Hệ thống tự động xác nhận ngay sau khi nhận được tiền.
          </p>
        </div>

        <!-- Khung Ngân hàng -->
        <div id="banlaBankSec" style="display:none;">
          <input type="text" id="banlaSearchInput" oninput="BanlaPayment.searchBank(this.value)" placeholder="Gõ tên viết tắt ngân hàng (MB, VCB, TCB...)" class="banla-input" style="margin-bottom:10px;">
          <div id="banlaBankList" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-height:170px;overflow-y:auto;"></div>
          <div style="background:#14161C;padding:10px;border-radius:10px;margin-top:10px;font-size:11px;color:#94A3B8;line-height:1.5;">
            * Nhấp vào ngân hàng để mở trực tiếp App. Nhớ giữ nguyên nội dung chuyển khoản <strong style="color:#D4AF37;">${currentSession.memo}</strong>.
          </div>
        </div>

        <!-- Khung Thẻ Quốc Tế -->
        <div id="banlaCardSec" style="display:none;">
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">Số thẻ quốc tế (Visa / Mastercard)</label>
            <input type="text" placeholder="4242 •••• •••• 9821" class="banla-input">
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;">
            <div style="flex:1;">
              <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">Hạn dùng (MM/YY)</label>
              <input type="text" placeholder="12/28" class="banla-input">
            </div>
            <div style="flex:1;">
              <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">Mã CVV</label>
              <input type="password" placeholder="•••" maxlength="4" class="banla-input">
            </div>
          </div>
          <button onclick="BanlaPayment.processCard()" class="banla-gold-btn" style="width:100%;padding:12px;font-size:13px;">Xác Nhận Thanh Toán</button>
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#64748B;">
          <span id="banlaSseStatus">● Đang chờ nhận thanh toán...</span>
          <span>Bảo mật 256-bit SSL</span>
        </div>
      </div>
    `;

    renderBanks(VN_BANKS);

    // Kích hoạt lắng nghe SSE thời gian thực từ server
    if (window.EventSource && sessionId) {
      try {
        if (sseConnection) sseConnection.close();
        sseConnection = new EventSource('/api/banla/stream/' + encodeURIComponent(sessionId));
        sseConnection.onmessage = function (event) {
          try {
            const data = JSON.parse(event.data);
            if (data && data.status === 'CONFIRMED') {
              triggerSuccess(data);
            }
          } catch (e) {}
        };
        sseConnection.onerror = function () {
          // SSE lỗi tạm thời, tự động kết nối lại khi có mạng
          const statusEl = document.getElementById('banlaSseStatus');
          if (statusEl) statusEl.textContent = '● Kết nối xác nhận tự động';
        };
      } catch (e) {
        console.warn('[Banla Payment] SSE không khả dụng:', e);
      }
    }
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

  function triggerSuccess(data = {}) {
    const pin = data.smartLockPin || '*9821#';
    alert(`THANH TOÁN THÀNH CÔNG!\n\nĐơn đặt phòng ${currentSession.bookingId} đã được xác nhận.\nMã Smart-Lock mở cửa phòng: ${pin}\n\nQuý khách vui lòng liên hệ Fanpage Facebook Banla (https://www.facebook.com/profile.php?id=61550577645853) để được cung cấp PHIẾU XÁC NHẬN DỊCH VỤ CHÍNH THỨC CÓ DẤU ĐỎ của Banla.\n\nHotline hỗ trợ 24/7: 0296.9996.999 - 0352554863`);
    if (currentSession && typeof currentSession.onSuccess === 'function') {
      currentSession.onSuccess(data);
    }
    closeModal();
  }

  function closeModal() {
    const modal = document.getElementById('banlaPriorityModal');
    if (modal) modal.remove();
    if (sseConnection) {
      sseConnection.close();
      sseConnection = null;
    }
  }

  function processCard() {
    alert('Thanh toán thẻ quốc tế đang kết nối cổng bảo mật. Vui lòng sử dụng phương thức chuyển khoản nhanh VietQR để được xác nhận tức thì.');
  }

  window.BanlaPayment = {
    open: openModal,
    close: closeModal,
    copy: copyText,
    processCard: processCard,
    switchTab: function (tab) {
      const tabQr = document.getElementById('banlaTabQr');
      const tabBank = document.getElementById('banlaTabBank');
      const tabCard = document.getElementById('banlaTabCard');
      const secQr = document.getElementById('banlaQrSec');
      const secBank = document.getElementById('banlaBankSec');
      const secCard = document.getElementById('banlaCardSec');

      if (!secQr || !secBank || !secCard) return;

      secQr.style.display = tab === 'qr' ? 'block' : 'none';
      secBank.style.display = tab === 'bank' ? 'block' : 'none';
      secCard.style.display = tab === 'card' ? 'block' : 'none';

      const activeStyle = 'rgba(212,175,55,0.2)';
      const activeColor = '#D4AF37';
      const activeBorder = '1px solid rgba(212,175,55,0.3)';

      [tabQr, tabBank, tabCard].forEach(t => {
        if (t) {
          t.style.background = 'none';
          t.style.color = '#94A3B8';
          t.style.border = 'none';
        }
      });

      const activeTab = tab === 'qr' ? tabQr : (tab === 'bank' ? tabBank : tabCard);
      if (activeTab) {
        activeTab.style.background = activeStyle;
        activeTab.style.color = activeColor;
        activeTab.style.border = activeBorder;
      }
    },
    searchBank: function (keyword) {
      const q = (keyword || '').trim().toLowerCase();
      if (!q) return renderBanks(VN_BANKS);
      const filtered = VN_BANKS.filter(b => b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q));
      renderBanks(filtered);
    },
    triggerSuccess: triggerSuccess
  };
})(window);
