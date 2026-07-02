const BUILD_NUMBER = 162;
const CACHE_NAME = `fdv-bouldering-timer-v${BUILD_NUMBER}`;
const CACHE_PREFIX = "fdv-bouldering-timer-v";
const CORE_URLS = ["/", "/index.html", "/offline-audio.js", "/help.html"];

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isCacheableResponse(response) {
  if (!response || !response.ok) return false;
  const contentType = response.headers.get("content-type") || "";
  return !contentType.includes("text/event-stream");
}

async function cacheCore() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(CORE_URLS.map(async (url) => {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (isCacheableResponse(response)) await cache.put(url, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCore().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function cacheNetworkResponse(request, response) {
  if (!isCacheableResponse(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "/index.html") {
    await cache.put("/index.html", response.clone());
  }
}

async function offlineDocumentFallback() {
  const cached = await caches.match("/index.html") || await caches.match("/");
  if (!cached) {
    return new Response("Offline copy is not available", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }
    });
  }
  const html = await cached.text();
  const marked = html.includes("window.__FDV_SW_OFFLINE_FALLBACK=true")
    ? html
    : html.replace("<head>", "<head>\n  <script>window.__FDV_SW_OFFLINE_FALLBACK=true;</script>");
  return new Response(marked, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-fdv-offline-fallback": "1"
    }
  });
}

async function networkFirstDocument(request) {
  try {
    const response = await fetch(request);
    await cacheNetworkResponse(request, response);
    return response;
  } catch (error) {
    return offlineDocumentFallback();
  }
}

async function networkFirstStatic(request) {
  try {
    const response = await fetch(request);
    await cacheNetworkResponse(request, response);
    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  event.respondWith(networkFirstStatic(request));
});
