import React, { useState, useRef, useEffect, useCallback } from "react";

/**
 * مِشْكاة — مساعد ذكاء اصطناعي للأسئلة الدينية
 *
 * ═══ الإعداد ═══
 * عنوان وركر كلاودفلير يُقرأ من ملف config.js بجوار index.html:
 *   window.MISHKAT = { proxy: "https://mishkat.xxx.workers.dev", hadithProxy: "" };
 * فيمكن تغييره بعد النشر دون إعادة بناء المشروع.
 * وإن كان فارغًا يتّصل التطبيق بـ Anthropic مباشرة (يعمل داخل Claude للتجربة فقط).
 */

const CFG = (typeof window !== "undefined" && window.MISHKAT) || {};

const PROXY_URL = CFG.proxy || "";

const QURAN_API = "https://api.alquran.cloud/v1/ayah";
const HADITH_API = "https://dorar.net/dorar_api.json?skey=";
const HADITH_PROXY = CFG.hadithProxy || ""; // وسيط اختياري لتخريج الأحاديث (حاجز CORS)

const K_CONVOS = "mishkat:conversations";
const K_PREFS = "mishkat:preferences";
const MAX_CONVOS = 40;

const SUGGESTIONS = [
  "ما حكم الجمع بين الصلاتين في السفر؟",
  "كيف أقضي الصيام الفائت بعذر؟",
  "ما آداب طلب العلم؟",
  "هل تجب الزكاة في ذهب الزينة؟",
];

const SYSTEM_PROMPT = `أنت "مِشْكاة"، مساعد متخصّص في الإجابة عن الأسئلة الدينية الإسلامية وحدها.

اكتب ردّك بهذا الترتيب الحرفي، ولا تستعمل markdown ولا JSON:

١) السطر الأول: [د] إن كان السؤال دينيًا، أو [خ] إن كان خارج النطاق.
٢) ثم الجواب نثرًا بالعربية الفصحى في ثلاث إلى خمس جمل، بلا عناوين ولا تعداد.
٣) ثم سطر فيه: ###
٤) ثم أسطر البيانات: كل سطر يبدأ بوسم، ويُفصل بين حقوله بشَرطة عمودية |

الأوسمة، سطر مستقلّ لكل عنصر:
@باب | تصنيف قصير
@آية | رقم السورة | رقم الآية | نص الآية | وجه الدلالة
@حديث | متن الحديث | عبارة قصيرة مميّزة من المتن للبحث | المصدر إن عرفته | وجه الدلالة
@قول | المذهب أو العالم | خلاصة قوله
@مرجع | اسم الكتاب أو الجهة | لماذا يُرجع إليه
@سؤال | سؤال متابعة

مثال لأسطر البيانات:
@باب | فقه الصيام
@آية | 2 | 185 | فَمَن كَانَ مِنكُم مَّرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِّنْ أَيَّامٍ أُخَرَ | الآية أصل في قضاء الصيام
@حديث | من مات وعليه صيام صام عنه وليه | من مات وعليه صيام | متفق عليه | القضاء يبقى في الذمة
@قول | الجمهور | لا يُشترط التتابع في القضاء
@مرجع | المغني لابن قدامة | باب قضاء رمضان
@سؤال | هل يجوز تأخير القضاء إلى رمضان التالي؟

قواعد صارمة:
١. كل جواب دينيّ لا بدّ أن يحوي دليلًا واحدًا على الأقل: @آية أو @حديث. وثلاثة أدلّة حدٌّ أقصى.
٢. اذكر رقم السورة والآية بدقّة، فسيُجلب نص الآية آليًا من المصحف ويُقارن بما كتبت.
٣. عبارة البحث في @حديث تُكتب حرفيًا كما في المتن، فسيُبحث بها في موسوعة الدرر السنية.
٤. لا تخترع مراجع. وإن لم تكن واثقًا من ثبوت حديث فاتركه واكتفِ بالآيات.
٥. لا تستعمل الشَّرطة العمودية | داخل نصّ الحقل نفسه، ولا تكتب سطر بيانات قبل ###.
٦. ابدأ أسطر البيانات مباشرة بعد ### ولا تكتب شيئًا آخر بعدها.
٧. إن كان السؤال غير ديني (برمجة، طبخ، سياسة، رياضة، ترفيه…) فابدأ بـ [خ] ثم سطر اعتذار واحد، ثم ### ولا شيء بعدها.
٨. إن كانت المسألة خلافية فاذكر أقوال المذاهب دون تعصّب، ولا تُفتِ في النوازل الشخصية بل وجّه إلى مفتٍ معتبر.
٩. اختم كل جواب دينيّ بثلاثة أسطر @سؤال تمامًا: أسئلة متابعة قصيرة تنشأ عن سؤال السائل وتفتح له الباب التالي في المسألة، لا تكرارًا لما أجبتَ عنه.`;

/* ═══════════ الثيمات والخطوط ═══════════ */

const THEMES = {
  mihrab: {
    label: "مِحراب",
    swatch: ["#04201F", "#C9A227"],
    v: {
      bg: "#04201F", bg2: "#0A3230", panel: "#062A28",
      surface: "rgba(255,255,255,.04)", surface2: "rgba(255,255,255,.075)",
      line: "rgba(201,162,39,.20)", hair: "rgba(255,255,255,.07)",
      text: "#E7E0CC", strong: "#F6F1E1", dim: "#9EAAA2",
      accent: "#C9A227", onAccent: "#04201F",
      ok: "#8FCFA8", warn: "#D4826A",
    },
  },
  makhtut: {
    label: "مخطوط",
    swatch: ["#E7DABB", "#9C3B2E"],
    v: {
      bg: "#E3D5B4", bg2: "#EFE6CD", panel: "#EDE3C8",
      surface: "rgba(94,64,40,.05)", surface2: "rgba(94,64,40,.10)",
      line: "rgba(122,58,44,.22)", hair: "rgba(46,35,24,.10)",
      text: "#332618", strong: "#1B140C", dim: "#7B6A51",
      accent: "#96382B", onAccent: "#F4ECD8",
      ok: "#3E6B49", warn: "#96382B",
    },
  },
  lazuward: {
    label: "لازورد",
    swatch: ["#0B1030", "#D8B85C"],
    v: {
      bg: "#0A0E2C", bg2: "#161E4E", panel: "#101740",
      surface: "rgba(255,255,255,.05)", surface2: "rgba(255,255,255,.09)",
      line: "rgba(160,175,255,.20)", hair: "rgba(255,255,255,.08)",
      text: "#DEE3FF", strong: "#F3F5FF", dim: "#939CC4",
      accent: "#D8B85C", onAccent: "#0A0E2C",
      ok: "#7FD1C0", warn: "#E08E7B",
    },
  },
  fahm: {
    label: "فحم",
    swatch: ["#131313", "#DFDFDF"],
    v: {
      bg: "#101010", bg2: "#1B1B1B", panel: "#161616",
      surface: "rgba(255,255,255,.045)", surface2: "rgba(255,255,255,.085)",
      line: "rgba(255,255,255,.13)", hair: "rgba(255,255,255,.07)",
      text: "#E4E4E4", strong: "#FFFFFF", dim: "#949494",
      accent: "#D6D6D6", onAccent: "#101010",
      ok: "#8FCFA8", warn: "#E0A08C",
    },
  },
};

