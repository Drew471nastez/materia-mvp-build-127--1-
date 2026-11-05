/*
 * Upsells and bundles against a stubbed API, for scripts/check-offers-page.mjs:
 *
 *   "admin"      the store's page, /app/offers, with the rows the server
 *                would have read (window.__data)
 *   "bundle"     a product page's bundles and upsells (components/offers/bundle-offers.tsx)
 *   "checkout"   the checkout's Add to your order
 *   "cart"       the cart's savings and suggestions (components/offers/cart-offers.tsx)
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OffersClient } from "@/app/(storelib)/app/offers/offers-client"
import { BundleOffers } from "@/components/offers/bundle-offers"
import { CheckoutSuggestions, type Suggestion } from "@/components/offers/checkout-suggestions"
import { CartOfferSavings, CartOfferSuggestions, type CartOffersData } from "@/components/offers/cart-offers"
import { QuantityBreaks } from "@/components/offers/quantity-breaks"
import type { Offer } from "@/lib/offers/offers"
import type { OfferCollection, OfferProduct } from "@/app/(storelib)/app/offers/offer-parts"

type Data = { offers: Offer[]; products: OfferProduct[]; collections: OfferCollection[]; currency: string; ready: boolean; settingsReady: boolean; breaksReady?: boolean; sold?: Record<string, number>; physical: boolean }
type W = Window & { __panel?: string; __api?: Record<string, unknown>; __data?: Data; __cart?: CartOffersData; __sent?: { method: string; path: string; body: unknown }[]; __added?: unknown[] }
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

/* Storelib's own product section's tiers (round AG), the buy box's quantity in its state. */
function Breaks() {
  const [quantity, setQuantity] = React.useState(1)
  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: 16, background: "#fff" }} data-quantity={quantity}>
      <QuantityBreaks
        breaks={[{ offerId: "qb", productId: "a", title: "Buy more, save more", tiers: [
          { quantity: 1, freeQuantity: 0, discountType: "none", discountValue: 0, label: "Buy 1", badge: "" },
          { quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "Most popular" },
          { quantity: 3, freeQuantity: 2, discountType: "none", discountValue: 0, label: "Buy 3 get 2 free", badge: "" },
        ] }]}
        priceCents={3600}
        quantity={quantity}
        onPick={setQuantity}
        money={(c) => `$${(c / 100).toFixed(2)}`}
        palette={{ heading: "#123456", price: "#aa0000", badgeBg: "#ffeeaa", badgeText: "#553300" }}
      />
    </div>
  )
}

function Root() {
  if (w.__panel === "breaks") return <Breaks />
  if (w.__panel === "bundle")
    return (
      <div style={{ maxWidth: 440, margin: "0 auto", padding: 16, background: "#fff" }}>
        <BundleOffers
          productId="a"
          chosen={{ variantId: "av", variantName: null, priceCents: 3200, imageUrl: null }}
          onAdd={(lines) => w.__added!.push(...lines)}
          palette={{ heading: "#123456", price: "#aa0000", badgeBg: "#ffeeaa", badgeText: "#553300", buttonBg: "#0a7d55", buttonText: "#ffffff" }}
          buttonStyle="fill"
        />
      </div>
    )
  if (w.__panel === "checkout")
    return (
      <div style={{ maxWidth: 440, margin: "0 auto", padding: 16, background: "#fafafa" }}>
        <CheckoutSuggestions suggestions={SUGGESTIONS} money={(c) => `$${(c / 100).toFixed(2)}`} onAdd={(s, v) => w.__added!.push({ product: s.product.id, variant: v?.id ?? null })} />
      </div>
    )
  if (w.__panel === "cart")
    return (
      <div style={{ maxWidth: 400, margin: "0 auto", padding: 16, background: "#fff", color: "#111" }}>
        <CartOfferSuggestions data={w.__cart ?? null} onAdd={(lines) => w.__added!.push(...lines)} money={(c) => `$${(c / 100).toFixed(2)}`} colors={{ text: "#111111", muted: "#666666", border: "#e5e5e5" }} />
        <CartOfferSavings data={w.__cart ?? null} money={(c) => `$${(c / 100).toFixed(2)}`} className="mt-4 space-y-1 text-[13px]" />
      </div>
    )
  const d = w.__data!
  return (
    <div style={{ height: "100vh" }}>
      <OffersClient initialOffers={d.offers} products={d.products} collections={d.collections} currency={d.currency} ready={d.ready} settingsReady={d.settingsReady} breaksReady={d.breaksReady !== false} sold={d.sold ?? {}} physical={d.physical} />
    </div>
  )
}
createRoot(document.getElementById("app")!).render(<Root />)
