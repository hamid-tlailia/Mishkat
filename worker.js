/**
 * وسيط مِشْكاة — Cloudflare Worker
 * ────────────────────────────────
 * يحلّ مشكلة واحدة: كيف يجرّب الناسُ التطبيق مجانًا دون أن يرى أحدٌ مفتاحك.
 *
 * المفتاح يعيش هنا على الخادم، والتطبيق في المتصفح لا يعرفه إطلاقًا.
 * يستعمل الطبقة المجانية من Gemini، فلا فاتورة عليك ما دمت تحت الحصة اليومية.
 *
 * ═══ التركيب في خمس دقائق ═══
 *
 * 1) مفتاح مجاني من aistudio.google.com/apikey  (بلا بطاقة بنكية)
 * 2) في cloudflare.com → Workers → Create Worker → الصق هذا الملف
 * 3) Settings → Variables → Secret باسم GEMINI_KEY وقيمته مفتاحك
 * 4) Settings → Variables → أضف ALLOWED_ORIGIN وقيمته نطاق تطبيقك
 *    مثال: https://hamid.github.io    (ضع * أثناء التجربة فقط)
 * 5) انسخ عنوان الوركر وضعه في ثابت PROXY_URL داخل التطبيق
 *
 * ═══ الحصة المجانية ═══
 * gemini-2.5-flash: نحو ٢٥٠ طلبًا في اليوم و١٠ في الدقيقة، وتتجدد يوميًا.
 * إن تجاوزتها يردّ الوركر برسالة واضحة بدل أن ينكسر التطبيق.
 * الحدود تتغيّر، فراجعها في ai.google.dev/pricing قبل التوسّع.
 */

const MODEL = "gemini-2.5-flash";
const MAX_CHARS = 4000; // سقف طول الطلب، حماية من الإساءة
const RPM_PER_IP = 6; // أقصى عدد طلبات في الدقيقة للزائر الواحد

const buckets = new Map(); // عدّاد بسيط في الذاكرة

function throttle(ip) {
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, t: now };
  if (now - b.t > 60000) {
    b.n = 0;
    b.t = now;
  }
  b.n += 1;
  buckets.set(ip, b);
  if (buckets.size > 5000) buckets.clear();
  return b.n <= RPM_PER_IP;
}

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return json({ error: "الطريقة غير مدعومة" }, 405, cors);
    if (!env.GEMINI_KEY)
      return json({ error: "المفتاح غير مضبوط على الوركر." }, 500, cors);

    const ip = request.headers.get("cf-connecting-ip") || "anon";
    if (!throttle(ip))
      return json({ error: "أرسلت أسئلة كثيرة بسرعة. تمهّل دقيقة." }, 429, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "طلب غير صالح" }, 400, cors);
    }

    const { system, messages } = body;
    if (!Array.isArray(messages) || !messages.length)
      return json({ error: "لا يوجد سؤال" }, 400, cors);

    const size = messages.reduce((n, m) => n + String(m.content || "").length, 0);
    if (size > MAX_CHARS) return json({ error: "السؤال أطول من اللازم" }, 413, cors);

    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    }));

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}` +
      `:streamGenerateContent?alt=sse&key=${env.GEMINI_KEY}`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system || "" }] },
        contents,
        generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      const msg =
        upstream.status === 429
          ? "نفدت الحصة المجانية لهذا اليوم. جرّب غدًا."
          : "تعذّر الوصول إلى النموذج.";
      return json({ error: msg, status: upstream.status, detail: detail.slice(0, 300) }, 502, cors);
    }

    // تحويل تدفّق Gemini إلى تدفّق موحّد يفهمه التطبيق: data: {"t":"..."}
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        const reader = upstream.body.getReader();
        let buf = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });

            const lines = buf.split("\n");
            buf = lines.pop();

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload);
                const text =
                  obj.candidates?.[0]?.content?.parts
                    ?.map((p) => p.text || "")
                    .join("") || "";
                if (text) controller.enqueue(enc.encode(`data: ${JSON.stringify({ t: text })}\n\n`));
              } catch {
                /* جزء غير مكتمل، يُتجاهل */
              }
            }
          }
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
        } catch (e) {
          controller.enqueue(
            enc.encode(`data: ${JSON.stringify({ error: "انقطع التدفّق" })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}
