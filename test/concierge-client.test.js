const { test } = require('node:test');
const assert = require('node:assert/strict');

function createHarness(fetchImpl, initialStorage) {
  const storage = new Map(Object.entries(initialStorage || {}));
  const calls = [];
  const makeElement = () => {
    const listeners = {};
    const children = [];
    const element = {
      listeners,
      children,
      style: {},
      className: '',
      textContent: '',
      value: '',
      disabled: false,
      hidden: true,
      scrollTop: 0,
      scrollHeight: 0,
      setAttribute() {},
      addEventListener(type, callback) { listeners[type] = callback; },
      appendChild(child) {
        children.push(child);
        child.parentElement = element;
        element.childElementCount = children.length;
      },
      remove() {
        if (!element.parentElement) return;
        const siblings = element.parentElement.children;
        const index = siblings.indexOf(element);
        if (index >= 0) siblings.splice(index, 1);
        element.parentElement.childElementCount = siblings.length;
      },
      focus() {},
      querySelector() { return makeElement(); },
      querySelectorAll() { return []; },
      classList: { add() {}, remove() {} },
      childElementCount: 0
    };
    let html = '';
    Object.defineProperty(element, 'innerHTML', {
      get() { return html; },
      set(value) {
        html = value;
        if (value === '') {
          children.length = 0;
          element.childElementCount = 0;
        }
      }
    });
    return element;
  };

  const elements = {
    '.bc-launcher': makeElement(),
    '.bc-panel': makeElement(),
    '.bc-close': makeElement(),
    '.bc-log': makeElement(),
    '.bc-chips': makeElement(),
    '.bc-form': makeElement(),
    '.bc-input': makeElement(),
    '.bc-send': makeElement()
  };
  const root = makeElement();
  root.querySelector = (selector) => elements[selector];
  let createdRoot = false;

  global.window = {
    BANLA_GEMINI_ENDPOINT: 'https://gemini.example.test/functions/v1/banla-gemini',
    BANLA_GEMINI_KEY: 'public-test-key',
    setTimeout,
    clearTimeout
  };
  global.document = {
    body: { appendChild() {} },
    createElement() {
      if (!createdRoot) {
        createdRoot = true;
        return root;
      }
      return makeElement();
    },
    addEventListener() {}
  };
  global.sessionStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, value); }
  };
  global.localStorage = { getItem() { return null; } };
  global.fetch = (url, options) => {
    calls.push({ url, options });
    return fetchImpl(url, options);
  };
  delete require.cache[require.resolve('../banla-concierge.js')];
  require('../banla-concierge.js');

  return { api: window.BanlaConcierge, calls, elements, storage };
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body)
  });
}

test('typed questions use Gemini and include recent conversation context', async () => {
  const harness = createHarness(async () => jsonResponse({ reply: 'Gemini answer' }));

  harness.elements['.bc-input'].value = 'Tôi đi cùng gia đình, phòng nào phù hợp?';
  await harness.elements['.bc-form'].listeners.submit({ preventDefault() {} });
  harness.elements['.bc-input'].value = 'Còn giá phòng đó thế nào?';
  await harness.elements['.bc-input'].listeners.keydown({
    key: 'Enter',
    shiftKey: false,
    preventDefault() {}
  });

  const chatCalls = harness.calls.filter((call) => JSON.parse(call.options.body).mode === 'chat');
  const memoryCalls = harness.calls.filter((call) => JSON.parse(call.options.body).mode === 'log');
  assert.equal(chatCalls.length, 2);
  assert.equal(memoryCalls.length, 2);
  assert.ok(harness.calls.every((call) => call.url === 'https://gemini.example.test/functions/v1/banla-gemini'));
  const secondRequest = JSON.parse(chatCalls[1].options.body);
  assert.equal(secondRequest.mode, 'chat');
  assert.deepEqual(secondRequest.messages.slice(-3), [
    { role: 'user', text: 'Tôi đi cùng gia đình, phòng nào phù hợp?' },
    { role: 'model', text: 'Gemini answer' },
    { role: 'user', text: 'Còn giá phòng đó thế nào?' }
  ]);
  assert.equal(harness.api.replyLocal, undefined);
  assert.deepEqual(JSON.parse(harness.storage.get('banla_concierge_history_v1')), [
    ...secondRequest.messages,
    { role: 'model', text: 'Gemini answer' }
  ]);
  assert.deepEqual(JSON.parse(memoryCalls[1].options.body), {
    mode: 'log',
    question: 'Còn giá phòng đó thế nào?',
    reply: 'Gemini answer'
  });
});

test('Gemini failure is shown as an error and does not create a canned answer', async () => {
  const harness = createHarness(async () => jsonResponse({ error: 'unavailable' }, false, 502));
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await harness.api.ask('Câu hỏi tự gõ');
    assert.equal(result, null);
  } finally {
    console.error = originalError;
  }

  const saved = JSON.parse(harness.storage.get('banla_concierge_history_v1'));
  assert.deepEqual(saved, [{ role: 'user', text: 'Câu hỏi tự gõ' }]);
  const errorBubble = harness.elements['.bc-log'].children.find((element) => element.className.includes('bc-error'));
  assert.ok(errorBubble);
  assert.match(errorBubble.innerHTML, /chưa kết nối được với Gemini/);
});

test('original suggested questions are unchanged', () => {
  const harness = createHarness(async () => jsonResponse({ reply: 'Gemini answer' }));
  harness.elements['.bc-launcher'].listeners.click();

  assert.deepEqual(harness.elements['.bc-chips'].children.map((button) => button.textContent), [
    'Phòng nào hợp cho 2 người lớn và 1 bé?',
    'Bảng giá 7 hạng phòng tại Banla?',
    'Giờ mở cửa và ưu đãi The Roof?',
    'Cách đặt cọc VietQR & nhận mã PIN Smart-Lock?',
    'Từ sân bay Liên Khương về khách sạn bao xa?'
  ]);
});
