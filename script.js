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

// Booking form
const form = document.querySelector('#bookingForm');
if (form) {
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
      alert(result.message || 'Cảm ơn bạn! Banla sẽ liên hệ sớm.');
      if (res.ok) form.reset();
    } catch {
      alert('Hiện chưa gửi được yêu cầu trực tuyến. Vui lòng liên hệ Banla qua điện thoại tel:0965999999 hoặc Zalo https://zalo.me/0965999999 để đặt phòng.');
    }

    btn.textContent = originalText;
    btn.disabled = false;
  });
}

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

// Lightbox for room slider + gallery
(function() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  const imgEl = lightbox.querySelector('img');
  const captionEl = lightbox.querySelector('.lightbox-caption');
  const closeBtn = lightbox.querySelector('.lightbox-close');
  const prevBtn = lightbox.querySelector('.lightbox-prev');
  const nextBtn = lightbox.querySelector('.lightbox-next');

  const sources = [];

  document.querySelectorAll('.room-slide').forEach(slide => {
    const visual = slide.querySelector('.room-slide-visual');
    const title = slide.querySelector('h3')?.textContent || '';
    if (!visual) return;
    const bg = getComputedStyle(visual).backgroundImage;
    const url = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    if (url && !url.includes('gradient')) {
      sources.push({ url, title, el: visual });
    }
  });

  document.querySelectorAll('.gallery-item').forEach(item => {
    const bg = getComputedStyle(item).backgroundImage;
    const url = bg.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    const title = item.getAttribute('aria-label') || '';
    if (url && !url.includes('gradient')) {
      sources.push({ url, title, el: item });
    }
  });

  let current = 0;

  function open(index) {
    current = index;
    imgEl.src = sources[current].url;
    imgEl.alt = sources[current].title;
    captionEl.textContent = sources[current].title;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }
  function prev() { open((current - 1 + sources.length) % sources.length); }
  function next() { open((current + 1) % sources.length); }

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

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
