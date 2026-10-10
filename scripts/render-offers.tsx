/*
 * Upsells and bundles against a stubbed API, for scripts/check-offers.mjs:
 * the store's page (`window.__panel = "admin"`), a product page's bundle
 * block (`"bundle"`) and the checkout's Add to your order (`"checkout"`).
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OffersClient } from "@/app/app/offers/offers-client"
import { BundleOffers } from "@/components/offers/bundle-offers"
import { CheckoutSuggestions, type Suggestion } from "@/components/offers/checkout-suggestions"

type W = Window & { __panel?: string; __api?: Record<string, unknown>; __sent?: { method: string; path: string; body: unknown }[]; __added?: unknown[] }
const w = window as W
w.__sent = []
w.__added = []
const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const full = url.replace(/^https?:\/\/[^/]+/, "")
  const path = full.split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (!path.startsWith("/api/")) return realFetch(input, init)
  if (method !== "GET") w.__sent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  const body = w.__api?.[`${method} ${path}`] ?? w.__api?.[path] ?? {}
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

const SUGGESTIONS: Suggestion[] = [
  { offerId: "o2", title: "Add to your order", label: "50% off", offerPriceCents: 450, product: { id: "c", title: "Beeswax candle", slug: "candle", imageUrl: null, type: "physical", priceCents: 900, variants: [{ id: "cv", name: "Default", priceCents: 900 }] } },
  { offerId: "o3", title: "Complete the look", label: null, offerPriceCents: 2400, product: { id: "d", title: "Linen apron with a rather long name for a small screen", slug: "apron", imageUrl: null, type: "physical", priceCents: 2400, variants: [{ id: "d1", name: "Sage", priceCents: 2400 }, { id: "d2", name: "Rust", priceCents: 2400 }] } },
]

function Root() {
  if (w.__panel === "bundle")
    return (
      <div style={{ maxWidth: 440, margin: "0 auto", padding: 16, background: "#fff" }}>
        <BundleOffers productId="a" chosen={{ variantId: "av", variantName: null, priceCents: 3200, imageUrl: null }} onAdd={(lines) => w.__added!.push(...lines)} />
      </div>
    )
  if (w.__panel === "checkout")
    return (
      <div style={{ maxWidth: 440, margin: "0 auto", padding: 16, background: "#fafafa" }}>
        <CheckoutSuggestions suggestions={SUGGESTIONS} onAdd={(s, v) => w.__added!.push({ product: s.product.id, variant: v?.id ?? null })} />
      </div>
    )
  return (
    <div style={{ height: "100vh" }}>
      <OffersClient />
    </div>
  )
}
createRoot(document.getElementById("app")!).render(<Root />)
