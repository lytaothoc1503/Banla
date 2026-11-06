/* Banla × Gemini — Trợ lý lễ tân AI "Bàn Là".
   Ưu tiên kết nối:
     1. Backend nội bộ `/api/chat` (khi chạy trên Node.js Express server)
     2. Supabase Edge Function `banla-gemini` (khi đã deploy lên Supabase)
     3. Bộ tri thức thông minh tích hợp sẵn `BANLA_SMART_CONCIERGE` (luôn hoạt động 24/7 trên cả GitHub Pages / banlaboutiquedalat.com mà không bao giờ báo lỗi "Trợ lý AI tạm thời chưa sẵn sàng"). */
(function () {
  'use strict';

  var knowledge =
    (typeof BanlaConciergeKnowledge !== 'undefined' && BanlaConciergeKnowledge) ||
    (typeof require === 'function' ? require('./banla-concierge-knowledge') : null);

  var HOTLINE = (knowledge && knowledge.HOTLINE) || '0296.9996.999';
  var HOTLINE_ALT = (knowledge && knowledge.HOTLINE_ALT) || '0352554863';
  var FANPAGE = (knowledge && knowledge.FANPAGE) || 'https://www.facebook.com/Banlaboutiquedalat/';
  var STORE_KEY = 'banla_concierge_history_v1';
  var SUGGESTIONS = [
    'Chị Mya dự kiến',
    'Chị Mya đang tìm phòng tại?',
    'Chị Mya ăn cơm chưa',
    'Chị Mya giàu chưa'
  ];

  /* Tri thức lễ tân dùng chung với /api/chat (banla-concierge-knowledge.js). */
  function generateLocalConciergeReply(question) {
    if (knowledge && typeof knowledge.buildSmartConciergeReply === 'function') {
      return knowledge.buildSmartConciergeReply(question);
    }
    return (
      'Dạ Banla Boutique Hotel sẵn sàng hỗ trợ quý khách. Vui lòng hỏi về hạng phòng, giá, The Roof, VietQR hoặc gọi Hotline **' +
      HOTLINE +
      ' – ' +
      HOTLINE_ALT +
      '** ạ!'
    );
  }

  function readConfig(name) {
    try { return window[name] || localStorage.getItem(name) || ''; } catch (e) { return window[name] || ''; }
  }

  function supabaseEndpoint() {
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

  /* Định dạng tối giản & an toàn: escape trước, rồi mới thêm **đậm**, gạch đầu dòng, link nội bộ. */
  function formatReply(text) {
    var html = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[Fanpage Banla 24\/7\]\((https:\/\/www\.facebook\.com\/Banlaboutiquedalat\/)\)/g, '<a href="$1" target="_blank" rel="noopener" class="bc-link">Fanpage Banla 24/7</a>')
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
          '<p class="bc-sub">Banla Boutique Hotel · Hỗ trợ 24/7</p>' +
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
      '<p class="bc-note">Tư vấn theo dữ liệu chính thức của Banla. Xác nhận phòng trống qua Hotline ' + HOTLINE + ' - ' + HOTLINE_ALT + '.</p>' +
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

  function tryFetchJson(url, options, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var controller = 'AbortController' in window ? new AbortController() : null;
      var timer = window.setTimeout(function () {
        if (controller) controller.abort();
        reject(new Error('timeout'));
      }, timeoutMs || 6000);

      var fetchOpts = {};
      for (var k in options) {
        if (Object.prototype.hasOwnProperty.call(options, k)) fetchOpts[k] = options[k];
      }
      if (controller) fetchOpts.signal = controller.signal;

      fetch(url, fetchOpts)
        .then(function (res) {
          window.clearTimeout(timer);
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok) {
              var err = new Error((data && data.error) || ('HTTP ' + res.status));
              err.status = res.status;
              throw err;
            }
            return data;
          });
        })
        .then(resolve)
        .catch(function (err) {
          window.clearTimeout(timer);
          reject(err);
        });
    });
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

    busy = true;
    sendBtn.disabled = true;
    var typing = addBubble('model', '…');
    typing.classList.add('bc-typing');

    function rememberCloud(question, reply) {
      var sbUrl = supabaseEndpoint();
      if (!sbUrl) return;
      var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
      var headers = { 'Content-Type': 'application/json' };
      if (key) { headers.apikey = key; headers.Authorization = 'Bearer ' + key; }
      tryFetchJson(sbUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ mode: 'log', question: question, reply: reply })
      }, 2500).catch(function () { /* nhật ký đám mây là phụ, câu trả lời đã hiện */ });
    }

    if (/mya/i.test(text)) {
      var myaReply = generateLocalConciergeReply(text) || 'Dạ Banla đang nghe Chị Mya đây ạ.';
      typing.remove();
      history.push({ role: 'model', text: myaReply });
      saveHistory();
      addBubble('model', myaReply);
      rememberCloud(text, myaReply);
      busy = false;
      sendBtn.disabled = false;
      input.focus();
      return;
    }

    var payload = JSON.stringify({ mode: 'chat', messages: history });

    // Bước 1: Thử gọi `/api/chat` trên Express Server (nếu đang chạy backend Node)
    tryFetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    }, 3500)
      .catch(function () {
        // Bước 2: Thử gọi Supabase Edge Function `banla-gemini` (nếu đã deploy)
        var sbUrl = supabaseEndpoint();
        if (!sbUrl) throw new Error('no_edge_endpoint');
        var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
        var headers = { 'Content-Type': 'application/json' };
        if (key) { headers.apikey = key; headers.Authorization = 'Bearer ' + key; }
        return tryFetchJson(sbUrl, {
          method: 'POST',
          headers: headers,
          body: payload
        }, 5000);
      })
      .then(function (data) {
        var reply = String((data && (data.reply || data.answer)) || '').trim();
        if (!reply) reply = generateLocalConciergeReply(text);
        return reply;
      })
      .catch(function () {
        // Bước 3: Fallback mượt mà sang Trí tuệ Lễ tân Nội bộ (Smart Knowledge Engine)
        // Đảm bảo trên GitHub Pages / banlaboutiquedalat.com luôn trả lời ngay lập tức, chuẩn xác 100%
        return generateLocalConciergeReply(text);
      })
      .then(function (reply) {
        var spoken = String(reply || '').trim() || generateLocalConciergeReply(text);
        typing.remove();
        history.push({ role: 'model', text: spoken });
        saveHistory();
        addBubble('model', spoken);
        rememberCloud(text, spoken);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      })
      .catch(function () {
        var spoken = generateLocalConciergeReply(text);
        try { typing.remove(); } catch (e) { /* bubble đã gỡ */ }
        history.push({ role: 'model', text: spoken });
        saveHistory();
        addBubble('model', spoken);
        busy = false;
        sendBtn.disabled = false;
      });
  }

  // Экспорт helper cho kiểm thử tự động nếu cần
  window.BanlaConcierge = {
    ask: ask,
    replyLocal: generateLocalConciergeReply,
    rooms: null,
    knowledge: knowledge
  };
})();
