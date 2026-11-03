// Banla × Google AI Studio (Gemini API) — Supabase Edge Function proxy.
//
// Giữ GEMINI_API_KEY ở phía server (Supabase Secrets), KHÔNG bao giờ gửi xuống trình duyệt.
//
// Secrets cần đặt (supabase secrets set ...):
//   GEMINI_API_KEY        (bắt buộc) — key tạo tại https://aistudio.google.com/apikey
//   BANLA_ADMIN_TOKEN     (bắt buộc cho chế độ tạo nội dung/ảnh) — chuỗi bí mật dài, ngẫu nhiên
//   GEMINI_MODEL          (tuỳ chọn) — model văn bản, mặc định "gemini-flash-latest"
//   GEMINI_IMAGE_MODEL    (tuỳ chọn) — model tạo ảnh, mặc định "gemini-2.5-flash-image"
//   BANLA_ALLOWED_ORIGINS (tuỳ chọn) — danh sách origin, phân cách bằng dấu phẩy
//
// API:
//   POST { mode: "chat", messages: [{ role: "user"|"model", text: string }] }
//     -> { reply: string }                                (công khai, có giới hạn tần suất)
//   POST { mode: "content", task: "blog"|"room"|"social", prompt: string }
//     -> { text: string }                                 (cần header x-banla-admin)
//   POST { mode: "image", prompt: string }
//     -> { images: [{ mimeType, data(base64) }], text }   (cần header x-banla-admin)

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const TEXT_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest";
const IMAGE_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-2.5-flash-image";

