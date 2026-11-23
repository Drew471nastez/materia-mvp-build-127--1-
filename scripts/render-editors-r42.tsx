/*
 * The collection editor and the offer editor against a stubbed API, for
 * scripts/check-editors-r42.mjs:
 *
 *   "collection"   a saved collection's page (app/(storelib)/app/products/collections/collection-editor)
 *   "offer-new"    a new bundle's page (app/(storelib)/app/offers/offer-editor; round 60: the kind is asked over the list first)
 *   "offer-edit"   a saved bundle's page
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { CollectionPage } from "@/app/(storelib)/app/products/collections/collection-editor"
import { OfferEditor } from "@/app/(storelib)/app/offers/offer-editor"
import type { Offer } from "@/lib/offers/offers"
import type { OfferProduct } from "@/app/(storelib)/app/offers/offer-parts"
import type { Collection, CollectionProduct } from "@/app/(storelib)/app/products/collections/collection-parts"

type W = Window & { __panel?: string; __sent?: { method: string; path: string; body: unknown }[] }
const w = window as W
w.__sent = []
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (method !== "GET") w.__sent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  return new Response(JSON.stringify({ collections: [], offers: [] }), { status: 200, headers: { "Content-Type": "application/json" } })
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const CP = (id: string, title: string, price: number): CollectionProduct => ({ id, title, thumbnail_url: null, type: "physical", status: "published", price_cents: price, tags: [], vendor: null })
const COLLECTION: Collection = { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "Kitchen", slug: "kitchen", description: "Everything for the table.", imageUrl: null, kind: "manual", rules: [], match: "all", sort: "manual", published: true, productIds: [A, B] }
const OP = (id: string, title: string, priceCents: number): OfferProduct => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, payWhatYouWant: false })
const OFFER: Offer = { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", kind: "bundle", title: "Breakfast set", productIds: [A, B], triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 10, active: true, placements: ["product", "cart"], startsAt: null, endsAt: null, combinesWithCodes: true, maxPerOrder: null, minSubtotalCents: null } as unknown as Offer
const products = [OP(A, "Wildflower honey", 3200), OP(B, "Honey dipper", 800), OP(C, "Beeswax candle", 900)]

function Root() {
  if (w.__panel === "collection") return <div style={{ height: "100vh" }}><CollectionPage collection={COLLECTION} products={[CP(A, "Wildflower honey", 3200), CP(B, "Honey dipper", 800), CP(C, "Beeswax candle", 900)]} /></div>
  const saved = w.__panel === "offer-edit"
  return (
    <div style={{ height: "100vh" }}>
      <OfferEditor offer={saved ? OFFER : null} kind={saved ? OFFER.kind : "bundle"} products={products} collections={[]} others={[]} currency="USD" physical ready settingsReady breaksReady sold={saved ? 4 : 0} />
    </div>
  )
}
createRoot(document.getElementById("app")!).render(<Root />)
