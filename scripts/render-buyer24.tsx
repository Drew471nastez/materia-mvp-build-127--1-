/**
 * Round 24 (C24) probe pages, for scripts/check-buyer24.mjs: the real
 * components with a fixture shop, every /api request answered here.
 *
 *   ?view=status    the buyer's order page: Need help with this order?
 *                   (Contact the shop, Cancel order, Return items, the
 *                   shop's email and phone), a parcel shipped long ago and
 *                   never marked delivered
 *   ?view=case      the buyer's conversation: the shop's answer, a photo,
 *                   Ask Storelib for help (three days unanswered)
 *   ?view=seller    the seller's order: Messages from the buyer with the
 *                   reply box, Notes with the cart's attributes and a
 *                   line's properties, a shipment Delivery not confirmed
 *   ?view=product   a product section saved before Delivery and pickup:
 *                   drawn after the low stock line
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { CaseView } from "@/app/(storelib)/order-help/[id]/case-view"
import { OrderMessagesCard } from "@/components/support/order-messages-card"
import { BuyerNoteCard, PhysicalFulfillment, usePhysicalOrder } from "@/components/physical/order-panel"
import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { siteCommerce } from "@/lib/website-builder/site-commerce"
import { productBlockDefaults } from "@/lib/website-builder/product-page"
import type { ProductSectionData } from "@/lib/products/product-page-model"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const q = new URLSearchParams(location.search)
const view = q.get("view") ?? "status"
const pic = (fill: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${fill}"/></svg>`)
const CO = "c0000000-0000-4000-8000-0000000000aa"
const CASE = "ca5e0000-0000-4000-8000-000000000001"
const day = 86_400_000
const ago = (n: number) => new Date(Date.now() - n * day).toISOString()

declare global {
  interface Window {
    __calls?: string[]
  }
}

const caseSummary = { id: CASE, reason: "damaged", status: "store", escalated: false, escalatedBy: null, orderRef: "C0000000", kind: "physical", buyerEmail: "sam@example.com", buyerName: "Sam Rivera", createdAt: ago(4), lastMessageAt: ago(1), unread: true }
const thread = [
  { id: 1, author: "buyer", internal: false, body: "The bowl arrived cracked down the side. Photo attached.", createdAt: ago(4), photos: [{ url: pic("#c9b8a6"), name: "bowl.jpg" }] },
  { id: 2, author: "buyer", internal: false, body: "Any news? I'd like a replacement or a refund.", createdAt: ago(1) },
]

const calls: string[] = (window.__calls = [])
let asked = false
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? "GET"
  const multipart = typeof FormData !== "undefined" && init?.body instanceof FormData
  calls.push(`${method} ${url}${multipart ? ` form photos=${(init!.body as FormData).getAll("photos").length}` : ""}`)
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  if (url === "/api/order-help" && method === "POST") return json({ id: CASE, link: `/order-help/${CASE}?k=demo`, existing: false, photosNotKept: false })
  /* Escalated once the buyer has asked (a POST); until then the case as it was, since the page reads it again while it is open. */
  if (url.startsWith(`/api/order-help/${CASE}`) && method === "POST") asked = true
  if (url.startsWith(`/api/order-help/${CASE}`) && !asked) return json({ case: caseSummary, messages: thread, escalation: { can: true, from: ago(1) } })
  if (url.startsWith(`/api/order-help/${CASE}`)) return json({ case: { ...caseSummary, escalated: true, status: "storelib" }, messages: [...thread, { id: 3, author: "buyer", internal: false, body: "Asking Storelib to help.", createdAt: new Date().toISOString() }], escalation: { can: false, from: null } })
  if (url.startsWith("/api/store/cases?")) return json({ cases: [caseSummary] })
  if (url.startsWith(`/api/store/cases/${CASE}`)) return json({ case: { ...caseSummary, unread: false }, messages: thread })
  if (url.startsWith("/api/physical/orders/")) return json({ order: sellerOrder, locations: [{ id: "loc", name: "Studio" }] })
  if (url.startsWith("/api/physical/storefront/shop")) return json({ returns: { enabled: true, windowDays: 30 }, freeShippingFromCents: 7500 })
  return json({})
}) as typeof fetch

/* ── the buyer's order page ─────────────────────────────────────────── */

function Status() {
  return (
    <OrderStatusView
      token="tok_demo_demo_demo_demo_demo"
      justPaid={false}
      shop={{ name: "Fern & Clay", avatar: null, email: "hello@fernandclay.example", phone: "+1 303 555 0142", websiteUrl: "https://fernandclay.example" }}
      help={{ openCase: null }}
      canReturn
      cancel={q.get("cancel") === "1" ? "can_request" : undefined}
      order={{
        id: CO, status: "paid", fulfillmentStatus: "fulfilled", cancelled: false, createdAt: ago(40), email: "sam@example.com", name: "Sam Rivera",
        address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
        delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 }, pickup: null, processing: true,
        totals: { subtotal: 10800, discount: 0, shipping: 600, tax: 0, taxIncluded: false, total: 11400, refunded: 0, currency: "USD" },
        lines: [
          { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", imageUrl: pic("#d8cbb8"), quantity: 2, cents: 6400, type: "physical", receiptToken: null, returnable: 2 },
          { orderId: "22222222-2222-4222-8222-222222222222", title: "Serving bowl", variantName: null, imageUrl: pic("#b9c4bd"), quantity: 1, cents: 4400, type: "physical", receiptToken: null, returnable: 1 },
        ],
        shipments: [{ id: "s1", status: "in_transit", carrier: "USPS", trackingNumber: "9400 1000 0000 0000 0000 00", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: ago(10), deliveredAt: null, items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }] }],
        returns: [],
        returnPolicy: { days: 30, endsAt: new Date(Date.now() + (5 + 14 - 10 + 30) * day).toISOString(), open: true, started: false, assumed: true },
      }}
    />
  )
}

