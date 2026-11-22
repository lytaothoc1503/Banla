const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('Mã đơn phía khách dùng crypto.getRandomValues và dài ít nhất 8 ký tự', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  assert.match(src, /function generateBookingCode\(/);
  assert.doesNotMatch(src, /Math\.random\(\)\.toString\(36\)/);

  const start = src.indexOf('function generateBookingCode()');
  const end = src.indexOf('// 2. BOOKING FORMS');
  const context = { globalThis: { crypto } };
  vm.createContext(context);
  vm.runInContext(`${src.slice(start, end)}\nthis.code = generateBookingCode();`, context);
  assert.match(context.code, /^BL[A-Z2-9]{8}$/);
});
