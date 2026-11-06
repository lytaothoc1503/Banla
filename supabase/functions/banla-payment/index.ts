// Hosted card checkout. Card number, expiry, and CVV are never accepted or stored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SITE = (Deno.env.get("BANLA_SITE_URL") || "https://banlaboutiquedalat.com").replace(/\/+$/, "");
const ORIGINS = ["https://banlaboutiquedalat.com", "https://www.banlaboutiquedalat.com", "https://lytaothoc1503.github.io", "http://localhost:3000", "http://127.0.0.1:3000"];
const ROOMS: Record<string, number> = {
  "elite room": 1060000, "élite room": 1060000, "banla signature": 970000, "highland room": 880000,
  "connecting room": 1240000, "deluxe twin": 700000, "original suite": 1150000, "deluxe balcony": 790000,
};
const FORBIDDEN = /^(pan|cardnumber|card_number|card_no|cardnum|ccnumber|cvv|cvc|cid|expiry|expiration|exp_month|exp_year)$/i;

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("vpc_SecureHash")) return await finishOnePay(url.searchParams);
    if (req.method === "GET" && url.searchParams.get("flow") === "paypal-return") return await finishPayPal(url.searchParams.get("token") || "");
    if (req.method === "GET" && url.searchParams.get("flow") === "paypal-cancel") return redirectResult("cancel", "", 0);
    if (req.method !== "POST") return json({ success: false, message: "Phương thức không được hỗ trợ." }, 405, origin);
    const body = await readJson(req);
    if (containsForbidden(body)) return json({ success: false, message: "Banla không nhận số thẻ, ngày hết hạn hay mã CVV. Quý khách nhập thẻ trên trang PayPal hoặc OnePay." }, 400, origin);
    const action = String(body.action || "checkout");
    if (action === "admin-login") return json(await adminLogin(String(body.key || "")), 200, origin);
    if (action === "admin-payments") {
      if (!adminOk(req)) return json({ success: false, message: "Chỉ chủ cửa hàng được xem dữ liệu thanh toán." }, 401, origin);
      return json({ success: true, payments: await listPayments() }, 200, origin);
    }
    const result = await createCheckout(body);
    return json(result.body, result.status, origin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không mở được trang thanh toán.";
    const status = Number((err as { status?: number }).status) || 500;
    return json({ success: false, message }, status, origin);
  }
});

