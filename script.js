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
    });
  });
}

// Header scroll effect
const header = document.querySelector('#header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  });
}

// Booking forms (room list in the select is intentionally unchanged)
document.querySelectorAll('form.booking-form').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"], button');
    if (!btn) return;
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

    const staticHost = location.hostname.endsWith('github.io') || location.protocol === 'file:';
    const offlineNote = 'Hiện chưa gửi được yêu cầu trực tuyến. Vui lòng gọi 02633.633.777 hoặc email sales@banlaboutiquehotel.com.';

    if (staticHost) {
      alert(offlineNote);
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await res.json();
      alert(result.message || 'Cảm ơn bạn! Banla sẽ liên hệ sớm.');
      if (res.ok) form.reset();
    } catch {
      alert(offlineNote);
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
      const bar = document.querySelector('.header');
      const headerHeight = bar ? bar.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight - 10;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// Soft intersection observer for section reveal (optional enhancement)
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealEls = document.querySelectorAll('.section-header, .feature, .review, .gallery-item, .hotel-card, .deal-card, .dest-card, .post-card');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach((el) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
  });
}

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
    dot.type = 'button';
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

  // Auto-play with visibility check (performance)
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

// Lightbox for room slider and gallery
(function() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  const imgEl = lightbox.querySelector('img');
  const captionEl = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  const triggers = [];
  document.querySelectorAll('.room-slide-visual, .gallery-item, .roof-visual').forEach((node) => {
    const img = node.querySelector('img');
    if (!img) return;
    triggers.push({ node, img });
  });
  if (!triggers.length || !imgEl || !closeBtn || !prevBtn || !nextBtn) return;

  let current = 0;

  function open(index) {
    current = (index + triggers.length) % triggers.length;
    const source = triggers[current].img;
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

  triggers.forEach((item, i) => {
    item.node.style.cursor = 'zoom-in';
    item.node.addEventListener('click', () => open(i));
  });

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => open(current - 1));
  nextBtn.addEventListener('click', () => open(current + 1));
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') open(current - 1);
    if (e.key === 'ArrowRight') open(current + 1);
  });
})();


// Listing filters (progressive enhancement; canonical stays on the clean URL)
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
    const data = new FormData(form);
    data.forEach((value, key) => {
      if (value) params.set(key, value);
    });
    const qs = params.toString();
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { apply(); syncUrl(); }, 200);
  }

  const initial = new URLSearchParams(location.search);
  ['q', 'type', 'guests', 'area', 'sort'].forEach((key) => {
    const field = form.elements[key];
    if (field && initial.get(key)) field.value = initial.get(key);
  });

  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); syncUrl(); });
  form.addEventListener('input', schedule);
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

// Service Worker registration (project Pages lives under /Banla/)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const path = location.pathname;
    const marker = '/Banla/';
    const at = path.indexOf(marker);
    const root = at === -1 ? '/' : path.slice(0, at + marker.length);
    navigator.serviceWorker.register(root + 'sw.js').catch(() => {});
  });
}
