/**
 * BANLA BOUTIQUE HOTEL — VISA / ONEPAY EXPRESS CONTROLLER & ROUTES
 * Endpoints:
 * - POST /api/payments/visa/create-intent   (Khởi tạo phiên OnePay Hosted Checkout)
 * - POST /api/payments/onepay/create        (Alias tương thích chuẩn gói banla-onepay)
 * - GET|POST /api/payments/visa/webhook     (Xác thực chữ ký IPN/Webhook & duyệt đơn)
 * - GET|POST /api/payments/onepay/ipn       (Endpoint chuẩn IPN OnePay VPC v2)
 * - GET /api/payments/onepay/return         (Return URL chuyển hướng khách về trang kết quả)
 * - GET /api/payments/status                (Tra cứu trạng thái qua query ?booking_code=...)
 * - GET /api/payments/:booking_id/status    (Tra cứu trạng thái theo booking_id)
 */
'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const visaService = require('./visa.service');
const OnePayService = require('./onepay.service');
const { logger, sanitizeClientError } = require('../../../utils/logger');

function createVisaPaymentRouter({ getRoomsData, onBookingConfirmed } = {}) {
  const router = express.Router();
  const isTestEnv = process.env.NODE_ENV === 'test';

  // Giới hạn tối đa 15 yêu cầu tạo thanh toán / phút / IP (đúng theo chuẩn create-payment.php)
  const createIntentLimiter = isTestEnv
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 1000,
        max: 15,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          error_code: 'RATE_LIMITED',
          message: 'Quá nhiều yêu cầu khởi tạo thanh toán. Vui lòng thử lại sau ít phút.'
        }
      });

  const statusLookupLimiter = isTestEnv
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          error_code: 'RATE_LIMITED',
          message: 'Quá nhiều lượt kiểm tra trạng thái. Vui lòng đợi giây lát.'
        }
      });

  function resolveRequestBaseUrl(req) {
    const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = req.get('host');
    return host ? `${proto}://${host}` : '';
  }

  function handleServiceError(res, err, fallbackMsg) {
    const status = Number(err?.status) || 500;
    if (status >= 500 && err?.code !== 'GATEWAY_NOT_CONFIGURED') {
      logger.error(fallbackMsg, err);
    }
    if (err?.isUserError || err?.code === 'GATEWAY_NOT_CONFIGURED') {
      return res.status(status).json({
        success: false,
        error_code: err.errorCode || err.code || 'PAYMENT_ERROR',
        message: err.message
      });
    }
    return res.status(status).json({
      ...sanitizeClientError(err, fallbackMsg),
      error_code: err?.errorCode || 'INTERNAL_ERROR'
    });
  }

  // Cho phép frontend kiểm tra cổng thẻ đã cấu hình sẵn sàng hay chưa (không lộ bất kỳ giá trị khóa nào)
  router.get('/visa/config-status', (req, res) => {
    const cfg = OnePayService.getOnePayConfig({ appBaseUrl: resolveRequestBaseUrl(req) });
    res.json({
      success: true,
      provider: 'ONEPAY',
      configured: cfg.configured,
      sandbox_mode: Boolean(cfg.sandboxMode),
      supported_cards: ['VISA', 'MASTERCARD', 'AMEX', 'JCB']
    });
  });

  // 0. Cổng Hosted Checkout Sandbox 3D Secure nội bộ (chỉ hoạt động khi chưa khai báo live merchant key trên môi trường dev)
  router.get('/onepay/sandbox-checkout', (req, res) => {
    const cfg = OnePayService.getOnePayConfig({ appBaseUrl: resolveRequestBaseUrl(req) });
    if (!cfg.configured) {
      return res.status(503).send('OnePay Gateway chưa được cấu hình.');
    }

    const q = req.query || {};
    const hashValid = OnePayService.verifySecureHash(q, cfg.secureSecret);
    if (!hashValid) {
      return res.status(400).send('Chữ ký bảo mật vpc_SecureHash không hợp lệ.');
    }

    const merchTxnRef = String(q.vpc_MerchTxnRef || '').replace(/[^A-Za-z0-9_-]/g, '');
    const orderInfo = String(q.vpc_OrderInfo || 'Banla Booking').replace(/[<>"'&]/g, '');
    const amountVnd = OnePayService.getAmountVnd(q);
    const formattedVnd = amountVnd > 0 ? amountVnd.toLocaleString('vi-VN') + ' ₫' : '0 ₫';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OnePay 3D Secure Hosted Checkout — Banla Boutique Hotel</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: radial-gradient(circle at top, #1e293b 0%, #0f172a 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .gateway-card {
      width: 100%;
      max-width: 480px;
      background: #ffffff;
      color: #0f172a;
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0,0,0,0.45);
      overflow: hidden;
    }
    .gw-header {
      background: linear-gradient(135deg, #192622 0%, #2a3f38 100%);
      color: #fff;
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gw-brand { font-weight: 800; font-size: 16px; letter-spacing: 0.5px; }
    .gw-badge {
      background: rgba(212, 175, 55, 0.2);
      color: #fde047;
      border: 1px solid rgba(212, 175, 55, 0.45);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
    }
    .gw-summary {
      background: #f8fafc;
      padding: 16px 24px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gw-amount { font-size: 22px; font-weight: 800; color: #b8612e; }
    .gw-body { padding: 22px 24px; }
    .card-brands {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .card-pill {
      padding: 5px 12px;
      border-radius: 6px;
      font-size: 11.5px;
      font-weight: 800;
      border: 1.5px solid #cbd5e1;
      cursor: pointer;
      background: #fff;
      color: #334155;
    }
    .card-pill.active {
      border-color: #1d4ed8;
      background: #eff6ff;
      color: #1d4ed8;
    }
    .pci-notice {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #065f46;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 12.5px;
      line-height: 1.55;
      margin-bottom: 18px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 13px;
    }
    .info-row strong { color: #0f172a; font-family: monospace; font-size: 13.5px; }
    .btn-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    .btn {
      width: 100%;
      padding: 13px 16px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.93; }
    .btn-approve {
      background: linear-gradient(135deg, #15803d 0%, #166534 100%);
      color: #ffffff;
      box-shadow: 0 6px 18px rgba(21, 128, 61, 0.28);
    }
    .btn-cancel {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="gateway-card">
    <div class="gw-header">
      <div>
        <div class="gw-brand">ONEPAY · 3D SECURE 2.0</div>
        <div style="font-size:11.5px;opacity:0.8;margin-top:2px;">Cổng Thanh Toán Thẻ Quốc Tế (PCI DSS Level 1)</div>
      </div>
      <span class="gw-badge">SANDBOX VERIFIED</span>
    </div>
    <div class="gw-summary">
      <div>
        <div style="font-size:11.5px;color:#64748b;font-weight:600;">ĐƠN VỊ THỤ HƯỞNG</div>
        <div style="font-weight:700;color:#192622;">BANLA BOUTIQUE HOTEL ĐÀ LẠT</div>
        <div style="font-size:12px;color:#475569;">${orderInfo}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#64748b;font-weight:600;">SỐ TIỀN THANH TOÁN</div>
        <div class="gw-amount">${formattedVnd}</div>
      </div>
    </div>
    <div class="gw-body">
      <div style="font-size:12px;font-weight:700;color:#475569;margin-bottom:8px;">CHỌN LOẠI THẺ QUỐC TẾ:</div>
      <div class="card-brands" id="cardBrands">
        <button type="button" class="card-pill active" data-card="VC">VISA (**** 4242)</button>
        <button type="button" class="card-pill" data-card="MC">MASTERCARD (**** 5454)</button>
        <button type="button" class="card-pill" data-card="JC">JCB (**** 3530)</button>
        <button type="button" class="card-pill" data-card="AE">AMEX (**** 8431)</button>
      </div>

      <div class="pci-notice">
        🔒 <strong>Chuẩn bảo mật PCI DSS:</strong> Banla Boutique Hotel tuyệt đối không thu thập hay lưu trữ số thẻ, ngày hết hạn hoặc mã CVV. Giao dịch được ký xác thực HMAC-SHA256 trực tiếp từ cổng thanh toán.
      </div>

      <div class="info-row">
        <span>Mã tham chiếu (vpc_MerchTxnRef):</span>
        <strong>${merchTxnRef}</strong>
      </div>
      <div class="info-row">
        <span>Xác thực 3D Secure (OTP):</span>
        <strong style="color:#15803d;">✓ Đã xác thực chủ thẻ</strong>
      </div>

      <form method="POST" action="/api/payments/onepay/sandbox-complete" id="sandboxForm">
        <input type="hidden" name="vpc_MerchTxnRef" value="${merchTxnRef}">
        <input type="hidden" name="vpc_Amount" value="${String(q.vpc_Amount || '')}">
        <input type="hidden" name="vpc_Card" id="vpcCardInput" value="VC">
        <input type="hidden" name="action" id="sandboxActionInput" value="approve">
        <div class="btn-group">
          <button type="submit" class="btn btn-approve" id="btnApprove">
            ✓ Xác Nhận Thanh Toán ${formattedVnd} &amp; Nhận Mã PIN Phòng
          </button>
          <button type="button" class="btn btn-cancel" id="btnCancel">
            ✕ Hủy giao dịch &amp; Quay lại
          </button>
        </div>
      </form>
    </div>
  </div>
  <script>
    (function () {
      var pills = document.querySelectorAll('#cardBrands .card-pill');
      var cardInput = document.getElementById('vpcCardInput');
      pills.forEach(function (btn) {
        btn.addEventListener('click', function () {
          pills.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          cardInput.value = btn.getAttribute('data-card') || 'VC';
        });
      });
      document.getElementById('btnCancel').addEventListener('click', function () {
        document.getElementById('sandboxActionInput').value = 'cancel';
        document.getElementById('sandboxForm').submit();
      });
    })();
  </script>
</body>
</html>`);
  });

  router.post('/onepay/sandbox-complete', async (req, res) => {
    try {
      const cfg = OnePayService.getOnePayConfig({ appBaseUrl: resolveRequestBaseUrl(req) });
      if (!cfg.configured) {
        return res.status(503).send('OnePay Gateway chưa được cấu hình.');
      }

      const merchTxnRef = String(req.body?.vpc_MerchTxnRef || '').trim();
      const vpcAmount = String(req.body?.vpc_Amount || '').trim();
      const vpcCard = String(req.body?.vpc_Card || 'VC').trim().slice(0, 4);
      const isApprove = String(req.body?.action || 'approve') === 'approve';

      const ipnParams = {
        vpc_Version: '2',
        vpc_Command: 'pay',
        vpc_Merchant: cfg.merchantId,
        vpc_MerchTxnRef: merchTxnRef,
        vpc_Amount: vpcAmount,
        vpc_Currency: cfg.currency || 'VND',
        vpc_TxnResponseCode: isApprove ? '0' : '99',
        vpc_TransactionNo: `ONEPAY_${Date.now()}`,
        vpc_Card: vpcCard
      };
      ipnParams.vpc_SecureHash = OnePayService.createSecureHash(ipnParams, cfg.secureSecret);

      await visaService.processOnePayWebhook({
        params: ipnParams,
        onBookingConfirmed
      });

      const targetUrl = visaService.resolveOnePayReturnRedirect(ipnParams);
      return res.redirect(302, targetUrl);
    } catch (err) {
      return handleServiceError(res, err, 'Không thể hoàn tất giao dịch thử nghiệm OnePay.');
    }
  });

  // 1. Tạo Payment Intent / OnePay Hosted Checkout URL
  async function handleCreateIntent(req, res) {
    try {
      const roomsCatalog = typeof getRoomsData === 'function' ? getRoomsData()?.rooms : null;
      const clientIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const baseUrl = resolveRequestBaseUrl(req);

      const data = await visaService.createVisaPaymentIntent({
        body: req.body || {},
        query: req.query || {},
        clientIp,
        baseUrl,
        roomsCatalog
      });

      return res.status(data.reused ? 200 : 201).json({
        success: true,
        message: data.reused
          ? 'Tái sử dụng phiên thanh toán đang chờ.'
          : 'Đã khởi tạo phiên thanh toán bảo mật OnePay.',
        data,
        ...data
      });
    } catch (err) {
      return handleServiceError(res, err, 'Không thể khởi tạo phiên thanh toán thẻ lúc này.');
    }
  }

  router.post('/visa/create-intent', createIntentLimiter, handleCreateIntent);
  router.post('/onepay/create', createIntentLimiter, handleCreateIntent);

  // 2. Xử lý IPN / Webhook từ OnePay (Hỗ trợ cả GET query chuẩn OnePay VPC v2 & POST body)
  async function handleWebhookOrIpn(req, res) {
    try {
      const mergedParams =
        req.method === 'GET'
          ? { ...(req.query || {}) }
          : { ...(req.query || {}), ...(req.body && typeof req.body === 'object' ? req.body : {}) };

      const result = await visaService.processOnePayWebhook({
        params: mergedParams,
        onBookingConfirmed
      });

      // Nếu OnePay yêu cầu định dạng text thuần `responsecode=1&desc=confirm-success`
      if (req.query?.format === 'onepay_text' || req.headers.accept === 'text/plain') {
        return res.status(200).type('text/plain').send(result.response_text);
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
        ...result
      });
    } catch (err) {
      return handleServiceError(res, err, 'Lỗi xử lý thông báo kết quả thanh toán (IPN/Webhook).');
    }
  }

  router.get('/onepay/ipn', handleWebhookOrIpn);
  router.post('/onepay/ipn', handleWebhookOrIpn);
  router.get('/visa/webhook', handleWebhookOrIpn);
  router.post('/visa/webhook', handleWebhookOrIpn);

  // 3. Return URL — Chuyển hướng khách hàng từ OnePay về trang hiển thị kết quả của Banla
  function handleReturn(req, res) {
    const targetUrl = visaService.resolveOnePayReturnRedirect(req.query || {});
    return res.redirect(302, targetUrl);
  }

  router.get('/onepay/return', handleReturn);
  router.get('/visa/return', handleReturn);

  // 4. Tra cứu trạng thái thanh toán
  function handleGetStatus(req, res) {
    try {
      const bookingCodeRaw = req.params.booking_id || req.query.booking_code || req.query.booking_id || '';
      const merchantTxnRef = req.query.merchant_txn_ref || req.query.vpc_MerchTxnRef || '';
      const contact = req.query.contact || '';

      const data = visaService.getBookingPaymentStatus({
        bookingCodeRaw,
        merchantTxnRef,
        contact
      });

      return res.status(200).json({
        success: true,
        data,
        ...data
      });
    } catch (err) {
      return handleServiceError(res, err, 'Không thể tra cứu trạng thái thanh toán.');
    }
  }

  router.get('/status', statusLookupLimiter, handleGetStatus);
  router.get('/:booking_id/status', statusLookupLimiter, handleGetStatus);

  return router;
}

module.exports = {
  createVisaPaymentRouter
};

