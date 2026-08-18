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
 * لكل نشر بصمة إصدار صريحة، ويُمرَّر الرقم أيضًا في رابط التسجيل.
 */

/*
 * تُحدِّد RELEASE النسخة الاحتياطية للملف، ويُعطى رابط التسجيل الأولوية
 * حتى يُنشأ مخزن جديد عند كل نشر. وبذلك لا تعود ملفات التطبيق السابقة من
 * التخزين المؤقت بعد تفعيل الإصدار الجديد.
 */
const RELEASE = "2026081808";
const BUILD = new URL(self.location.href).searchParams.get("v") || RELEASE;
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

  e.respondWith(
    fetch(req)
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