const FONTS = {
  amiri: { label: "أميري", d: "'Reem Kufi'", q: "'Amiri'", b: "'IBM Plex Sans Arabic'" },
  naskh: { label: "نسخ", d: "'Noto Naskh Arabic'", q: "'Noto Naskh Arabic'", b: "'Noto Naskh Arabic'" },
  kufi: { label: "كوفي", d: "'Reem Kufi'", q: "'Reem Kufi'", b: "'Noto Kufi Arabic'" },
  asri: { label: "عصري", d: "'Cairo'", q: "'Cairo'", b: "'IBM Plex Sans Arabic'" },
};

const SIZES = { sm: { label: "صغير", v: 0.9 }, md: { label: "متوسط", v: 1 }, lg: { label: "كبير", v: 1.14 } };
const DEFAULT_PREFS = { theme: "mihrab", font: "amiri", size: "md" };

/* ═══════════ التخزين ═══════════ */

function readLocal(key) {
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function writeLocal(key, raw) {
  try {
    window.localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

/*
 * الكتابة تتم في المخزنين معًا (مخزن Claude والمتصفح) حتى لا يضيع السجلّ
 * إن تعذّر أحدهما، وتُصفّ الكتابات في طابور فلا تتسابق فتُفسد آخر نسخة.
 */
const queue = new Map();

const store = {
  async get(key) {
    if (typeof window === "undefined") return null;
    if (window.storage) {
      try {
        const r = await window.storage.get(key);
        if (r && r.value) return JSON.parse(r.value);
      } catch {
        /* المفتاح غير موجود أو تعذّر المخزن — نجرّب المتصفح */
      }
    }
    return readLocal(key);
  },
  set(key, value) {
    if (typeof window === "undefined") return Promise.resolve(false);
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch {
      return Promise.resolve(false);
    }

    writeLocal(key, raw);

    const prev = queue.get(key) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        if (window.storage) {
          try {
            await window.storage.set(key, raw);
          } catch {
            /* يبقى المحفوظ في المتصفح */
          }
        }
        return true;
      });
    queue.set(key, next);
    return next;
  },
};

/* ═══════════ الاتصال بالنموذج ═══════════ */

function typewrite(full, onDelta) {
  return new Promise((done) => {
    let i = 0;
    const step = () => {
      i = Math.min(full.length, i + 3);
      onDelta(full.slice(0, i));
      if (i < full.length) setTimeout(step, 11);
      else done();
    };
    step();
  });
}

async function readStream(res, onDelta) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  let failure = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (!p || p === "[DONE]") continue;

      let o = null;
      try {
        o = JSON.parse(p);
      } catch {
        continue;
      }
      if (o.error) {
        failure = typeof o.error === "string" ? o.error : "انقطع التدفّق";
        continue;
      }
      const t =
        o.t !== undefined
          ? o.t
          : o.type === "content_block_delta" && o.delta
          ? o.delta.text || ""
          : "";
      if (t) {
        full += t;
        onDelta(full);
      }
    }
  }
  if (failure && !full) throw new Error(failure);
  return full;
}

async function callModel(messages, onDelta) {
  const viaProxy = Boolean(PROXY_URL);
  const url = viaProxy ? PROXY_URL : "https://api.anthropic.com/v1/messages";
  const body = viaProxy
    ? { system: SYSTEM_PROMPT, messages }
    : {
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
      };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let msg = "تعذّر الوصول إلى النموذج.";
    try {
      const j = await res.json();
      if (j && j.error) msg = typeof j.error === "string" ? j.error : msg;
    } catch {
      /* لا شيء */
    }
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("event-stream") && res.body) return readStream(res, onDelta);

  // بلا تدفّق: نجلب الرد كاملًا ثم نكشفه حرفًا حرفًا
  const data = await res.json();
  const full = Array.isArray(data.content)
    ? data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n")
    : data.text || "";
  await typewrite(full, onDelta);
  return full;
}

/* يفصل الرد: العلامة، ثم النثر، ثم أسطر البيانات */
function splitReply(raw) {
  let rest = String(raw || "").trimStart();
  let religious = null;
  const mark = rest.match(/^\[\s*(د|خ)\s*\]/);
  if (mark) {
    religious = mark[1] === "د";
    rest = rest.slice(mark[0].length);
  }

  let cut = -1;
  let from = -1;
  const hash = rest.indexOf("###");
  if (hash !== -1) {
    cut = hash;
    from = hash + 3;
  } else {
    // إن نسي النموذج ### نقطع عند أول سطر بيانات
    const at = /(?:^|\n)[ \t]*@[\u0621-\u064A]/.exec(rest);
    if (at) {
      cut = at.index;
      from = at.index;
    }
  }
  if (cut === -1) return { religious, prose: rest.trim(), tail: "" };
  return { religious, prose: rest.slice(0, cut).trim(), tail: rest.slice(from) };
}

const EMPTY_DATA = () => ({
  topic: "",
  evidences: [],
  scholarlyViews: [],
  sources: [],
  followUps: [],
});

/* احتياط: نسخة قديمة من البروتوكول كانت ترسل JSON */
function parseJsonTail(tail) {
  const cleaned = String(tail).replace(/```json|```/g, "").trim();
  const s = cleaned.indexOf("{");
  const t = cleaned.lastIndexOf("}");
  if (s === -1 || t <= s) return EMPTY_DATA();
  try {
    return { ...EMPTY_DATA(), ...JSON.parse(cleaned.slice(s, t + 1)) };
  } catch {
    return EMPTY_DATA();
  }
}

