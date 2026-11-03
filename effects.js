/* Additive home-page effects:
   1. Canvas Nexus - Omni x Banla ("Banna") Interactive Background Engine
   2. Skillry.dev UI/UX Multi-Scene Hero Slider & Omni Intensity Controller
   3. Skillry.dev Room Slider Ambient Backdrop, Numbered Progress Bar & Drag/Swipe
   Leaves core slider, lightbox, form, and menu logic in script.js untouched. */
(function () {
  'use strict';

  var SCENES = [
    { num: '01', label: 'Élite Attic', src: 'images/elite.jpg' },
    { num: '02', label: 'Banla Về Đêm', src: 'images/banla-exterior.jpg' },
    { num: '03', label: 'The Roof Wine', src: 'images/banla-rooftop.jpg' },
    { num: '04', label: 'Sảnh Thông Tầng', src: 'images/banla-lobby.jpg' },
    { num: '05', label: 'Ẩm Thực Sáng', src: 'images/banla-breakfast.jpg' }
  ];

  var reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMq = window.matchMedia('(max-width: 768px)');
  var finePointerMq = window.matchMedia('(hover: hover) and (pointer: fine)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var reduced = function () { return reduceMq.matches; };

  /* Top Scroll Progress Bar */
  var bar = document.createElement('div');
  bar.className = 'fx-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.prepend(bar);

  var hero = document.querySelector('.hero');
  var heroMedia = document.querySelector('.hero-media');
  var parallaxNodes = document.querySelectorAll('.roof-visual, .gallery-item, .room-slide-visual, .story-aside img');
  var ticking = false;

  /* Shared state for Nexus-Omni Canvas intensity (controlled by Skillry.dev slider) */
  var omniState = {
    intensity: 1.0, // 0.2 -> 1.6
    sceneIndex: 0
  };

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

  /* ==========================================================================
     1. CANVAS NEXUS - OMNI x BANLA ("BANNA") INTERACTIVE BACKGROUND ENGINE
     ========================================================================== */
  function mountNexusOmniCanvas() {
    if (reduced() || saveData) return;

    /* Global Fixed Background Canvas */
    var globalCanvas = document.createElement('canvas');
    globalCanvas.className = 'fx-nexus-omni-canvas';
    globalCanvas.id = 'banlaNexusOmniCanvas';
    globalCanvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(globalCanvas);

    /* Hero Foreground Constellation Canvas */
    var heroCanvas = null;
    var hCtx = null;
    if (hero) {
      heroCanvas = document.createElement('canvas');
      heroCanvas.className = 'fx-hero-nexus-canvas';
      heroCanvas.setAttribute('aria-hidden', 'true');
      hero.insertBefore(heroCanvas, hero.querySelector('.hero-content'));
      hCtx = heroCanvas.getContext('2d');
    }

    var ctx = globalCanvas.getContext('2d');
    var width = 0;
    var height = 0;
    var hWidth = 0;
    var hHeight = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var mouse = {
      x: null,
      y: null,
      heroX: null,
      heroY: null,
      radius: 175
    };

    var particles = [];
    var heroParticles = [];
    var orbs = [];
    var tick = 0;

    function createOrbs() {
      orbs = [
        { x: 0.18, y: 0.22, r: 0.38, vx: 0.00025, vy: 0.00018, color: '184, 97, 46', alpha: 0.12 },   /* Banla Ember */
        { x: 0.82, y: 0.30, r: 0.42, vx: -0.0002, vy: 0.00022, color: '212, 165, 116', alpha: 0.15 }, /* Banla Brass */
        { x: 0.48, y: 0.78, r: 0.45, vx: 0.00018, vy: -0.0002, color: '36, 53, 48', alpha: 0.09 },    /* Dalat Pine */
        { x: 0.75, y: 0.82, r: 0.34, vx: -0.00022, vy: -0.00015, color: '212, 165, 116', alpha: 0.12 }
      ];
    }

    function createParticle(w, h, isHero) {
      var palette = isHero
        ? ['212, 165, 116', '250, 246, 240', '249, 115, 22']
        : ['184, 97, 46', '212, 165, 116', '36, 53, 48'];
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * (isHero ? 0.55 : 0.65),
        vy: (Math.random() - 0.5) * (isHero ? 0.55 : 0.65) - (isHero ? 0.12 : 0),
        radius: Math.random() * (isHero ? 2.2 : 2.5) + 1.0,
        rgb: palette[Math.floor(Math.random() * palette.length)],
        phase: Math.random() * Math.PI * 2
      };
    }

    function resizeCanvases() {
      width = window.innerWidth;
      height = window.innerHeight;
      globalCanvas.width = width * dpr;
      globalCanvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var targetCount = mobileMq.matches ? 28 : Math.min(72, Math.max(36, Math.floor((width * height) / 19000)));
      particles = [];
      for (var i = 0; i < targetCount; i++) {
        particles.push(createParticle(width, height, false));
      }

      if (hero && heroCanvas && hCtx) {
        var rect = hero.getBoundingClientRect();
        hWidth = Math.max(1, rect.width);
        hHeight = Math.max(1, rect.height);
        heroCanvas.width = hWidth * dpr;
        heroCanvas.height = hHeight * dpr;
        hCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        var hCount = mobileMq.matches ? 18 : 38;
        heroParticles = [];
        for (var j = 0; j < hCount; j++) {
          heroParticles.push(createParticle(hWidth, hHeight, true));
        }
      }
    }

    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      if (hero) {
        var r = hero.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          mouse.heroX = e.clientX - r.left;
          mouse.heroY = e.clientY - r.top;
        } else {
          mouse.heroX = null;
          mouse.heroY = null;
        }
      }
    }, { passive: true });

    window.addEventListener('mouseout', function () {
      mouse.x = null;
      mouse.y = null;
      mouse.heroX = null;
      mouse.heroY = null;
    });

    function drawBannaAmbientOrbs(c, w, h, mult) {
      /* 1. Soft Aurora Orbs ("Banna" Warmth & Dalat Mist) */
      for (var i = 0; i < orbs.length; i++) {
        var o = orbs[i];
        o.x += o.vx * mult;
        o.y += o.vy * mult;
        if (o.x < 0.05 || o.x > 0.95) o.vx = -o.vx;
        if (o.y < 0.05 || o.y > 0.95) o.vy = -o.vy;

        var cx = o.x * w;
        var cy = o.y * h;
        var rad = Math.max(w, h) * o.r;
        var grad = c.createRadialGradient(cx, cy, 0, cx, cy, rad);
        var a = Math.min(0.28, o.alpha * mult);
        grad.addColorStop(0, 'rgba(' + o.color + ', ' + a.toFixed(3) + ')');
        grad.addColorStop(0.55, 'rgba(' + o.color + ', ' + (a * 0.35).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(' + o.color + ', 0)');
        c.fillStyle = grad;
        c.fillRect(0, 0, w, h);
      }

      /* 2. Flowing Dalat Mist & Brass Silk Ribbon Waves */
      for (var wv = 0; wv < 2; wv++) {
        c.beginPath();
        var baseY = h * (0.32 + wv * 0.38);
        c.moveTo(0, baseY);
        for (var x = 0; x <= w; x += 60) {
          var y = baseY +
            Math.sin(x * 0.003 + tick * 0.012 + wv * 1.7) * 34 * mult +
            Math.cos(x * 0.0015 - tick * 0.008) * 18 * mult;
          c.lineTo(x, y);
        }
        c.strokeStyle = wv === 0
          ? 'rgba(212, 165, 116, ' + (0.09 * mult).toFixed(3) + ')'
          : 'rgba(184, 97, 46, ' + (0.07 * mult).toFixed(3) + ')';
        c.lineWidth = 1.4;
        c.stroke();
      }
    }

    function drawNexusOmniMesh(c, list, w, h, mx, my, isHero, mult) {
      var linkDist = (isHero ? 125 : 135) * (0.75 + mult * 0.25);
      var omniRadius = mouse.radius * (0.8 + mult * 0.25);

      /* Optional Omni Cursor Glow Halo */
      if (mx !== null && my !== null) {
        var mGrad = c.createRadialGradient(mx, my, 0, mx, my, omniRadius);
        var haloAlpha = (isHero ? 0.16 : 0.11) * mult;
        mGrad.addColorStop(0, 'rgba(212, 165, 116, ' + haloAlpha.toFixed(3) + ')');
        mGrad.addColorStop(0.5, 'rgba(184, 97, 46, ' + (haloAlpha * 0.35).toFixed(3) + ')');
        mGrad.addColorStop(1, 'rgba(212, 165, 116, 0)');
        c.fillStyle = mGrad;
        c.beginPath();
        c.arc(mx, my, omniRadius, 0, Math.PI * 2);
        c.fill();
      }

      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        p.x += p.vx * (0.65 + mult * 0.35);
        p.y += p.vy * (0.65 + mult * 0.35);

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        var pulse = 0.65 + 0.35 * Math.sin(tick * 0.03 + p.phase);
        var dotAlpha = Math.min(0.9, (isHero ? 0.62 : 0.46) * pulse * mult);

        c.beginPath();
        c.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        c.fillStyle = 'rgba(' + p.rgb + ', ' + dotAlpha.toFixed(3) + ')';
        c.fill();

        /* Nexus node-to-node links */
        for (var j = i + 1; j < list.length; j++) {
          var p2 = list[j];
          var dx = p.x - p2.x;
          var dy = p.y - p2.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < linkDist) {
            var lineAlpha = (1 - dist / linkDist) * (isHero ? 0.26 : 0.17) * mult;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(p2.x, p2.y);
            c.strokeStyle = isHero
              ? 'rgba(212, 165, 116, ' + lineAlpha.toFixed(3) + ')'
              : 'rgba(184, 97, 46, ' + lineAlpha.toFixed(3) + ')';
            c.lineWidth = 0.65;
            c.stroke();
          }
        }

        /* Omni-directional cursor connection + gentle orbital pull */
        if (mx !== null && my !== null) {
          var mdx = p.x - mx;
          var mdy = p.y - my;
          var mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mDist < omniRadius && mDist > 1) {
            var mAlpha = (1 - mDist / omniRadius) * (isHero ? 0.52 : 0.38) * mult;
            c.beginPath();
            c.moveTo(p.x, p.y);
            c.lineTo(mx, my);
            c.strokeStyle = 'rgba(212, 165, 116, ' + mAlpha.toFixed(3) + ')';
            c.lineWidth = 0.9;
            c.stroke();

            /* Subtle omni-directional attraction toward pointer */
            p.x -= (mdx / mDist) * 0.22 * mult;
            p.y -= (mdy / mDist) * 0.22 * mult;
          }
        }
      }
    }

    function renderLoop() {
      tick++;
      var mult = omniState.intensity;

      ctx.clearRect(0, 0, width, height);
      if (mult > 0.05) {
        drawBannaAmbientOrbs(ctx, width, height, mult);
        drawNexusOmniMesh(ctx, particles, width, height, mouse.x, mouse.y, false, mult);
      }

      if (hero && heroCanvas && hCtx) {
        var r = hero.getBoundingClientRect();
        if (r.bottom > 0 && r.top < window.innerHeight && mult > 0.05) {
          hCtx.clearRect(0, 0, hWidth, hHeight);
          drawNexusOmniMesh(hCtx, heroParticles, hWidth, hHeight, mouse.heroX, mouse.heroY, true, mult);
        }
      }

      window.requestAnimationFrame(renderLoop);
    }

    createOrbs();
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    window.requestAnimationFrame(renderLoop);
  }

  /* ==========================================================================
     2. SKILLRY.DEV HERO MULTI-SCENE SLIDER & OMNI AURA CONTROLLER DOCK
     ========================================================================== */
  function mountSkillryHeroSlider(media) {
    if (!hero || !media) return;

    var layers = [];
    var buttons = [];
    var currentIndex = 0;
    var timer = null;
    var INTERVAL_MS = 7500;

    SCENES.forEach(function (scene, idx) {
      var layer = document.createElement('div');
      layer.className = 'fx-kb' + (idx === 0 ? ' is-active' : '');
      layer.setAttribute('aria-hidden', 'true');
      layer.style.backgroundImage = 'url("' + scene.src + '")';
      media.appendChild(layer);
      layers.push(layer);
    });

    /* Build Skillry.dev Floating Control Dock */
    var dock = document.createElement('div');
    dock.className = 'fx-skillry-dock';
    dock.setAttribute('aria-label', 'Bộ điều khiển cảnh nền & hiệu ứng Nexus-Omni');

    var pillsWrap = document.createElement('div');
    pillsWrap.className = 'fx-scene-pills';

    function activateScene(index, resetTimer) {
      currentIndex = (index + SCENES.length) % SCENES.length;
      omniState.sceneIndex = currentIndex;

      layers.forEach(function (layer, i) {
        layer.classList.toggle('is-active', i === currentIndex);
      });

      buttons.forEach(function (btn, i) {
        var isActive = i === currentIndex;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        /* Restart CSS progress bar animation cleanly */
        var prog = btn.querySelector('.fx-scene-progress');
        if (prog && isActive) {
          prog.style.animation = 'none';
          /* trigger reflow */
          void prog.offsetWidth;
          prog.style.animation = '';
        }
      });

      if (resetTimer) {
        startAutoCycle();
      }
    }

    function startAutoCycle() {
      if (timer) window.clearInterval(timer);
      if (reduced()) return;
      timer = window.setInterval(function () {
        activateScene(currentIndex + 1, false);
      }, INTERVAL_MS);
    }

    SCENES.forEach(function (scene, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fx-scene-btn' + (idx === 0 ? ' active' : '');
      btn.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      btn.setAttribute('title', 'Cảnh nền ' + scene.num + ': ' + scene.label);
      btn.innerHTML =
        '<span class="fx-scene-num">' + scene.num + '</span>' +
        '<span class="fx-scene-label">' + scene.label + '</span>' +
        '<span class="fx-scene-progress" aria-hidden="true"></span>';

      btn.addEventListener('click', function () {
        activateScene(idx, true);
      });

      pillsWrap.appendChild(btn);
      buttons.push(btn);
    });

    /* Interactive Nexus-Omni Intensity Range Slider (Skillry.dev UI/UX pattern) */
    var omniCtrl = document.createElement('div');
    omniCtrl.className = 'fx-omni-control';
    omniCtrl.innerHTML =
      '<span class="fx-omni-title">Nexus · Omni</span>' +
      '<input type="range" class="fx-omni-slider" min="0" max="150" value="100" aria-label="Điều chỉnh cường độ nền Canvas Nexus-Omni">' +
      '<span class="fx-omni-val">100%</span>';

    var rangeInput = omniCtrl.querySelector('.fx-omni-slider');
    var rangeVal = omniCtrl.querySelector('.fx-omni-val');

    rangeInput.addEventListener('input', function () {
      var val = parseInt(rangeInput.value, 10) || 0;
      omniState.intensity = val / 100;
      rangeVal.textContent = val + '%';
    });

    dock.appendChild(pillsWrap);
    dock.appendChild(omniCtrl);
    hero.appendChild(dock);

    startAutoCycle();

    /* Subtle 3D tilt on Hero pointermove */
    if (finePointerMq.matches && !reduced() && !saveData) {
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
    }
  }

  /* ==========================================================================
     3. SKILLRY.DEV ROOM SLIDER (#roomSlider) AMBIENT BACKDROP & NUMBERED BAR
     ========================================================================== */
  function mountSkillryRoomSlider() {
    var roomsSection = document.getElementById('rooms');
    var roomSlider = document.getElementById('roomSlider');
    if (!roomsSection || !roomSlider) return;

    var slides = roomSlider.querySelectorAll('.room-slide');
    if (!slides.length) return;

    /* 1. Ambient blurred background layer inside #rooms */
    var ambientWrap = document.createElement('div');
    ambientWrap.className = 'fx-room-ambient';
    ambientWrap.setAttribute('aria-hidden', 'true');
    var ambientImg = document.createElement('div');
    ambientImg.className = 'fx-room-ambient-img';
    ambientWrap.appendChild(ambientImg);
    roomsSection.insertBefore(ambientWrap, roomsSection.firstChild);

    /* 2. Numbered Status & Progress Track Bar above #roomSlider */
    var statusBar = document.createElement('div');
    statusBar.className = 'fx-room-status-bar';
    var totalStr = slides.length < 10 ? '0' + slides.length : '' + slides.length;
    statusBar.innerHTML =
      '<div class="fx-room-counter"><strong class="fx-room-cur">01</strong><span>/ ' + totalStr + '</span> · <span class="fx-room-name">Élite Room</span></div>' +
      '<div class="fx-room-progress-track" aria-hidden="true"><div class="fx-room-progress-fill"></div></div>' +
      '<div class="fx-room-drag-hint">⇄ Kéo hoặc dùng phím mũi tên để lướt phòng</div>';

    roomSlider.insertBefore(statusBar, roomSlider.firstChild);

    var curEl = statusBar.querySelector('.fx-room-cur');
    var nameEl = statusBar.querySelector('.fx-room-name');
    var fillEl = statusBar.querySelector('.fx-room-progress-fill');

    function syncActiveRoom() {
      var activeIdx = 0;
      for (var i = 0; i < slides.length; i++) {
        if (slides[i].classList.contains('active')) {
          activeIdx = i;
          break;
        }
      }
      var activeSlide = slides[activeIdx];
      var img = activeSlide.querySelector('img');
      var title = activeSlide.querySelector('h3');
      if (img && img.getAttribute('src')) {
        ambientImg.style.backgroundImage = 'url("' + img.getAttribute('src') + '")';
      }
      curEl.textContent = activeIdx + 1 < 10 ? '0' + (activeIdx + 1) : '' + (activeIdx + 1);
      if (title) nameEl.textContent = title.textContent;
      fillEl.style.width = (((activeIdx + 1) / slides.length) * 100).toFixed(2) + '%';
    }

    syncActiveRoom();

    /* Observe class changes on .room-slide to keep ambient backdrop & counter in sync */
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(syncActiveRoom);
      Array.prototype.forEach.call(slides, function (slide) {
        mo.observe(slide, { attributes: true, attributeFilter: ['class'] });
      });
    }

    /* Pointer drag / swipe support for #roomSlider */
    var track = roomSlider.querySelector('.room-slider-track');
    var prevBtn = roomSlider.querySelector('.slider-btn.prev');
    var nextBtn = roomSlider.querySelector('.slider-btn.next');
    var startX = null;

    if (track && prevBtn && nextBtn) {
      track.addEventListener('pointerdown', function (e) {
        if (e.target.closest('a, button')) return;
        startX = e.clientX;
      });
      track.addEventListener('pointerup', function (e) {
        if (startX === null) return;
        var diff = e.clientX - startX;
        startX = null;
        if (Math.abs(diff) > 48) {
          if (diff < 0) nextBtn.click();
          else prevBtn.click();
        }
      });
      track.addEventListener('pointercancel', function () {
        startX = null;
      });
    }
  }

  /* ==========================================================================
     4. SCROLL REVEAL OBSERVER
     ========================================================================== */
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
  mountNexusOmniCanvas();
  if (heroMedia) mountSkillryHeroSlider(heroMedia);
  mountSkillryRoomSlider();
  mountReveals();
  updateParallax();
})();