const DEFAULT_ORIGINS = [
  "https://lytaothoc1503.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const ALLOWED_ORIGINS = (Deno.env.get("BANLA_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

const HOTEL_FACTS = `
THÔNG TIN CHÍNH THỨC — BANLA BOUTIQUE HOTEL ĐÀ LẠT
- Địa chỉ: 47 Nguyễn Đình Chiểu, Phường 9, TP. Đà Lạt. Cách Hồ Xuân Hương, Vườn Hoa Thành Phố, Chợ Đà Lạt khoảng 5–7 phút; cách sân bay Liên Khương ~30 km (~35 phút).
- Slogan: "Ngoài lạnh. Trong ấm." — tên Banla lấy cảm hứng từ chiếc bàn là đồng xưa ủi phẳng cái se lạnh phố núi.
- Hotline 24/7: 0296.9996.999 – 0352554863. Fanpage Facebook: https://www.facebook.com/profile.php?id=61550577645853
- Email: concact@banlaboutiquedalat.com · Instagram @banla.boutiquehotel · TikTok @banlaboutiquehotel
- Nhận phòng từ 14:00, trả phòng trước 12:00. Đổi lịch/nhận phòng sớm: báo trước tối thiểu 72 giờ.
- 7 hạng phòng (giá tham khảo/đêm):
  1. Élite Room (gác mái, trần gỗ, bồn tắm) — 30m², 2 NL + 1 trẻ — 1.250.000 ₫
  2. Banla Signature (tường xanh olive, trần gỗ) — 28m², 2 NL + 1 trẻ — 1.150.000 ₫
  3. Highland Room (trần gỗ cao, giường King) — 28m², 2 NL + 1 trẻ — 1.100.000 ₫
  4. Connecting Room (2 phòng thông nhau, gia đình) — 35m², 4 NL + 1–2 trẻ — 1.850.000 ₫
  5. Deluxe Twin (2 giường đơn) — 22m², 2–3 NL — 950.000 ₫
  6. Original Suite (rộng, bàn làm việc, khu tiếp khách) — 35m², 2 NL + 1 trẻ — 1.550.000 ₫
  7. Deluxe Balcony (ban công riêng hướng phố) — 20m², 2 NL + 1 trẻ — 980.000 ₫
- The Roof by Banla (tầng thượng): Café & trà 08:00–16:00; Cocktail & Wine Bar 16:00–00:00. Khách đặt trực tiếp giảm 15% đồ uống.
- Bữa sáng: phở, bánh mì xíu mại, món Á – Âu, cà phê rang xay.
- Ưu đãi: Đặt sớm trước 14 ngày giảm 10%; Long Stay từ 3 đêm: hỗ trợ nhận phòng sớm 12:00 (tuỳ phòng trống), tặng 02 đồ uống tại The Roof.
- Đặt phòng trên website: chọn Cọc 50% (phần còn lại trả khi check-in) hoặc Thanh toán 100% (giảm 10%). Thanh toán bằng VietQR, nội dung chuyển khoản BANLA_MÃĐƠN. Sau khi đối soát sẽ nhận Phiếu xác nhận có dấu đỏ và mã Smart-Lock PIN 6 số (hiệu lực từ giờ check-in đến check-out). Gửi biên lai qua Fanpage Facebook để đối soát nhanh.
- Hỗ trợ đặt xe đưa đón sân bay Liên Khương, limousine Đà Lạt – Nha Trang (135 km qua đèo Khánh Lê).
`.trim();

const CONCIERGE_PROMPT = `
Bạn là "Bàn Là" — trợ lý lễ tân AI của Banla Boutique Hotel Đà Lạt. Giọng văn ấm áp, lịch sự, ngắn gọn, xưng "Banla" và gọi khách là "quý khách" (trả lời bằng ngôn ngữ khách dùng).
Quy tắc:
- Chỉ dùng thông tin trong mục THÔNG TIN CHÍNH THỨC dưới đây. Không bịa giá, chính sách, tình trạng phòng trống hay khuyến mãi khác.
- Bạn KHÔNG xem được tình trạng phòng trống theo ngày và KHÔNG thể tự giữ phòng, nhận thanh toán, cấp mã PIN hay huỷ đơn. Khi khách muốn đặt, hướng dẫn điền biểu mẫu tại mục "#contact" trên trang hoặc gọi Hotline/nhắn Fanpage.
- Không yêu cầu khách gửi số thẻ, mật khẩu, mã OTP hay mã PIN trong khung chat.
- Gợi ý hạng phòng phù hợp theo số khách, ngân sách và nhu cầu (cặp đôi, gia đình, công tác).
- Câu hỏi ngoài phạm vi khách sạn và du lịch Đà Lạt: từ chối nhẹ nhàng và quay lại chủ đề lưu trú.
- Trả lời tối đa khoảng 120 từ, dùng gạch đầu dòng khi liệt kê.

${HOTEL_FACTS}
`.trim();

const CONTENT_PROMPTS: Record<string, string> = {
  blog: "Bạn là biên tập viên nội dung du lịch của Banla Boutique Hotel. Viết bài blog 'Cẩm nang' chuẩn SEO tiếng Việt: tiêu đề H1, sapo, các mục H2/H3, giọng ấm áp tinh tế, có lời kêu gọi đặt phòng trực tiếp ở cuối. Trả về Markdown.",
  room: "Bạn là copywriter của Banla Boutique Hotel. Viết mô tả hạng phòng ngắn gọn (60–90 từ), giàu cảm xúc nhưng chính xác theo dữ kiện, kèm 3 gạch đầu dòng tiện nghi nổi bật. Trả về Markdown.",
  social: "Bạn là người quản lý mạng xã hội của Banla Boutique Hotel. Viết 3 phương án caption Facebook/Instagram ngắn, có emoji vừa phải và 5 hashtag liên quan Đà Lạt. Trả về Markdown.",
};

// Giới hạn tần suất đơn giản theo IP (trong bộ nhớ của mỗi instance).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_CHAT = 12;
const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-banla-admin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean(text: unknown, max: number): string {
  return String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}

async function callGemini(model: string, payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY chưa được cấu hình trong Supabase Secrets.");
  const res = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Gemini API lỗi HTTP ${res.status}`;
    throw new Error(msg);
  }
  // deno-lint-ignore no-explicit-any
  const parts: Array<Record<string, any>> = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => typeof p.text === "string").map((p) => p.text).join("").trim();
  const images = parts
    .filter((p) => p.inlineData?.data)
    .map((p) => ({ mimeType: p.inlineData.mimeType || "image/png", data: p.inlineData.data }));
  return { text, images };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (origin && !ORIGINS.includes(origin)) return json({ error: "Origin không được phép" }, 403, origin);

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body JSON không hợp lệ" }, 400, origin);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const mode = clean(body.mode, 20);

  try {
    if (mode === "chat") {
      if (rateLimited(`chat:${ip}`, RATE_MAX_CHAT)) {
        return json({ error: "Quý khách gửi hơi nhanh, vui lòng thử lại sau ít phút." }, 429, origin);
      }
      const raw = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
      const contents = raw
        // deno-lint-ignore no-explicit-any
        .map((m: any) => ({
          role: m?.role === "model" ? "model" : "user",
          parts: [{ text: clean(m?.text, 800) }],
        }))
        // deno-lint-ignore no-explicit-any
        .filter((m: any) => m.parts[0].text);
      if (!contents.length || contents[contents.length - 1].role !== "user") {
        return json({ error: "Thiếu câu hỏi của khách" }, 400, origin);
      }
      const { text } = await callGemini(TEXT_MODEL, {
        systemInstruction: { parts: [{ text: CONCIERGE_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 600 },
      });
      return json({ reply: text || "Xin lỗi, Banla chưa trả lời được. Quý khách vui lòng gọi Hotline 0296.9996.999." }, 200, origin);
    }

    if (mode === "content" || mode === "image") {
      const adminToken = Deno.env.get("BANLA_ADMIN_TOKEN") || "";
      const provided = req.headers.get("x-banla-admin") || "";
      if (!safeEqual(provided, adminToken)) return json({ error: "Không có quyền quản trị" }, 401, origin);

      const prompt = clean(body.prompt, 4000);
      if (!prompt) return json({ error: "Thiếu nội dung yêu cầu" }, 400, origin);

      if (mode === "content") {
        const task = clean(body.task, 20);
        const sys = CONTENT_PROMPTS[task];
        if (!sys) return json({ error: "task phải là blog, room hoặc social" }, 400, origin);
        const { text } = await callGemini(TEXT_MODEL, {
          systemInstruction: { parts: [{ text: `${sys}\nChỉ dùng dữ kiện chính xác sau, không bịa giá hay chính sách:\n${HOTEL_FACTS}` }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        });
        return json({ text }, 200, origin);
      }

      const { text, images } = await callGemini(IMAGE_MODEL, {
        contents: [{
          role: "user",
          parts: [{ text: `Phong cách thương hiệu Banla Boutique Hotel Đà Lạt: ấm áp, gỗ trầm, ánh đèn vàng, sương phố núi, tông ember #B8612E và brass #D4A574. Yêu cầu: ${prompt}` }],
        }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      });
      return json({ images, text }, 200, origin);
    }

    return json({ error: "mode phải là chat, content hoặc image" }, 400, origin);
  } catch (err) {
    console.error("banla-gemini error:", err);
    return json({ error: "Dịch vụ AI tạm thời gián đoạn. Vui lòng thử lại sau." }, 502, origin);
  }
});