/* ── the buyer's conversation ───────────────────────────────────────── */

function Case() {
  return (
    <CaseView
      id={CASE}
      k="demo"
      initial={{ case: caseSummary as never, messages: thread as never, escalation: { can: true, from: ago(1) } }}
      store={{ name: "Fern & Clay", logoUrl: null, email: "hello@fernandclay.example", phone: "+1 303 555 0142", websiteUrl: "https://fernandclay.example" }}
    />
  )
}

/* ── the seller's order ─────────────────────────────────────────────── */

const sellerOrder = {
  id: CO, status: "paid", fulfillmentStatus: "fulfilled", returnStatus: "none", currency: "USD", buyerName: "Sam Rivera", buyerPhone: null,
  totalCents: 11400, refundedCents: 0, shippingCents: 600, shippingDiscountCents: 0,
  address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
  delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 }, deliveryMethod: "ship", pickup: null, processingAt: ago(64),
  buyerNote: "Please leave it with the neighbour if nobody is in.", cartAttributes: { "Gift message": "Happy housewarming, Ana!", "Delivery date": "Friday" }, merchantNote: null, cancelledAt: null,
  lines: [
    { orderId: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", variantName: "12 oz / Sand", sku: null, imageUrl: pic("#d8cbb8"), type: "physical", quantity: 2, unitCents: 3200, discountCents: 0, requiresShipping: true, locationId: "loc", fulfillmentMethod: "self", fulfilled: 2, returned: 0, amountCents: 6400, refundedCents: 0, properties: { Engraving: "A & J" } },
  ],
  shipments: [{ id: "s1", status: "in_transit", carrier: "USPS", trackingNumber: "9400100000000000000000", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction", shippedAt: ago(62), deliveredAt: null, createdAt: ago(62), locationId: "loc", items: [{ orderId: "11111111-1111-4111-8111-111111111111", quantity: 2 }], unconfirmedAt: ago(2) }],
  returns: [],
  events: [{ id: 9, kind: "delivery.unconfirmed", message: "Delivery not confirmed: USPS 9400100000000000000000 shipped 60 days ago and was never marked delivered. Check with the carrier or the buyer.", actor: "system", createdAt: ago(2) }],
}

function Seller() {
  const state = usePhysicalOrder("11111111-1111-4111-8111-111111111111")
  return (
    <div className="mx-auto grid max-w-[1100px] gap-4 px-4 py-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-4">
        <PhysicalFulfillment state={state} number={1004} onNotice={() => undefined} onRefund={null} onRefundAll={null} />
        <OrderMessagesCard checkoutId={CO} />
      </div>
      <div className="grid min-w-0 content-start gap-4">
        <BuyerNoteCard order={state.order} />
      </div>
    </div>
  )
}

/* ── a product page saved before Delivery and pickup ────────────────── */

const product: ProductSectionData = {
  id: "11111111-1111-4111-8111-111111111111", title: "Speckled mug", slug: "speckled-mug", type: "physical",
  description: "<p>Thrown by hand, glazed in sand.</p>", description_html: "<p>Thrown by hand, glazed in sand.</p>",
  price_cents: 3200, compare_at_cents: null, thumbnail_url: pic("#d8cbb8"), gallery_urls: [pic("#d8cbb8")],
  options: [], variants: [{ id: "20000000-0000-4000-8000-000000000001", name: "Default", options: [null, null, null], price_cents: 3200, compare_at_cents: null, image_url: null, available: true, left: 3, max_quantity: 3, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null }],
  inventory_left: 3, low_stock_at: 5, created_at: "2026-01-01T00:00:00Z",
  delivery: { ship: { country: "US", priceCents: 600, estimate: "3 to 5 business days", freeFromCents: 7500 }, pickup: { "20000000-0000-4000-8000-000000000001": [{ name: "Studio", city: "Denver", ready: "Usually ready in 24 hours" }] } },
} as unknown as ProductSectionData
const block = (type: string) => ({ id: `old-${type}`, type, settings: productBlockDefaults(type) })
/* As a page saved in September has it: no Delivery and pickup block, no mark. */
const oldSection: SectionInstance = { id: "main-product", type: "product", name: "Product", hidden: false, settings: { _product_data: product }, blocks: [block("title"), block("price"), block("quantity"), block("buy_buttons"), block("low_stock"), block("description")] } as SectionInstance
const theme = { border_radius: 8, button_style: "rounded" } as ThemeSettingsValues

function Product() {
  return (
    <StorefrontProvider value={{ creatorId: "c", commerce: siteCommerce(theme as Record<string, unknown>) }}>
      <SiteCartProvider shopId="c" cartType="page">
        <div className="@container" data-product-box="">
          <ProductSection section={oldSection} theme={theme} />
        </div>
      </SiteCartProvider>
    </StorefrontProvider>
  )
}

function App() {
  if (view === "case") return <Case />
  if (view === "seller") return <div style={{ background: "#f8f9fa", minHeight: "100vh" }}><Seller /></div>
  if (view === "product") return <Product />
  return <Status />
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
