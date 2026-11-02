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

  function openModal(options = {}) {
    injectStyles();
    const bankCfg = getSavedBankConfig();
    const amount = Number(options.amount) || 1200000;
    const totalAmount = Number(options.totalAmount) || amount;
    const discountAmount = Number(options.discountAmount) || 0;
    const remainingAmount = Number(options.remainingAmount) || 0;
    const paymentOption = options.paymentOption || (discountAmount > 0 ? 'pay_100' : 'deposit_50');
    const rawCode = String(options.bookingId || 'BL9821').replace(/^#+/, '').toUpperCase();
    const bookingId = rawCode;
    const memo = options.memo || (`BANLA_${rawCode}`);
    const bankId = options.bankId || bankCfg.bankId || 'MB';
    const accountNo = options.accountNo || bankCfg.accountNo || '0352554863';
    const accountName = options.accountName || bankCfg.accountName || 'BANLA BOUTIQUE HOTEL';
    const sessionId = options.sessionId || ('SESS_' + Date.now());

    const vietQrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(accountNo)}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(accountName)}`;

    currentSession = {
      totalAmount,
      discountAmount,
      remainingAmount,
      paymentOption,
      bookingId,
      amount,
      memo,
      bankId,
      accountNo,
      accountName,
      sessionId,
      vietQrUrl,
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

    modal.innerHTML = `
      <div class="banla-priority-box">
        <button onclick="BanlaPayment.close()" aria-label="Đóng" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#94A3B8;cursor:pointer;font-size:20px;">✕</button>

        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:11px;letter-spacing:2px;color:#D4AF37;font-weight:700;">BANLA DIRECT BOOKING & VIETQR</div>
          <h3 style="margin:4px 0 0;font-size:19px;color:#fff;">Thanh Toán & Nhận Phiếu Xác Nhận</h3>
        </div>

        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(212,175,55,0.32);border-radius:14px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:11.5px;color:#94A3B8;">MÃ BOOKING: <strong style="color:#fff;">#${currentSession.bookingId}</strong></div>
            <div style="font-size:11.5px;color:#94A3B8;margin-top:4px;">
              Nội dung CK: <strong style="color:#D4AF37;font-family:monospace;">${currentSession.memo}</strong>
              <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.memo}', this)">Chép</button>
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px;color:#94A3B8;">TỔNG THANH TOÁN</div>
            <div class="banla-gold-text" style="font-size:18px;">${currentSession.amount.toLocaleString('vi-VN')} đ</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;margin:12px 0;">
          <button id="banlaTabQr" onclick="BanlaPayment.switchTab('qr')" style="flex:1;padding:8px;border-radius:8px;background:rgba(212,175,55,0.2);color:#D4AF37;border:1px solid rgba(212,175,55,0.3);cursor:pointer;font-size:12px;font-weight:600;">Quét mã VietQR</button>
          <button id="banlaTabBank" onclick="BanlaPayment.switchTab('bank')" style="flex:1;padding:8px;border-radius:8px;background:none;color:#94A3B8;border:none;cursor:pointer;font-size:12px;">Mở App Ngân Hàng</button>
        </div>

        <div id="banlaQrSec" style="text-align:center;">
          <div style="margin:6px auto 10px;padding:8px;background:#fff;border-radius:12px;display:inline-block;border:2px solid #D4AF37;">
            <img src="${currentSession.vietQrUrl}" alt="VietQR Banla Boutique" width="200" height="200" style="display:block;max-width:200px;height:auto;">
          </div>
          <div style="font-size:12.5px;color:#E2E8F0;line-height:1.6;">
            <div>Ngân hàng: <strong>${currentSession.bankId}</strong> · STK: <strong style="color:#D4AF37;">${currentSession.accountNo}</strong>
              <button class="banla-copy-btn" onclick="BanlaPayment.copy('${currentSession.accountNo}', this)">Chép STK</button>
            </div>
            <div>Chủ TK: <strong style="color:#fff;">${currentSession.accountName}</strong></div>
          </div>
        </div>

        <div id="banlaBankSec" style="display:none;">
          <input type="text" id="banlaSearchInput" oninput="BanlaPayment.searchBank(this.value)" placeholder="Gõ tên ngân hàng (MB, VCB, TCB, ACB...)" class="banla-input" style="margin-bottom:10px;">
          <div id="banlaBankList" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;max-height:165px;overflow-y:auto;"></div>
          <div style="background:rgba(0,0,0,0.3);padding:9px 11px;border-radius:10px;margin-top:10px;font-size:11px;color:#94A3B8;line-height:1.5;">
            * Giữ nguyên nội dung chuyển khoản <strong style="color:#D4AF37;">${currentSession.memo}</strong> để hệ thống tự động đối soát.
          </div>
        </div>

        <!-- Hành động xác nhận & Liên hệ Facebook nhận Phiếu Dấu Đỏ -->
        <div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);display:flex;flex-direction:column;gap:8px;">
          <a href="${slipUrl}" target="_blank" class="banla-gold-btn" style="padding:11px;font-size:13px;text-align:center;text-decoration:none;display:block;">
            Xem Phiếu Xác Nhận Dịch Vụ Có Dấu Đỏ (#${currentSession.bookingId})
          </a>
          <a href="https://www.facebook.com/profile.php?id=61550577645853" target="_blank" rel="noopener" class="banla-fb-btn" style="padding:10px;font-size:12.5px;">
            Nhắn Fanpage Facebook Banla (Xác nhận 24/7)
          </a>
          <div style="font-size:11px;color:#94A3B8;text-align:center;margin-top:2px;">
            Sau khi thanh toán, Quý khách liên hệ Facebook hoặc Hotline <strong>0296.9996.999 - 0352554863</strong> để được duyệt mã Smart-Lock PIN 6 số.
          </div>
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
      btn.onclick = () => { window.location.href = b.scheme; };
      btn.innerHTML = `
        <div style="color:#D4AF37;font-size:10px;font-weight:700;">${b.code}</div>
        <div style="color:#fff;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${b.name}</div>
      `;
      box.appendChild(btn);
    });
  }

  function closeModal() {
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
