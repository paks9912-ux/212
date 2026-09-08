/* Офлайн-кэш. Меняйте VER при обновлении файлов. */
const VER = 'kapital-v21';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css?v=21',
  './js/util.js?v=21', './js/fx.js?v=21', './js/auth.js?v=21', './js/store.js?v=21', './js/calc.js?v=21',
  './js/views.js?v=21', './js/detail.js?v=21', './js/app.js?v=21',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-64.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Сеть первой, кэш — как запасной вариант: обновления доезжают, офлайн работает */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(VER).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => {
        if (r) return r;
        /* Страницей подменяем только переход по адресу. Отдать HTML вместо
           скрипта нельзя: он не выполнится, и приложение не запустится. */
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }))
  );
});
