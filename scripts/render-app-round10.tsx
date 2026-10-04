/**
 * Round 10's app and navigation, rendered for scripts/check-app-round10.mjs.
 * One scene per load, read from the hash:
 *
 *   scene=header&path=/p&app=1      the real Storelib header, in the app or not
 *   scene=product&app=1             a product's top: the header, the product's own bar, the back
 *   scene=tabs&path=/account/library  the real tab bar over a tall page
 *   scene=ptr                       the real pull to refresh around a long feed
 *   scene=receipt&app=1             the receipt in its new frame
 *   scene=start                     the app's start gate, with a session on the phone
 *
 * `app=1` is the app as the head script makes it before the first paint:
 * html.capacitor and a Capacitor bridge with a Haptics plugin that records.
 */
import React, { useEffect, useSyncExternalStore } from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PlatformHeaderClient } from "@/components/platform/platform-header-client"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { DiscoverBackBreadcrumb } from "@/components/product/discover-back-breadcrumb"
import { DiscoverStickyWrapper } from "@/components/store-builder/discover-sticky-wrapper"
import { PULL_REFRESH_EVENT, PullToRefreshEvent, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { ReceiptView } from "@/app/receipt/[token]/receipt-view"
import { ConditionalHeader } from "@/components/marketing/conditional-header"
import NativeStartPage from "@/app/native-start/page"
import { receiptCases } from "./receipt-cases"

const params = new URLSearchParams(location.hash.slice(1))
const w = window as any
const scene = params.get("scene") || "header"
const app = params.get("app") === "1"
w.__nav = { path: params.get("path") || "/explore", subs: new Set<() => void>() }
w.__who = params.get("who") || "buyer"
w.__haptics = []
if (app) {
  document.documentElement.classList.add("capacitor")
  w.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    Plugins: {
      Haptics: {
        impact: (o: unknown) => (w.__haptics.push(["impact", o]), Promise.resolve()),
        selectionChanged: () => (w.__haptics.push(["selection"]), Promise.resolve()),
      },
    },
  }
}
try {
  sessionStorage.clear()
  if (scene !== "start") localStorage.clear()
  /* Signed in, as the header and the tab bar read it on their first frame (lib/auth/auth-snapshot). */
  if (scene !== "start" && w.__who !== "guest") localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
} catch {
  /* no storage */
}

const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const json = (body: unknown, delay = 0) => new Promise<Response>((r) => setTimeout(() => r(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })), delay))
  if (url.startsWith("/api/platform/flags")) return json({ communities: true, exploreMarketplace: true })
  if (url.startsWith("/api/me/places"))
    return json({ signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: false, recent: [{ kind: "product", id: "p-ambience", title: "Free Ambience Sample Pack", imageUrl: null }, { kind: "community", id: "c-mara", slug: "mara-club", title: "Mara Club", imageUrl: null }] }, 20)
  if (url.startsWith("/api/notifications/inbox")) return json({ unread: 2, items: [], nextCursor: null, available: true })
  if (url.startsWith("/api/wishlist")) return json({ count: 3 })
  return realFetch(input as RequestInfo, init)
}) as typeof fetch

const usePath = () => useSyncExternalStore((f) => (w.__nav.subs.add(f), () => w.__nav.subs.delete(f)), () => w.__nav.path)

function Page({ rows = 30 }: { rows?: number }) {
  return (
    <main className="bg-[#fafafa] px-4 py-5 text-[15px] text-neutral-500" data-page="">
      <h1 className="text-[24px] font-bold text-[#1a1a2e]" data-page-title="">{usePath()}</h1>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-3">
            <div className="aspect-[4/3] rounded-xl" style={{ background: ["#d9c7b1", "#b7c4cf", "#c9d3b4"][i % 3] }} />
            <div className="mt-3 h-3 w-3/4 rounded bg-[#e5e7eb]" />
          </div>
        ))}
      </div>
    </main>
  )
}

