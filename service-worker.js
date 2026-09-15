// يجعل التطبيق يعمل بالكامل بدون إنترنت (Offline First):
// كل ملفات الواجهة تُخزَّن محليًا عند أول زيارة، والبيانات نفسها مخزّنة في IndexedDB
// (انظر src/db.js) وليس لها علاقة بهذا الملف.
const CACHE_VERSION = 'sdc-v21';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/db.js',
  './src/i18n.js',
  './src/i18n/ar.js',
  './src/i18n/en.js',
  './src/i18n/ur.js',
  './src/search.js',
  './src/auth.js',
  './src/settings.js',
  './src/duplicates.js',
  './src/export-image.js',
  './src/render.js',
  './src/modal.js',
  './src/utils.js',
  './src/sync.js',
  './src/cloud.js',
  './src/firebase-config.js',
  './icons/icon.svg',
];
// ملاحظة: مكتبة Firebase نفسها (gstatic.com) لا تُدرج هنا عمدًا — لو فشل
// تحميلها لأي سبب أثناء أول تثبيت لهذا التطبيق، يجب ألا يمنع ذلك تخزين بقية
// التطبيق (المزامنة السحابية اختيارية، وباقي التطبيق يجب أن يبقى يعمل بدونها).

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
