/*
 * Storelib's browser notifications (Settings, Privacy, "Notifications on this
 * browser"). This worker only shows pushes and opens the page one is about:
 * it has no fetch handler, so it never sits between the site and the network
 * and caches nothing.
 */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "Storelib", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Storelib"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      /* The Storelib logo with its corners cut in (lib/brand/logo.ts STORELIB_EMAIL_LOGO): a notification has no CSS to round it. */
      icon: "/images/brand/storelib-logo-email-v2.png",
      badge: "/icon-light-32x32.png",
      tag: data.tag || undefined,
      data: { url: data.url || "/app" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url)
          return w.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
