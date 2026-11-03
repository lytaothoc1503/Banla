// ============================================================================
// BANLA BOUTIQUE HOTEL — CORE FRONTEND CONTROLLER (ES6+)
// Supports:
// 1. Triple-click Logo (.logo, .logo-footer) -> Redirect to Admin Dashboard (admin.html)
// 2. Hybrid Booking Engine (Supabase schema `banla` + LocalStorage + Express API)
// 3. Instant VietQR Payment Modal & Red-Stamp Confirmation Voucher (phieu.html)
// 4. Real-time Room Price Calculator & Interactive FAQ Accordion
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

function getSiteRoot() {
  const path = window.location.pathname;
  const marker = '/Banla/';
  const idx = path.indexOf(marker);
  if (idx !== -1) {
    return path.slice(0, idx + marker.length);
  }
  if (path.includes('/khach-san/banla-boutique-hotel/') || path.includes('/khach-san/da-lat/') || path.includes('/khach-san/nha-trang/') || path.includes('/khach-san/ho-chi-minh/') || path.includes('/blog/kinh-nghiem-') || path.includes('/blog/meo-')) {
    return '../../';
  }
  if (path.includes('/khach-san/') || path.includes('/lien-he/') || path.includes('/ve-chung-toi/') || path.includes('/faq/') || path.includes('/chinh-sach/') || path.includes('/dieu-khoan/') || path.includes('/blog/') || path.includes('/phong/')) {
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
window.addEventListener('scroll', () => {
  if (!header) return;
  if (window.scrollY > 40) {
    header.classList.add('scrolled');
  } else if (document.querySelector('.hero')) {
    header.classList.remove('scrolled');
  }
}, { passive: true });

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
  const discountAmount = isPay100 ? Math.round(totalAmount * 0.10) : 0; // Giảm 10% khi thanh toán 100%
  const payAmount = isPay100 ? (totalAmount - discountAmount) : depositAmount;
  const remainingAmount = isPay100 ? 0 : (totalAmount - depositAmount);

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
    localStorage.setItem(BANLA_STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('LocalStorage save warning:', err);
  }
}

async function saveBookingToSupabase(bookingObj) {
  try {
    const sbUrl = window.BANLA_SUPABASE_URL || localStorage.getItem('BANLA_SUPABASE_URL') || '';
    const sbKey = window.BANLA_SUPABASE_ANON_KEY || localStorage.getItem('BANLA_SUPABASE_ANON_KEY') || '';
    if (!sbUrl || !sbKey) return null;

    const checkInIso = bookingObj.checkin ? new Date(bookingObj.checkin + 'T14:00:00+07:00').toISOString() : new Date().toISOString();
    const checkOutIso = bookingObj.checkout ? new Date(bookingObj.checkout + 'T12:00:00+07:00').toISOString() : new Date(Date.now() + 86400000).toISOString();

    const res = await fetch(`${sbUrl.replace(/\/+$/, '')}/rest/v1/bookings`, {
      method: 'POST',
      headers: {
        'apikey': sbKey,
        'Authorization': `Bearer ${sbKey}`,
        'Accept-Profile': 'banla',
        'Content-Profile': 'banla',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        booking_code: bookingObj.id,
        guest_name: bookingObj.name,
        guest_phone: bookingObj.phone,
        guest_email: bookingObj.email,
        room_id: bookingObj.room || 'Banla Signature',
        guests: Number(bookingObj.guests) || 2,
        check_in: checkInIso,
        check_out: checkOutIso,
        total_amount: Number(bookingObj.totalPrice) || 1150000,
        paid_amount: 0,
        payment_status: 'pending',
        booking_status: 'pending',
        note: bookingObj.message || ''
      })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Supabase sync skipped:', err);
  }
  return null;
}

// 2. BOOKING FORMS — Instant Booking + VietQR Payment Modal + Red Stamp Voucher
document.querySelectorAll('form.booking-form').forEach((form) => {
  // Set default dates if empty
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

  // Inject live price summary box inside form if not already present
  let summaryBox = form.querySelector('.booking-live-summary');
  if (!summaryBox) {
    summaryBox = document.createElement('div');
    summaryBox.className = 'booking-live-summary glass-card';
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      form.insertBefore(summaryBox, submitBtn);
    } else {
      form.appendChild(summaryBox);
    }
  }

  function updateSummaryUI() {
    const rName = roomSelect?.value || 'Banla Signature';
    const ci = checkinInput?.value || '';
    const co = checkoutInput?.value || '';
    const selectedOpt = form.querySelector('[name="payment_option"]:checked')?.value || 'deposit_50';
    const s = calculateStaySummary(rName, ci, co, selectedOpt);

    summaryBox.innerHTML = `
      <div class="booking-summary-row">
        <span>Hạng phòng dự kiến:</span>
        <strong>${rName || 'Banla Signature'} (${formatVND(s.unitPrice)}/đêm)</strong>
      </div>
      <div class="booking-summary-row">
        <span>Thời gian lưu trú:</span>
        <strong>${s.nights} đêm · Tổng tiền gốc: ${formatVND(s.totalAmount)}</strong>
      </div>
      ${s.paymentOption === 'pay_100' ? `
        <div class="booking-summary-row highlight" style="color: #22c55e;">
          <span>Ưu đãi thanh toán 100%:</span>
          <strong>Giảm 10% (-${formatVND(s.discountAmount)})</strong>
        </div>
        <div class="booking-summary-row highlight">
          <span>Số tiền chuyển khoản VietQR ngay:</span>
          <strong style="color: var(--brass, #d4af37); font-size: 15px;">${formatVND(s.payAmount)} (Đã trừ 10%)</strong>
        </div>
      ` : `
        <div class="booking-summary-row highlight">
          <span>Cọc 50% giữ phòng (VietQR):</span>
          <strong style="color: var(--brass, #d4af37); font-size: 15px;">${formatVND(s.payAmount)}</strong>
        </div>
        <div class="booking-summary-row" style="font-size: 12px; color: #94a3b8;">
          <span>Còn lại thanh toán khi check-in:</span>
          <strong>${formatVND(s.remainingAmount)}</strong>
        </div>
      `}
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.15); font-size: 11.5px; color: #cbd5e1; display: flex; align-items: center; gap: 6px;">
        <span>📸</span>
        <span>Sau khi quét VietQR, <strong>hãy gửi biên lai qua Facebook Banla</strong> để được Lễ tân đối soát CSDL & cấp mã PIN Smart-Lock chính thức.</span>
      </div>
    `;
  }

  updateSummaryUI();
  const paymentRadios = form.querySelectorAll('[name="payment_option"]');
  [...paymentRadios, checkinInput, checkoutInput, roomSelect, guestsInput].forEach((el) => {
    if (el) {
      el.addEventListener('change', updateSummaryUI);
      el.addEventListener('input', updateSummaryUI);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const originalText = btn ? btn.textContent : 'Đặt phòng & Thanh toán';
    if (btn) {
      btn.textContent = 'Đang khởi tạo đơn & mã QR...';
      btn.disabled = true;
    }

    const data = {
      name: (form.querySelector('[name="name"]')?.value || '').trim(),
      email: (form.querySelector('[name="email"]')?.value || '').trim(),
      phone: (form.querySelector('[name="phone"]')?.value || '').trim(),
      checkin: form.querySelector('[name="checkin"]')?.value || '',
      checkout: form.querySelector('[name="checkout"]')?.value || '',
      room: form.querySelector('[name="room"]')?.value || 'Banla Signature',
      guests: form.querySelector('[name="guests"]')?.value || '2',
      message: (form.querySelector('[name="message"]')?.value || form.querySelector('[name="note"]')?.value || '').trim()
    };

    if (data.checkin && data.checkout && data.checkin >= data.checkout) {
      alert('Ngày trả phòng phải sau ngày nhận phòng. Vui lòng kiểm tra lại!');
      if (btn) {
        btn.textContent = originalText;
        btn.disabled = false;
      }
      return;
    }

    const paymentOption = form.querySelector('[name="payment_option"]:checked')?.value || 'deposit_50';
    const summary = calculateStaySummary(data.room, data.checkin, data.checkout, paymentOption);
    const nights = summary.nights;
    const totalAmount = summary.totalAmount;
    const depositAmount = summary.payAmount;
    const generatedCode = 'BL' + Math.random().toString(36).substring(2, 6).toUpperCase();
    let finalId = generatedCode;

    // Try Express API first if running on Node server, otherwise fallback seamlessly on GitHub Pages
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2800);
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const result = await res.json();
        if (result && result.id) {
          finalId = String(result.id).toUpperCase();
        }
      }
    } catch {
      // Static hosting (GitHub Pages) — handled by LocalStorage + Supabase below
    }

    const bookingRecord = {
      id: finalId,
      booking_code: finalId,
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
      nights,
      totalPrice: totalAmount,
      total_amount: totalAmount,
      paidAmount: 0,
      depositAmount: summary.payAmount,
      paymentOption: summary.paymentOption,
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
    await saveBookingToSupabase(bookingRecord);

    if (btn) {
      btn.textContent = originalText;
      btn.disabled = false;
    }

    const cleanCode = String(finalId).replace(/^BANLA_/i, '');
    if (window.BanlaPayment && typeof window.BanlaPayment.open === 'function') {
      window.BanlaPayment.open({
        bookingId: cleanCode,
        amount: summary.payAmount,
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
          bookingRecord.paidAmount = summary.payAmount;
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
    const observer = new IntersectionObserver((entries) => {
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
    }, { threshold: 0.1, rootMargin: '0px 0px -32px 0px' });

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
  function prev() { open(current - 1); }
  function next() { open(current + 1); }

  sources.forEach((src, i) => {
    src.el.style.cursor = 'zoom-in';
    src.el.addEventListener('click', () => open(i));
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
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
    cards.forEach((card) => { card.hidden = true; });
    visible.forEach((card) => {
      card.hidden = false;
      list.appendChild(card);
    });
    if (empty) empty.hidden = visible.length !== 0;
    if (count) count.textContent = visible.length + ' hạng phòng';
  }

  function syncUrl() {
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => { if (value) params.set(key, value); });
    const qs = params.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  const initial = new URLSearchParams(location.search);
  ['q', 'type', 'guests', 'area', 'sort'].forEach((key) => {
    const field = form.elements[key];
    if (field && initial.get(key)) field.value = initial.get(key);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); syncUrl(); });
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { apply(); syncUrl(); }, 200);
  });
  form.addEventListener('change', () => { apply(); syncUrl(); });
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

// 3. BOOKING LOOKUP CONTROLLER (LocalStorage + Supabase + Express API)
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

  function findInLocalStore(id, contact) {
    try {
      const raw = localStorage.getItem(BANLA_STORAGE_KEY);
      if (!raw) return null;
      const list = JSON.parse(raw);
      const cleanId = id.replace(/^BANLA_/i, '').toUpperCase();
      const cleanContact = contact.toLowerCase().replace(/\s+/g, '');
      return list.find((b) => {
        const bId = String(b.id || b.booking_code || '').replace(/^BANLA_/i, '').toUpperCase();
        if (bId !== cleanId) return false;
        const phone = String(b.phone || b.guest_phone || '').replace(/\s+/g, '');
        const email = String(b.email || b.guest_email || '').toLowerCase().trim();
        return (phone && phone.includes(cleanContact)) || (email && email === cleanContact);
      });
    } catch {
      return null;
    }
  }

  function renderBookingLookupResult(b) {
    const isConfirmed = b.status === 'confirmed' || b.booking_status === 'confirmed';
    const badgeClass = isConfirmed ? 'badge-confirmed' : 'badge-pending';
    const statusText = isConfirmed ? 'Đã duyệt & Xác nhận' : 'Đang xử lý (Chờ xác nhận)';
    const isPaid = b.paymentStatus === 'PAID' || b.payment_status === 'paid';
    const paymentBadge = isPaid
      ? '<span class="lookup-badge badge-confirmed" style="margin-left: 6px;">Đã thanh toán</span>'
      : '<span class="lookup-badge badge-pending" style="margin-left: 6px;">Chờ thanh toán</span>';

    const code = b.id || b.booking_code;
    const pin = b.smartLockPin || b.smartlock_pin;
    const checkin = b.checkin || (b.check_in ? String(b.check_in).slice(0, 10) : '');
    const checkout = b.checkout || (b.check_out ? String(b.check_out).slice(0, 10) : '');

    let html =
      '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;margin-bottom:8px;">' +
        '<span class="lookup-badge ' + badgeClass + '">' + statusText + '</span>' +
        paymentBadge +
      '</div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Mã đặt phòng:</span><span class="lookup-detail-val">#' + escapeHtml(code) + '</span></div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Khách hàng:</span><span class="lookup-detail-val">' + escapeHtml(b.name || b.guest_name) + '</span></div>' +
      '<div class="lookup-detail-row"><span class="lookup-detail-label">Hạng phòng:</span><span class="lookup-detail-val">' + escapeHtml(b.room || b.room_id || 'Banla Signature') + '</span></div>' +
      (checkin ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Thời gian:</span><span class="lookup-detail-val">' + escapeHtml(checkin) + ' → ' + escapeHtml(checkout) + '</span></div>' : '') +
      (b.guests ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Số khách:</span><span class="lookup-detail-val">' + escapeHtml(b.guests) + ' khách</span></div>' : '');

    if (pin) {
      html += '<div class="lookup-detail-row" style="background:rgba(212,175,55,0.14);padding:10px 12px;border-radius:8px;margin-top:8px;"><span class="lookup-detail-label" style="color:var(--ink);font-weight:600;">Mã Smart-Lock 6 số:</span><span class="lookup-detail-val" style="color:var(--ember);font-size:1.1rem;font-weight:700;letter-spacing:0.12em;">' + escapeHtml(pin) + '</span></div>';
    }

    html += '<div style="margin-top: 14px; display:flex; gap:8px; justify-content: center; flex-wrap:wrap;">' +
      '<a href="' + getSiteRoot() + 'phieu.html?ma=' + encodeURIComponent(code) + '" target="_blank" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; font-size: 13px; text-decoration: none;">📄 Xem Phiếu Xác Nhận Dấu Đỏ</a>' +
      '</div>';
    resultDiv.innerHTML = html;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawId = (document.getElementById('lookupBookingId')?.value || '').trim();
    const id = rawId.replace(/^#+/, '').replace(/^BANLA_/i, '').trim();
    const contact = (document.getElementById('lookupBookingContact')?.value || '').trim();

    if (!id || !contact) {
      resultDiv.className = 'lookup-result show';
      resultDiv.innerHTML = '<p style="color: var(--ember);">Vui lòng nhập đầy đủ mã đặt phòng và số điện thoại hoặc email.</p>';
      return;
    }

    const origText = submitBtn.textContent;
    submitBtn.textContent = 'Đang tra cứu...';
    submitBtn.disabled = true;
    resultDiv.className = 'lookup-result show';
    resultDiv.innerHTML = '<p style="color: var(--muted);">Đang tìm kiếm thông tin...</p>';

    // 1. Check LocalStorage first (instant on GitHub Pages)
    const localMatch = findInLocalStore(id, contact);
    if (localMatch) {
      renderBookingLookupResult(localMatch);
      submitBtn.textContent = origText;
      submitBtn.disabled = false;
      return;
    }

    // 2. Check Express API if available
    try {
      const res = await fetch('/api/booking/lookup?id=' + encodeURIComponent(id) + '&contact=' + encodeURIComponent(contact));
      const data = await res.json();

      if (res.ok && data.success && data.booking) {
        renderBookingLookupResult(data.booking);
      } else {
        resultDiv.innerHTML = '<p style="color: var(--ember); margin-bottom: 8px;">' + escapeHtml(data.message || 'Không tìm thấy dữ liệu đặt phòng.') + '</p><p style="font-size: 0.85rem; color: var(--muted);">Nếu quý khách vừa đặt phòng hoặc cần hỗ trợ gấp, vui lòng gọi hotline <a href="tel:02969996999" style="color: var(--brass); font-weight: 500;">0296.9996.999</a> / <a href="tel:0352554863" style="color: var(--brass); font-weight: 500;">0352554863</a> hoặc nhắn <a href="https://www.facebook.com/profile.php?id=61550577645853" target="_blank" rel="noopener" style="color: var(--brass); text-decoration: underline;">Facebook Fanpage Banla 24/7</a>.</p>';
      }
    } catch {
      resultDiv.innerHTML = '<p style="color: var(--ember); margin-bottom: 8px;">Không tìm thấy mã đặt phòng #' + escapeHtml(id) + ' trên thiết bị này.</p><p style="font-size: 0.85rem; color: var(--muted);">Vui lòng kiểm tra lại Mã đơn hoặc liên hệ Hotline <a href="tel:02969996999" style="color: var(--ember); font-weight: 600;">0296.9996.999</a> - <a href="tel:0352554863" style="color: var(--ember); font-weight: 600;">0352554863</a> / <a href="https://www.facebook.com/profile.php?id=61550577645853" target="_blank" rel="noopener" style="color: var(--ember); text-decoration: underline;">Fanpage Facebook Banla 24/7</a> để nhận Phiếu xác nhận dấu đỏ.</p>';
    } finally {
      submitBtn.textContent = origText;
      submitBtn.disabled = false;
    }
  });
})();
