/* Additive home-page effects. Leaves slider, lightbox, form, and menu to script.js. */
(function () {
  'use strict';

  var KB_IMAGES = ['images/banla-exterior.jpg', 'images/banla-lobby.jpg', 'images/banla-reception.jpg', 'images/banla-rooftop.jpg'];
  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMq = window.matchMedia('(max-width: 768px)');
  var finePointerMq = window.matchMedia('(hover: hover) and (pointer: fine)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var reduced = function () { return reduceMq.matches; };

  var bar = document.createElement('div');
  bar.className = 'fx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);

  var hero = document.querySelector('.hero');
  var heroMedia = document.querySelector('.hero-media');
  var parallaxNodes = document.querySelectorAll('.roof-visual, .gallery-item, .room-slide-visual, .story-aside img');
  var kbStarted = false;
  var ticking = false;

  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var p = max > 0 ? window.scrollY / max : 0;
    bar.style.transform = 'scaleX(' + Math.max(0, Math.min(1, p)) + ')';
  }

  function updateParallax() {
    if (!hero || !heroMedia || reduced() || saveData) return;
    var rect = hero.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < window.innerHeight) {
      var shift = Math.max(-28, Math.min(28, -rect.top * 0.12));
      heroMedia.style.setProperty('--hero-shift-y', shift.toFixed(2) + 'px');
    } else {
      heroMedia.style.removeProperty('--hero-shift-y');
    }
    var mid = window.innerHeight / 2;
    for (var i = 0; i < parallaxNodes.length; i++) {
      var el = parallaxNodes[i];
      var r = el.getBoundingClientRect();
      if ((r.width === 0 && r.height === 0) || r.bottom < -40 || r.top > window.innerHeight + 40) continue;
      var delta = (r.top - mid) * -0.05;
      if (el.tagName === 'IMG') {
        el.style.transform = 'translate3d(0, ' + (delta * 0.35).toFixed(2) + 'px, 0)';
      } else {
        el.style.backgroundPosition = 'center calc(50% + ' + delta.toFixed(1) + 'px)';
      }
    }
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      updateProgress();
      updateParallax();
    });
  }

  function mountKenBurns(media) {
    if (kbStarted || reduced() || saveData || mobileMq.matches) return;
    kbStarted = true;
    var delays = [0, 8, 16, 24];
    KB_IMAGES.forEach(function (src, i) {
      var layer = document.createElement('div');
      layer.className = 'fx-kb';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.backgroundImage = 'url("' + src + '")';
      layer.style.animationDelay = delays[i] + 's';
      media.appendChild(layer);
    });
  }

  function mountHeroMotion(media) {
    mountKenBurns(media);
    if (!hero || !finePointerMq.matches || reduced() || saveData) return;

    function resetTilt() {
      media.style.removeProperty('--hero-rotate-x');
      media.style.removeProperty('--hero-rotate-y');
    }

    hero.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      var rect = hero.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var x = (event.clientX - rect.left) / rect.width - 0.5;
      var y = (event.clientY - rect.top) / rect.height - 0.5;
      media.style.setProperty('--hero-rotate-x', (-y * 2).toFixed(2) + 'deg');
      media.style.setProperty('--hero-rotate-y', (x * 2).toFixed(2) + 'deg');
    });
    hero.addEventListener('pointerleave', resetTilt);
    hero.addEventListener('pointercancel', resetTilt);

    if (typeof reduceMq.addEventListener === 'function') {
      reduceMq.addEventListener('change', function () {
        if (reduced()) resetTilt();
      });
    }
  }

  function mountReveals() {
    if (reduced() || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('fx-on');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.remove('fx-await');
        io.unobserve(el);
        window.setTimeout(function () { el.style.transitionDelay = ''; }, 900);
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -4% 0px' });

    function arm(list) {
      Array.prototype.forEach.call(list, function (el, i) {
        if (el.classList.contains('reveal')) return;
        var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9 && r.bottom > 0) return;
        el.style.transitionDelay = (i % 8) * 70 + 'ms';
        el.classList.add('fx-await');
        io.observe(el);
      });
    }

    arm(document.querySelectorAll('main > section:not(#home)'));
    arm(document.querySelectorAll('.gallery-item'));
    arm(document.querySelectorAll('.hour-item'));
    arm(document.querySelectorAll('.location-meta > div'));
  }

  updateProgress();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  if (heroMedia) mountHeroMotion(heroMedia);
  mountReveals();
  updateParallax();
})();
