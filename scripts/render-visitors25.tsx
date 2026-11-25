/**
 * Round 25 (G25) probe pages, for scripts/check-visitors25.ts: the real
 * components, every /api request answered here, the store's tags as the
 * server writes them (lib/store/tracking.ts trackingTags, handed in as
 * window.__tags) put on the page after it is interactive, in order, the way
 * next/script's afterInteractive does.
 *
 *   ?view=site        a Storelib theme's home (the default theme's own
 *                     sections through ThemePage), its language switch and
 *                     offer card, TrackView, GaRoute and the cookie banner
 *   ?view=creator     the creator page's client parts on a stand-in page:
 *                     GaRoute, the language row and its offer, links that
 *                     change the page without a full load, and Explore
 *   ?view=onepage     a OnePage stand-in with the store's tag
 *   ?view=checkout    begin_checkout, then Pay says it was paid (as
 *                     app/(storelib)/checkout/checkout-client.tsx does)
 *   ?view=thanks      a thank you page's purchase
 *   ?view=settings    Settings › Integrations › Google Analytics (GaConnect)
 *   ?view=commerce    Website settings › Commerce, its Integrations row
 *   ?view=markets     Settings › Markets and languages, the new switch
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { TrackView } from "@/components/analytics/track-view"
import { GaRoute, type GaCheckout } from "@/components/analytics/ga-route"
import { CreatorLanguage } from "@/components/storefront/creator-language"
import { GaConnect, type GaStatusView } from "@/components/app/settings/ga-connect"
import { CommerceSettings } from "@/components/website-builder/website-settings/commerce"
import { MarketsPanel } from "@/components/app/settings/markets-panel"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { starterRows } from "./_fixtures/native-starter"
import type { GaItem } from "@/lib/store/ga"

const q = new URLSearchParams(location.search)
const view = q.get("view") || "site"
const SHOP = "c0000000-0000-4000-8000-000000000001"
const PRODUCT = "11111111-1111-4111-8111-111111111111"
const GA = "G-C2SD9ZCTXK"

declare global {
  interface Window {
    __tags?: { key: string; src?: string; inline?: string }[]
    __calls?: string[]
    __ga?: GaStatusView | null
  }
}

/** next/script afterInteractive: after the page is interactive, each in order; an inline one runs as it is put in. */
function useServerTags() {
  React.useEffect(() => {
    for (const t of window.__tags ?? []) {
      const s = document.createElement("script")
      s.id = `storelib-${t.key}`
      if (t.src) {
        s.src = t.src
        s.async = true
      } else s.textContent = t.inline ?? ""
      document.body.appendChild(s)
    }
  }, [])
}

