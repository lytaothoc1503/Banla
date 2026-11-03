/* Banla × Gemini — Trợ lý lễ tân AI "Bàn Là".
   Gọi Supabase Edge Function `banla-gemini` (API key Gemini nằm ở server, KHÔNG có trong file này).
   Cấu hình (đặt trước khi nạp file, hoặc dùng cấu hình Supabase sẵn có của site):
     window.BANLA_GEMINI_ENDPOINT   — URL đầy đủ của function (tuỳ chọn)
     window.BANLA_SUPABASE_URL      — https://<project-ref>.supabase.co
     window.BANLA_SUPABASE_ANON_KEY — publishable/anon key (an toàn để công khai) */
(function () {
  'use strict';

  var HOTLINE = '0296.9996.999';
  var FANPAGE = 'https://www.facebook.com/profile.php?id=61550577645853';
  var STORE_KEY = 'banla_concierge_history_v1';
  var SUGGESTIONS = [
    'Phòng nào hợp cho 2 người lớn và 1 bé?',
    'Giờ mở cửa The Roof?',
    'Cách đặt cọc VietQR thế nào?',
    'Từ sân bay Liên Khương về khách sạn bao xa?'
  ];

  function readConfig(name) {
    try { return window[name] || localStorage.getItem(name) || ''; } catch (e) { return window[name] || ''; }
  }

  function endpoint() {
    var direct = readConfig('BANLA_GEMINI_ENDPOINT');
    if (direct) return direct;
    var sb = readConfig('BANLA_SUPABASE_URL');
    return sb ? sb.replace(/\/+$/, '') + '/functions/v1/banla-gemini' : '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Định dạng tối giản & an toàn: escape trước, rồi mới thêm **đậm**, gạch đầu dòng, xuống dòng. */
  function formatReply(text) {
    var html = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\s*[-*•]\s+(.*)$/gm, '<span class="bc-li">$1</span>')
      .replace(/#contact/g, '<a href="#contact" class="bc-link" data-bc-close>mục Đặt phòng</a>');
    return html.replace(/\n/g, '<br>');
  }

  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]').slice(-12); } catch (e) { history = []; }

  function saveHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-12))); } catch (e) { /* ignore */ }
  }

  /* ---------- Giao diện ---------- */
  var root = document.createElement('div');
  root.className = 'bc-root';
  root.innerHTML =
    '<button type="button" class="bc-launcher" aria-expanded="false" aria-controls="bcPanel">' +
      '<span class="bc-launcher-dot" aria-hidden="true"></span>' +
      '<span class="bc-launcher-text">Hỏi lễ tân AI</span>' +
    '</button>' +
    '<section class="bc-panel" id="bcPanel" role="dialog" aria-modal="false" aria-labelledby="bcTitle" hidden>' +
      '<header class="bc-head">' +
        '<div class="bc-avatar" aria-hidden="true">B</div>' +
        '<div class="bc-head-copy">' +
          '<h2 class="bc-title" id="bcTitle">Bàn Là · Lễ tân AI</h2>' +
          '<p class="bc-sub">Gemini · Google AI Studio · trả lời 24/7</p>' +
        '</div>' +
        '<button type="button" class="bc-close" aria-label="Đóng trợ lý">&times;</button>' +
      '</header>' +
      '<div class="bc-log" role="log" aria-live="polite"></div>' +
      '<div class="bc-chips"></div>' +
      '<div class="bc-turnstile" aria-live="polite"></div>' +
      '<form class="bc-form">' +
        '<label class="bc-sr" for="bcInput">Câu hỏi của quý khách</label>' +
        '<textarea id="bcInput" class="bc-input" rows="1" maxlength="800" placeholder="Hỏi về phòng, giá, The Roof, đường đi..."></textarea>' +
        '<button type="submit" class="bc-send" aria-label="Gửi câu hỏi">➤</button>' +
      '</form>' +
      '<p class="bc-note">AI có thể nhầm lẫn. Xác nhận giá & phòng trống qua Hotline ' + HOTLINE + '. Không gửi mã PIN, OTP hay số thẻ tại đây.</p>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = root.querySelector('.bc-launcher');
  var panel = root.querySelector('.bc-panel');
  var closeBtn = root.querySelector('.bc-close');
  var log = root.querySelector('.bc-log');
  var chips = root.querySelector('.bc-chips');
  var form = root.querySelector('.bc-form');
  var input = root.querySelector('.bc-input');
  var sendBtn = root.querySelector('.bc-send');
  var turnstileBox = root.querySelector('.bc-turnstile');
  var busy = false;
  var turnstileWidgetId = null;
  var turnstileLoadPromise = null;
  var turnstileResolver = null;
  var turnstileRejecter = null;
  var turnstileTimer = null;
  var requestTimes = [];
  var lastRequestAt = 0;

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (turnstileLoadPromise) return turnstileLoadPromise;

    turnstileLoadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.turnstile) resolve();
        else {
          turnstileLoadPromise = null;
          reject(new Error('Không tải được xác minh bảo mật.'));
        }
      };
      script.onerror = function () {
        turnstileLoadPromise = null;
        reject(new Error('Không tải được xác minh bảo mật.'));
      };
      document.head.appendChild(script);
    });

    return turnstileLoadPromise;
  }

  function finishTurnstile(error, token) {
    if (!turnstileResolver) return;
    window.clearTimeout(turnstileTimer);
    var resolve = turnstileResolver;
    var reject = turnstileRejecter;
    turnstileResolver = null;
    turnstileRejecter = null;
    if (error) reject(error);
    else resolve(token);
  }

  function getTurnstileToken() {
    var siteKey = readConfig('BANLA_TURNSTILE_SITE_KEY');
    if (!siteKey) return Promise.reject(new Error('Chưa cấu hình mã Cloudflare Turnstile cho website.'));

    return loadTurnstile().then(function () {
      if (turnstileWidgetId === null) {
        turnstileWidgetId = window.turnstile.render(turnstileBox, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          action: 'banla_chat',
          callback: function (token) { finishTurnstile(null, token); },
          'error-callback': function () { finishTurnstile(new Error('Xác minh bảo mật gặp lỗi. Vui lòng thử lại.')); },
          'expired-callback': function () { finishTurnstile(new Error('Xác minh bảo mật đã hết hạn. Vui lòng thử lại.')); }
        });
      }

      return new Promise(function (resolve, reject) {
        turnstileResolver = resolve;
        turnstileRejecter = reject;
        turnstileTimer = window.setTimeout(function () {
          finishTurnstile(new Error('Xác minh bảo mật quá thời gian. Vui lòng thử lại.'));
        }, 90000);
        try {
          window.turnstile.execute(turnstileWidgetId);
        } catch (error) {
          finishTurnstile(error);
        }
      });
    });
  }

  function resetTurnstile() {
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function addBubble(role, text, isError) {
    var el = document.createElement('div');
    el.className = 'bc-msg ' + (role === 'user' ? 'bc-user' : 'bc-bot') + (isError ? ' bc-error' : '');
    el.innerHTML = role === 'user' ? escapeHtml(text).replace(/\n/g, '<br>') : formatReply(text);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function renderChips() {
    chips.innerHTML = '';
    if (history.length > 1) return;
    SUGGESTIONS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bc-chip';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

  function renderHistory() {
    log.innerHTML = '';
    addBubble('model', 'Xin chào quý khách! Banla có thể tư vấn **hạng phòng**, **giá**, **The Roof**, đường đi và cách **đặt cọc VietQR**. Quý khách cần hỗ trợ gì ạ?');
    history.forEach(function (m) { addBubble(m.role, m.text); });
    renderChips();
  }

  function openPanel() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!log.childElementCount) renderHistory();
    window.setTimeout(function () { input.focus(); }, 60);
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    launcher.focus();
  }

  launcher.addEventListener('click', function () { if (panel.hidden) { openPanel(); } else { closePanel(); } });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });
  log.addEventListener('click', function (e) { if (e.target.closest('[data-bc-close]')) closePanel(); });

  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
  });

  function fallbackText() {
    return 'Quý khách vui lòng gọi **Hotline ' + HOTLINE + '** hoặc nhắn Fanpage Banla 24/7: ' + FANPAGE;
  }

  function ask(raw) {
    var text = String(raw || '').trim().slice(0, 800);
    if (!text || busy) return;
    var now = Date.now();
    requestTimes = requestTimes.filter(function (time) { return now - time < 60000; });
    if (now - lastRequestAt < 3000 || requestTimes.length >= 6) {
      addBubble('model', 'Quý khách vui lòng chờ một chút trước khi gửi câu hỏi tiếp theo.', true);
      return;
    }
    if (!readConfig('BANLA_TURNSTILE_SITE_KEY')) {
      addBubble('model', 'Trợ lý AI đang chờ cấu hình xác minh bảo mật. Quý khách vui lòng gọi Hotline ' + HOTLINE + ' để được hỗ trợ.', true);
      return;
    }

    lastRequestAt = now;
    requestTimes.push(now);
    input.value = '';
    input.style.height = 'auto';
    chips.innerHTML = '';

    var url = endpoint();
    if (!url) {
      addBubble('model', fallbackText(), true);
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    var typing = addBubble('model', 'Đang xác minh bảo mật…');
    typing.classList.add('bc-typing');
    var historyAdded = false;

    var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
    var headers = { 'Content-Type': 'application/json' };
    if (key) { headers.apikey = key; headers.Authorization = 'Bearer ' + key; }

    var controller = null;
    var timer = null;

    getTurnstileToken()
      .then(function (token) {
        history.push({ role: 'user', text: text });
        historyAdded = true;
        addBubble('user', text);
        saveHistory();
        typing.textContent = '…';
        controller = 'AbortController' in window ? new AbortController() : null;
        timer = window.setTimeout(function () { if (controller) controller.abort(); }, 30000);
        return fetch(url, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ mode: 'chat', messages: history, turnstileToken: token }),
          signal: controller ? controller.signal : undefined
        });
      })
      .then(function (res) {
        if (!res) throw new Error('Không nhận được phản hồi từ máy chủ AI.');
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            if (res.status === 404) throw new Error('Không tìm thấy Edge Function AI (404). Function chưa được triển khai hoặc địa chỉ cấu hình chưa đúng.');
            if (res.status === 401) throw new Error('Dịch vụ AI chưa được cấu hình xác thực đúng.');
            if (res.status === 403 && data.code === 'captcha_required') throw new Error('Xác minh bảo mật không được bật trên máy chủ. Hãy cấu hình TURNSTILE_SECRET_KEY trong Supabase.');
            if (res.status === 403 && data.code === 'captcha_failed') throw new Error('Xác minh bảo mật thất bại. Vui lòng thử lại.');
            if (res.status === 503 && data.code === 'captcha_required') throw new Error('Xác minh bảo mật chưa được cấu hình trên Supabase.');
            if (res.status === 403) throw new Error('Tên miền website chưa được cấp quyền gọi trợ lý AI (CORS).');
            if (res.status === 429 && data.error) throw new Error(data.error);
            throw new Error(data.error || 'Dịch vụ AI tạm thời gián đoạn (HTTP ' + res.status + ').');
          }
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        var reply = String(data.reply || '').trim() || fallbackText();
        history.push({ role: 'model', text: reply });
        saveHistory();
        addBubble('model', reply);
      })
      .catch(function (err) {
        typing.remove();
        if (historyAdded && history.length && history[history.length - 1].role === 'user' && history[history.length - 1].text === text) {
          history.pop();
          saveHistory();
        }
        var msg = err && err.name === 'AbortError'
          ? 'Phản hồi hơi lâu.'
          : (err && err.message && !/failed to fetch|networkerror|load failed/i.test(err.message)
            ? err.message
            : 'Không kết nối được với máy chủ AI. Có thể do CORS, mạng hoặc function chưa được triển khai.');
        addBubble('model', msg + ' ' + fallbackText(), true);
      })
      .then(function () {
        if (timer) window.clearTimeout(timer);
        resetTurnstile();
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }
})();
