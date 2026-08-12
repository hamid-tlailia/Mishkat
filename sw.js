/*
 * عامل الخدمة — يجعل مِشْكاة تُثبَّت كتطبيق وتفتح بلا إنترنت.
 *
 * القاعدة الحاكمة: لا يُخزَّن إلا هيكل التطبيق.
 * أمّا الأجوبة وتخريج الأحاديث ونصوص الآيات فتُطلب من الشبكة دائمًا،
 * لأن جوابًا شرعيًا مخزّنًا قد يُعرض في سياق غير سياقه.
 */

const VERSION = "mishkat-v1";
const SHELL = `${VERSION}-shell`;

/* ملفات الهيكل. تُطلب بمسارات نسبية ليعمل التطبيق تحت أي مجلّد */
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
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

  /* ما ليس من أصل التطبيق (الوركر، المصحف، الدرر) يُترك للشبكة */
  if (url.origin !== self.location.origin) return;

  /*
   * config.js من الشبكة أولًا: لو خُزّن، لبقي عنوان وركر قديم عالقًا
   * في هواتف الناس بعد تغييره، فيتعطّل التطبيق عندهم بلا سبب ظاهر.
   */
  if (url.pathname.endsWith("/config.js")) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* التنقّل: الشبكة أولًا، فإن انقطعت فالصفحة المخزّنة */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  /* بقيّة الأصول: المخزَّن أولًا لأن أسماءها تحمل بصمة المحتوى */
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