function cors(origin: string) {
  const allow = ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return { "Access-Control-Allow-Origin": allow, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
}
function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) } });
}
async function readJson(req: Request) { const text = await req.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return {}; } }
function containsForbidden(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key) || containsForbidden(child)) return true;
  }
  return false;
}
function fail(message: string, status: number): never {
  const err = new Error(message); (err as { status?: number }).status = status; throw err;
}
function amountDue(roomName: string, checkin: string, checkout: string, paymentOption: string) {
  const price = ROOMS[String(roomName || "").trim().toLowerCase()];
  if (!price) fail("Không tính được số tiền vì hạng phòng không khớp bảng giá Banla.", 422);
  let nights = 1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkin) && /^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    const diff = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000);
    if (diff >= 1 && diff <= 60) nights = diff;
  }
  const total = price * nights;
  return paymentOption === "pay_100" ? total - Math.round(total * 0.1) : Math.round(total * 0.5);
}
function mode() { return (Deno.env.get("CARD_PAYMENT_MODE") || "sandbox").toLowerCase() === "live" ? "live" : "sandbox"; }
function db() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}
function functionUrl() {
  const base = Deno.env.get("SUPABASE_URL") || "https://hcikbpvzbzottxoitujl.supabase.co";
  return `${base.replace(/\/+$/, "")}/functions/v1/banla-payment`;
}
function allowedGateway(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && ["www.paypal.com", "www.sandbox.paypal.com", "mtf.onepay.vn", "onepay.vn"].includes(host);
  } catch { return false; }
}
async function signOnePay(params: Record<string, string>, secret: string) {
  const keys = Object.keys(params).filter((key) => key.startsWith("vpc_") && key !== "vpc_SecureHash" && key !== "vpc_SecureHashType" && params[key]).sort();
  const data = keys.map((key) => `${key}=${params[key]}`).join("&");
  const raw = secret.trim();
  const keyBytes = /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0
    ? Uint8Array.from(raw.match(/../g)!.map((pair) => parseInt(pair, 16)))
    : new TextEncoder().encode(raw);
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function savePayment(row: Record<string, unknown>) {
  const client = db();
  if (client) await client.from("banla_card_payments").upsert({ ...row, updated_at: new Date().toISOString() });
}
async function loadPayment(id: string) {
  const client = db();
  if (!client) return null;
  const { data } = await client.from("banla_card_payments").select("id,booking_id,provider,provider_order_id,amount,currency,status").eq("id", id).maybeSingle();
  return data;
}
async function markPaid(paymentId: string, captureId: string, paidAmount: number, currency: string) {
  const current = await loadPayment(paymentId);
  if (!current) return { ok: false };
  if (current.status === "PAID") return { ok: true };
  if (Number(current.amount) !== paidAmount || String(current.currency) !== currency) {
    await savePayment({ id: paymentId, status: "AMOUNT_MISMATCH" });
    return { ok: false };
  }
  await savePayment({ id: paymentId, status: "PAID", provider_capture_id: captureId, paid_at: new Date().toISOString() });
  return { ok: true };
}
async function createCheckout(body: Record<string, unknown>) {
  const provider = String(body.provider || "").toLowerCase();
  if (provider !== "paypal" && provider !== "onepay") return { status: 400, body: { success: false, message: "Chọn PayPal hoặc OnePay. Thẻ được nhập trên trang của cổng thanh toán." } };
  const bookingId = String(body.bookingId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 34);
  if (!bookingId) return { status: 400, body: { success: false, message: "Thiếu mã đơn." } };
  const paymentOption = body.paymentOption === "pay_100" ? "pay_100" : "deposit_50";
  const amount = amountDue(String(body.roomName || body.room || ""), String(body.checkin || ""), String(body.checkout || ""), paymentOption);
  const paymentId = `p${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
  const redirect = provider === "paypal" ? await paypalRedirect(paymentId, bookingId, amount) : await onepayRedirect(paymentId, bookingId, amount);
  await savePayment({ id: paymentId, booking_id: bookingId, provider, provider_order_id: redirect.providerOrderId, amount, currency: "VND", status: "PENDING", room_name: String(body.roomName || body.room || "") });
  return { status: 201, body: { success: true, provider, redirectUrl: redirect.redirectUrl, amount, currency: "VND", bookingId, paymentId } };
}
async function paypalRedirect(paymentId: string, bookingId: string, amount: number) {
  const live = mode() === "live";
  const clientId = Deno.env.get(live ? "PAYPAL_LIVE_CLIENT_ID" : "PAYPAL_SANDBOX_CLIENT_ID") || "";
  const secret = Deno.env.get(live ? "PAYPAL_LIVE_CLIENT_SECRET" : "PAYPAL_SANDBOX_CLIENT_SECRET") || "";
  if (!clientId || !secret) fail("Cổng PayPal chưa được cấu hình trên máy chủ. Banla không mở form nhập thẻ tại website.", 503);
  const api = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const tokenRes = await fetch(`${api}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) fail("Không kết nối được PayPal. Quý khách thử OnePay.", 502);
  const fn = functionUrl();
  const orderRes = await fetch(`${api}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: paymentId, custom_id: bookingId, invoice_id: paymentId, description: `Banla ${bookingId}`, amount: { currency_code: "VND", value: String(amount) } }],
      payment_source: { paypal: { experience_context: { brand_name: "Banla Boutique Hotel", locale: "vi-VN", landing_page: "GUEST_CHECKOUT", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED", return_url: `${fn}?flow=paypal-return`, cancel_url: `${fn}?flow=paypal-cancel` } } },
    }),
  });
  const order = await orderRes.json();
  const link = (order.links || []).find((item: { rel?: string; href?: string }) => item.rel === "payer-action") || (order.links || []).find((item: { rel?: string; href?: string }) => item.rel === "approve");
  if (!orderRes.ok || !link?.href || !allowedGateway(link.href)) fail("PayPal không mở được trang nhập thẻ. Quý khách thử OnePay.", 502);
  return { providerOrderId: String(order.id), redirectUrl: link.href as string };
}
async function onepayRedirect(paymentId: string, bookingId: string, amount: number) {
  const live = mode() === "live";
  const merchant = Deno.env.get(live ? "ONEPAY_LIVE_MERCHANT" : "ONEPAY_SANDBOX_MERCHANT") || "";
  const access = Deno.env.get(live ? "ONEPAY_LIVE_ACCESS_CODE" : "ONEPAY_SANDBOX_ACCESS_CODE") || "";
  const hashKey = Deno.env.get(live ? "ONEPAY_LIVE_HASH_KEY" : "ONEPAY_SANDBOX_HASH_KEY") || "";
  if (!merchant || !access || !hashKey) fail("Cổng OnePay chưa được cấu hình trên máy chủ. Banla không mở form nhập thẻ tại website.", 503);
  const endpoint = live ? "https://onepay.vn/paygate/vpcpay.op" : "https://mtf.onepay.vn/paygate/vpcpay.op";
  const params: Record<string, string> = { vpc_Version: "2", vpc_Currency: "VND", vpc_Command: "pay", vpc_AccessCode: access, vpc_Merchant: merchant, vpc_Locale: "vn", vpc_ReturnURL: functionUrl(), vpc_MerchTxnRef: paymentId, vpc_OrderInfo: bookingId, vpc_Amount: `${amount}00`, vpc_TicketNo: "127.0.0.1", vpc_CardList: "INTERNATIONAL" };
  params.vpc_SecureHash = await signOnePay(params, hashKey);
  const target = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  return { providerOrderId: paymentId, redirectUrl: target.toString() };
}
async function finishOnePay(params: URLSearchParams, ipn = false) {
  const hashKey = Deno.env.get(mode() === "live" ? "ONEPAY_LIVE_HASH_KEY" : "ONEPAY_SANDBOX_HASH_KEY") || "";
  const received = Object.fromEntries(params.entries());
  if (!hashKey) return ipn ? new Response("responsecode=0&desc=invalid", { status: 503 }) : redirectResult("failed", "", 0);
  const expected = await signOnePay(received, hashKey);
  if (expected !== String(received.vpc_SecureHash || "").toUpperCase()) {
    return ipn ? new Response("responsecode=0&desc=invalid", { status: 400 }) : redirectResult("failed", "", 0);
  }
  const payment = await loadPayment(received.vpc_MerchTxnRef || "");
  if (!payment) return ipn ? new Response("responsecode=0&desc=invalid", { status: 400 }) : redirectResult("failed", "", 0);
  if (received.vpc_TxnResponseCode === "99") {
    await savePayment({ id: payment.id, status: "CANCELLED" });
    return ipn ? new Response("responsecode=1&desc=confirm-success") : redirectResult("cancel", payment.booking_id, payment.amount);
  }
  const major = String(received.vpc_Amount || "");
  const amount = major.endsWith("00") ? Number(major.slice(0, -2)) : NaN;
  if (received.vpc_TxnResponseCode === "0" && received.vpc_CurrencyCode === "VND" && received.vpc_TransactionNo) {
    const marked = await markPaid(payment.id, received.vpc_TransactionNo, amount, "VND");
    if (marked.ok) return ipn ? new Response("responsecode=1&desc=confirm-success") : redirectResult("success", payment.booking_id, payment.amount);
  }
  await savePayment({ id: payment.id, status: "AMOUNT_MISMATCH" });
  return ipn ? new Response("responsecode=1&desc=confirm-success") : redirectResult("mismatch", payment.booking_id, payment.amount);
}
async function finishPayPal(token: string) {
  if (!/^[A-Za-z0-9]+$/.test(token)) return redirectResult("failed", "", 0);
  const client = db();
  const found = client ? (await client.from("banla_card_payments").select("id,booking_id,amount,currency,status").eq("provider_order_id", token).maybeSingle()).data : null;
  if (!found) return redirectResult("failed", "", 0);
  if (found.status === "PAID") return redirectResult("success", found.booking_id, found.amount);
  const live = mode() === "live";
  const clientId = Deno.env.get(live ? "PAYPAL_LIVE_CLIENT_ID" : "PAYPAL_SANDBOX_CLIENT_ID") || "";
  const secret = Deno.env.get(live ? "PAYPAL_LIVE_CLIENT_SECRET" : "PAYPAL_SANDBOX_CLIENT_SECRET") || "";
  const api = live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const tokenRes = await fetch(`${api}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const tokenJson = await tokenRes.json();
  const res = await fetch(`${api}/v2/checkout/orders/${token}/capture`, { method: "POST", headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" } });
  const order = await res.json();
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  const value = Number(String(capture?.amount?.value || "").replace(/\.0+$/, ""));
  if (res.ok && capture?.status === "COMPLETED" && capture.amount?.currency_code === "VND") {
    const marked = await markPaid(found.id, capture.id, value, "VND");
    return marked.ok ? redirectResult("success", found.booking_id, found.amount) : redirectResult("mismatch", found.booking_id, found.amount);
  }
  return redirectResult("failed", found.booking_id, found.amount);
}
function redirectResult(state: string, bookingId: string, amount: number) {
  const target = new URL(`${SITE}/payment-result.html`);
  target.searchParams.set("state", state);
  if (bookingId) target.searchParams.set("order", bookingId);
  if (amount) target.searchParams.set("amount", String(amount));
  return Response.redirect(target.toString(), 302);
}
function adminOk(req: Request) {
  const given = req.headers.get("x-admin-key") || "";
  const expected = Deno.env.get("ADMIN_KEY") || "";
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
async function adminLogin(key: string) {
  const expected = Deno.env.get("ADMIN_KEY") || "";
  if (!key || !expected || key.length !== expected.length) return { success: false, message: "Mã quản trị không chính xác." };
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { success: true } : { success: false, message: "Mã quản trị không chính xác." };
}
async function listPayments() {
  const client = db();
  if (!client) return [];
  const { data } = await client.from("banla_card_payments").select("id,booking_id,provider,provider_order_id,provider_capture_id,amount,currency,status,room_name,created_at,paid_at").order("created_at", { ascending: false }).limit(100);
  return data || [];
}
