// ============================================================================
// BANLA BOUTIQUE HOTEL — CORE FRONTEND CONTROLLER (ES6+ REAL-DATA ENGINE)
// Supports:
// 1. Triple-click Logo (.logo, .logo-footer) -> Redirect to Admin Dashboard (admin.html)
// 2. Real-Data Booking Engine (Express API -> Supabase RPC `banla.banla_create_booking`)
// 3. Authoritative VietQR Session + OnePay Visa/Mastercard Hosted Checkout + Red-Stamp Slip
// 4. Real-time Room Price Calculator, Server-First Booking Lookup & Interactive UI
// ============================================================================

const BANLA_STORAGE_KEY = 'BANLA_BOOKINGS_STORE';

const ROOM_PRICES = {
  'Élite Room': 1250000,
  'Attic Room': 1250000,
  'Banla Signature': 1150000,
  'Highland Room': 1100000,
  'King Room Hướng Núi': 1100000,
  'Connecting Room': 1850000,
  'Deluxe Twin': 950000,
  'Original Suite': 1550000,
  'Suite Hướng Núi': 1550000,
  'Deluxe Balcony': 980000,
  'Deluxe với Ban công': 980000
};

const ROOM_CODES = {
  'Élite Room': 'elite',
  'Attic Room': 'elite',
  'Banla Signature': 'signature',
  'Highland Room': 'highland',
  'King Room Hướng Núi': 'highland',
  'Connecting Room': 'connecting',
  'Deluxe Twin': 'twin',
  'Original Suite': 'suite',
  'Suite Hướng Núi': 'suite',
  'Deluxe Balcony': 'balcony',
  'Deluxe với Ban công': 'balcony'
};

function resolveRoomCode(roomName) {
  if (!roomName) return 'signature';
  if (ROOM_CODES[roomName]) return ROOM_CODES[roomName];
  const lower = String(roomName).toLowerCase();
  if (lower.includes('élite') || lower.includes('elite') || lower.includes('attic')) return 'elite';
  if (lower.includes('highland') || lower.includes('king')) return 'highland';
  if (lower.includes('connecting')) return 'connecting';
  if (lower.includes('twin')) return 'twin';
  if (lower.includes('suite')) return 'suite';
  if (lower.includes('balcony') || lower.includes('ban công')) return 'balcony';
  return 'signature';
}

function getSiteRoot() {
  const path = window.location.pathname;
  const marker = '/Banla/';
  const idx = path.indexOf(marker);
  if (idx !== -1) {
    return path.slice(0, idx + marker.length);
  }
  if (
    path.includes('/khach-san/banla-boutique-hotel/') ||
    path.includes('/khach-san/da-lat/') ||
    path.includes('/khach-san/nha-trang/') ||
    path.includes('/khach-san/ho-chi-minh/') ||
    path.includes('/blog/kinh-nghiem-') ||
    path.includes('/blog/meo-')
  ) {
    return '../../';
  }
  if (
    path.includes('/khach-san/') ||
    path.includes('/lien-he/') ||
    path.includes('/ve-chung-toi/') ||
    path.includes('/faq/') ||
    path.includes('/chinh-sach/') ||
    path.includes('/dieu-khoan/') ||
    path.includes('/blog/') ||
    path.includes('/phong/')
  ) {
    return '../';
  }
  return '';
}

// Auto-load Banla Priority Payment Modal if not already included in HTML
(function ensurePaymentModalLoaded() {
  if (window.BanlaPayment) return;
  const existing = document.querySelector('script[src*="banla-priority-modal.js"]');
  if (existing) return;
  const script = document.createElement('script');
  script.src = getSiteRoot() + 'banla_payment_module/frontend/banla-priority-modal.js';
  script.defer = true;
  document.head.appendChild(script);
})();

// 1. TRIPLE-CLICK LOGO -> OPEN ADMIN DASHBOARD (admin.html)
(function initLogoTripleClickAdmin() {
  const logos = document.querySelectorAll('.logo, .logo-footer');
  logos.forEach((logo) => {
    logo.style.userSelect = 'none';
    logo.style.cursor = 'pointer';
    logo.setAttribute('title', 'Bấm 3 lần liên tiếp để mở Trang Quản Trị & Đối Soát (Admin)');

    let clickCount = 0;
    let clickTimer = null;

    logo.addEventListener('click', (e) => {
      clickCount += 1;
      if (clickCount === 1) {
        clickTimer = setTimeout(() => {
          clickCount = 0;
        }, 900);
      } else if (clickCount >= 3) {
        e.preventDefault();
        e.stopPropagation();
        clearTimeout(clickTimer);
        clickCount = 0;
        window.location.href = getSiteRoot() + 'admin.html';
      }
    });
  });
})();

// Mobile menu
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#navLinks');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

// Header scroll effect
const header = document.querySelector('#header');
window.addEventListener(
  'scroll',
  () => {
    if (!header) return;
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else if (document.querySelector('.hero')) {
      header.classList.remove('scrolled');
    }
  },
  { passive: true }
);

