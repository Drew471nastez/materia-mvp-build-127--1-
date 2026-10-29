/*
 * The sub pages of Products (an offer, a size chart, a coupon) against a
 * stubbed API, for scripts/check-subpages.mjs. window.__panel picks one:
 *
 *   "offer-new"    /app/offers/new?kind=bundle
 *   "offer-edit"   /app/offers/<id>, an upsell
 *   "break-new"    /app/offers/new?kind=quantity_break
 *   "chart-new"    /app/products/size-charts/new
 *   "chart-edit"   /app/products/size-charts/<id>
 *   "coupon-edit"  /app/coupons/<id>
 *   "collection-new"    /app/products/collections/new
 *   "collection-edit"   /app/products/collections/<id>, picked by hand
 *   "collection-rules"  /app/products/collections/<id>, matched by rules
 *
 * Fourteen products, so every picker scrolls in its box.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OfferEditor } from "@/app/app/offers/offer-editor"
import { SizeChartPage } from "@/app/app/products/size-charts/size-chart-page"
import { CouponEditor } from "@/app/app/coupons/coupon-editor"
import { CollectionPage } from "@/app/app/products/collections/collection-editor"
import type { Collection, CollectionProduct } from "@/app/app/products/collections/collection-parts"
import type { Offer } from "@/lib/offers/offers"
import type { OfferProduct } from "@/app/app/offers/offer-parts"
import type { SavedSizeChart } from "@/components/physical/size-chart-editor"
import type { CouponRecord } from "@/app/app/coupons/coupon-form"

type W = Window & { __panel?: string; __sent?: { method: string; path: string; body: unknown }[] }
const w = window as W
w.__sent = []
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
  const method = (init?.method || "GET").toUpperCase()
  if (method !== "GET") w.__sent!.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null })
  const body = path === "/api/store/offers" ? { offer: { ...OFFER, id: "o9" } } : path.startsWith("/api/size-charts") ? { id: "s1", charts: [CHART] } : path.startsWith("/api/collections") ? { id: "k9", collections: [COLLECTION] } : {}
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const P = (id: string, title: string, priceCents: number): OfferProduct => ({ id, title, type: "physical", published: true, priceCents, imageUrl: null, payWhatYouWant: false })
const MORE = ["Comb honey", "Honey mustard", "Bee pollen", "Propolis drops", "Royal jelly", "Mead kit", "Lip balm", "Hand cream", "Tea towel", "Gift box", "Jar opener"]
const PRODUCTS = [P(A, "Wildflower honey", 3200), P(B, "Honey dipper", 800), P(C, "Beeswax candle with a long name for small screens", 900), ...MORE.map((t, i) => P(`dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, "0")}`, t, 500 + i * 100))]
const OFFER: Offer = { id: "o2", kind: "checkout", title: "Add a candle", productIds: [C], triggerIds: [], triggerCollectionIds: [], discountType: "fixed", discountValue: 300, active: true, placements: ["cart", "checkout"], startsAt: null, endsAt: null, combinesWithCodes: true, maxPerOrder: null, minSubtotalCents: null }
const CHART: SavedSizeChart = {
  id: "s1",
  name: "Tees",
  unit: "cm",
  columns: [{ name: "Size", measure: false }, { name: "Chest", measure: true }, { name: "Length", measure: true }, { name: "Sleeve", measure: true }],
  rows: [["S", "92", "69", "20"], ["M", "98", "71", "21"], ["L", "104", "74", "22"], ["XL", "110", "76", "23"]],
  notes: "Measured flat.",
  imageUrl: null,
  productCount: 3,
  collectionIds: [],
  categories: [],
}
const COUPON = { id: "c1", code: "SUMMER20", discount_type: "percentage", discount_value: 20, product_ids: null, usage_limit: 100, usage_count: 12, starts_at: null, expires_at: null, min_purchase_cents: null, is_active: true, created_at: "2026-10-01T00:00:00Z" } as unknown as CouponRecord

const COLLECTION_PRODUCTS = PRODUCTS.map((p) => ({ id: p.id, title: p.title, thumbnail_url: null, type: "physical", status: "published", price_cents: p.priceCents, tags: [] })) as unknown as CollectionProduct[]
const COLLECTION: Collection = { id: "k1", title: "Kitchen", slug: "kitchen", description: "Everything for the table.", imageUrl: null, kind: "manual", rules: [], match: "all", sort: "manual", published: true, productIds: [A, B] }
const COLLECTION_RULES = { id: "k2", title: "Under $30", description: "", kind: "smart", rules: [{ field: "price", op: "less_than", value: "30" }], match: "all", sort: "manual", published: true, productIds: [B, C], imageUrl: null } as unknown as Collection

function Root() {
  const p = w.__panel
  const offer = (o: Offer | null, kind: Offer["kind"]) => <OfferEditor offer={o} kind={kind} products={PRODUCTS} collections={[{ id: "k", title: "Kitchen" }]} others={[OFFER]} currency="USD" physical ready settingsReady breaksReady sold={14} />
  if (p === "offer-edit") return offer(OFFER, "checkout")
  if (p === "break-new") return offer(null, "quantity_break")
  if (p === "chart-new") return <SizeChartPage creatorId="me" chart={null} ready rules targets={{ collections: [{ id: "k", title: "Tees" }], categories: ["Shirts"] }} />
  if (p === "chart-edit") return <SizeChartPage creatorId="me" chart={CHART} ready rules targets={{ collections: [{ id: "k", title: "Tees" }], categories: ["Shirts"] }} />
  if (p === "collection-new") return <CollectionPage collection={null} products={COLLECTION_PRODUCTS} />
  if (p === "collection-edit") return <CollectionPage collection={COLLECTION} products={COLLECTION_PRODUCTS} />
  if (p === "collection-rules") return <CollectionPage collection={COLLECTION_RULES} products={COLLECTION_PRODUCTS} />
  if (p === "coupon-edit") return <CouponEditor products={[]} currency="USD" initialCoupon={COUPON} />
  return offer(null, "bundle")
}

createRoot(document.getElementById("app")!).render(
  <div style={{ height: "100vh" }}>
    <Root />
  </div>,
)
