/* Shakstory service worker — gerado no build. Não editar. */
const VERSION = "3u1aev";
const SHELL_CACHE = 'shakstory-shell-' + VERSION;
const RUNTIME_CACHE = 'shakstory-runtime-v1';
const PRECACHE = ["","assets/html2canvas.esm-B0tyYwQk.js","assets/index-DlFQgZei.css","assets/index-LLTbu-8N.js","assets/index.es-BGzAH4z6.js","assets/pdf-fonts-B031VheP.js","assets/purify.es-CYR4BTuT.js","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","manifest.webmanifest","shakstory-icon.svg"];
const SCOPE = self.registration.scope;
const abs = rel => new URL(rel, SCOPE).href;
const PRECACHE_URLS = PRECACHE.map(abs);
const NETWORK_ONLY = ['api/', 'cdn-cgi/', '__manus__/', 'health', 'self-test'];
const NAV_TIMEOUT_MS = 4000;

async function precacheOne(cache, url) {
  const response = await fetch(url, { cache: 'reload', redirect: 'manual' });
  if (!response.ok || response.type === 'opaqueredirect' || response.redirected) throw new Error('shell:' + url);
  await cache.put(url, response);
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => Promise.all(PRECACHE_URLS.map(url => precacheOne(cache, url)))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.indexOf('shakstory-shell-') === 0 && name !== SHELL_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

async function navigate(request) {
  const shell = await caches.match(abs(''));
  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (response.status >= 500 && shell) return shell;
    return response;
  } catch (error) {
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && !response.redirected && response.type === 'basic') {
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const refresh = fetch(request).then(response => {
    if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || refresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === new URL(SCOPE).origin) {
    const rel = url.pathname.slice(new URL(SCOPE).pathname.length);
    if (NETWORK_ONLY.some(prefix => rel.indexOf(prefix) === 0)) return;
    if (request.mode === 'navigate') { event.respondWith(navigate(request)); return; }
    if (rel.indexOf('assets/') === 0 || PRECACHE_URLS.indexOf(url.origin + url.pathname) !== -1) { event.respondWith(cacheFirst(request)); }
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') event.respondWith(staleWhileRevalidate(request));
});