/*
 * قراءة أسطر البيانات سطرًا سطرًا.
 * الميزة: لو انقطع الرد في منتصفه بقيت الأسطر المكتملة سليمة،
 * بخلاف JSON الذي يسقط كاملًا عند أول حرف ناقص.
 */
function parseTail(tail) {
  const data = EMPTY_DATA();
  let found = false;

  for (const rawLine of String(tail || "").split("\n")) {
    const line = rawLine.replace(/^[\s\-*>`•]+/, "").trim();
    if (!line.startsWith("@")) continue;

    const parts = line.slice(1).split("|").map((p) => p.trim());
    const tag = (parts.shift() || "").replace(/[:：]$/, "").trim();
    if (!tag) continue;

    if (tag === "باب") {
      if (parts[0]) data.topic = parts[0];
      found = true;
    } else if (tag === "آية" || tag === "اية") {
      const [surah, ayah, text, explanation] = parts;
      if (surah && ayah) {
        data.evidences.push({
          type: "قرآن",
          surah,
          ayah,
          text: text || "",
          explanation: explanation || "",
        });
        found = true;
      }
    } else if (tag === "حديث") {
      const [text, searchKey, reference, explanation] = parts;
      if (text) {
        data.evidences.push({
          type: "حديث",
          text,
          searchKey: searchKey || text,
          reference: reference || "",
          explanation: explanation || "",
        });
        found = true;
      }
    } else if (tag === "قول") {
      if (parts[0]) {
        data.scholarlyViews.push({ school: parts[0], view: parts[1] || "" });
        found = true;
      }
    } else if (tag === "مرجع") {
      if (parts[0]) {
        data.sources.push({ title: parts[0], note: parts[1] || "" });
        found = true;
      }
    } else if (tag === "سؤال") {
      if (parts[0]) {
        data.followUps.push(parts[0]);
        found = true;
      }
    }
  }

  if (!found) return parseJsonTail(tail);
  data.evidences = data.evidences.slice(0, 3);
  data.followUps = data.followUps.slice(0, 4);
  return data;
}

/* ═══════════ التحقق من الأدلة ═══════════ */

function normalizeAr(s = "") {
  return s
    .replace(/[\u064B-\u0652\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlap(a, b) {
  const wa = normalizeAr(a).split(" ").filter((w) => w.length > 1);
  const wb = new Set(normalizeAr(b).split(" "));
  if (!wa.length) return 0;
  return wa.filter((w) => wb.has(w)).length / wa.length;
}

async function verifyAyah(ev) {
  const s = parseInt(ev.surah, 10);
  const a = parseInt(ev.ayah, 10);
  if (!s || !a || s < 1 || s > 114) return { state: "fail", note: "لم يُذكر موضع الآية بدقة." };

  const res = await fetch(`${QURAN_API}/${s}:${a}/quran-uthmani`);
  const json = await res.json();
  if (json.code !== 200 || !json.data || !json.data.text)
    return { state: "fail", note: "تعذّر جلب الآية من المصحف." };

  const official = json.data.text;
  const place = `سورة ${json.data.surah.name} — الآية ${json.data.numberInSurah}`;
  if (!ev.text || overlap(ev.text, official) >= 0.55) return { state: "ok", text: official, place };
  return {
    state: "mismatch",
    text: official,
    place,
    note: "ما أورده النموذج لا يطابق هذا الموضع. المعروض أعلاه نصّ المصحف.",
  };
}

function stripTags(html = "") {
  const d = document.createElement("div");
  d.innerHTML = html;
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

const DORAR_LABELS = ["الراوي", "المحدث", "المصدر", "الصفحة أو الرقم", "خلاصة حكم المحدث", "التخريج"];

function parseDorar(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const matn = doc.querySelector(".hadith");
  const info = doc.querySelector(".hadith-info");
  if (!matn) return null;

  const fields = {};
  if (info) {
    const flat = stripTags(info.innerHTML);
    DORAR_LABELS.forEach((label) => {
      const others = DORAR_LABELS.filter((l) => l !== label).join("|");
      const m = flat.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:${others})\\s*:|$)`));
      if (m && m[1].trim()) fields[label] = m[1].trim();
    });
  }
  return { matn: stripTags(matn.innerHTML), fields };
}

async function verifyHadith(ev) {
  const key = (ev.searchKey || ev.text || "").slice(0, 90);
  if (!key.trim()) return { state: "fail", note: "لا توجد عبارة صالحة للبحث." };

  const direct = HADITH_API + encodeURIComponent(key);
  const res = await fetch(HADITH_PROXY ? HADITH_PROXY + encodeURIComponent(direct) : direct);
  const json = await res.json();
  const html = json && json.ahadith && json.ahadith.result;
  if (!html) return { state: "fail", note: "لم تُرجع الموسوعة نتيجة لهذه العبارة." };

  const parsed = parseDorar(html);
  if (!parsed) return { state: "fail", note: "لم يُعثر على الحديث في موسوعة الدرر السنية." };

  const grade = parsed.fields["خلاصة حكم المحدث"] || "";
  const weak = /ضعيف|موضوع|منكر|لا يصح|باطل/.test(grade);

  return {
    state: weak ? "mismatch" : "ok",
    text: parsed.matn,
    place: [parsed.fields["المحدث"], parsed.fields["المصدر"], parsed.fields["الصفحة أو الرقم"]]
      .filter(Boolean)
      .join(" — "),
    grade,
    narrator: parsed.fields["الراوي"],
    note: weak ? "حكم المحدّث يقتضي التوقّف؛ راجعه قبل الاستدلال به." : "",
  };
}

async function verifyEvidence(ev) {
  try {
    if (ev.type === "قرآن") return await verifyAyah(ev);
    if (ev.type === "حديث") return await verifyHadith(ev);
    return { state: "skip", note: "" };
  } catch {
    return { state: "fail", note: "تعذّر الوصول إلى مصدر التحقق من المتصفح." };
  }
}

