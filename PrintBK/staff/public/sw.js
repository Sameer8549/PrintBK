// PrintBK Staff Service Worker
// Cache app shell only. NEVER cache live feeds, staff API, agent API, or items.
const CACHE_NAME = "printbk-staff-shell-v1"
const SHELL_ASSETS = ["./", "./index.html", "hkbk-logo.jpg"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key)
        })
      )
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)

  // CRITICAL: NEVER cache API endpoints or live feeds
  if (
    url.pathname.startsWith("/server/api/") ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/staff/") ||
    url.pathname.includes("/agent/") ||
    url.pathname.includes("/live") ||
    event.request.method !== "GET"
  ) {
    return
  }

  // Network first for HTML, cache first for static build assets
  if (url.pathname.startsWith("/assets/") || url.pathname.endsWith(".jpg") || url.pathname.endsWith(".png")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
