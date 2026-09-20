const CACHE_VERSION = "life-pwa-v2";
const PAGE_CACHE = `${CACHE_VERSION}-pages`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const APP_ROUTES = ["/", "/diary", "/diary/new", "/timeline", "/calendar", "/search", "/life", "/account"];

async function warmAppShell() {
  const pages = await caches.open(PAGE_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const assetUrls = new Set();
  assetUrls.add(new URL("/icon.svg", self.location.origin).href);
  await Promise.allSettled(APP_ROUTES.map(async (path) => {
    const response = await fetch(path, { cache: "reload" });
    if (!response.ok) return;
    await pages.put(path, response.clone());
    const html = await response.text();
    for (const match of html.matchAll(/(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g)) {
      assetUrls.add(new URL(match[1], self.location.origin).href);
    }
  }));
  await Promise.allSettled(Array.from(assetUrls).map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok) await assets.put(url, response);
  }));
}

async function cachedIgnoringQuery(request) {
  const cache = await caches.open(ASSET_CACHE);
  return cache.match(request, { ignoreSearch: true });
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== PAGE_CACHE && key !== ASSET_CACHE)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image") || request.destination === "image") {
    event.respondWith(
      cachedIgnoringQuery(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
    return;
  }

  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(async () => (await caches.match(request)) || Response.error()),
    );
    return;
  }

  if (request.destination === "document") {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && !url.search) {
          const copy = response.clone();
          void caches.open(PAGE_CACHE).then((cache) => cache.put(url.pathname, copy));
        }
        return response;
      }).catch(async () => (await caches.match(url.pathname, { ignoreSearch: true })) || (await caches.match("/", { ignoreSearch: true })) || Response.error()),
    );
    return;
  }

  if (request.destination === "script" || request.destination === "style" || request.destination === "font") {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
  }
});
