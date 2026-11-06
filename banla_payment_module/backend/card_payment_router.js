/**
 * HTTP cho thanh toán thẻ: tạo phiên rồi chuyển khách sang PayPal hoặc OnePay.
 * Không có form nhập thẻ.
 */
const express = require('express');

const { logger } = require('../../utils/logger');
const payments = require('./card_payments');

const router = express.Router();

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || '';
}

function sendError(res, err) {
  if (err && err.isUserError) {
    return res.status(err.status || 400).json({ success: false, message: err.message });
  }
  logger.error('Thanh toán thẻ lỗi', err);
  return res.status(500).json({ success: false, message: 'Yêu cầu không hợp lệ hoặc đã xảy ra sự cố xử lý.' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function formatVnd(amount) {
  const digits = String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${digits} ₫`;
}

function page(title, message, bookingId) {
  const slip = bookingId
    ? `<p><a href="/phieu.html?ma=${encodeURIComponent(bookingId)}">Xem phiếu đặt phòng</a></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: Figtree, sans-serif; background: #111614; color: #e2e8f0; }
    main { max-width: 520px; margin: 10vh auto; padding: 28px; border: 1px solid rgba(212,175,55,.45); border-radius: 18px; }
    h1 { font-size: 1.35rem; color: #f5e5c9; }
    a { color: #d4af37; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${slip}
    <p><a href="/#contact">Về trang đặt phòng</a></p>
  </main>
</body>
</html>`;
}

function sendPage(res, result) {
  const payment = result && result.payment;
  const bookingId = payment && payment.bookingId;
  const amount = payment && payment.amount;
  let title = 'Thanh toán bằng thẻ';
  let message = 'Thanh toán chưa hoàn tất. Đơn chưa được thanh toán; bạn có thể thử lại.';
  if (result && result.outcome === 'paid' && payment) {
    title = 'Thanh toán thành công';
    message = `Thanh toán thành công. Cổng thanh toán đã xác nhận số tiền ${formatVnd(amount)} cho đơn ${bookingId}.`;
  } else if (result && result.outcome === 'cancel') {
    title = 'Đã hủy thanh toán';
    message = 'Bạn đã hủy thanh toán. Đơn chưa được thanh toán; bạn có thể thử lại.';
  } else if (result && result.outcome === 'mismatch') {
    title = 'Chưa xác nhận thanh toán';
    message = 'Số tiền hoặc loại tiền cổng thanh toán trả về không khớp hóa đơn. Đơn chưa được thanh toán.';
  } else if (result && result.outcome === 'already_settled') {
    title = 'Đơn đã được thanh toán';
    message = 'Đơn đã được thanh toán trước đó. Giao dịch thẻ này không được ghi thêm.';
  }
  res.set('Cache-Control', 'no-store');
  res.type('html').send(page(title, message, result && result.outcome === 'paid' ? bookingId : bookingId));
}

router.post('/card/checkout', async (req, res) => {
  try {
    if (payments.containsForbiddenCardField(req.body)) {
      return res.status(400).json({
        success: false,
        message: 'Banla không nhận số thẻ, ngày hết hạn hay mã CVV. Quý khách nhập thẻ trên trang PayPal hoặc OnePay.'
      });
    }
    const result = await payments.createCheckout({
      provider: req.body?.provider,
      bookingId: req.body?.bookingId || req.body?.orderId,
      clientIp: clientIp(req)
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return sendError(res, err);
  }
});

router.get('/paypal/return', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const result = await payments.settlePayPalReturn(token);
    return sendPage(res, result);
  } catch (err) {
    logger.error('PayPal return lỗi', err);
    return sendPage(res, { outcome: 'failed' });
  }
});

router.get('/paypal/cancel', async (req, res) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const result = await payments.cancelPayPal(token);
    return sendPage(res, result);
  } catch (err) {
    logger.error('PayPal cancel lỗi', err);
    return sendPage(res, { outcome: 'cancel' });
  }
});

router.post('/paypal/webhook', async (req, res) => {
  try {
    let event = req.body;
    if (Buffer.isBuffer(req.body)) {
      event = JSON.parse(req.body.toString('utf8') || '{}');
    }
    const result = await payments.settlePayPalWebhook(event, req.headers);
    return res.status(200).json({ success: true, outcome: result.outcome || 'ignored' });
  } catch (err) {
    return sendError(res, err);
  }
});

async function onepayIpn(req, res) {
  try {
    const source = req.method === 'POST'
      && req.body
      && typeof req.body === 'object'
      && !Buffer.isBuffer(req.body)
      && Object.keys(req.body).length
      ? req.body
      : req.query;
    const params = payments.readNotification(source);
    if (!params) return res.status(400).type('text/plain').send('responsecode=0&desc=invalid');
    const result = await payments.settleOnePay(params);
    if (result.outcome === 'invalid' || result.outcome === 'unconfigured') {
      const status = result.outcome === 'unconfigured' ? 503 : 400;
      return res.status(status).type('text/plain').send('responsecode=0&desc=invalid');
    }
    return res.status(200).type('text/plain').send('responsecode=1&desc=confirm-success');
  } catch (err) {
    logger.error('OnePay IPN lỗi', err);
    return res.status(500).type('text/plain').send('responsecode=0&desc=error');
  }
}

router.get('/onepay/return', async (req, res) => {
  try {
    const params = payments.readNotification(req.query);
    const result = params ? await payments.settleOnePay(params) : { outcome: 'invalid' };
    return sendPage(res, result);
  } catch (err) {
    logger.error('OnePay return lỗi', err);
    return sendPage(res, { outcome: 'failed' });
  }
});

router.get('/onepay/ipn', onepayIpn);
router.post('/onepay/ipn', onepayIpn);

module.exports = router;
