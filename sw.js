/* ============================================================================
   העולם של שירה · עבודה גם בלי אינטרנט
   דפים: קודם מהרשת (כדי שתמיד תקבלי את הגרסה העדכנית), ואם אין רשת — מהמטמון.
   קבצים קבועים (CSS/JS/גופנים/תמונות): קודם מהמטמון, מהר.
   כשמעלים גרסה חדשה מעלים את CACHE — הישן נמחק לבד.
   ========================================================================== */
const CACHE = 'shira-v6';
const CORE = [
  './',
  './index.html',
  './css/shira.css',
  './js/shira.js',
  './vendor/katex.min.css',
  './vendor/katex.min.js',
  './vendor/contrib/auto-render.min.js',
  './assets/search-index.js',
  './assets/icons/icon-180.png',
  './404.html'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(CORE.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* חימום שקט: אחרי שהדף נטען, הדפדפן מבקש מכאן לשמור את כל האתר (2MB בערך),
   כדי שגם דף שלא נפתח מעולם יהיה זמין באוטובוס. רץ פעם אחת, ברקע. */
let warming = false;
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'warm' || warming) return;
  warming = true;
  e.waitUntil((async () => {
    try {
      const list = await (await fetch('./assets/pages.json', { cache: 'no-cache' })).json();
      const cache = await caches.open(CACHE);
      const urls = [].concat(list.pages || [], list.assets || []).map((u) => './' + u);
      for (const u of urls) {                 /* אחד-אחד, בלי להעמיס את הרשת שלה */
        if (await cache.match(u)) continue;
        try { await cache.add(u); } catch (err) { /* קובץ חסר — ממשיכים */ }
      }
    } catch (err) { /* אין רשת עכשיו — ננסה בביקור הבא */ }
    warming = false;
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  /* דף: רשת קודם, מטמון כגיבוי, ואם אין כלום — דף השגיאה שלנו */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./404.html')))
    );
    return;
  }

  /* קובץ קבוע: מטמון קודם, ומשלימים ברקע */
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => hit))
  );
});