function stubFetch() {
  const calls: string[] = (window.__calls = [])
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  let ga: GaStatusView | null = window.__ga ?? null
  let saved: string | null = ga?.id ?? null
  let local = {
    defaultLanguage: "en",
    languages: [
      { code: "fr", published: true },
      { code: "de", published: true },
    ],
    markets: [{ id: "primary", name: "Home", countries: ["US"], currency: null, language: null, active: true, primary: true, rounding: "none", adjustBps: 0 }],
    visitorLanguage: false,
  }
  const real = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url}${init?.body ? ` ${String(init.body)}` : ""}`)
    if (url === "/api/store/integrations" && method === "GET") return json({ tracking: saved ? { ga4: saved } : {}, ready: true, ga })
    if (url === "/api/store/integrations" && method === "PUT") {
      const b = JSON.parse(String(init?.body ?? "{}")) as { value: string | null }
      saved = b.value
      ga = saved ? { id: saved, seenAt: null, checkedAt: null, ready: true } : null
      return json({ tracking: saved ? { ga4: saved } : {}, ready: true })
    }
    if (url === "/api/store/ga-check" && method === "POST") {
      ga = { id: saved, seenAt: ga?.seenAt ?? null, checkedAt: new Date().toISOString(), ready: true }
      return json({ ga })
    }
    if (url === "/api/store/markets" && method === "GET") return json({ ready: true, localization: local, autoTranslate: { run: { at: new Date(Date.now() - 20 * 60_000).toISOString(), translated: 12, left: 3 }, available: true }, baseCurrency: "USD", chargeCurrency: "USD", fx: null })
    if (url === "/api/store/markets" && method === "PUT") {
      local = (JSON.parse(String(init?.body ?? "{}")) as { localization: typeof local }).localization
      return json({ localization: local })
    }
    if (url.startsWith("/api/track") || url.startsWith("/api/")) return json({})
    return real(input as RequestInfo, init)
  }) as typeof fetch
}

/* ── A Storelib theme's page ─────────────────────────────────────────── */

function Site() {
  useServerTags()
  const rows = starterRows(SHOP)!
  const lang = q.get("lang") || "en"
  const product = q.get("page") === "product"
  return (
    <>
      <ThemePage
        theme={rows.settings}
        sections={rows.pages.find((p) => p.page_key === (product ? "product" : "home"))!.sections.slice(0, 4)}
        storefront={{ creatorId: SHOP, installId: "i1", pages: ["home"], pageKey: "home", language: { code: lang, defaultLanguage: "en", languages: [{ code: "en", name: "English" }, { code: "fr", name: "Français" }, { code: "de", name: "Deutsch" }] } }}
      />
      <TrackView type={product ? "product" : "store"} creatorId={SHOP} productId={product ? PRODUCT : undefined} />
      <GaRoute ids={[GA]} product={product ? { item: { item_id: PRODUCT, item_name: "Speckled mug", price: 32, item_category: "Physical" } as GaItem, currency: "USD" } : null} />
      <CookieConsentBanner />
    </>
  )
}

/* ── The creator page's client parts, on a stand-in page ─────────────── */

function usePath() {
  return React.useSyncExternalStore(
    (f) => {
      window.addEventListener("popstate", f)
      window.addEventListener("sl:nav", f)
      return () => {
        window.removeEventListener("popstate", f)
        window.removeEventListener("sl:nav", f)
      }
    },
    () => location.pathname,
    () => location.pathname,
  )
}
function go(path: string) {
  history.pushState({}, "", path)
  document.title = path === "/explore" ? "Explore" : path === "/andrew" ? "Andrew" : `Andrew · ${path.split("/").pop()}`
  window.dispatchEvent(new Event("sl:nav"))
}
function Creator() {
  useServerTags()
  const path = usePath()
  const mine = path === "/andrew" || path.startsWith("/andrew/")
  const link = (to: string, label: string, id: string) => (
    <a
      href={to}
      data-go={id}
      onClick={(e) => {
        e.preventDefault()
        go(to)
      }}
      className="block rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] font-medium text-[#1a1a2e]"
    >
      {label}
    </a>
  )
  return (
    <div className="min-h-dvh bg-[#f8f9fa]">
      <main className="mx-auto max-w-[720px] space-y-3 px-4 py-10">
        <h1 className="text-[28px] font-bold text-[#1a1a2e]" data-where={path}>
          {mine ? "Andrew" : "Explore"}
        </h1>
        {link("/andrew/tech-house-drum-kit", "Tech house drum kit", "kit")}
        {link("/andrew/black-sleeve", "Black sleeve", "sleeve")}
        {link("/andrew", "Andrew", "home")}
        {link("/explore", "Explore", "explore")}
      </main>
      {mine ? <GaRoute ids={[GA]} /> : null}
      {mine ? <CreatorLanguage code={q.get("lang") || "en"} defaultLanguage="en" languages={[{ code: "en", name: "English" }, { code: "fr", name: "Français" }, { code: "de", name: "Deutsch" }]} /> : null}
    </div>
  )
}

function OnePage() {
  useServerTags()
  return (
    <div className="min-h-dvh bg-[#111] px-4 py-12 text-center text-white">
      <p className="text-[22px] font-semibold">Andrew</p>
      <a className="mt-6 block rounded-full bg-white px-4 py-3 font-medium text-[#111]" href="https://example.com/">
        My latest pack
      </a>
      <GaRoute ids={[GA]} />
    </div>
  )
}

function Checkout() {
  useServerTags()
  const checkout: GaCheckout = { items: [{ item_id: PRODUCT, item_name: "Tech house drum kit", price: 24.99, quantity: 1, item_category: "Digital" }], valueCents: 2499, currency: "USD" }
  return (
    <div className="min-h-dvh bg-[#f8f9fa] px-4 py-10">
      <div className="mx-auto max-w-[480px] rounded-2xl border border-[#e5e7eb] bg-white p-5">
        <p className="text-[16px] font-semibold text-[#1a1a2e]">Tech house drum kit</p>
        <p className="text-[14px] text-[#6b7280]">$24.99</p>
        <button
          type="button"
          data-pay=""
          className="mt-4 h-11 w-full rounded-lg bg-[#1a1a2e] text-white"
          onClick={() => window.dispatchEvent(new CustomEvent("storelib:paid", { detail: { ref: "rcpt_9f8e7d6c5b4a39281706f5e4d3c2b1a0", totalCents: 2499 } }))}
        >
          Pay
        </button>
      </div>
      <GaRoute ids={[GA]} checkout={checkout} />
    </div>
  )
}

function Thanks() {
  useServerTags()
  return (
    <div className="min-h-dvh bg-[#f8f9fa] px-4 py-10">
      <h1 className="text-[24px] font-semibold text-[#1a1a2e]">Thank you for your order</h1>
      <GaRoute ids={[GA]} />
    </div>
  )
}

function Settings() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] px-4 py-6 sm:px-8">
      <section className="mx-auto max-w-[720px] rounded-2xl border border-[#e5e7eb]/70 bg-white">
        <div className="border-b border-[#f1f2f4] px-4 py-3.5 sm:px-6">
          <h3 className="text-[15px] font-semibold text-[#1a1a2e]">{q.get("state") === "empty" ? "Set up" : "Settings"}</h3>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <GaConnectHost />
        </div>
      </section>
    </div>
  )
}
function GaConnectHost() {
  const [value, setValue] = React.useState<string | null>(window.__ga?.id ?? null)
  return <GaConnect value={value} ready onSaved={(t) => setValue(t.ga4 ?? null)} />
}

function Commerce() {
  const ctx = { settings: {}, onSettingChange: () => {}, onNavigate: (h: string) => window.__calls?.push(`navigate ${h}`), productCount: 4 } as never
  return (
    <div className="min-h-dvh bg-[#0f0f0f] px-4 py-6 text-white">
      <div className="mx-auto max-w-[720px]">
        <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
          <CommerceSettings ctx={ctx} />
        </PlatformSettingsProvider>
      </div>
    </div>
  )
}

function Markets() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa] px-4 py-6">
      <div className="mx-auto max-w-[760px]">
        <MarketsPanel />
      </div>
    </div>
  )
}

stubFetch()
const views: Record<string, () => React.ReactElement> = { site: Site, creator: Creator, onepage: OnePage, checkout: Checkout, thanks: Thanks, settings: Settings, commerce: Commerce, markets: Markets }
const View = views[view] ?? Site
createRoot(document.getElementById("root")!).render(<View />)
