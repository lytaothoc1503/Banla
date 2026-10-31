/**
 * BANLA PRIORITY MODAL SDK (Plug & Play)
 * Giao diện MB Bank Priority (Đen Carbon - Bạc Titanium - Vàng Ánh Kim)
 * Bộ lọc >35 ngân hàng, Deeplink mở app trực tiếp, Form thẻ Visa/Master
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
        border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 20px;
        width: 95%; max-width: 520px; max-height: 90vh; overflow-y: auto;
        padding: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.8); position: relative;
      }
      .banla-gold-text {
        background: linear-gradient(135deg, #F5E5C9 0%, #D4AF37 50%, #AA8022 100%);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: bold;
      }
      .banla-gold-btn {
        background: linear-gradient(135deg, #ECC880 0%, #D4AF37 50%, #9E7D23 100%);
        color: #111215; font-weight: 700; border: none; cursor: pointer; border-radius: 12px;
      }
      .banla-input {
        width: 100%; background: #181B22; border: 1px solid rgba(255,255,255,0.1);
        color: #fff; padding: 10px 14px; border-radius: 10px; font-size: 13px; box-sizing: border-box;
      }
      .banla-input:focus { outline: none; border-color: #D4AF37; }
      .banla-bank-item {
        background: #1B1E26; border: 1px solid rgba(255,255,255,0.06); padding: 8px 10px;
        border-radius: 10px; cursor: pointer; transition: all 0.2s; text-align: left;
      }
      .banla-bank-item:hover { border-color: rgba(212, 175, 55, 0.5); background: #252A36; }
    `;
    document.head.appendChild(style);
  }

  function openModal(options = {}) {
    injectStyles();
    currentSession = {
      bookingId: options.bookingId || 'BALA-9821',
      amount: options.amount || 200000,
      memo: options.memo || 'BALA9821',
      accountNo: options.accountNo || '982100009999',
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
        <button onclick="BanlaPayment.close()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:18px;">✕</button>
        
        <div style="text-align:center;margin-bottom:18px;">
          <div style="font-size:11px;letter-spacing:2px;color:#D4AF37;font-weight:700;">BANLA PRIORITY CHECKOUT</div>
          <h3 style="margin:4px 0 0;font-size:20px;color:#fff;">Cổng Thanh Toán Đặc Quyền</h3>
        </div>

        <div style="background:#1B1E26;border:1px solid rgba(212,175,55,0.3);border-radius:14px;padding:14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11px;color:#94A3B8;">MÃ ĐƠN: <strong style="color:#fff;">\${currentSession.bookingId}</strong></div>
            <div style="font-size:11px;color:#94A3B8;margin-top:2px;">Nội dung CK: <strong style="color:#D4AF37;">\${currentSession.memo}</strong></div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94A3B8;">SỐ TIỀN</div>
            <div class="banla-gold-text" style="font-size:20px;">\${currentSession.amount.toLocaleString('vi-VN')} đ</div>
          </div>
        </div>

        <!-- Tab chuyển đổi -->
        <div style="display:flex;gap:8px;margin:16px 0;">
          <button id="banlaTabBank" onclick="BanlaPayment.switchTab('bank')" style="flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;border:none;cursor:pointer;font-size:12px;">Ngân hàng Nội địa</button>
          <button id="banlaTabCard" onclick="BanlaPayment.switchTab('card')" style="flex:1;padding:8px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:12px;">Thẻ Visa / Master</button>
        </div>

        <!-- Khung Ngân hàng -->
        <div id="banlaBankSec">
          <input type="text" id="banlaSearchInput" oninput="BanlaPayment.searchBank(this.value)" placeholder="Gõ chữ cái đầu tìm ngân hàng (M, V, T...)" class="banla-input" style="margin-bottom:10px;">
          <div id="banlaBankList" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-height:180px;overflow-y:auto;"></div>
          
          <div style="background:#14161C;padding:10px;border-radius:10px;margin-top:12px;font-size:11px;color:#94A3B8;line-height:1.5;">
            * Nhấp vào ngân hàng để mở trực tiếp App. Quý khách vui lòng nhập đúng nội dung 
            <strong style="color:#D4AF37;">\${currentSession.memo}</strong> để hệ thống duyệt tự động.
          </div>
        </div>

        <!-- Khung Thẻ Visa -->
        <div id="banlaCardSec" style="display:none;">
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">Số thẻ quốc tế</label>
            <input type="text" placeholder="4242 •••• •••• 9821" class="banla-input">
          </div>
          <div style="display:flex;gap:10px;margin-bottom:12px;">
            <div style="flex:1;">
              <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">Hạn dùng (MM/YY)</label>
              <input type="text" placeholder="12/28" class="banla-input">
            </div>
            <div style="flex:1;">
              <label style="font-size:11px;color:#94A3B8;display:block;margin-bottom:4px;">CVV</label>
              <input type="password" placeholder="•••" maxlength="3" class="banla-input">
            </div>
          </div>
          <button onclick="BanlaPayment.triggerSuccess()" class="banla-gold-btn" style="width:100%;padding:12px;font-size:13px;">Thanh Toán Ngay</button>
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;font-size:11px;color:#64748B;">
          <span>● Lắng nghe Webhook tự động</span>
          <a href="javascript:void(0)" onclick="BanlaPayment.triggerSuccess()" style="color:#D4AF37;text-decoration:none;">[Test Thành Công]</a>
        </div>
      </div>
    `;

    renderBanks(VN_BANKS);
  }

  function renderBanks(list) {
    const box = document.getElementById('banlaBankList');
    if (!box) return;
    box.innerHTML = '';
    list.forEach(b => {
      const btn = document.createElement('div');
      btn.className = 'banla-bank-item';
      btn.onclick = () => window.location.href = b.scheme;
      btn.innerHTML = `
        <div style="color:#D4AF37;font-size:10px;font-weight:700;">\${b.code}</div>
        <div style="color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">\${b.name}</div>
      `;
      box.appendChild(btn);
    });
  }

  function triggerSuccess(data = {}) {
    const pin = data.smartLockPin || '*9821#';
    alert(`THANH TOÁN THÀNH CÔNG!\n\nĐơn hàng ${currentSession.bookingId} đã được xác nhận.\nMã mở cửa Smart-Lock: ${pin}`);
    if (currentSession && currentSession.onSuccess) currentSession.onSuccess(data);
    closeModal();
  }

  function closeModal() {
    const modal = document.getElementById('banlaPriorityModal');
    if (modal) modal.remove();
    if (sseConnection) sseConnection.close();
  }

  window.BanlaPayment = {
    open: openModal,
    close: closeModal,
    switchTab: function (tab) {
      document.getElementById('banlaBankSec').style.display = tab === 'bank' ? 'block' : 'none';
      document.getElementById('banlaCardSec').style.display = tab === 'card' ? 'block' : 'none';
      document.getElementById('banlaTabBank').style.background = tab === 'bank' ? 'rgba(255,255,255,0.1)' : 'none';
      document.getElementById('banlaTabCard').style.background = tab === 'card' ? 'rgba(255,255,255,0.1)' : 'none';
    },
    searchBank: function (keyword) {
      const q = keyword.trim().toLowerCase();
      if (!q) return renderBanks(VN_BANKS);
      const filtered = VN_BANKS.filter(b => b.name.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q));
      renderBanks(filtered);
    },
    triggerSuccess: triggerSuccess
  };
})(window);
