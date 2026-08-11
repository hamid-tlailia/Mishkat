/*
 * إعداد مِشْكاة — عدّل هذا الملف مباشرةً على GitHub بعد النشر، ثم احفظ.
 * لا يحتاج إلى إعادة بناء المشروع.
 */
window.MISHKAT = {
  // عنوان وركر كلاودفلير الذي يحمل المفتاح (انظر worker.js و README).
  // مثال: "https://mishkat.hamid.workers.dev"
  proxy: "https://dash.cloudflare.com/2a523e55df9f22855781bb2076931f4e/workers/services/view/mishkat/production/domains",

  // وسيط اختياري لتخريج الأحاديث من الدرر السنية (تجاوز حاجز CORS).
  // اتركه فارغًا إن لم تُعدّه؛ حينها تُتحقّق الآيات فقط.
  hadithProxy: "",
};
