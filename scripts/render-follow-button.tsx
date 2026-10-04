/**
 * The Follow button with fixture data, for scripts/check-follow-button.mjs.
 * The real block (components/profile/profile-social.tsx, which draws
 * components/profile/follow-button.tsx) on three grounds:
 *
 *   ?platform   a plain profile: Storelib's near black and white
 *   ?sage       a creator page on a light scheme (Sage)
 *   ?astrid     a creator page on a dark scheme (Astrid)
 *
 * fetch is answered here. window.__follow sets how: `delay` (ms before the
 * answer), `fail` (refuse every request), `failNext` (refuse only the next
 * so many, then answer). window.__followLog records every request body, so
 * the probe can count them, and window.__server is what the server has.
 */
import { createRoot } from "react-dom/client"
import { ProfileSocial } from "@/components/profile/profile-social"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"

type Knobs = { delay: number; fail: boolean; failNext: number }
const w = window as unknown as { __follow: Knobs; __followLog: { follow: boolean; at: number; done?: number; ok?: boolean }[]; __inFlight: number; __maxInFlight: number; __server: { following: boolean } }
w.__follow = { delay: 40, fail: false, failNext: 0 }
w.__server = { following: false }
w.__followLog = []
w.__inFlight = 0
w.__maxInFlight = 0

let followers = 1280
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith("/api/follow")) return realFetch(input, init)
  const body = JSON.parse(String(init?.body || "{}")) as { follow?: boolean }
  const follow = body.follow !== false
  const entry: { follow: boolean; at: number; done?: number; ok?: boolean } = { follow, at: performance.now() }
  w.__followLog.push(entry)
  w.__inFlight++
  w.__maxInFlight = Math.max(w.__maxInFlight, w.__inFlight)
  await new Promise((r) => setTimeout(r, w.__follow.delay))
  w.__inFlight--
  entry.done = performance.now()
  const refuse = w.__follow.fail || w.__follow.failNext > 0
  if (w.__follow.failNext > 0) w.__follow.failNext--
  entry.ok = !refuse
  if (refuse) return new Response(JSON.stringify({ error: "That did not go through. Try again." }), { status: 500, headers: { "Content-Type": "application/json" } })
  if (w.__server.following !== follow) followers += follow ? 1 : -1
  w.__server.following = follow
  return new Response(JSON.stringify({ following: follow, followers }), { status: 200, headers: { "Content-Type": "application/json" } })
}) as typeof fetch

const which = location.search.slice(1) || "platform"
const props = { userId: "00000000-0000-4000-8000-0000000000c3", name: "Maya Ortiz", followers: 1280, following: 64, viewerFollowing: false, signedIn: true, isSelf: false }

let app: React.ReactNode
if (which === "platform") {
  app = (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", paddingTop: 80 }} data-ground="">
      <ProfileSocial {...props} />
    </div>
  )
} else {
  const chrome = resolveStorefrontChrome(which === "astrid" ? "astrid" : "sage")
  app = (
    <div data-storefront-root="" data-ground="" style={{ background: chrome.pageBackground, color: chrome.text, minHeight: "100vh", paddingTop: 80, ...(chrome.tokens as React.CSSProperties) }}>
      <div data-storefront-follow="">
        <ProfileSocial {...props} tone="storefront" scheme={chrome.action} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(app)
