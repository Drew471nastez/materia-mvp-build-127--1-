/*
 * Round 58: Products › Upsells and bundles with its offer modal, against a
 * stubbed API, for scripts/check-offers-r58.mjs. `window.__view` picks what
 * the page opens on, as the addresses do:
 *
 *   list          /app/offers
 *   kind          /app/offers/new            the modal asks the kind first
 *   bundle        /app/offers/new?kind=bundle
 *   checkout      /app/offers/new?kind=checkout
 *   quantity      /app/offers/new?kind=quantity_break
 *   edit          /app/offers/<id>           a saved bundle
 *
 * Every write is kept in window.__sent; POST and PUT answer with the offer
 * as sent, given an id, as app/api/store/offers does.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OffersClient, type OffersOpening } from "@/app/(storelib)/app/offers/offers-client"
import type { Offer, OfferKind } from "@/lib/offers/offers"

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const D = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const COLL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const P = (id: string, title: string, priceCents: number) => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, payWhatYouWant: false })
const offer = (o: Partial<Offer> & Pick<Offer, "id" | "kind" | "title" | "productIds">): Offer => ({ triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 10, active: true, placements: ["product", "cart", "checkout"], startsAt: null, endsAt: null, combinesWithCodes: true, maxPerOrder: null, minSubtotalCents: null, ...o })
const OFFERS: Offer[] = [
  offer({ id: "11111111-1111-4111-8111-111111111111", kind: "bundle", title: "Breakfast set", productIds: [A, B], discountValue: 15, placements: ["product", "cart"] }),
  offer({ id: "22222222-2222-4222-8222-222222222222", kind: "checkout", title: "Add a candle", productIds: [C], discountType: "fixed", discountValue: 300, active: false }),
  offer({ id: "33333333-3333-4333-8333-333333333333", kind: "quantity_break", title: "Buy more, save more", productIds: [A], discountType: "none", discountValue: 0, placements: ["product", "cart"], tiers: [{ quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "" }] }),
]
const PRODUCTS = [P(A, "Wildflower honey", 3200), P(B, "Honey dipper", 800), P(C, "Beeswax candle", 900), P(D, "Linen tea towel", 1400)]

type W = Window & { __view?: string; __sent?: { method: string; body: unknown }[] }
const w = window as W
w.__sent = []
let serial = 0
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method || "GET").toUpperCase()
  const body = init?.body ? JSON.parse(String(init.body)) : null
  if (method !== "GET") w.__sent!.push({ method, body })
  const answer = method === "POST" || method === "PUT" ? { offer: { ...body, id: body?.id ?? `99999999-9999-4999-8999-${String(++serial).padStart(12, "0")}` } } : { ok: true }
  void input
  return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } })
}

const view = w.__view ?? "list"
const kinds: Record<string, OfferKind> = { bundle: "bundle", checkout: "checkout", quantity: "quantity_break" }
const opening: OffersOpening = view === "kind" ? { new: true, kind: null } : kinds[view] ? { new: true, kind: kinds[view] } : view === "edit" ? { id: OFFERS[0].id } : null

createRoot(document.getElementById("app")!).render(
  <div style={{ height: "100vh" }}>
    <OffersClient initialOffers={OFFERS} products={PRODUCTS} collections={[{ id: COLL, title: "Kitchen" }]} currency="USD" ready settingsReady breaksReady sold={{ [OFFERS[0].id]: 14 }} physical opening={opening} />
  </div>,
)
