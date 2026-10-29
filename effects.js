/* Additive home-page effects. Leaves slider, lightbox, form, and menu to script.js. */
(function () {
  'use strict';

  var VIDEO_SRC = 'https://cdn.coverr.co/videos/coverr-the-mountains-in-the-fog-9051/360p.mp4';
  var KB_IMAGES = ['images/elite.jpg', 'images/highland.jpg', 'images/signature.jpg', 'images/balcony.jpg'];
  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMq = window.matchMedia('(max-width: 768px)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var reduced = function () { return reduceMq.matches; };
  var allowVideo = function () { return !reduced() && !saveData && !mobileMq.matches; };

  var bar = document.createElement('div');
  bar.className = 'fx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);

  var hero = document.querySelector('.hero');
  var heroMedia = document.querySelector('.hero-media');
  var parallaxNodes = document.querySelectorAll('.roof-visual, .gallery-item, .room-slide-visual, .story-aside img');
  var video = null;
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
      heroMedia.style.transform = 'translate3d(0, ' + shift.toFixed(2) + 'px, 0)';
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
    var delays = [-5, -13, -21, -29];
    KB_IMAGES.forEach(function (src, i) {
      var layer = document.createElement('div');
      layer.className = 'fx-kb';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.backgroundImage = 'url("' + src + '")';
      layer.style.animationDelay = delays[i] + 's';
      media.appendChild(layer);
    });
  }

  function mountVideo(media) {
    video = document.createElement('video');
    video.className = 'fx-hero-video';
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.autoplay = false;
    video.playsInline = true;
    video.preload = 'none';
    video.poster = 'images/elite.jpg';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    if ('disablePictureInPicture' in video) video.disablePictureInPicture = true;

    var shade = document.createElement('div');
    shade.className = 'fx-hero-shade';
    shade.setAttribute('aria-hidden', 'true');
    media.appendChild(video);
    media.appendChild(shade);

    video.addEventListener('error', function () {
      media.classList.remove('is-video');
      mountKenBurns(media);
    });

    function stopVideo() {
      media.classList.remove('is-video');
      video.pause();
    }

    function startVideo() {
      if (!allowVideo()) {
        stopVideo();
        return;
      }
      if (!video.getAttribute('src')) {
        var arm = function () {
          if (video.getAttribute('src') || !allowVideo()) return;
          video.preload = 'none';
          video.src = VIDEO_SRC;
          var play = video.play();
          if (play && typeof play.catch === 'function') {
            play.catch(function () { media.classList.remove('is-video'); });
          }
        };
        if ('requestIdleCallback' in window) window.requestIdleCallback(arm, { timeout: 1500 });
        else window.setTimeout(arm, 400);
      } else {
        var again = video.play();
        if (again && typeof again.catch === 'function') {
          again.catch(function () { media.classList.remove('is-video'); });
        }
      }
    }

    video.addEventListener('playing', function () {
      if (allowVideo()) media.classList.add('is-video');
    });

    startVideo();
    if (typeof mobileMq.addEventListener === 'function') {
      mobileMq.addEventListener('change', startVideo);
    }
    if (typeof reduceMq.addEventListener === 'function') {
      reduceMq.addEventListener('change', function () {
        if (reduced()) {
          stopVideo();
          document.documentElement.classList.remove('fx-on');
          heroMedia.style.transform = '';
        } else {
          document.documentElement.classList.add('fx-on');
          startVideo();
        }
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
  if (heroMedia) mountVideo(heroMedia);
  mountReveals();
  updateParallax();
})();
