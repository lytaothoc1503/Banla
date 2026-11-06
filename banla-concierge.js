/* Banla × Gemini — Trợ lý lễ tân AI "Bàn Là". */
(function () {
  'use strict';

  var STORE_KEY = 'banla_concierge_history_v1';
  var MAX_HISTORY_MESSAGES = 20;
  var SUGGESTIONS = [
    'Phòng nào hợp cho 2 người lớn và 1 bé?',
    'Bảng giá 7 hạng phòng tại Banla?',
    'Giờ mở cửa và ưu đãi The Roof?',
    'Cách đặt cọc VietQR & nhận mã PIN Smart-Lock?',
    'Từ sân bay Liên Khương về khách sạn bao xa?'
  ];

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
  try {
    var savedHistory = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    if (Array.isArray(savedHistory)) {
      history = savedHistory.filter(function (message) {
        return message && (message.role === 'user' || message.role === 'model')
          && typeof message.text === 'string' && message.text.trim();
      }).map(function (message) {
        return { role: message.role, text: message.text.slice(0, 2000) };
      }).slice(-MAX_HISTORY_MESSAGES);
    }
  } catch (e) { history = []; }

  function saveHistory() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-MAX_HISTORY_MESSAGES))); } catch (e) { /* storage may be unavailable */ }
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
        '<textarea id="bcInput" class="bc-input" rows="1" maxlength="800" placeholder="Cứ hỏi tự nhiên về kỳ nghỉ của quý khách..."></textarea>' +
        '<button type="submit" class="bc-send" aria-label="Gửi câu hỏi">➤</button>' +
      '</form>' +
      '<p class="bc-note">Gemini tư vấn theo dữ liệu chính thức của Banla. Hội thoại có thể được lưu để hỗ trợ lễ tân; vui lòng không gửi thông tin cá nhân. Xác nhận phòng trống qua Hotline 0296.9996.999 - 0352554863.</p>' +
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
      b.addEventListener('click', function () { return ask(q); });
      chips.appendChild(b);
    });
  }

  function renderHistory() {
    log.innerHTML = '';
    addBubble('model', 'Xin chào quý khách! Quý khách có thể nhập câu hỏi theo cách tự nhiên; các gợi ý bên dưới chỉ để bắt đầu nhanh ạ.');
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); return ask(input.value); }
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    return ask(input.value);
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

  function requestGeminiReply(messages) {
    var endpoint = supabaseEndpoint();
    if (!endpoint) return Promise.reject(new Error('Gemini endpoint is not configured.'));

    var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
    var headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers.apikey = key;
      headers.Authorization = 'Bearer ' + key;
    }

    return tryFetchJson(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ mode: 'chat', messages: messages.slice(-MAX_HISTORY_MESSAGES) })
    }, 15000).then(function (data) {
      var reply = String(data && data.reply || '').trim();
      if (!reply) throw new Error('Gemini returned an empty reply.');
      return reply;
    });
  }

  function rememberCloud(question, reply) {
    var endpoint = supabaseEndpoint();
    if (!endpoint) return;

    var key = readConfig('BANLA_GEMINI_KEY') || readConfig('BANLA_SUPABASE_ANON_KEY');
    var headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers.apikey = key;
      headers.Authorization = 'Bearer ' + key;
    }

    tryFetchJson(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ mode: 'log', question: question, reply: reply })
    }, 2500).catch(function (error) {
      console.warn('Banla conversation memory could not be saved:', error.status || error.message);
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

    return requestGeminiReply(history)
      .then(function (reply) {
        typing.remove();
        history.push({ role: 'model', text: reply });
        saveHistory();
        addBubble('model', reply);
        rememberCloud(text, reply);
        return reply;
      })
      .catch(function (error) {
        typing.remove();
        addBubble('model', 'Bàn Là hiện chưa kết nối được với Gemini nên chưa thể trả lời câu hỏi này. Quý khách vui lòng thử gửi lại sau ít phút ạ.', true);
        console.error('Banla Gemini request failed:', error);
        return null;
      })
      .then(function (result) {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
        return result;
      });
  }

  window.BanlaConcierge = {
    ask: ask,
    rooms: null
  };
})();
