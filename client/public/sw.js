/* OnHighTech service worker: after the first visit the site opens from the
   phone, without spending data, and interview topics already opened work offline.

   - Page (navigation): served from the phone straight away; a fresh copy is
     fetched in the background when there is a connection.
   - Built files (/assets/*, hashed) and the CSS/fonts from CDNs: cache first.
   - Interview content (/careers-bot/api/interview GETs): network first, the
     saved copy when offline. Sign-in and payment calls are never cached.
   - Everything else (staff /api, bookings, payments) is not touched.

   Bump VERSION to drop old caches after a big change. */
const VERSION = "v1"; // saved copies are matched with ignoreVary (servers send Vary: Origin)
const SHELL = `onhigh-shell-${VERSION}`;
const ASSETS = `onhigh-assets-${VERSION}`;
const CONTENT = `onhigh-interview-${VERSION}`;
const KEEP = [SHELL, ASSETS, CONTENT];

const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
const INTERVIEW_API = "/careers-bot/api/interview/";
const NEVER_CACHE = ["/auth/", "/pay", "/me"];
const NETWORK_TIMEOUT_MS = 4000;

// The first page view loads before this worker is running, so save the
// opening screens' content here too (areas + popular topics, a few KB).
const FIRST_CONTENT = [`${INTERVIEW_API}sectors`, `${INTERVIEW_API}topics?sector=&q=`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((cache) => cache.addAll(["/", "/manifest.json"])),
      caches.open(CONTENT).then((cache) => cache.addAll(FIRST_CONTENT)),
    ])
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok || response.type === "opaque") cache.put(request, response.clone());
          return response;
        })
    )
  );
}

// The page itself: answer from the phone at once, refresh it quietly.
function pageFromPhone(request, event) {
  return caches.open(SHELL).then((cache) =>
    cache.match("/", { ignoreVary: true }).then((saved) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) cache.put("/", response.clone());
          return response;
        })
        .catch(() => saved);
      if (saved) {
        event.waitUntil(fresh.catch(() => undefined));
        return saved;
      }
      return fresh;
    })
  );
}

// Interview content: latest when online (so a purchase shows at once), saved copy offline.
function networkFirst(request) {
  return caches.open(CONTENT).then((cache) => {
    const network = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    return Promise.race([network, timeout.then(() => cache.match(request, { ignoreVary: true }))])
      .then((first) => first || network)
      .catch(() =>
        cache.match(request, { ignoreVary: true }).then(
          (saved) =>
            saved ||
            new Response(
              JSON.stringify({ detail: "You are offline. Connect once to open this topic." }),
              { status: 503, headers: { "Content-Type": "application/json" } }
            )
        )
      );
  });
}

// The page sends what it loaded before this worker was running (its main
// code, styles, first content); save those so the next visit needs no data.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "save-loaded" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls.slice(0, 80).map((raw) => {
        let url;
        try {
          url = new URL(raw, self.location.origin);
        } catch {
          return undefined;
        }
        const own = url.origin === self.location.origin;
        if (own && url.pathname.startsWith(INTERVIEW_API)) {
          if (NEVER_CACHE.some((part) => url.pathname.includes(part))) return undefined;
          return caches.open(CONTENT).then((c) => c.add(url.href)).catch(() => undefined);
        }
        if ((own && url.pathname.startsWith("/assets/")) || CDN_HOSTS.includes(url.hostname)) {
          return caches
            .open(ASSETS)
            .then((c) => c.match(url.href, { ignoreVary: true }).then((hit) => hit || c.add(url.href)))
            .catch(() => undefined);
        }
        return undefined;
      })
    )
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith(INTERVIEW_API)) {
      if (NEVER_CACHE.some((part) => url.pathname.includes(part))) return;
      event.respondWith(networkFirst(request));
      return;
    }
    // (legal pages are plain pages of their own: always from the server)
    const legal = /^\/(privacy|terms|data-deletion|delete-data|delete-my-data)/.test(url.pathname);
    if (request.mode === "navigate" && !url.pathname.startsWith("/api/") &&
        !url.pathname.startsWith("/careers-bot/") && !legal) {
      event.respondWith(pageFromPhone(request, event));
      return;
    }
    if (url.pathname.startsWith("/assets/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(request, ASSETS));
    }
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
