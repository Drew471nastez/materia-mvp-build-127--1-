/**
 * The real platform header (light, as storelib.com has it) for
 * scripts/check-header-auth-menus.mjs: the navigator on Explore, product and
 * creator pages, the hamburger sheet on the marketing pages. The probe stubs
 * Supabase and the router; this stubs GET /api/me/places with a switch the
 * probe turns:
 *
 *   window.__who          "guest" | "buyer" | "seller", who the cookie says
 *   window.__placesMode   "ok" | "fail" (a 500) | "slow" (2.5s) | "hang" (never answers) | "offline" (throws)
 *   window.__nav.go(path) a client side move
 *   window.__signIn(who) / window.__signOut()
 *                         what another tab does: the cookie changes, that tab's header writes the record,
 *                         this tab hears the storage event and Supabase's broadcast
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
w.__nav = {
  path: params.get("path") || "/explore",
  subs: new Set<() => void>(),
  go(path: string) {
    w.__nav.path = path
    w.__nav.subs.forEach((f: () => void) => f())
  },
}
w.__who = params.get("who") || "guest"
w.__placesMode = params.get("places") || "ok"
w.__placesAsked = 0
try {
  if (params.get("keep") !== "1") {
    localStorage.clear()
    sessionStorage.clear()
  }
} catch {
  /* no storage */
}

const places = () => {
  const who = w.__who
  if (who === "guest") return { signedIn: false, communitiesOn: true, isCreator: false, hasSellerAccess: false, recent: [] }
  return {
    signedIn: true,
    communitiesOn: true,
    isCreator: who === "seller",
    hasSellerAccess: who === "seller",
    recent: [
      { kind: "course", id: "k-grade", slug: "", title: "Color Grading for Film", imageUrl: null },
      { kind: "community", id: "c-mara", slug: "mara-club", title: "Mara Club", imageUrl: null },
    ],
  }
}
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const json = (body: unknown, delay = 0, status = 200) =>
    new Promise<Response>((resolve, reject) => {
      const t = setTimeout(() => resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })), delay)
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(t)
        reject(new DOMException("aborted", "AbortError"))
      })
    })
  if (url.startsWith("/api/me/places")) {
    w.__placesAsked++
    /* The answer is for whoever the cookie named when it was asked. */
    const body = places()
    const mode = w.__placesMode
    if (mode === "fail") return json({ error: "boom" }, 80, 500)
    if (mode === "offline") return Promise.reject(new TypeError("Failed to fetch"))
    if (mode === "hang") return json(body, 600_000)
    return json(body, mode === "slow" ? 2500 : 60)
  }
  if (url.startsWith("/api/notifications/inbox")) return json({ unread: 0, items: [], nextCursor: null, available: true })
  if (url.startsWith("/api/wishlist")) return json({ count: 0 })
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

const KEY = "_sl_auth_v1"
const record = (who: string) =>
  who === "guest"
    ? null
    : JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: who === "seller" })
/* Another tab: it changes the cookie, its header writes the record, and this tab hears both. */
const otherTab = (who: string, event: "SIGNED_IN" | "SIGNED_OUT") => {
  w.__who = who
  const was = localStorage.getItem(KEY)
  const next = record(who)
  if (next) localStorage.setItem(KEY, next)
  else localStorage.removeItem(KEY)
  window.dispatchEvent(new StorageEvent("storage", { key: KEY, oldValue: was, newValue: next, storageArea: localStorage }))
  if (params.get("broadcast") !== "0") for (const f of w.__authSubs ?? []) f(event, who === "guest" ? null : { user: { id: "u1" } })
}
w.__signIn = (who = "buyer") => otherTab(who, "SIGNED_IN")
w.__signOut = () => otherTab("guest", "SIGNED_OUT")

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight>
      <PlatformHeaderClient buyerHeaderLight />
      <main className="min-h-[1600px] bg-[#f8f9fa] p-8" data-page="" />
    </PlatformSettingsProvider>
  </LocaleProvider>,
)
