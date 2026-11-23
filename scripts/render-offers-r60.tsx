/*
 * Round 60: Products › Upsells and bundles, its New offer chooser and an
 * offer's own page, against a stubbed API, for scripts/check-offers-flow-r60.mjs.
 *
 * Served over HTTP so the address is real: the page draws what the address
 * names, as app/(storelib)/app/offers/offers-screen.tsx does on the server:
 *
 *   /app/offers              the list (?choose=1: New offer's chooser open)
 *   /app/offers/new?kind=k   a new offer's page
 *   /app/offers/new          the list with the chooser open
 *   /app/offers/<id>         a saved offer's page (an unknown id: the list)
 *
 * next/navigation is scripts/probe-router-r60.ts: push, replace and back move
 * the real history. The "server" is the offers below: POST and PUT keep what
 * was sent (with an id), DELETE takes it out, and router.refresh() draws the
 * list from them again. Every write is kept in window.__sent.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { useRoute } from "./probe-router-r60"
import { OffersClient } from "@/app/(storelib)/app/offers/offers-client"
import { OfferEditor } from "@/app/(storelib)/app/offers/offer-editor"
import type { Offer, OfferKind } from "@/lib/offers/offers"

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const D = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const COLL = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const P = (id: string, title: string, priceCents: number) => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, payWhatYouWant: false })
const offer = (o: Partial<Offer> & Pick<Offer, "id" | "kind" | "title" | "productIds">): Offer => ({ triggerIds: [], triggerCollectionIds: [], discountType: "percent", discountValue: 10, active: true, placements: ["product", "cart", "checkout"], startsAt: null, endsAt: null, combinesWithCodes: true, maxPerOrder: null, minSubtotalCents: null, ...o })
let db: Offer[] = [
  offer({ id: "11111111-1111-4111-8111-111111111111", kind: "bundle", title: "Breakfast set", productIds: [A, B], discountValue: 15, placements: ["product", "cart"] }),
  offer({ id: "22222222-2222-4222-8222-222222222222", kind: "checkout", title: "Add a candle", productIds: [C], discountType: "fixed", discountValue: 300, active: false }),
  offer({ id: "33333333-3333-4333-8333-333333333333", kind: "quantity_break", title: "Buy more, save more", productIds: [A], discountType: "none", discountValue: 0, placements: ["product", "cart"], tiers: [{ quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: "Buy 2 get 1 free", badge: "" }] }),
]
const PRODUCTS = [P(A, "Wildflower honey", 3200), P(B, "Honey dipper", 800), P(C, "Beeswax candle", 900), P(D, "Linen tea towel", 1400)]
const SOLD = { "11111111-1111-4111-8111-111111111111": 14 }

type W = Window & { __sent?: { method: string; body: unknown }[]; __delay?: number }
const w = window as W
w.__sent = []
let serial = 0
window.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
  const method = (init?.method || "GET").toUpperCase()
  const body = init?.body ? JSON.parse(String(init.body)) : null
  if (method !== "GET") w.__sent!.push({ method, body })
  if (w.__delay) await new Promise((r) => setTimeout(r, w.__delay))
  let answer: unknown = { ok: true }
  if (method === "POST") {
    const saved = { ...body, id: `99999999-9999-4999-8999-${String(++serial).padStart(12, "0")}` }
    delete saved.formCurrency
    db = [...db, saved]
    answer = { offer: saved }
  } else if (method === "PUT") {
    const saved = { ...body }
    delete saved.formCurrency
    db = db.map((o) => (o.id === saved.id ? saved : o))
    answer = { offer: saved }
  } else if (method === "DELETE") db = db.filter((o) => o.id !== body?.id)
  return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } })
}

const KINDS: OfferKind[] = ["bundle", "checkout", "quantity_break"]
const common = { products: PRODUCTS, collections: [{ id: COLL, title: "Kitchen" }], currency: "USD", ready: true }

function Route() {
  const key = useRoute()
  const url = new URL(key.split("#")[0], window.location.origin)
  const path = url.pathname
  /* The rows as the server has them, read again on each move and each refresh. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = React.useMemo(() => [...db], [key])
  /* What the server would draw for the address (offers-screen.tsx). */
  const list = (choose = false) => <OffersClient key="list" initialOffers={rows} sold={SOLD} choose={choose} {...common} />
  if (path === "/app/offers/new") {
    const kind = KINDS.find((k) => k === url.searchParams.get("kind"))
    if (!kind) return list(true)
    return <OfferEditor key={`new-${kind}`} offer={null} kind={kind} others={db} physical settingsReady breaksReady sold={0} {...common} />
  }
  const m = /^\/app\/offers\/([^/]+)$/.exec(path)
  if (m) {
    const o = db.find((x) => x.id === m[1])
    if (o) return <OfferEditor key={o.id} offer={o} kind={o.kind} others={db} physical settingsReady breaksReady sold={SOLD[o.id as keyof typeof SOLD] ?? 0} {...common} />
  }
  return list(url.searchParams.get("choose") === "1")
}

createRoot(document.getElementById("app")!).render(
  <div style={{ height: "100vh" }}>
    <Route />
  </div>,
)
