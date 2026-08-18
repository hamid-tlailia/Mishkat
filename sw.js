/*
 * عامل الخدمة — يجعل مِشْكاة تُثبَّت كتطبيق وتفتح بلا إنترنت.
 *
 * قاعدتان تحكمان هذا الملف:
 *
 * ١) الشبكة أولًا في كل شيء، والمخزَّن احتياط عند الانقطاع.
 *    السبب: ملفات التطبيق تحمل أسماء ثابتة بلا بصمة، فلو قدّمنا المخزَّن
 *    لبقيت نسخة قديمة عالقة في هواتف الناس بعد كل تحديث.
 *
 * ٢) لا تُخزَّن الأجوبة ولا نصوص الأدلّة إطلاقًا، بل هيكل التطبيق وحده.
 *    جوابٌ شرعيّ محفوظ قد يُقرأ لاحقًا في غير سياق سؤاله.
 *
 * لا حاجة لترقيم يدوي: رقم النسخة يأتي من رابط التسجيل ويتغيّر مع كل بناء.
 */

/*
 * رقم النسخة يُؤخذ من رابط التسجيل نفسه (sw.js?v=...) الذي يُولّده البناء.
 * السبب: الترقيم اليدوي هنا كان يضيع، لأن كل بناء ينسخ هذا الملف من مصدره
 * فيمحو أي رقم رُفع في النسخة المبنيّة. أما الآن فيتغيّر مع كل بناء تلقائيًا،
 * والمتصفح يعيد جلب الملف لأن رابطه تغيّر، فتُثبَّت النسخة الجديدة حتمًا.
 */
const BUILD = new URL(self.location.href).searchParams.get("v") || "0";
const VERSION = `mishkat-${BUILD}`;
const SHELL = `${VERSION}-shell`;

/* app.js يُطلب موسومًا ببصمة البناء، فيُخزَّن بالرابط نفسه الذي تطلبه الصفحة */
const SHELL_FILES = [
  "./",
  "./index.html",
  `./app.js?v=${BUILD}`,
  "./config.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* الوركر والمصحف والدرر: للشبكة وحدها، لا تُخزَّن */
  if (url.origin !== self.location.origin) return;

  /*
   * الصفحة وملف الإعداد يُطلبان بتجاوز ذاكرة المتصفح.
   * السبب: GitHub Pages ترسل ترويسة تخزين لعشر دقائق، فكان fetch يُرجع
   * نسخة قديمة من index.html رغم أن الاستراتيجية «الشبكة أولًا»، فيبقى
   * المستخدم على بناء سابق ويظنّ أن الرفع لم ينجح.
   * أما app.js فرابطه يحمل بصمة البناء، فالتخزين عليه لا يضرّ.
   */
  const fresh = req.mode === "navigate" || url.pathname.endsWith("/config.js");
  const request = fresh
    ? new Request(url.href, { cache: "no-cache", credentials: "same-origin" })
    : req;

  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req)
          .then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined))
      )
  );
});