/* ═══════════ التنسيق ═══════════ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@300;400;600&family=IBM+Plex+Sans+Arabic:wght@300;400;500&family=Noto+Kufi+Arabic:wght@300;400;500&family=Noto+Naskh+Arabic:wght@400;600&family=Reem+Kufi:wght@400;500;600&display=swap');

.mk{
  height:100dvh;display:flex;flex-direction:column;direction:rtl;position:relative;overflow:hidden;
  background:var(--bg);color:var(--text);
  font-family:var(--fb),system-ui,sans-serif;font-size:calc(15px * var(--fs));
}
.mk *{box-sizing:border-box;}
.mk button{font-family:inherit;cursor:pointer;}
.mk button:focus-visible,.mk input:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.mk textarea{outline:none !important;box-shadow:none !important;}
.mk textarea:focus,.mk textarea:focus-visible{outline:none !important;border:none;}

/* ——— الشريط العلوي ——— */
.mk-bar{
  display:flex;align-items:center;gap:8px;padding:11px 15px;flex:0 0 auto;z-index:5;
  border-bottom:1px solid var(--hair);background:var(--panel);
}
.mk-brand{display:flex;align-items:baseline;gap:9px;flex:1;min-width:0;}
.mk-brand h1{font-family:var(--fd);font-size:calc(18px*var(--fs));font-weight:600;margin:0;color:var(--strong);}
.mk-brand h1 i{font-style:normal;color:var(--accent);}
.mk-brand small{
  font-size:calc(10px*var(--fs));color:var(--dim);letter-spacing:.06em;opacity:.75;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.mk-ico{
  width:34px;height:34px;flex:0 0 auto;display:grid;place-items:center;border-radius:4px;
  background:transparent;border:1px solid transparent;color:var(--dim);font-size:15px;
  transition:color .15s,background .15s;
}
.mk-ico:hover{color:var(--accent);background:var(--surface2);}

/* ——— المحادثة ——— */
.mk-scroll{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;}
.mk-thread{max-width:740px;margin:0 auto;padding:20px 18px 10px;}

/* ——— شاشة البداية ——— */
.mk-hello{
  min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px 20px;text-align:center;
}
.mk-arch{width:min(230px,62vw);height:auto;display:block;margin:0 auto;}
.mk-arch .frame{fill:none;stroke:var(--line);stroke-width:1.1;}
.mk-arch .star{fill:none;stroke:var(--accent);stroke-width:1.5;}
.mk-arch .star .halo{opacity:.3;}
.mk-hello h2{
  font-family:var(--fq);font-size:calc(26px*var(--fs));font-weight:400;
  margin:22px 0 10px;color:var(--strong);letter-spacing:.01em;
}
.mk-hello > p{color:var(--dim);font-size:calc(13.5px*var(--fs));line-height:2;margin:0;font-weight:300;max-width:34ch;}
.mk-chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:26px;max-width:440px;}
.mk-chip{
  background:var(--surface);border:1px solid var(--hair);color:var(--dim);border-radius:999px;
  padding:8px 15px;font-size:calc(12.5px*var(--fs));transition:all .16s;
}
.mk-chip:hover{color:var(--strong);border-color:var(--accent);}

/* ——— السؤال ——— */
.mk-q{
  margin:0 0 15px;padding:11px 15px;border-radius:4px;border-right:2px solid var(--accent);
  background:var(--surface2);font-family:var(--fq);font-size:calc(17.5px*var(--fs));
  line-height:1.85;color:var(--strong);
}

/* ——— النثر المتدفّق ——— */
.mk-flow{
  font-family:var(--fq);font-size:calc(20px*var(--fs));line-height:2.05;
  color:var(--strong);margin:0;white-space:pre-wrap;
}
.mk-caret{
  display:inline-block;width:2px;height:.95em;background:var(--accent);
  vertical-align:-2px;margin-right:3px;animation:blink 1s step-end infinite;
}
@keyframes blink{50%{opacity:0;}}

/* ——— البطاقات ——— */
.mk-card{
  background:var(--surface);border:1px solid var(--hair);border-radius:4px;
  padding:18px;margin-bottom:12px;animation:rise .4s cubic-bezier(.2,.7,.3,1) both;
}
@keyframes rise{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
.mk-eb{
  font-family:var(--fd);font-size:calc(10.5px*var(--fs));font-weight:500;letter-spacing:.13em;
  color:var(--accent);margin:0 0 13px;display:flex;align-items:center;gap:9px;
}
.mk-eb::after{content:"";flex:1;height:1px;background:var(--line);opacity:.6;}
.mk-eb em{font-style:normal;color:var(--dim);letter-spacing:0;font-size:calc(10.5px*var(--fs));}

/* ——— الأدلة ——— */
.mk-ev{border-right:2px solid var(--hair);padding:2px 14px 2px 0;margin-bottom:21px;}
.mk-ev:last-of-type{margin-bottom:0;}
.mk-ev.ok{border-right-color:var(--ok);}
.mk-ev.mismatch,.mk-ev.fail{border-right-color:var(--warn);}
.mk-evh{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:10px;}
.mk-tag{
  font-family:var(--fd);font-size:calc(10px*var(--fs));letter-spacing:.08em;padding:3px 9px;
  border-radius:3px;background:var(--surface2);color:var(--accent);
}
.mk-badge{font-size:calc(10.5px*var(--fs));padding:3px 9px;border-radius:3px;display:inline-flex;align-items:center;gap:5px;background:var(--surface2);}
.mk-badge.pending{color:var(--dim);}
.mk-badge.ok{color:var(--ok);}
.mk-badge.mismatch,.mk-badge.fail{color:var(--warn);}
.mk-badge.skip{color:var(--dim);}
.mk-dot{width:5px;height:5px;border-radius:50%;background:currentColor;}
.mk-badge.pending .mk-dot{animation:pulse 1.1s ease-in-out infinite;}
@keyframes pulse{50%{opacity:.2;}}
.mk-quote{font-family:var(--fq);font-size:calc(19px*var(--fs));line-height:2.05;margin:0;color:var(--strong);}
.mk-ref{font-size:calc(11.5px*var(--fs));color:var(--accent);margin:9px 0 0;font-family:var(--fd);line-height:1.85;}
.mk-why{font-size:calc(13px*var(--fs));color:var(--dim);margin:7px 0 0;line-height:1.95;font-weight:300;}
.mk-flag{
  font-size:calc(12.5px*var(--fs));line-height:1.85;color:var(--warn);margin:9px 0 0;
  font-weight:300;background:var(--surface2);padding:8px 11px;border-radius:3px;
}
.mk-attrib{
  font-size:calc(10.5px*var(--fs));color:var(--dim);margin:16px 0 0;padding-top:12px;
  border-top:1px solid var(--hair);font-weight:300;line-height:1.95;opacity:.8;
}

.mk-view{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--hair);}
.mk-view:last-child{border-bottom:none;}
.mk-school{flex:0 0 84px;font-family:var(--fd);font-size:calc(12.5px*var(--fs));color:var(--accent);}
.mk-view p{margin:0;font-size:calc(14px*var(--fs));line-height:1.95;font-weight:300;opacity:.92;}

