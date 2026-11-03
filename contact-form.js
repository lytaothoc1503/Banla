(function () {
  'use strict';

  var form = document.querySelector('[data-contact-form]');
  if (!form) return;

  var submitButton = form.querySelector('button[type="submit"]');
  var status = form.querySelector('#contactFormStatus');
  var turnstileBox = form.querySelector('.contact-turnstile');
  var turnstileWidgetId = null;
  var turnstilePromise = null;
  var loadingPromise = null;

  function setStatus(message, isError) {
    if (!status) return;
    status.textContent = message;
    status.setAttribute('role', isError ? 'alert' : 'status');
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve();
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function () {
        if (window.turnstile) resolve();
        else {
          loadingPromise = null;
          reject(new Error('Không tải được bước xác minh bảo mật.'));
        }
      };
      script.onerror = function () {
        loadingPromise = null;
        reject(new Error('Không tải được bước xác minh bảo mật.'));
      };
      document.head.appendChild(script);
    });

    return loadingPromise;
  }

  function getTurnstileToken() {
    var siteKey = window.BANLA_TURNSTILE_SITE_KEY || '';
    if (!siteKey) {
      return Promise.reject(new Error('Website chưa cấu hình xác minh bảo mật. Vui lòng liên hệ Banla qua email hoặc điện thoại.'));
    }

    return loadTurnstile().then(function () {
      if (turnstileWidgetId === null) {
        turnstileWidgetId = window.turnstile.render(turnstileBox, {
          sitekey: siteKey,
          execution: 'execute',
          appearance: 'interaction-only',
          action: 'banla_contact',
          callback: function (token) {
            if (!turnstilePromise) return;
            turnstilePromise.resolve(token);
            turnstilePromise = null;
          },
          'error-callback': function () {
            if (!turnstilePromise) return;
            turnstilePromise.reject(new Error('Xác minh bảo mật gặp lỗi. Vui lòng thử lại.'));
            turnstilePromise = null;
          },
          'expired-callback': function () {
            if (!turnstilePromise) return;
            turnstilePromise.reject(new Error('Xác minh bảo mật đã hết hạn. Vui lòng thử lại.'));
            turnstilePromise = null;
          }
        });
      }

      return new Promise(function (resolve, reject) {
        var timer = window.setTimeout(function () {
          turnstilePromise = null;
          reject(new Error('Xác minh bảo mật quá thời gian. Vui lòng thử lại.'));
        }, 90000);

        turnstilePromise = {
          resolve: function (token) {
            window.clearTimeout(timer);
            resolve(token);
          },
          reject: function (error) {
            window.clearTimeout(timer);
            reject(error);
          }
        };

        try {
          window.turnstile.execute(turnstileWidgetId);
        } catch (error) {
          turnstilePromise = null;
          window.clearTimeout(timer);
          reject(error);
        }
      });
    });
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!form.reportValidity()) return;

    var data = new FormData(form);
    var endpoint = window.BANLA_CONTACT_ENDPOINT || '';
    var publishableKey = window.BANLA_GEMINI_KEY || '';
    if (!endpoint || !publishableKey) {
      setStatus('Kênh gửi yêu cầu chưa được cấu hình. Vui lòng liên hệ Banla qua email hoặc điện thoại.', true);
      return;
    }

    var originalLabel = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Đang gửi yêu cầu...';
    }
    setStatus('Đang xác minh và gửi yêu cầu...', false);

    var controller = null;
    var timeout = null;

    try {
      var turnstileToken = await getTurnstileToken();
      controller = new AbortController();
      timeout = window.setTimeout(function () { controller.abort(); }, 20000);
      var response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: publishableKey,
          Authorization: 'Bearer ' + publishableKey
        },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone'),
          checkin: data.get('checkin'),
          checkout: data.get('checkout'),
          room: data.get('room'),
          guests: data.get('guests'),
          note: data.get('note'),
          turnstileToken: turnstileToken
        }),
        signal: controller.signal
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        throw new Error(result.error || 'Chưa gửi được yêu cầu. Vui lòng thử lại hoặc liên hệ Banla trực tiếp.');
      }

      form.reset();
      setStatus('Banla đã nhận yêu cầu thành công và sẽ sớm liên hệ xác nhận.', false);
    } catch (error) {
      var message = error && error.name === 'AbortError'
        ? 'Gửi yêu cầu quá thời gian. Vui lòng thử lại hoặc liên hệ Banla trực tiếp.'
        : (error && error.message || 'Chưa gửi được yêu cầu. Vui lòng thử lại hoặc liên hệ Banla trực tiếp.');
      setStatus(message, true);
    } finally {
      if (timeout) window.clearTimeout(timeout);
      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalLabel;
      }
    }
  });
})();
