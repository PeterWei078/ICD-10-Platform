// 離線快取 Service Worker（建置時由 vite.config.js 填入清單與版本後輸出為 dist/sw.js）
// 策略：
//   - 頁面 (navigate)：網路優先，3 秒逾時或離線時改用快取 → 上線時總是拿到最新版
//   - 其他同源檔案：快取優先 (檔名含 hash，內容不會變)，沒有才從網路抓並存入快取
const BUILD_ID = __BUILD_ID__;
const CACHE_NAME = `icd10-${BUILD_ID}`;
const PRECACHE_URLS = __PRECACHE_URLS__;
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith('icd10-') && key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

const fetchWithTimeout = (request, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
        response => { clearTimeout(timer); resolve(response); },
        error => { clearTimeout(timer); reject(error); }
    );
});

const handleNavigation = async (request) => {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS);
        if (response.ok) cache.put('/index.html', response.clone());
        return response;
    } catch (error) {
        const cached = (await cache.match('/index.html')) || (await caches.match('/index.html'));
        return cached || Response.error();
    }
};

const handleAsset = async (request) => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
    }
    return response;
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigation(request));
    } else {
        event.respondWith(handleAsset(request));
    }
});
