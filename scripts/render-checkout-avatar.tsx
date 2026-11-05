/**
 * The checkout's top bar with the creator's photo in each state it can be in,
 * for scripts/check-checkout-avatar.mjs. The real page component, a free
 * product (so no Stripe), and `?case=` for the photo:
 *
 *   ok        on Supabase storage, which the image optimizer may fetch
 *   missing   on Supabase storage, but the file is gone (404)
 *   foreign   a Google sign in photo: loads on its own, but its host is not
 *             in next.config's remotePatterns, so the optimizer refuses it
 *   refused   a Google photo that answers 403
 *   none      no photo at all
 *
 * `?hydrate` draws the page the way it arrives from the server: its HTML
 * first, with the photo already loading or failing, and React attached
 * 600ms later, after the browser has fired the photo's load or error event.
 */
import * as React from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server.browser"
import CheckoutPageClient from "@/app/(storelib)/checkout/checkout-client"

const q = new URLSearchParams(location.search)
const SUPABASE = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/avatars/probe"
const PHOTOS: Record<string, string | null> = {
  ok: `${SUPABASE}/ok.jpg`,
  missing: `${SUPABASE}/missing.jpg`,
  foreign: "https://lh3.googleusercontent.com/a/ACg8ocProbeOk=s96-c",
  refused: "https://lh3.googleusercontent.com/a/ACg8ocProbeRefused=s96-c",
  none: null,
}
const avatar = PHOTOS[q.get("case") || "ok"] ?? null

const page = (
  <CheckoutPageClient
    product={{ id: "p1", title: "Free ambience sample pack", slug: "free-ambience", description: null, price_cents: 0, thumbnail_url: null, type: "digital" }}
    creator={{ id: "c1", name: "AndrewRullz", avatar_url: avatar, username: "andrewrullz" }}
    userEmail={null}
    isLoggedIn={false}
  />
)

const app = document.getElementById("app")!
if (q.has("hydrate")) {
  app.innerHTML = renderToString(page)
  setTimeout(() => hydrateRoot(app, page), 600)
} else {
  createRoot(app).render(page)
}
