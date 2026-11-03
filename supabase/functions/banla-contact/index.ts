
const RECIPIENT = "Contact@banlaboutiquedalat.com";
const DEFAULT_ORIGINS = [
  "https://banlaboutiquedalat.com",
  "https://www.banlaboutiquedalat.com",
  "https://lytaothoc1503.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const configuredOrigins = (Deno.env.get("BANLA_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = configuredOrigins.length ? configuredOrigins : DEFAULT_ORIGINS;
const RATE_WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_PER_MINUTE = 3;
const MAX_PER_DAY = 12;
const MAX_TRACKED_IPS = 5_000;
const hits = new Map<string, number[]>();

function headersFor(origin: string): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
}

function json(data: Record<string, unknown>, status: number, origin: string): Response {
  const headers = headersFor(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength)
    : "";
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (!hits.has(ip) && hits.size >= MAX_TRACKED_IPS) {
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((time) => now - time < DAY_MS);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
    }
    if (!hits.has(ip) && hits.size >= MAX_TRACKED_IPS) return true;
  }

  const recent = (hits.get(ip) || []).filter((time) => now - time < DAY_MS);
  if (
    recent.filter((time) => now - time < RATE_WINDOW_MS).length >= MAX_PER_MINUTE ||
    recent.length >= MAX_PER_DAY
  ) return true;

  recent.push(now);
  hits.set(ip, recent);
  return false;
}

async function verifyTurnstile(token: string, origin: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret || !token || token.length > 2_048) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result?.success === true &&
      result?.action === "banla_contact" &&
      result?.hostname === new URL(origin).hostname;
  } catch (error) {
    console.error("Contact form Turnstile verification failed:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: "Origin không được phép." }, 403, ALLOWED_ORIGINS[0]);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headersFor(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "Phương thức không được hỗ trợ." }, 405, origin);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Content-Type phải là application/json." }, 415, origin);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 8_192) {
    return json({ error: "Nội dung gửi vượt quá giới hạn." }, 413, origin);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 8_192) {
      return json({ error: "Nội dung gửi vượt quá giới hạn." }, 413, origin);
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Dữ liệu gửi không hợp lệ." }, 400, origin);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Dữ liệu gửi không hợp lệ." }, 400, origin);
  }

  const name = clean(body.name, 100).replace(/[\r\n]+/g, " ");
  const email = clean(body.email, 254);
  const phone = clean(body.phone, 24);
  const checkin = clean(body.checkin, 10);
  const checkout = clean(body.checkout, 10);
  const room = clean(body.room, 100);
  const guestsRaw = clean(body.guests, 3);
  const note = clean(body.note, 1_000);
  if (name.length < 2) return json({ error: "Vui lòng nhập họ tên hợp lệ." }, 400, origin);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Vui lòng nhập email hợp lệ." }, 400, origin);
  }
  if (!/^[+0-9 ().-]{8,20}$/.test(phone)) {
    return json({ error: "Vui lòng nhập số điện thoại hợp lệ." }, 400, origin);
  }
  if ((checkin || checkout) && (!isValidDate(checkin) || !isValidDate(checkout) || checkout <= checkin)) {
    return json({ error: "Ngày trả phòng phải sau ngày nhận phòng." }, 400, origin);
  }

  let guests = "";
  if (guestsRaw) {
    const count = Number(guestsRaw);
    if (!Number.isInteger(count) || count < 1 || count > 20) {
      return json({ error: "Số khách phải từ 1 đến 20." }, 400, origin);
    }
    guests = String(count);
  }

  const ip = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  if (rateLimited(ip)) {
    return json({ error: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." }, 429, origin);
  }
  if (!(await verifyTurnstile(clean(body.turnstileToken, 2_048), origin, ip))) {
    return json({ error: "Xác minh bảo mật không thành công. Vui lòng tải lại trang và thử lại." }, 403, origin);
  }

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("BANLA_CONTACT_FROM");
  if (!apiKey || !from) {
    console.error("Contact email is not configured: RESEND_API_KEY or BANLA_CONTACT_FROM is missing.");
    return json({ error: "Kênh nhận yêu cầu đang được thiết lập. Vui lòng liên hệ Banla trực tiếp." }, 503, origin);
  }

  const emailText = [
    "Yêu cầu tư vấn/đặt phòng mới từ website Banla",
    "",
    `Họ tên: ${name}`,
    `Email: ${email}`,
    `Điện thoại: ${phone}`,
    `Ngày nhận phòng: ${checkin || "Chưa cung cấp"}`,
    `Ngày trả phòng: ${checkout || "Chưa cung cấp"}`,
    `Hạng phòng: ${room || "Cần tư vấn"}`,
    `Số khách: ${guests || "Chưa cung cấp"}`,
    "",
    "Ghi chú:",
    note || "Không có",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: email,
        subject: `Yêu cầu từ website Banla: ${name}`,
        text: emailText,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("Resend rejected contact email:", response.status);
      return json({ error: "Chưa gửi được yêu cầu tới Banla. Vui lòng thử lại sau." }, 502, origin);
    }
    return json({ success: true, message: "Banla đã nhận yêu cầu." }, 200, origin);
  } catch (error) {
    console.error("Contact email delivery failed:", error);
    return json({ error: "Dịch vụ email tạm thời gián đoạn. Vui lòng thử lại sau." }, 502, origin);
  } finally {
    clearTimeout(timeout);
  }
});