.mk-src{padding:10px 0;border-bottom:1px solid var(--hair);}
.mk-src:last-child{border-bottom:none;}
.mk-src b{font-family:var(--fq);font-size:calc(16px*var(--fs));color:var(--strong);font-weight:700;}
.mk-src span{display:block;font-size:calc(12.5px*var(--fs));color:var(--dim);margin-top:3px;font-weight:300;}

.mk-next button{
  display:flex;align-items:center;gap:10px;width:100%;text-align:right;background:none;border:none;
  border-bottom:1px solid var(--hair);color:var(--text);padding:12px 0;
  font-size:calc(14px*var(--fs));line-height:1.8;transition:color .16s,padding .16s;opacity:.92;
}
.mk-next button span{flex:1;}
.mk-next button i{font-style:normal;color:var(--accent);opacity:.55;font-size:13px;transition:transform .16s,opacity .16s;}
.mk-next button:last-child{border-bottom:none;}
.mk-next button:hover{color:var(--accent);padding-right:6px;}
.mk-next button:hover i{opacity:1;transform:translateX(-3px);}

.mk-note{
  border-right:2px solid var(--warn);padding:2px 13px 2px 0;font-size:calc(12px*var(--fs));
  line-height:1.95;color:var(--warn);font-weight:300;margin:16px 0 6px;opacity:.8;
}
.mk-refuse{text-align:center;padding:32px 20px;border:1px dashed var(--line);border-radius:4px;margin-bottom:12px;}
.mk-refuse h3{font-family:var(--fq);font-size:calc(20px*var(--fs));margin:0 0 9px;color:var(--strong);font-weight:400;}
.mk-refuse p{color:var(--dim);font-size:calc(13.5px*var(--fs));line-height:2;margin:0;font-weight:300;}

.mk-wait{display:flex;align-items:center;gap:11px;color:var(--dim);font-size:calc(13px*var(--fs));padding:8px 0 4px;}
.mk-spin{width:20px;height:20px;animation:spin 7s linear infinite;flex:0 0 auto;}
@keyframes spin{to{transform:rotate(360deg);}}

/* ——— الإدخال ——— */
.mk-dock{
  flex:0 0 auto;position:relative;border-top:1px solid var(--hair);background:var(--panel);
  padding:12px 16px calc(10px + env(safe-area-inset-bottom));
}
.mk-composer{
  max-width:740px;margin:0 auto;display:flex;align-items:center;gap:6px;
  background:var(--surface);border:1px solid var(--hair);border-radius:22px;
  padding:4px 4px 4px 4px;transition:border-color .18s;
}
.mk-composer:focus-within{border-color:var(--line);}
.mk-input{
  flex:1 1 auto;min-width:0;background:none;border:none;resize:none;color:var(--text);
  caret-color:var(--accent);text-align:right;
  font-family:var(--fq);font-size:calc(16.5px*var(--fs));line-height:1.75;
  padding:9px 12px;max-height:124px;
}
.mk-input::placeholder{color:var(--dim);opacity:.65;}

/* زر الإرسال داخل الصندوق، على منتصف محوره تمامًا */
.mk-send{
  width:38px;height:38px;flex:0 0 auto;align-self:center;
  border:1px solid transparent;border-radius:50%;background:var(--accent);
  color:var(--onAccent);font-size:16px;display:grid;place-items:center;
  transition:opacity .16s,filter .16s;
}
.mk-send:hover:not(:disabled){filter:brightness(1.12);}
.mk-send:disabled{opacity:.28;cursor:not-allowed;}
.mk-send.busy{background:none;border-color:var(--line);opacity:1;}
.mk-hint{max-width:740px;margin:9px auto 0;font-size:calc(10.5px*var(--fs));color:var(--dim);opacity:.6;text-align:center;}

/* عودة إلى آخر الجواب بعد التمرير لأعلى */
.mk-down{
  position:absolute;top:-46px;left:50%;transform:translateX(-50%);
  width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  background:var(--panel);border:1px solid var(--line);color:var(--accent);
  font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:5;
  animation:rise .2s both;
}
.mk-down:hover{background:var(--surface2);}

/* ——— اللوحات ——— */
.mk-veil{position:absolute;inset:0;background:rgba(0,0,0,.5);z-index:20;animation:fade .2s both;}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.mk-panel{
  position:absolute;top:0;bottom:0;right:0;width:min(320px,86vw);z-index:21;
  background:var(--panel);border-left:1px solid var(--hair);display:flex;flex-direction:column;
  animation:slide .25s cubic-bezier(.2,.7,.3,1) both;
}
@keyframes slide{from{transform:translateX(100%);}to{transform:none;}}
.mk-ph{display:flex;align-items:center;gap:10px;padding:13px 15px;border-bottom:1px solid var(--hair);}
.mk-ph h3{margin:0;flex:1;font-family:var(--fd);font-size:calc(14.5px*var(--fs));font-weight:500;color:var(--strong);}
.mk-pb{flex:1;overflow-y:auto;padding:14px 15px 28px;}

.mk-new{
  width:100%;padding:11px;border:1px dashed var(--line);background:none;color:var(--accent);
  border-radius:4px;font-family:var(--fd);font-size:calc(13px*var(--fs));margin-bottom:14px;transition:background .16s;
}
.mk-new:hover{background:var(--surface2);}
.mk-item{display:flex;align-items:center;gap:6px;padding:10px 9px;border-radius:4px;border-bottom:1px solid var(--hair);transition:background .16s;}
.mk-item:hover{background:var(--surface);}
.mk-item.on{background:var(--surface2);}
.mk-item > button:first-child{
  flex:1;text-align:right;background:none;border:none;color:var(--text);padding:0;
  font-size:calc(13px*var(--fs));line-height:1.7;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
}
.mk-item small{display:block;color:var(--dim);font-size:calc(10px*var(--fs));margin-top:4px;}
.mk-del{background:none;border:none;color:var(--dim);font-size:14px;padding:2px 5px;opacity:.5;}
.mk-del:hover{color:var(--warn);opacity:1;}
.mk-empty{color:var(--dim);font-size:calc(12.5px*var(--fs));line-height:2;text-align:center;padding:28px 10px;font-weight:300;}