// Helper: Calculate nights & total amount
function calculateStaySummary(roomName, checkinStr, checkoutStr, paymentOption = 'deposit_50') {
  const unitPrice = ROOM_PRICES[roomName] || 1150000;
  let nights = 1;
  if (checkinStr && checkoutStr) {
    const d1 = new Date(checkinStr);
    const d2 = new Date(checkoutStr);
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0 && diff <= 60) nights = diff;
  }
  const totalAmount = unitPrice * nights;
  const isPay100 = paymentOption === 'pay_100';
  const depositAmount = Math.round(totalAmount * 0.5); // Cọc 50% tổng đơn
  const discountAmount = isPay100 ? Math.round(totalAmount * 0.1) : 0; // Giảm 10% khi thanh toán 100%
  const payAmount = isPay100 ? totalAmount - discountAmount : depositAmount;
  const remainingAmount = isPay100 ? 0 : totalAmount - depositAmount;

  return {
    unitPrice,
    nights,
    totalAmount,
    depositAmount,
    discountAmount,
    payAmount,
    remainingAmount,
    paymentOption: isPay100 ? 'pay_100' : 'deposit_50'
  };
}

function formatVND(num) {
  return Number(num || 0).toLocaleString('vi-VN') + ' ₫';
}

function saveBookingToLocalStore(bookingObj) {
  try {
    const raw = localStorage.getItem(BANLA_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((b) => String(b.id).toUpperCase() === String(bookingObj.id).toUpperCase());
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...bookingObj };
    } else {
      list.unshift(bookingObj);
    }
    localStorage.setItem(BANLA_STORAGE_KEY, JSON.stringify(list.slice(0, 30)));
  } catch (err) {
    console.warn('LocalStorage save warning:', err);
  }
}

/**
 * Khi chạy trên hosting tĩnh (GitHub Pages không có Express API),
 * gọi đúng hàm RPC bảo mật `banla.banla_create_booking` thay vì ghi thẳng bảng bị RLS chặn.
 */