function Product() {
  return (
    <>
      <PlatformHeaderClient buyerHeaderLight />
      <DiscoverStickyWrapper>
        <div data-dark-bar="" className="flex h-[56px] items-center gap-3 bg-[#1f1f22] px-4 text-white">
          <span>&larr;</span>
          <span className="h-8 w-8 rounded-full bg-black" />
          <span className="font-semibold">TRP8</span>
        </div>
      </DiscoverStickyWrapper>
      <div className="px-4 pt-5">
        <DiscoverBackBreadcrumb creatorHref="/trp8" creatorName="TRP8" />
        <div className="aspect-video rounded-xl bg-[#4a463e]" data-gallery="" />
        <h1 className="mt-6 text-[28px] font-bold text-[#1a1a2e]">Black &amp; Gold, The Mission A, B, and C</h1>
        <div className="h-[900px]" />
      </div>
    </>
  )
}

function Feed() {
  useEffect(() => {
    const onPull = (e: Event) => {
      const d = (e as CustomEvent<PullRefreshDetail>).detail
      w.__pulls = (w.__pulls || 0) + 1
      if (d.scope === "community-feed") d.done = new Promise((r) => setTimeout(r, Number(params.get("work") || "600")))
    }
    window.addEventListener(PULL_REFRESH_EVENT, onPull)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, onPull)
  }, [])
  return (
    <>
      <div className="sticky top-0 z-40 flex h-[60px] items-center border-b border-[#eef0f3] bg-white px-4 font-semibold text-[#1a1a2e]" data-community-bar="">Mara Club</div>
      <PullToRefreshEvent scope="community-feed">
        {/* A sideways row nobody told the pull about, like a community's space chips. */}
        <div data-chips="" className="flex gap-2 overflow-x-auto bg-white px-4 py-3" style={{ scrollbarWidth: "none" }}>
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className="shrink-0 rounded-full border border-[#e5e7eb] px-4 py-2 text-[14px] text-[#1a1a2e]">Space {i + 1}</span>
          ))}
        </div>
        <div className="bg-[#f1f2f4]">
          {Array.from({ length: 24 }, (_, i) => (
            <article key={i} className="mb-2 bg-white px-4 py-4" data-post="">
              <div className="flex items-center gap-2.5"><span className="h-9 w-9 rounded-full bg-[#c9d3b4]" /><span className="font-semibold text-[#1a1a2e]">Member {i + 1}</span></div>
              <p className="mt-2 text-[15px] text-[#374151]">A post with a few words in it, the way a feed has them, so the page is long.</p>
            </article>
          ))}
        </div>
      </PullToRefreshEvent>
    </>
  )
}

function Receipt() {
  const c = receiptCases(location.origin).free
  return (
    <div className="flex min-h-svh flex-col bg-[#f5f6f8]" data-receipt-frame="">
      <div className="contents print:hidden">
        <ConditionalHeader buyerHeaderLight />
      </div>
      <div className="flex-1">
        <ReceiptView receipt={c.receipt as never} viewer={c.viewer as never} locale="en-US" />
      </div>
      <div className="contents print:hidden">
        <BuyerTabBar />
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById("app")!)
const withProviders = (node: React.ReactNode) => (
  <LocaleProvider>
    <PlatformSettingsProvider exploreMarketplace buyerHeaderLight>
      {node}
    </PlatformSettingsProvider>
  </LocaleProvider>
)

if (scene === "header") {
  root.render(withProviders(<><PlatformHeaderClient buyerHeaderLight /><Page /></>))
} else if (scene === "product") {
  root.render(withProviders(<Product />))
} else if (scene === "tabs") {
  root.render(withProviders(<><Page rows={40} /><BuyerTabBar /></>))
} else if (scene === "ptr") {
  root.render(withProviders(<Feed />))
} else if (scene === "receipt") {
  root.render(withProviders(<Receipt />))
} else if (scene === "start") {
  w.__startAt = performance.now()
  root.render(withProviders(<NativeStartPage />))
}
