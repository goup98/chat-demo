// 只做两件事：让浏览器认定站点可安装；缓存带 contenthash 的静态资源。
// 刻意不缓存 index.html —— 页面一旦被缓存，发版后用户会一直看到旧版本，
// 主 JS 文件名带 hash，缓存旧页面就会引不到新资源。
const CACHE = 'chat-demo-static-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  // 只管同源、且落在 static/ 或图标里的资源；接口、页面、跨域请求全部直通
  if (url.origin !== self.location.origin) {
    return;
  }
  const cacheable =
    url.pathname.includes('/static/') || /\.(png|ico)$/.test(url.pathname);
  if (!cacheable) {
    return;
  }
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        return hit;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
