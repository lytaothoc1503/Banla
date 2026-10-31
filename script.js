// Mobile menu
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('#navLinks');

if (menuToggle && navLinks) {
  menuToggle.addEventListener('click', () => {
    const open = navLinks.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  navLinks.querySelectorAll('a').forEach(link => {
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
  } else {
    header.classList.remove('scrolled');
  }
}, { passive: true });

// Booking forms — room options stay as authored on each page
document.querySelectorAll('form.booking-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const originalText = btn.textContent;
    btn.textContent = 'Đang gửi...';
    btn.disabled = true;

    const data = {
      name: form.querySelector('[name="name"]')?.value || '',
      email: form.querySelector('[name="email"]')?.value || '',
      phone: form.querySelector('[name="phone"]')?.value || '',
      checkin: form.querySelector('[name="checkin"]')?.value || '',
      checkout: form.querySelector('[name="checkout"]')?.value || '',
      room: form.querySelector('[name="room"]')?.value || '',
      guests: form.querySelector('[name="guests"]')?.value || '',
      message: form.querySelector('[name="message"]')?.value || form.querySelector('[name="note"]')?.value || ''
    };

    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      if (res.ok) {
        form.reset();
        if (window.BanlaPayment && result.id) {
          window.BanlaPayment.open({
            bookingId: result.id,
            amount: 200000,
            memo: 'BALA' + String(result.id).slice(-4).toUpperCase(),
            onSuccess: function(payRes) {
              console.log('Thanh toán Banla Priority hoàn tất:', payRes);
            }
          });
        } else {
          alert(result.message || 'Cảm ơn bạn! Banla sẽ liên hệ sớm.');
        }
      } else {
        alert(result.message || 'Có lỗi xảy ra khi gửi yêu cầu.');
      }
    } catch {
      alert('Hiện chưa gửi được yêu cầu trực tuyến. Vui lòng liên hệ Banla qua điện thoại tel:0965999999 hoặc Zalo https://zalo.me/0965999999 để đặt phòng.');
    }

    btn.textContent = originalText;
    btn.disabled = false;
  });
});

// Smooth scroll offset for fixed header
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const targetId = this.getAttribute('href');
    if (targetId === '#') return;
    const target = document.querySelector(targetId);
    if (target) {
      e.preventDefault();
      const headerHeight = document.querySelector('.header')?.offsetHeight || 72;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// --- Anime.js motion (DESIGN.md) ---
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const animeApi = window.anime;

function initMotion() {
  const revealEls = document.querySelectorAll('.reveal');

  if (reduceMotion || !animeApi || typeof animeApi.animate !== 'function') {
    revealEls.forEach((el) => el.classList.add('in'));
    return;
  }

  const { animate, stagger } = animeApi;

  // 1) Hero entrance — brand → title → sub → CTA
  const heroTargets = document.querySelectorAll('[data-hero]');
  if (heroTargets.length) {
    animate(heroTargets, {
      opacity: [0, 1],
      translateY: [28, 0],
      delay: stagger(120, { start: 180 }),
      duration: 900,
      ease: 'out(3)'
    });
  }

  // 2) Hero media slow drift
  const heroMedia = document.querySelector('.hero-media img');
  if (heroMedia) {
    animate(heroMedia, {
      scale: [1.06, 1.12],
      duration: 14000,
      ease: 'linear',
      loop: true,
      alternate: true
    });
  }

  // 3) Scroll reveals
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        observer.unobserve(el);
        animate(el, {
          opacity: [0, 1],
          translateY: [28, 0],
          duration: 700,
          ease: 'out(3)',
          onComplete: () => el.classList.add('in')
        });
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

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
(function() {
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
    if (timer) { clearInterval(timer); timer = null; }
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
(function() {
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

// Listing filters (canonical stays the clean URL)
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


// Booking Lookup Controller
(function() {
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawId = (document.getElementById('lookupBookingId')?.value || '').trim();
    const id = rawId.replace(/^#+/, '').trim();
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

    try {
      const res = await fetch('/api/booking/lookup?id=' + encodeURIComponent(id) + '&contact=' + encodeURIComponent(contact));
      const data = await res.json();

      if (!res.ok || !data.success) {
        resultDiv.innerHTML = '<p style="color: var(--ember); margin-bottom: 8px;">' + (data.message || 'Không tìm thấy dữ liệu đặt phòng.') + '</p><p style="font-size: 0.85rem; color: var(--muted);">Nếu quý khách vừa đặt phòng hoặc cần hỗ trợ gấp, vui lòng liên hệ hotline/Zalo: <a href="tel:0965999999" style="color: var(--brass); font-weight: 500;">0965.999.999</a>.</p>';
      } else {
        const b = data.booking;
        const isConfirmed = b.status === 'confirmed';
        const badgeClass = isConfirmed ? 'badge-confirmed' : 'badge-pending';
        const statusText = isConfirmed ? 'Đã xác nhận' : 'Đang xử lý (Chờ xác nhận)';

        resultDiv.innerHTML =
          '<div class="lookup-badge ' + badgeClass + '">' + statusText + '</div>' +
          '<div class="lookup-detail-row"><span class="lookup-detail-label">Mã đặt phòng:</span><span class="lookup-detail-val">#' + b.id + '</span></div>' +
          '<div class="lookup-detail-row"><span class="lookup-detail-label">Khách hàng:</span><span class="lookup-detail-val">' + b.name + '</span></div>' +
          '<div class="lookup-detail-row"><span class="lookup-detail-label">Hạng phòng:</span><span class="lookup-detail-val">' + (b.room || 'Tư vấn khi check-in') + '</span></div>' +
          (b.checkin ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Thời gian:</span><span class="lookup-detail-val">' + b.checkin + ' → ' + b.checkout + '</span></div>' : '') +
          (b.guests ? '<div class="lookup-detail-row"><span class="lookup-detail-label">Số khách:</span><span class="lookup-detail-val">' + b.guests + ' khách</span></div>' : '') +
          '<div class="lookup-detail-row"><span class="lookup-detail-label">Liên hệ xác thực:</span><span class="lookup-detail-val">' + (b.phoneMasked || b.emailMasked) + '</span></div>';
      }
    } catch {
      resultDiv.innerHTML = '<p style="color: var(--ember);">Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại mạng hoặc liên hệ qua Zalo 0965.999.999.</p>';
    } finally {
      submitBtn.textContent = origText;
      submitBtn.disabled = false;
    }
  });
})();
