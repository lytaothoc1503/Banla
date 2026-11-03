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
  var busy = false;

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
    return 'Trợ lý AI đang được kết nối. Quý khách vui lòng gọi **Hotline ' + HOTLINE + '** hoặc nhắn Fanpage Banla 24/7: ' + FANPAGE;
  }

  function ask(raw) {
    var text = String(raw || '').trim().slice(0, 800);
    if (!text || busy) return;
    input.value = '';
    input.style.height = 'auto';
    chips.innerHTML = '';
    history.push({ role: 'user', text: text });
    addBubble('user', text);
    saveHistory();

    var url = endpoint();
    if (!url) {
      history.pop();
      saveHistory();
      addBubble('model', fallbackText(), true);
      return;
    }

    busy = true;
    sendBtn.disabled = true;
    var typing = addBubble('model', '…');
    typing.classList.add('bc-typing');

    var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
    var headers = { 'Content-Type': 'application/json' };
    if (key) { headers.apikey = key; headers.Authorization = 'Bearer ' + key; }

    var controller = 'AbortController' in window ? new AbortController() : null;
    var timer = window.setTimeout(function () { if (controller) controller.abort(); }, 30000);

    fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ mode: 'chat', messages: history }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(res.status === 429 && data.error ? data.error : 'Trợ lý AI tạm thời chưa sẵn sàng.');
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
        history.pop();
        saveHistory();
        var msg = err && err.name === 'AbortError' ? 'Phản hồi hơi lâu.' : (err && err.message && err.message.indexOf('Failed to fetch') === -1 ? err.message : 'Trợ lý AI tạm thời chưa sẵn sàng.');
        addBubble('model', msg + ' ' + fallbackText(), true);
      })
      .then(function () {
        window.clearTimeout(timer);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }
})();
