const CACHE_NAME = "24-duck-game-v38-cache-repair-20260627";
const SAME_ORIGIN_ASSETS = [
  "./index.html",
  "./privacy.html",
  "./support.html",
  "./style_v33.css",
  "./app_v33.js",
  "./family_card_assets.js",
  "./twenty_four_bruteforce_catalog_v19.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SAME_ORIGIN_ASSETS).catch(() => undefined)
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh && fresh.ok && request.method === "GET") {
      cache.put(request, fresh.clone()).catch(() => undefined);
    }
    return fresh;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const fallback = await caches.match("./index.html");
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(networkFirst(event.request));
});
