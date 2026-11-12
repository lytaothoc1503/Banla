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
    if (req.method === "GET" && url.searchParams.get("action") === "providers") {
      return json({ success: true, paypal: true, onepay: true, ninepay: ninepayEnabled() }, 200, origin);
    }
    if (req.method === "GET" && url.searchParams.has("vpc_SecureHash")) return await finishOnePay(url.searchParams);
    if (req.method === "GET" && url.searchParams.get("flow") === "paypal-return") return await finishPayPal(url.searchParams.get("token") || "");
    if (req.method === "GET" && url.searchParams.get("flow") === "paypal-cancel") return redirectResult("cancel", "", 0);
    if (req.method === "GET" && url.searchParams.get("flow") === "ninepay-cancel") return redirectResult("cancel", "", 0);
    if (req.method === "GET" && url.searchParams.has("result") && url.searchParams.has("checksum")) {
      return await finishNinePay({ result: url.searchParams.get("result") || "", checksum: url.searchParams.get("checksum") || "" }, false);
    }
    if (req.method === "POST") {
      const type = req.headers.get("content-type") || "";
      if (type.includes("application/x-www-form-urlencoded")) {
        const form = await req.formData();
        return await finishNinePay({ result: String(form.get("result") || ""), checksum: String(form.get("checksum") || "") }, true);
      }
    }
    if (req.method !== "POST") return json({ success: false, message: "Phương thức không được hỗ trợ." }, 405, origin);
    const body = await readJson(req);
    if (containsForbidden(body)) return json({ success: false, message: "Banla không nhận số thẻ, ngày hết hạn hay mã CVV. Quý khách nhập thẻ trên trang PayPal, OnePay hoặc 9Pay." }, 400, origin);
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
    const ninepayHost = mode() === "live" ? "payment.9pay.vn" : "sand-payment.9pay.vn";
    const ninepayOk = host === ninepayHost && url.pathname === "/portal";
    const cardHost = ["www.paypal.com", "www.sandbox.paypal.com", "mtf.onepay.vn", "onepay.vn"].includes(host);
    return url.protocol === "https:" && (cardHost || ninepayOk);
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
  if (provider !== "paypal" && provider !== "onepay" && provider !== "ninepay") return { status: 400, body: { success: false, message: "Chọn PayPal, OnePay hoặc 9Pay. Thẻ được nhập trên trang của cổng thanh toán." } };
  if (provider === "ninepay" && !ninepayEnabled()) return { status: 403, body: { success: false, message: "Cổng 9Pay chưa được bật. Banla không nhận số thẻ trên website." } };
  const bookingId = String(body.bookingId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 34);
  if (!bookingId) return { status: 400, body: { success: false, message: "Thiếu mã đơn." } };
  const paymentOption = body.paymentOption === "pay_100" ? "pay_100" : "deposit_50";
  const amount = amountDue(String(body.roomName || body.room || ""), String(body.checkin || ""), String(body.checkout || ""), paymentOption);
  const paymentId = `p${Date.now().toString(36)}${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`;
  const redirect = provider === "paypal"
    ? await paypalRedirect(paymentId, bookingId, amount)
    : provider === "onepay"
    ? await onepayRedirect(paymentId, bookingId, amount)
    : await ninepayRedirect(paymentId, bookingId, amount);
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
function ninepayEnabled() {
  return /^(1|true|on|yes)$/i.test((Deno.env.get("NINEPAY_ENABLED") || "").trim());
}
function ninepayEnv(name: string) {
  const live = mode() === "live";
  return (Deno.env.get(live ? `NINEPAY_LIVE_${name}` : `NINEPAY_SANDBOX_${name}`) || "").trim();
}
function ninepayOrigin() {
  const live = mode() === "live";
  const fallback = live ? "https://payment.9pay.vn" : "https://sand-payment.9pay.vn";
  const raw = (Deno.env.get(live ? "NINEPAY_LIVE_URL" : "NINEPAY_SANDBOX_URL") || fallback).trim();
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed = live ? host === "payment.9pay.vn" : host === "sand-payment.9pay.vn";
  if (url.protocol !== "https:" || !allowed || url.username || url.password || (url.pathname && url.pathname !== "/")) {
    fail("Địa chỉ 9Pay không hợp lệ.", 503);
  }
  return url.origin;
}
function canonicalQuery(params: Record<string, string | number>) {
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value === undefined || value === null || value === "") continue;
    query.append(key, String(value));
  }
  return query.toString();
}
async function hmacBase64(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
function utf8ToBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
async function ninepayRedirect(paymentId: string, bookingId: string, amount: number) {
  if (amount < 10000 || amount > 100000000) fail("Số tiền hóa đơn không nằm trong hạn mức 9Pay (10.000–100.000.000 VND).", 409);
  const merchantKey = ninepayEnv("MERCHANT_KEY");
  const secretKey = ninepayEnv("SECRET_KEY");
  if (!merchantKey || !secretKey || !ninepayEnv("CHECKSUM_KEY")) fail("Cổng 9Pay chưa được cấu hình trên máy chủ. Banla không mở form nhập thẻ tại website.", 503);
  const endpoint = ninepayOrigin();
  const fn = functionUrl();
  const time = Math.floor(Date.now() / 1000);
  const params = {
    merchantKey,
    time,
    invoice_no: paymentId,
    amount,
    description: `Banla ${bookingId}`.slice(0, 255),
    return_url: `${fn}?flow=ninepay-return`,
    back_url: `${fn}?flow=ninepay-cancel`,
    currency: "VND",
    lang: "vi",
  };
  const message = `POST\n${endpoint}/payments/create\n${time}\n${canonicalQuery(params)}`;
  const signature = await hmacBase64(secretKey, message);
  const target = `${endpoint}/portal?${canonicalQuery({ baseEncode: utf8ToBase64(JSON.stringify(params)), signature })}`;
  if (!allowedGateway(target)) fail("Địa chỉ 9Pay không hợp lệ.", 502);
  return { providerOrderId: paymentId, redirectUrl: target };
}
function ninepayFields(text: string) {
  if (!text || text.length > 20000 || !text.includes('"invoice_no"')) return null;
  const invoiceNo = (text.match(/"invoice_no"\s*:\s*"([A-Za-z0-9]{1,40})"/) || [])[1] || "";
  const currency = ((text.match(/"currency"\s*:\s*"([A-Za-z]{3})"/) || [])[1] || "").toUpperCase();
  const statusRaw = (text.match(/"status"\s*:\s*"?(\d{1,3})"?/) || [])[1];
  const amount = Number((text.match(/"amount"\s*:\s*"?(\d{1,12})"?/) || [])[1] || "");
  const paymentNo = (text.match(/"payment_no"\s*:\s*"?(\d{1,24})"?/) || [])[1] || "";
  if (!invoiceNo || statusRaw === undefined) return null;
  return { invoiceNo, currency, status: Number(statusRaw), amount, paymentNo };
}
function decodeNinePayResult(result: string) {
  try {
    const normalized = result.replace(/-/g, "+").replace(/_/g, "/");
    const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const bin = atob(normalized + pad);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    return text.startsWith("{") ? ninepayFields(text) : null;
  } catch { return null; }
}
async function inquireNinePay(invoiceNo: string) {
  if (!/^[A-Za-z0-9]{1,30}$/.test(invoiceNo)) return null;
  const merchantKey = ninepayEnv("MERCHANT_KEY");
  const secretKey = ninepayEnv("SECRET_KEY");
  if (!merchantKey || !secretKey) return null;
  const endpoint = ninepayOrigin();
  const time = Math.floor(Date.now() / 1000);
  const uri = `${endpoint}/v2/payments/${invoiceNo}/inquire`;
  const signature = await hmacBase64(secretKey, `GET\n${uri}\n${time}`);
  const res = await fetch(uri, { method: "GET", redirect: "error", headers: { Date: String(time), Accept: "application/json", Authorization: `Signature Algorithm=HS256,Credential=${merchantKey},SignedHeaders=,Signature=${signature}` } });
  if (!res.ok) return null;
  return ninepayFields(await res.text());
}
async function finishNinePay(notice: { result: string; checksum: string }, ipn: boolean) {
  const invalid = () => ipn ? new Response("invalid", { status: 400 }) : redirectResult("failed", "", 0);
  const unconfigured = () => ipn ? new Response("unconfigured", { status: 503 }) : redirectResult("failed", "", 0);
  if (!ninepayEnabled()) return unconfigured();
  const checksumKey = ninepayEnv("CHECKSUM_KEY");
  if (!checksumKey) return unconfigured();
  const result = notice.result.trim();
  const checksum = notice.checksum.trim();
  if (!result || result.length > 12000 || !/^[0-9a-fA-F]{64}$/.test(checksum)) return invalid();
  let signed = "";
  const direct = await sha256Hex(result + checksumKey);
  if (direct === checksum.toUpperCase()) signed = result;
  else if (result.includes(" ")) {
    const plus = result.replace(/ /g, "+");
    if ((await sha256Hex(plus + checksumKey)) === checksum.toUpperCase()) signed = plus;
  }
  if (!signed) return invalid();
  const decoded = decodeNinePayResult(signed);
  const payment = decoded ? await loadPayment(decoded.invoiceNo) : null;
  if (!decoded || !payment || payment.provider !== "ninepay") return invalid();
  const reply = async (state: string) => ipn ? new Response("success") : redirectResult(state, payment.booking_id, Number(payment.amount) || 0);
  if (payment.status === "PAID") return reply("success");
  if (decoded.status === 5 && decoded.currency === "VND" && decoded.paymentNo && decoded.amount === Number(payment.amount)) {
    const marked = await markPaid(payment.id, decoded.paymentNo, decoded.amount, "VND");
    return marked.ok ? reply("success") : reply("mismatch");
  }
  if (decoded.status === 5) {
    await savePayment({ id: payment.id, status: "AMOUNT_MISMATCH" });
    return reply("mismatch");
  }
  if (decoded.status === 8) {
    await savePayment({ id: payment.id, status: "CANCELLED" });
    return reply("cancel");
  }
  if (decoded.status === 6 || decoded.status === 15) {
    await savePayment({ id: payment.id, status: "FAILED" });
    return reply("failed");
  }
  if (decoded.status === 2 || decoded.status === 4) {
    const inquired = await inquireNinePay(payment.id);
    if (inquired && inquired.status === 5 && inquired.invoiceNo === payment.id && inquired.currency === "VND" && inquired.amount === Number(payment.amount) && inquired.paymentNo) {
      const marked = await markPaid(payment.id, inquired.paymentNo, inquired.amount, "VND");
      return marked.ok ? reply("success") : reply("mismatch");
    }
  }
  return reply("pending");
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