.mk-group{margin-bottom:24px;}
.mk-glabel{
  font-family:var(--fd);font-size:calc(10.5px*var(--fs));letter-spacing:.12em;color:var(--accent);
  margin:0 0 11px;display:flex;align-items:center;gap:9px;
}
.mk-glabel::after{content:"";flex:1;height:1px;background:var(--line);opacity:.6;}
.mk-opts{display:flex;flex-wrap:wrap;gap:7px;}
.mk-opt{
  border:1px solid var(--hair);background:none;color:var(--dim);border-radius:4px;
  padding:9px 13px;font-size:calc(12.5px*var(--fs));transition:all .16s;display:flex;align-items:center;gap:7px;
}
.mk-opt:hover{color:var(--strong);}
.mk-opt.on{border-color:var(--accent);color:var(--strong);background:var(--surface2);}
.mk-sw{display:flex;border-radius:2px;overflow:hidden;}
.mk-sw i{width:8px;height:15px;display:block;}
.mk-about{font-size:calc(11.5px*var(--fs));color:var(--dim);line-height:2;font-weight:300;}

@media (max-width:560px){
  .mk-view{flex-direction:column;gap:3px;}
  .mk-school{flex:none;}
  .mk-thread{padding:16px 13px 8px;}
}
@media (prefers-reduced-motion:reduce){
  .mk-spin,.mk-card,.mk-panel,.mk-veil,.mk-caret,.mk-badge.pending .mk-dot{animation:none;}
}
`;

/* ═══════════ مكوّنات ═══════════ */

/* المحراب: قوس مدبّب تتوسّطه نجمة ثمانية */
function Mihrab() {
  return (
    <svg className="mk-arch" viewBox="0 0 120 170" aria-hidden="true">
      <path className="frame" d="M8,168 L8,74 Q8,20 60,6 Q112,20 112,74 L112,168" />
      <path className="frame" d="M18,168 L18,76 Q18,30 60,17 Q102,30 102,76 L102,168" opacity=".45" />
      <g className="star" transform="translate(60,74)">
        <rect x="-19" y="-19" width="38" height="38" />
        <rect x="-19" y="-19" width="38" height="38" transform="rotate(45)" />
        <circle className="halo" r="27" />
        <circle r="6" />
      </g>
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="mk-spin" viewBox="0 0 40 40" aria-hidden="true">
      <g fill="none" stroke="var(--accent)" strokeWidth="1.6">
        <rect x="8" y="8" width="24" height="24" />
        <rect x="8" y="8" width="24" height="24" transform="rotate(45 20 20)" />
      </g>
    </svg>
  );
}

const BADGE = {
  pending: "جارٍ التحقق",
  ok: "مُطابق للمصدر",
  mismatch: "يحتاج مراجعة",
  fail: "تعذّر التحقق",
  skip: "بلا تحقق آلي",
};

const FALLBACK_FOLLOWUPS = [
  "ما دليل هذا الحكم من السنّة؟",
  "هل في المسألة خلاف بين المذاهب؟",
  "ما الحالات المستثناة من هذا الحكم؟",
];

const Badge = ({ state }) => (
  <span className={"mk-badge " + state}>
    <span className="mk-dot" />
    {BADGE[state]}
  </span>
);

function Answer({ turn, onFollow }) {
  const { prose, data = {}, checks = [], religious } = turn;

  if (religious === false) {
    return (
      <div className="mk-refuse">
        <h3>هذا خارج نطاق مِشْكاة</h3>
        <p>
          مِشْكاة مخصّصة للأسئلة الدينية وحدها: العقيدة، والعبادات، والمعاملات، والتفسير، والسيرة،
          والأخلاق. أعد صياغة سؤالك في هذا الباب.
        </p>
      </div>
    );
  }

  const evs = Array.isArray(data.evidences) ? data.evidences : [];
  const done = checks.filter((c) => c.state === "ok").length;
  const busy = checks.some((c) => c.state === "pending");
  const asked = Array.isArray(data.followUps) ? data.followUps.filter(Boolean) : [];
  const follows = asked.length ? asked.slice(0, 4) : FALLBACK_FOLLOWUPS;

  return (
    <>
      <article className="mk-card">
        {data.topic && <p className="mk-eb">{data.topic}</p>}
        <p className="mk-flow">{prose}</p>
      </article>

      {evs.length > 0 && (
        <article className="mk-card">
          <p className="mk-eb">
            الأدلّة
            <em>{busy ? "يجري مقابلتها بمصادرها…" : `طوبق ${done} من ${evs.length}`}</em>
          </p>
          {evs.map((ev, i) => {
            const c = checks[i] || { state: "pending" };
            const shown = c.text || ev.text;
            return (
              <div className={"mk-ev " + c.state} key={i}>
                <div className="mk-evh">
                  <span className="mk-tag">{ev.type}</span>
                  <Badge state={c.state} />
                </div>
                <p className="mk-quote">{ev.type === "قرآن" ? `﴿ ${shown} ﴾` : shown}</p>
                {(c.place || ev.reference) && (
                  <p className="mk-ref">
                    {c.place || ev.reference}
                    {c.narrator && <> · الراوي: {c.narrator}</>}
                    {c.grade && <> · {c.grade}</>}
                  </p>
                )}
                {ev.explanation && <p className="mk-why">{ev.explanation}</p>}
                {c.note && <p className="mk-flag">{c.note}</p>}
              </div>
            );
          })}
          <p className="mk-attrib">
            التحقق آليّ: نصوص الآيات من api.alquran.cloud بالرسم العثماني، وتخريج الأحاديث وأحكامها
            من موسوعة الدرر السنية. وسم «مُطابق للمصدر» يعني أن الموضع ثبت، لا أن الاستدلال به صحيح.
          </p>
        </article>
      )}

      {evs.length === 0 && (
        <article className="mk-card">
          <p className="mk-eb">الأدلّة</p>
          <p className="mk-why" style={{ margin: 0 }}>
            لم يورد النموذج في هذا الجواب دليلًا يمكن مقابلته بمصدره. أعد صياغة السؤال أو اسأل
            صراحةً عن دليل المسألة من الكتاب والسنّة.
          </p>
        </article>
      )}

      {Array.isArray(data.scholarlyViews) && data.scholarlyViews.length > 0 && (
        <article className="mk-card">
          <p className="mk-eb">أقوال أهل العلم</p>
          {data.scholarlyViews.map((v, i) => (
            <div className="mk-view" key={i}>
              <div className="mk-school">{v.school}</div>
              <p>{v.view}</p>
            </div>
          ))}
        </article>
      )}

      {Array.isArray(data.sources) && data.sources.length > 0 && (
        <article className="mk-card">
          <p className="mk-eb">المراجع للاستزادة</p>
          {data.sources.map((s, i) => (
            <div className="mk-src" key={i}>
              <b>{s.title}</b>
              {s.note && <span>{s.note}</span>}
            </div>
          ))}
        </article>
      )}

      <article className="mk-card">
        <p className="mk-eb">
          أسئلة تتفرّع عن سؤالك
          <em>اضغط أيَّها شئت ليُسأل</em>
        </p>
        <div className="mk-next">
          {follows.map((f, i) => (
            <button key={i} onClick={() => onFollow(f)}>
              <span>{f}</span>
              <i>←</i>
            </button>
          ))}
        </div>
      </article>

      <p className="mk-note">
        التحقق يُثبت النصّ لا الفهم. الجواب من نموذج ذكاء اصطناعي وقد يخطئ في تنزيل الدليل على
        المسألة، فلا تعتمده فتوى في حالتك الخاصة.
      </p>
    </>
  );
}

/* ═══════════ التطبيق ═══════════ */

export default function Mishkat() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [convos, setConvos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState(null); // { q, prose, religious }
  const [error, setError] = useState("");
  const [panel, setPanel] = useState(null);
  const [ready, setReady] = useState(false);
  const [atEnd, setAtEnd] = useState(true);

  const boxRef = useRef(null);
  const endRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true); // هل نتابع أسفل الصفحة تلقائيًا؟
  const turnsRef = useRef(turns);
  const convosRef = useRef(convos);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const theme = THEMES[prefs.theme] || THEMES.mihrab;
  const font = FONTS[prefs.font] || FONTS.amiri;
  const size = SIZES[prefs.size] || SIZES.md;
  const busy = live !== null;

  useEffect(() => {
    (async () => {
      const [p, c] = await Promise.all([store.get(K_PREFS), store.get(K_CONVOS)]);
      if (p) setPrefs({ ...DEFAULT_PREFS, ...p });
      if (Array.isArray(c)) {
        convosRef.current = c;
        setConvos(c);
      }
      setReady(true);
    })();
  }, []);

  const savePrefs = (patch) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    store.set(K_PREFS, next);
  };

  /* المرجع يُحدَّث فورًا قبل إعادة الرسم، فلا تضيع كتابة تلي أخرى في اللحظة نفسها */
  const persist = useCallback((list) => {
    const trimmed = list.slice(0, MAX_CONVOS);
    convosRef.current = trimmed;
    setConvos(trimmed);
    store.set(K_CONVOS, trimmed);
  }, []);

  const applyTurns = useCallback((next) => {
    turnsRef.current = next;
    setTurns(next);
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 124) + "px";
    }
  }, [draft]);

  /* يُستدعى مع كل حرف يصل، فلا يجوز أن يجرّ الشاشة إن كان القارئ صاعدًا يقرأ */
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
    stickRef.current = near;
    setAtEnd(near);
  }, []);

  const toEnd = useCallback((smooth) => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = true;
    setAtEnd(true);
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, live, error]);

  function commit(id, newTurns) {
    const record = {
      id,
      title: newTurns[0] ? newTurns[0].q : "محادثة",
      updatedAt: Date.now(),
      turns: newTurns,
    };
    persist([record, ...convosRef.current.filter((c) => c.id !== id)]);
  }

  async function runChecks(id, index, evidences) {
    const results = await Promise.all(evidences.map(verifyEvidence));
    const next = turnsRef.current.map((t, i) => (i === index ? { ...t, checks: results } : t));
    applyTurns(next);
    commit(id, next);
  }

  async function ask(text) {
    const q = (text ?? draft).trim();
    if (!q || busy) return;

    const id = activeRef.current || `c${Date.now()}`;
    if (!activeRef.current) {
      activeRef.current = id;
      setActiveId(id);
    }

    setDraft("");
    setError("");
    setPanel(null);
    toEnd(false);
    setLive({ q, prose: "", religious: null });

    const history = turnsRef.current.slice(-3).flatMap((t) => [
      { role: "user", content: t.q },
      { role: "assistant", content: t.prose || "—" },
    ]);

    try {
      const raw = await callModel([...history, { role: "user", content: q }], (partial) => {
        const { religious, prose } = splitReply(partial);
        setLive({ q, prose, religious });
      });

      const { religious, prose, tail } = splitReply(raw);
      const data = parseTail(tail);
      const evs = religious !== false && Array.isArray(data.evidences) ? data.evidences : [];

      const turn = {
        q,
        prose,
        religious: religious === false ? false : true,
        data,
        checks: evs.map(() => ({ state: "pending" })),
      };
      const next = [...turnsRef.current, turn];

      applyTurns(next);
      setLive(null);
      commit(id, next);

      if (evs.length) runChecks(id, next.length - 1, evs);
    } catch (e) {
      setError(e.message || "تعذّر جلب الإجابة. تحقق من الاتصال ثم أعد المحاولة.");
      setLive(null);
      setDraft(q); // يعود السؤال إلى الصندوق فلا يُعاد كتابته
    }
  }

  function openConvo(c) {
    activeRef.current = c.id;
    setActiveId(c.id);
    applyTurns(Array.isArray(c.turns) ? c.turns : []);
    setError("");
    setPanel(null);
    toEnd(false);
  }
  function newConvo() {
    activeRef.current = null;
    setActiveId(null);
    applyTurns([]);
    setError("");
    setPanel(null);
    toEnd(false);
  }
  function removeConvo(id) {
    persist(convosRef.current.filter((c) => c.id !== id));
    if (id === activeRef.current) newConvo();
  }

  const vars = {
    ...Object.fromEntries(Object.entries(theme.v).map(([k, v]) => ["--" + k, v])),
    "--fd": font.d,
    "--fq": font.q,
    "--fb": font.b,
    "--fs": size.v,
  };

  const stamp = (t) => new Date(t).toLocaleDateString("ar", { day: "numeric", month: "long" });
  const empty = turns.length === 0 && !busy && !error;

  return (
    <div className="mk" style={vars}>
      <style>{CSS}</style>

      <header className="mk-bar">
        <div className="mk-brand">
          <h1>
            مِشْـ<i>كاة</i>
          </h1>
          <small>للأسئلة الشرعية</small>
        </div>
        <button className="mk-ico" onClick={newConvo} title="محادثة جديدة" aria-label="محادثة جديدة">✎</button>
        <button className="mk-ico" onClick={() => setPanel("history")} title="المواضيع" aria-label="المواضيع السابقة">☰</button>
        <button className="mk-ico" onClick={() => setPanel("look")} title="المظهر" aria-label="المظهر">◐</button>
      </header>

      <div className="mk-scroll" ref={scrollRef} onScroll={onScroll}>
        {empty ? (
          <div className="mk-hello">
            <Mihrab />
            <h2>سَلْ عن دينك</h2>
            <p>أجيب على الأسئلة الشرعية وحدها، وأقابل كل دليل بمصدره قبل أن أعرضه عليك.</p>
            <div className="mk-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="mk-chip" onClick={() => ask(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mk-thread">
            {turns.map((t, i) => (
              <section key={i}>
                <p className="mk-q">{t.q}</p>
                <Answer turn={t} onFollow={ask} />
              </section>
            ))}

            {busy && (
              <section>
                <p className="mk-q">{live.q}</p>
                {live.prose ? (
                  <article className="mk-card">
                    <p className="mk-flow">
                      {live.prose}
                      <span className="mk-caret" />
                    </p>
                  </article>
                ) : (
                  <div className="mk-wait">
                    <Spinner />
                    يُراجَع السؤال ويُلتمس دليله…
                  </div>
                )}
              </section>
            )}

            {error && (
              <div className="mk-refuse">
                <h3>لم تكتمل الإجابة</h3>
                <p>{error}</p>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="mk-dock">
        {!empty && !atEnd && (
          <button className="mk-down" onClick={() => toEnd(true)} aria-label="انزل إلى آخر الجواب">
            ↓
          </button>
        )}

        <div className="mk-composer">
          <label htmlFor="mk-in" style={{ position: "absolute", left: -9999 }}>
            اكتب سؤالك الديني
          </label>
          <textarea
            id="mk-in"
            ref={boxRef}
            className="mk-input"
            rows={1}
            placeholder="اكتب سؤالك الديني…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <button
            className={"mk-send" + (busy ? " busy" : "")}
            onClick={() => ask()}
            disabled={busy || !draft.trim()}
            aria-label="أرسل السؤال"
          >
            {busy ? <Spinner /> : "↑"}
          </button>
        </div>

        <p className="mk-hint">أداة للاسترشاد لا للإفتاء</p>
      </div>

      {panel === "history" && (
        <>
          <div className="mk-veil" onClick={() => setPanel(null)} />
          <aside className="mk-panel">
            <div className="mk-ph">
              <h3>المواضيع السابقة</h3>
              <button className="mk-ico" onClick={() => setPanel(null)} aria-label="إغلاق">✕</button>
            </div>
            <div className="mk-pb">
              <button className="mk-new" onClick={newConvo}>✎ محادثة جديدة</button>
              {!ready ? (
                <p className="mk-empty">يُفتح السجلّ…</p>
              ) : convos.length === 0 ? (
                <p className="mk-empty">
                  لا مواضيع محفوظة بعد.
                  <br />
                  كل سؤال تسأله يُحفظ هنا تلقائيًا.
                </p>
              ) : (
                convos.map((c) => (
                  <div className={"mk-item" + (c.id === activeId ? " on" : "")} key={c.id}>
                    <button onClick={() => openConvo(c)}>
                      {c.title}
                      <small>
                        {stamp(c.updatedAt)} · {c.turns.length} سؤال
                      </small>
                    </button>
                    <button className="mk-del" onClick={() => removeConvo(c.id)} aria-label="حذف">✕</button>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {panel === "look" && (
        <>
          <div className="mk-veil" onClick={() => setPanel(null)} />
          <aside className="mk-panel">
            <div className="mk-ph">
              <h3>المظهر</h3>
              <button className="mk-ico" onClick={() => setPanel(null)} aria-label="إغلاق">✕</button>
            </div>
            <div className="mk-pb">
              <div className="mk-group">
                <p className="mk-glabel">الثيمة</p>
                <div className="mk-opts">
                  {Object.entries(THEMES).map(([k, t]) => (
                    <button
                      key={k}
                      className={"mk-opt" + (prefs.theme === k ? " on" : "")}
                      onClick={() => savePrefs({ theme: k })}
                    >
                      <span className="mk-sw">
                        {t.swatch.map((c, i) => (
                          <i key={i} style={{ background: c }} />
                        ))}
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mk-group">
                <p className="mk-glabel">الخط</p>
                <div className="mk-opts">
                  {Object.entries(FONTS).map(([k, f]) => (
                    <button
                      key={k}
                      className={"mk-opt" + (prefs.font === k ? " on" : "")}
                      style={{ fontFamily: f.q }}
                      onClick={() => savePrefs({ font: k })}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mk-group">
                <p className="mk-glabel">حجم النص</p>
                <div className="mk-opts">
                  {Object.entries(SIZES).map(([k, s]) => (
                    <button
                      key={k}
                      className={"mk-opt" + (prefs.size === k ? " on" : "")}
                      onClick={() => savePrefs({ size: k })}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mk-group">
                <p className="mk-glabel">عن مِشْكاة</p>
                <p className="mk-about">
                  الجواب من نموذج ذكاء اصطناعي. الآيات تُجلب من المصحف بالرسم العثماني، والأحاديث
                  تُخرَّج من موسوعة الدرر السنية، ويُعرض حكم المحدّث عليها.
                  <br />
                  <br />
                  المواضيع والتفضيلات محفوظة في هذا المتصفح وحده.
                </p>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