async function createBookingViaSupabaseRpc(data) {
  const sbUrl = window.BANLA_SUPABASE_URL || localStorage.getItem('BANLA_SUPABASE_URL') || '';
  const sbKey = window.BANLA_SUPABASE_ANON_KEY || localStorage.getItem('BANLA_SUPABASE_ANON_KEY') || '';
  if (!sbUrl || !sbKey) return { ok: false, unreachable: true };

  try {
    const res = await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/rpc/banla_create_booking`, {
      method: 'POST',
      headers: {
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        'Accept-Profile': 'banla',
        'Content-Profile': 'banla',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        p_guest_name: data.name,
        p_guest_phone: data.phone,
        p_guest_email: data.email || null,
        p_room_code: resolveRoomCode(data.room),
        p_check_in: data.checkin,
        p_check_out: data.checkout,
        p_guests: Number(data.guests) || 2,
        p_payment_option: data.paymentOption || 'deposit_50',
        p_note: data.message || null,
        p_payment_method: data.paymentMethod || 'vietqr'
      })
    });

    const payload = await res.json().catch(() => null);
    if (res.ok) {
      const row = Array.isArray(payload) ? payload[0] : payload;
      if (row && row.booking_code) {
        return { ok: true, row };
      }
    }

    const errMsg = (payload && (payload.message || payload.details)) || '';
    if (errMsg.includes('ROOM_UNAVAILABLE')) {
      return {
        ok: false,
        rejected: true,
        message: 'Hạng phòng này đã kín lịch trong khoảng ngày quý khách chọn. Vui lòng chọn ngày hoặc hạng phòng khác.'
      };
    }
    if (errMsg.includes('CAPACITY_EXCEEDED')) {
      return {
        ok: false,
        rejected: true,
        message: 'Số lượng khách vượt quá sức chứa tối đa của hạng phòng đã chọn.'
      };
    }
    if (errMsg.includes('INVALID_')) {
      return {
        ok: false,
        rejected: true,
        message: 'Thông tin đặt phòng chưa hợp lệ. Vui lòng kiểm tra lại họ tên, số điện thoại và ngày lưu trú.'
      };
    }
  } catch (err) {
    console.warn('Supabase RPC skipped:', err);
  }
  return { ok: false, unreachable: true };
}

function translateFormErrorHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 2. BOOKING FORMS — Real-Data Server Validation + VietQR Session + OnePay Visa
document.querySelectorAll('form.booking-form').forEach((form) => {
  const checkinInput = form.querySelector('[name="checkin"]');
  const checkoutInput = form.querySelector('[name="checkout"]');
  const roomSelect = form.querySelector('[name="room"]');
  const guestsInput = form.querySelector('[name="guests"]');

  if (checkinInput && !checkinInput.value) {
    const tomorrow = new Date(Date.now() + 86400000);
    const nextDay = new Date(Date.now() + 2 * 86400000);
    checkinInput.value = tomorrow.toISOString().split('T')[0];
    if (checkoutInput && !checkoutInput.value) {
      checkoutInput.value = nextDay.toISOString().split('T')[0];
    }
  }

  let summaryBox = form.querySelector('.booking-live-summary');
  if (!summaryBox) {
    summaryBox = document.createElement('div');
    summaryBox.className = 'booking-live-summary glass-card';
    const sBtn = form.querySelector('button[type="submit"]');
    if (sBtn) {
      form.insertBefore(summaryBox, sBtn);
    } else {
      form.appendChild(summaryBox);
    }
  }

  const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('button');
  const formNoteEl = form.querySelector('.form-note');
  const gatewayAlertEl = form.querySelector('.visa-gateway-alert');

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pay') === 'visa') {
      const visaRadio = form.querySelector('[name="payment_method"][value="visa"]');
      if (visaRadio) visaRadio.checked = true;
    }
  } catch (_) {}

  function showBookingFormError(msg) {
    if (gatewayAlertEl) {
      gatewayAlertEl.hidden = false;
      gatewayAlertEl.innerHTML = `<div style="color:#fecaca;"><strong>Không thể tạo đơn đặt phòng:</strong> ${translateFormErrorHtml(msg)}</div>`;
      gatewayAlertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      alert(msg);
    }
  }

  async function openVietQrModalOrSlip(cleanCode, summary, data, bookingRecord, backendCreated) {
    let sessionId = '';
    let vietQrUrl = '';
    let authoritativeAmount = summary.payAmount;

    if (backendCreated) {
      try {
        const sRes = await fetch(getSiteRoot() + 'api/banla/session/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: cleanCode,
            guestName: data.name,
            roomName: data.room || 'Banla Signature',
            checkin: data.checkin,
            checkout: data.checkout
          })
        });
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (sJson && sJson.success && sJson.session) {
            sessionId = sJson.session.sessionId || '';
            vietQrUrl = sJson.session.vietQrUrl || '';
            if (Number(sJson.session.amount) > 0) {
              authoritativeAmount = Number(sJson.session.amount);
            }
          }
        }
      } catch (_) {}
    }

    if (window.BanlaPayment && typeof window.BanlaPayment.open === 'function') {
      window.BanlaPayment.open({
        bookingId: cleanCode,
        sessionId,
        vietQrUrl,
        guestPhone: data.phone,
        amount: authoritativeAmount,
        totalAmount: summary.totalAmount,
        discountAmount: summary.discountAmount,
        remainingAmount: summary.remainingAmount,
        paymentOption: summary.paymentOption,
        guestName: data.name,
        roomName: data.room || 'Banla Signature',
        checkin: data.checkin,
        checkout: data.checkout,
        memo: 'BANLA_' + cleanCode,
        onSuccess: function (payRes) {
          bookingRecord.paymentStatus = 'PAID';
          bookingRecord.payment_status = 'paid';
          bookingRecord.status = 'confirmed';
          bookingRecord.booking_status = 'confirmed';
          bookingRecord.paidAmount = authoritativeAmount;
          if (payRes && payRes.smartLockPin) {
            bookingRecord.smartLockPin = payRes.smartLockPin;
            bookingRecord.smartlock_pin = payRes.smartLockPin;
          }
          saveBookingToLocalStore(bookingRecord);
        }
      });
    } else {
      window.location.href = getSiteRoot() + 'phieu.html?ma=' + encodeURIComponent(cleanCode);
    }
  }

  function updateSummaryUI() {
    const rName = roomSelect?.value || 'Banla Signature';
    const ci = checkinInput?.value || '';
    const co = checkoutInput?.value || '';
    const selectedOpt = form.querySelector('[name="payment_option"]:checked')?.value || 'deposit_50';
    const selectedMethod = form.querySelector('[name="payment_method"]:checked')?.value || 'vietqr';
    const isVisa = selectedMethod === 'visa';
    const s = calculateStaySummary(rName, ci, co, selectedOpt);

    if (gatewayAlertEl) {
      gatewayAlertEl.hidden = true;
      gatewayAlertEl.innerHTML = '';
    }

    if (submitBtn && !submitBtn.disabled) {
      submitBtn.textContent = isVisa
        ? 'Đặt phòng & Thanh toán an toàn bằng Thẻ Quốc Tế'
        : 'Tiếp tục Thanh Toán VietQR & Nhận Phiếu Dấu Đỏ';
    }

    if (formNoteEl) {
      formNoteEl.innerHTML = isVisa
        ? 'Banla <strong>không lưu thông tin thẻ</strong>. Thẻ được xử lý bảo mật chuẩn PCI DSS &amp; 3D Secure qua cổng thanh toán OnePay.'
        : 'Sau khi chuyển khoản VietQR, quý khách <strong>hãy gửi biên lai qua Facebook Banla</strong> để được đối soát nhanh và nhận mã Smart-Lock PIN chính thức.';
    }

    const channelLabel = isVisa ? 'Thẻ Quốc Tế (OnePay)' : 'VietQR';

    summaryBox.innerHTML = `
      <div class="booking-summary-row">
        <span>Hạng phòng dự kiến:</span>
        <strong>${rName || 'Banla Signature'} (${formatVND(s.unitPrice)}/đêm)</strong>
      </div>
      <div class="booking-summary-row">
        <span>Thời gian lưu trú:</span>
        <strong>${s.nights} đêm · Tổng tiền gốc: ${formatVND(s.totalAmount)}</strong>
      </div>
      ${
        s.paymentOption === 'pay_100'
          ? `
        <div class="booking-summary-row highlight" style="color: #22c55e;">
          <span>Ưu đãi thanh toán 100%:</span>
          <strong>Giảm 10% (-${formatVND(s.discountAmount)})</strong>
        </div>
        <div class="booking-summary-row highlight">
          <span>Số tiền thanh toán ${channelLabel} ngay:</span>
          <strong style="color: var(--brass, #d4af37); font-size: 15px;">${formatVND(s.payAmount)} (Đã trừ 10%)</strong>
        </div>
      `
          : `
        <div class="booking-summary-row highlight">
          <span>Cọc 50% giữ phòng (${channelLabel}):</span>
          <strong style="color: var(--brass, #d4af37); font-size: 15px;">${formatVND(s.payAmount)}</strong>
        </div>
        <div class="booking-summary-row" style="font-size: 12px; color: #94a3b8;">
          <span>Còn lại thanh toán khi check-in:</span>
          <strong>${formatVND(s.remainingAmount)}</strong>
        </div>
      `
      }
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.15); font-size: 11.5px; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
        <span>${isVisa ? '🔒' : '📸'}</span>
        <span>${
          isVisa
            ? 'Hỗ trợ <strong>Visa · Mastercard · Amex · JCB</strong> (3D Secure). Xác thực IPN tự động cấp ngay Phiếu dấu đỏ &amp; mã Smart-Lock PIN 6 số.'
            : 'Sau khi quét VietQR, <strong>hãy gửi biên lai qua Facebook Banla</strong> để được Lễ tân đối soát CSDL &amp; cấp mã PIN Smart-Lock chính thức.'
        }</span>
      </div>
    `;
  }

  updateSummaryUI();
  const paymentRadios = form.querySelectorAll('[name="payment_option"], [name="payment_method"]');
  [...paymentRadios, checkinInput, checkoutInput, roomSelect, guestsInput].forEach((el) => {
    if (el) {
      el.addEventListener('change', updateSummaryUI);
      el.addEventListener('input', updateSummaryUI);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const paymentOption = form.querySelector('[name="payment_option"]:checked')?.value || 'deposit_50';
    const paymentMethod = form.querySelector('[name="payment_method"]:checked')?.value || 'vietqr';
    const isVisa = paymentMethod === 'visa';
    const originalText = btn ? btn.textContent : 'Đặt phòng & Thanh toán';

    if (gatewayAlertEl) {
      gatewayAlertEl.hidden = true;
      gatewayAlertEl.innerHTML = '';
    }

    const data = {
      name: (form.querySelector('[name="name"]')?.value || '').trim(),
      email: (form.querySelector('[name="email"]')?.value || '').trim(),
      phone: (form.querySelector('[name="phone"]')?.value || '').trim(),
      checkin: form.querySelector('[name="checkin"]')?.value || '',
      checkout: form.querySelector('[name="checkout"]')?.value || '',
      room: form.querySelector('[name="room"]')?.value || 'Banla Signature',
      guests: form.querySelector('[name="guests"]')?.value || '2',
      message: (form.querySelector('[name="message"]')?.value || form.querySelector('[name="note"]')?.value || '').trim(),
      paymentOption,
      paymentMethod
    };

    if (data.checkin && data.checkout && data.checkin >= data.checkout) {
      showBookingFormError('Ngày trả phòng phải sau ngày nhận phòng. Vui lòng kiểm tra lại!');
      return;
    }

    if (btn) {
      btn.textContent = isVisa ? 'Đang khởi tạo đơn & kết nối cổng thẻ...' : 'Đang kiểm tra phòng trống & khởi tạo đơn...';
      btn.disabled = true;
    }

    const summary = calculateStaySummary(data.room, data.checkin, data.checkout, paymentOption);
    let finalId = '';
    let backendCreated = false;
    let staticHostingFallback = false;

    // 1. Ưu tiên tuyệt đối Máy chủ Node.js Express (`/api/booking`)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(getSiteRoot() + 'api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      if (res.ok && isJson) {
        const result = await res.json();
        if (result && (result.booking_code || result.id)) {
          finalId = String(result.booking_code || result.id).toUpperCase();
          backendCreated = true;
          if (Number(result.total_amount) > 0) summary.totalAmount = Number(result.total_amount);
          if (result.discount_amount !== undefined) summary.discountAmount = Number(result.discount_amount);
          if (Number(result.amount_due) > 0) summary.payAmount = Number(result.amount_due);
          if (result.remaining_amount !== undefined) summary.remainingAmount = Number(result.remaining_amount);
          if (Number(result.nights) > 0) summary.nights = Number(result.nights);
        }
      } else if (isJson) {
        // Máy chủ đang chạy và từ chối hợp lệ (400 quá sức chứa/SĐT sai, 409 hết phòng trùng ngày, 429 quá tần suất...)
        // TUYỆT ĐỐI KHÔNG tự sinh mã giả hay mở QR chuyển tiền!
        const errBody = await res.json().catch(() => ({}));
        const errMsg =
          errBody.message ||
          (Array.isArray(errBody.errors) ? errBody.errors.join(' ') : '') ||
          'Dữ liệu đặt phòng chưa hợp lệ hoặc hạng phòng đã kín lịch.';
        showBookingFormError(errMsg);
        if (btn) {
          btn.textContent = originalText;
          btn.disabled = false;
        }
        return;
      } else if (res.status === 404 || res.status === 405) {
        staticHostingFallback = true;
      } else {
        showBookingFormError('Máy chủ đặt phòng đang bận (HTTP ' + res.status + '). Quý khách vui lòng thử lại sau ít giây.');
        if (btn) {
          btn.textContent = originalText;
          btn.disabled = false;
        }
        return;
      }
    } catch (_) {
      // Không có máy chủ Express (ví dụ đang mở trên GitHub Pages tĩnh)
      staticHostingFallback = true;
    }

    // 2. Nếu chạy trên hosting tĩnh, gọi RPC bảo mật `banla.banla_create_booking` trên Supabase
    if (!backendCreated && staticHostingFallback) {
      const rpcOutcome = await createBookingViaSupabaseRpc(data);
      if (rpcOutcome.rejected) {
        showBookingFormError(rpcOutcome.message);
        if (btn) {
          btn.textContent = originalText;
          btn.disabled = false;
        }
        return;
      }
      if (rpcOutcome.ok && rpcOutcome.row) {
        finalId = String(rpcOutcome.row.booking_code).toUpperCase();
        if (Number(rpcOutcome.row.total_amount) > 0) summary.totalAmount = Number(rpcOutcome.row.total_amount);
        if (rpcOutcome.row.discount_amount !== undefined) summary.discountAmount = Number(rpcOutcome.row.discount_amount);
        if (Number(rpcOutcome.row.amount_due) > 0) summary.payAmount = Number(rpcOutcome.row.amount_due);
        if (rpcOutcome.row.remaining_at_checkin !== undefined) {
          summary.remainingAmount = Number(rpcOutcome.row.remaining_at_checkin);
        }
      } else {
        showBookingFormError(
          'Hiện chưa kết nối được hệ thống đặt phòng trực tuyến. Quý khách vui lòng liên hệ Hotline 0296.9996.999 - 0352554863 hoặc Fanpage Banla để giữ phòng ngay.'
        );
        if (btn) {
          btn.textContent = originalText;
          btn.disabled = false;
        }
        return;
      }
    }

    const cleanCode = String(finalId).replace(/^BANLA_/i, '').toUpperCase();

    // Lưu SĐT trong phiên tab hiện tại để máy chủ xác thực mở khóa PIN khi khách mở phiếu
    try {
      if (data.phone) {
        sessionStorage.setItem('BANLA_GUEST_CONTACT_' + cleanCode, data.phone);
      }
    } catch (_) {}

    const bookingRecord = {
      id: cleanCode,
      booking_code: cleanCode,
      name: data.name,
      guest_name: data.name,
      phone: data.phone,
      guest_phone: data.phone,
      email: data.email,
      guest_email: data.email,
      room: data.room || 'Banla Signature',
      room_id: data.room || 'Banla Signature',
      checkin: data.checkin,
      check_in: data.checkin,
      checkout: data.checkout,
      check_out: data.checkout,
      guests: Number(data.guests) || 2,
      nights: summary.nights,
      totalPrice: summary.totalAmount,
      total_amount: summary.totalAmount,
      paidAmount: 0,
      depositAmount: summary.payAmount,
      paymentOption: summary.paymentOption,
      paymentMethod,
      discountAmount: summary.discountAmount,
      remainingAmount: summary.remainingAmount,
      message: data.message,
      source: 'direct',
      status: 'pending',
      booking_status: 'pending',
      paymentStatus: 'UNPAID',
      payment_status: 'pending',
      smartLockPin: null,
      smartlock_pin: null,
      createdAt: new Date().toISOString()
    };

    saveBookingToLocalStore(bookingRecord);

    // Luồng Thẻ Quốc Tế Visa / Mastercard / Amex / JCB (OnePay Hosted Checkout)
    if (isVisa) {
      if (backendCreated) {
        try {
          if (btn) btn.textContent = 'Đang chuyển đến trang thanh toán bảo mật OnePay...';
          const intentRes = await fetch(getSiteRoot() + 'api/payments/visa/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              booking_id: cleanCode,
              payment_option: summary.paymentOption
            })
          });
          const intentJson = await intentRes.json().catch(() => ({}));
          if (intentRes.ok && intentJson.redirect_url) {
            window.location.assign(intentJson.redirect_url);
            return;
          }
          const reason = intentJson.message || 'Cổng thanh toán thẻ quốc tế đang bảo trì hoặc chưa được kích hoạt.';
          if (gatewayAlertEl) {
            gatewayAlertEl.hidden = false;
            gatewayAlertEl.innerHTML = `
              <div><strong>Đã giữ mã đặt phòng #${cleanCode}</strong>: ${translateFormErrorHtml(reason)}</div>
              <button type="button" class="btn-switch-vietqr">Chuyển sang quét mã VietQR cho đơn #${cleanCode}</button>
            `;
            gatewayAlertEl.querySelector('.btn-switch-vietqr')?.addEventListener('click', () => {
              gatewayAlertEl.hidden = true;
              openVietQrModalOrSlip(cleanCode, summary, data, bookingRecord, backendCreated);
            });
          } else {
            alert(reason);
          }
        } catch {
          if (gatewayAlertEl) {
            gatewayAlertEl.hidden = false;
            gatewayAlertEl.innerHTML = `
              <div>Không thể kết nối cổng thanh toán thẻ lúc này. Đơn <strong>#${cleanCode}</strong> của quý khách đã được lưu trên hệ thống.</div>
              <button type="button" class="btn-switch-vietqr">Thanh toán ngay bằng VietQR (#${cleanCode})</button>
            `;
            gatewayAlertEl.querySelector('.btn-switch-vietqr')?.addEventListener('click', () => {
              gatewayAlertEl.hidden = true;
              openVietQrModalOrSlip(cleanCode, summary, data, bookingRecord, backendCreated);
            });
          }
        }
      } else if (gatewayAlertEl) {
        gatewayAlertEl.hidden = false;
        gatewayAlertEl.innerHTML = `
          <div>Cổng thanh toán thẻ quốc tế cần kết nối máy chủ bảo mật. Đơn <strong>#${cleanCode}</strong> của quý khách đã sẵn sàng để quét VietQR ngay bên dưới.</div>
          <button type="button" class="btn-switch-vietqr">Mở mã VietQR cho đơn #${cleanCode}</button>
        `;
        gatewayAlertEl.querySelector('.btn-switch-vietqr')?.addEventListener('click', () => {
          gatewayAlertEl.hidden = true;
          openVietQrModalOrSlip(cleanCode, summary, data, bookingRecord, backendCreated);
        });
      }

      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
      return;
    }

    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }

    await openVietQrModalOrSlip(cleanCode, summary, data, bookingRecord, backendCreated);
  });
});

// Smooth scroll offset for fixed header
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#' || targetId.length < 2) return;
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      const headerHeight = document.querySelector('.header')?.offsetHeight || 72;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// FAQ Accordion controller
document.querySelectorAll('.faq-accordion-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-accordion-item');
    if (!item) return;
    const isOpen = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });
});

// --- Anime.js motion ---
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const animeApi = window.anime;

function initMotion() {
  const revealEls = document.querySelectorAll('.reveal');

  if (reduceMotion || !animeApi || typeof animeApi.animate !== 'function') {
    revealEls.forEach((el) => el.classList.add('in'));
    return;
  }

  const { animate, stagger } = animeApi;

  const heroTargets = document.querySelectorAll('[data-hero]');
  if (heroTargets.length) {
    animate(heroTargets, {
      opacity: [0, 1],
      translateY: [24, 0],
      delay: stagger(110, { start: 140 }),
      duration: 820,
      ease: 'out(3)'
    });
  }

  const heroMedia = document.querySelector('.hero-media img');
  if (heroMedia) {
    animate(heroMedia, {
      scale: [1.05, 1.1],
      duration: 14000,
      ease: 'linear',
      loop: true,
      alternate: true
    });
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          observer.unobserve(el);
          animate(el, {
            opacity: [0, 1],
            translateY: [22, 0],
            duration: 650,
            ease: 'out(3)',
            onComplete: () => el.classList.add('in')
          });
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -32px 0px' }
    );

    revealEls.forEach((el) => {
      el.style.opacity = '0';
      observer.observe(el);
    });
  } else {
    revealEls.forEach((el) => el.classList.add('in'));
  }
}

initMotion();

// Room Slider
(function () {
  const slider = document.getElementById('roomSlider');
  if (!slider) return;
  const slides = slider.querySelectorAll('.room-slide');
  const prevBtn = slider.querySelector('.prev');
  const nextBtn = slider.querySelector('.next');
  const dotsContainer = slider.querySelector('.slider-dots');
  let current = 0;

  slides.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.setAttribute('aria-label', 'Slide ' + (i + 1));
    if (i === 0) dot.classList.add('active');
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });
  const dots = dotsContainer.querySelectorAll('button');

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }

  prevBtn.addEventListener('click', () => goTo(current - 1));
  nextBtn.addEventListener('click', () => goTo(current + 1));

  let timer = null;
  function startAuto() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 4800);
  }
  function stopAuto() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  slider.addEventListener('mouseenter', stopAuto);
  slider.addEventListener('mouseleave', startAuto);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAuto();
    else startAuto();
  });
  startAuto();
})();

// Lightbox reads the real <img> alt and src
(function () {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  const imgEl = lightbox.querySelector('img');
  const captionEl = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');
  if (!imgEl || !closeBtn || !prevBtn || !nextBtn) return;

  const sources = [];
  document.querySelectorAll('.room-slide-visual, .gallery-item, .roof-visual').forEach((node) => {
    const img = node.querySelector('img');
    if (!img) return;
    sources.push({ img, el: node });
  });
  if (!sources.length) return;

  let current = 0;

  function open(index) {
    current = (index + sources.length) % sources.length;
    const source = sources[current].img;
    imgEl.src = source.currentSrc || source.src;
    imgEl.alt = source.alt || 'Banla Boutique Hotel tại Đà Lạt';
    if (source.width) imgEl.width = source.width;
    if (source.height) imgEl.height = source.height;
    if (captionEl) captionEl.textContent = source.alt || '';
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }
  function prev() {
    open(current - 1);
  }
  function next() {
    open(current + 1);
  }

  sources.forEach((src, i) => {
    src.el.style.cursor = 'zoom-in';
    src.el.addEventListener('click', () => open(i));
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close();
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  });
})();

// Listing filters
(function () {
  const list = document.getElementById('roomList');
  const form = document.getElementById('roomFilters');
  if (!list || !form) return;
  const cards = Array.from(list.querySelectorAll('[data-room-card]'));
  const empty = document.getElementById('roomEmpty');
  const count = document.getElementById('roomCount');
  let timer = null;

  function areaOk(value, filter) {
    if (!filter) return true;
    const parts = filter.split('-').map(Number);
    if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return true;
    return value >= parts[0] && value <= parts[1];
  }

  function read() {
    const data = new FormData(form);
    return {
      q: String(data.get('q') || '').trim().toLowerCase(),
      type: String(data.get('type') || ''),
      guests: Number(data.get('guests') || 0),
      area: String(data.get('area') || ''),
      sort: String(data.get('sort') || '')
    };
  }

  function apply() {
    const filters = read();
    const visible = cards.filter((card) => {
      const text = (card.dataset.text || '').toLowerCase();
      const guests = Number(card.dataset.guests || 0);
      const area = Number(card.dataset.area || 0);
      if (filters.q && !text.includes(filters.q)) return false;
      if (filters.type && card.dataset.type !== filters.type) return false;
      if (filters.guests && guests < filters.guests) return false;
      if (!areaOk(area, filters.area)) return false;
      return true;
    });
    visible.sort((a, b) => {
      if (filters.sort === 'name') return (a.dataset.name || '').localeCompare(b.dataset.name || '', 'vi');
      if (filters.sort === 'area-asc') return Number(a.dataset.area) - Number(b.dataset.area);
      if (filters.sort === 'area-desc') return Number(b.dataset.area) - Number(a.dataset.area);
      if (filters.sort === 'guests-desc') return Number(b.dataset.guests) - Number(a.dataset.guests);
      return Number(a.dataset.order) - Number(b.dataset.order);
    });
    cards.forEach((card) => {
      card.hidden = true;
    });
    visible.forEach((card) => {
      card.hidden = false;
      list.appendChild(card);
    });
    if (empty) empty.hidden = visible.length !== 0;
    if (count) count.textContent = visible.length + ' hạng phòng';
  }

  function syncUrl() {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (value) params.set(key, value);
    });
    const qs = params.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  const initial = new URLSearchParams(location.search);
  ['q', 'type', 'guests', 'area', 'sort'].forEach((key) => {
    const field = form.elements[key];
    if (field && initial.get(key)) field.value = initial.get(key);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    apply();
    syncUrl();
  });
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      apply();
      syncUrl();
    }, 200);
  });
  form.addEventListener('change', () => {
    apply();
    syncUrl();
  });
  apply();
})();

const heroSearch = document.getElementById('heroSearch');
if (heroSearch) {
  heroSearch.addEventListener('submit', () => {
    const dest = heroSearch.elements.destination ? heroSearch.elements.destination.value : '';
    const params = new URLSearchParams(new FormData(heroSearch));
    params.delete('destination');
    let url = 'listing.html';
    if (dest === 'da-lat') url = 'khach-san/da-lat/';
    else if (dest === 'nha-trang') url = 'khach-san/nha-trang/';
    else if (dest === 'ho-chi-minh') url = 'khach-san/ho-chi-minh/';
    const qs = params.toString();
    heroSearch.action = qs ? `${url}?${qs}` : url;
  });
}

(function () {
  const area = new URLSearchParams(location.search).get('khu-vuc');
  if (!area) return;
  const target = document.getElementById('khu-' + area);
  if (!target) return;
  target.classList.add('is-highlighted');
  const bar = document.querySelector('.header');
  const top = target.getBoundingClientRect().top + window.pageYOffset - ((bar && bar.offsetHeight) || 0) - 12;
  window.scrollTo({ top, behavior: 'smooth' });
})();

// Service Worker — project Pages lives under /Banla/
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const path = location.pathname;
    const marker = '/Banla/';
    const at = path.indexOf(marker);
    const root = at === -1 ? '/' : path.slice(0, at + marker.length);
    navigator.serviceWorker.register(root + 'sw.js').catch(() => {});
  });
}

// 3. BOOKING LOOKUP CONTROLLER (Server-First Authoritative Lookup -> Supabase RPC -> Unverified Draft)
(function () {
  const modal = document.getElementById('lookupModal');
  const openBtn = document.getElementById('openLookupBtn');
  const closeBtn = document.getElementById('closeLookupBtn');
  const form = document.getElementById('lookupForm');
  const resultDiv = document.getElementById('lookupResult');
  const submitBtn = document.getElementById('lookupSubmitBtn');

  if (!modal || !form) return;

  function openModal() {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    const idInput = document.getElementById('lookupBookingId');
    if (idInput && !idInput.value) idInput.focus();
  }

  function closeModal() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderBookingLookupResult(b, verifiedByServer) {
    const isConfirmed = verifiedByServer && (b.status === 'confirmed' || b.booking_status === 'confirmed');
    const badgeClass = isConfirmed ? 'badge-confirmed' : 'badge-pending';
    const statusText = isConfirmed ? 'Đã duyệt & Xác nhận' : 'Đang xử lý (Chờ xác nhận)';
    const rawPay = String(b.paymentStatus || b.payment_status || '').toLowerCase();
    const isPaid = verifiedByServer && (rawPay === 'paid' || rawPay === 'deposit_paid');
    const paymentBadge = isPaid
      ? '<span class="lookup-badge badge-confirmed" style="margin-left: 6px;">Đã thanh toán</span>'
      : '<span class="lookup-badge badge-pending" style="margin-left: 6px;">Chờ thanh toán</span>';

    const code = b.bookingCode || b.booking_code || b.id;
    const pin = verifiedByServer ? b.smartLockPin || b.smartlock_pin : null;
    const checkin = b.checkin || (b.check_in ? String(b.check_in).slice(0, 10) : '');
    const checkout = b.checkout || (b.check_out ? String(b.check_out).slice(0, 10) : '');

    let html =
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:8px;">' +
      '<span class="lookup-badge ' +
      badgeClass +
      '">' +
      statusText +
      '</span>' +
      paymentBadge +
      '</div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Mã đặt phòng:</span><span class="lookup-detail-val">#' +
      escapeHtml(code) +
      '</span></div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Khách hàng:</span><span class="lookup-detail-val">' +
      escapeHtml(b.name || b.guest_name) +
      '</span></div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Hạng phòng:</span><span class="lookup-detail-val">' +
      escapeHtml(b.room || b.room_name || b.room_id || 'Banla Signature') +
      '</span></div>' +
      (checkin
        ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Thời gian:</span><span class="lookup-detail-val">' +
          escapeHtml(checkin) +
          ' → ' +
          escapeHtml(checkout) +
          '</span></div>'
        : '') +
      (b.guests
        ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Số khách:</span><span class="lookup-detail-val">' +
          escapeHtml(b.guests) +
          ' khách</span></div>'
        : '');

    if (pin) {
      html +=
        '<div class="lookup-detail-row" style="background:rgba(212,175,55,0.14);padding:10px 12px;border-radius:8px;margin-top:8px;"><span class="lookup-detail-label" style="color:var(--ink);font-weight:600;">Mã Smart-Lock 6 số:</span><span class="lookup-detail-val" style="color:var(--ember);font-size:1.1rem;font-weight:700;letter-spacing:0.12em;">' +
        escapeHtml(pin) +
        '</span></div>';
    }

    html +=
      '<div style="margin-top: 14px; display:flex; gap:8px; justify-content: center; flex-wrap:wrap;">' +
      '<a href="' +
      getSiteRoot() +
      'phieu.html?ma=' +
      encodeURIComponent(code) +
      '" target="_blank" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; font-size: 13px; text-decoration: none;">📄 Xem Phiếu Xác Nhận</a>' +
      '</div>';
    resultDiv.innerHTML = html;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawId = (document.getElementById('lookupBookingId')?.value || '').trim();
    const id = rawId.replace(/^#+/, '').replace(/^BANLA_/i, '').trim().toUpperCase();
    const contact = (document.getElementById('lookupBookingContact')?.value || '').trim();

    if (!id || !contact) {
      resultDiv.className = 'lookup-result show';
      resultDiv.innerHTML =
        '<p style="color: var(--ember);">Vui lòng nhập đầy đủ mã đặt phòng và số điện thoại hoặc email.</p>';
      return;
    }

    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Đang đối chiếu CSDL...';
    submitBtn.disabled = true;
    resultDiv.className = 'lookup-result show';
    resultDiv.innerHTML = '<p style="color: var(--muted);">Đang xác thực thông tin đặt phòng từ hệ thống...</p>';

    try {
      // 1. Nguồn chuẩn #1: Máy chủ Express API (/api/booking/lookup)
      let serverRespondedJson = false;
      try {
        const res = await fetch(
          getSiteRoot() +
            'api/booking/lookup?id=' +
            encodeURIComponent(id) +
            '&contact=' +
            encodeURIComponent(contact)
        );
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          serverRespondedJson = true;
          const data = await res.json();
          if (res.ok && data.success && data.booking) {
            try {
              sessionStorage.setItem('BANLA_GUEST_CONTACT_' + id, contact);
            } catch (_) {}
            renderBookingLookupResult(data.booking, true);
            return;
          }
          resultDiv.innerHTML =
            '<p style="color: var(--ember); margin-bottom: 8px;">' +
            escapeHtml(data.message || 'Không tìm thấy dữ liệu đặt phòng khớp thông tin.') +
            '</p><p style="font-size: 0.85rem; color: var(--muted);">Nếu quý khách cần hỗ trợ gấp, vui lòng gọi hotline <a href="tel:02969996999" style="color: var(--brass); font-weight: 500;">0296.9996.999</a> / <a href="tel:0352554863" style="color: var(--brass); font-weight: 500;">0352554863</a>.</p>';
          return;
        }
      } catch (_) {}

      // 2. Nguồn chuẩn #2 (Hosting tĩnh): Supabase RPC `banla.banla_booking_status`
      if (!serverRespondedJson && window.BANLA_SUPABASE_URL && window.BANLA_SUPABASE_ANON_KEY) {
        try {
          const rpcRes = await fetch(
            window.BANLA_SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/rpc/banla_booking_status',
            {
              method: 'POST',
              headers: {
                apikey: window.BANLA_SUPABASE_ANON_KEY,
                Authorization: 'Bearer ' + window.BANLA_SUPABASE_ANON_KEY,
                'Accept-Profile': 'banla',
                'Content-Profile': 'banla',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                p_booking_code: id,
                p_guest_phone: contact
              })
            }
          );
          if (rpcRes.ok) {
            const rows = await rpcRes.json();
            const row = Array.isArray(rows) ? rows[0] : rows;
            if (row && row.booking_code) {
              try {
                sessionStorage.setItem('BANLA_GUEST_CONTACT_' + id, contact);
              } catch (_) {}
              renderBookingLookupResult(row, true);
              return;
            }
          }
        } catch (_) {}
      }

      resultDiv.innerHTML =
        '<p style="color: var(--ember); margin-bottom: 8px;">Không tìm thấy đơn đặt phòng #' +
        escapeHtml(id) +
        ' khớp với thông tin liên hệ.</p><p style="font-size: 0.85rem; color: var(--muted);">Vui lòng kiểm tra lại Mã đơn &amp; Số điện thoại hoặc liên hệ Hotline <a href="tel:02969996999" style="color: var(--ember); font-weight: 600;">0296.9996.999</a> - <a href="tel:0352554863" style="color: var(--ember); font-weight: 600;">0352554863</a>.</p>';
    } finally {
      submitBtn.textContent = origText;
      submitBtn.disabled = false;
    }
  });
})();
