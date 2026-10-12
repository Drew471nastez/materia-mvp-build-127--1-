/**
 * The label flow and the shipping app cards, as the real components draw
 * them, for scripts/check-shippingapps24.mjs. Every /api request is answered
 * here in the shapes app/api/physical/orders/[id](/label) and
 * app/api/physical/integrations answer: an order to ship, Shippo connected
 * with a test key, its rates, a purchase that ships the items.
 *
 *   ?view=order   Orders › an order (PhysicalOrderPanel)
 *   ?view=cards   Shippo and ShipStation connected, as their pages show them
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { IntegrationCard } from "@/components/physical/integrations-marketplace"
import { providerInfo } from "@/lib/physical/providers"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "order"

const ORDER = "0f3a9c2e-1111-4222-8333-444455556666"
const LOC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MUG = "11111111-1111-4111-8111-111111111111"
const BOWL = "22222222-2222-4222-8222-222222222222"
const pic = (bg: string, ink: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${bg}"/><rect x="60" y="55" width="70" height="90" rx="10" fill="${ink}"/></svg>`)

const state = {
  shipments: [] as any[],
  labels: [] as any[],
  fulfilled: 0,
}

function order() {
  const shipped = state.shipments.some((s) => s.status !== "cancelled")
  return {
    id: ORDER, status: "paid", fulfillmentStatus: shipped ? "fulfilled" : "unfulfilled", returnStatus: "none", currency: "USD", totalCents: 11400, refundedCents: 0, shippingCents: 600, shippingDiscountCents: 0,
    buyerName: "Sam Rivera", buyerPhone: null, deliveryMethod: "ship", pickup: null, processingAt: null,
    address: { name: "Sam Rivera", line1: "48 Maple Avenue", line2: "Apt 3", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
    delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 },
    buyerNote: null, merchantNote: null, cancelledAt: null,
    lines: [
      { orderId: MUG, title: "Speckled mug", variantName: "12 oz / Sand", sku: "MUG-12-S", imageUrl: pic("#efe6da", "#c9b49a"), type: "physical", quantity: 2, unitCents: 3200, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 2 : 0, returned: 0, amountCents: 6400, refundedCents: 0 },
      { orderId: BOWL, title: "Serving bowl", variantName: null, sku: "BOWL-L", imageUrl: pic("#ece7e1", "#a7988a"), type: "physical", quantity: 1, unitCents: 4400, discountCents: 0, requiresShipping: true, locationId: LOC, fulfillmentMethod: "self", fulfilled: shipped ? 1 : 0, returned: 0, amountCents: 4400, refundedCents: 0 },
    ],
    shipments: state.shipments,
    returns: [],
    events: [{ id: 1, kind: "payment.paid", message: "Payment of $114.00 received", actor: "webhook", createdAt: "2026-10-07T10:00:00Z" }],
  }
}

const options = () => ({
  ready: true,
  apps: [{ id: "shippo", name: "Shippo", test: true }],
  packages: [
    { id: "pkg-box", name: "Small box", kind: "box", lengthMm: 254, widthMm: 203, heightMm: 152, weightGrams: 170, isDefault: true },
    { id: "pkg-mailer", name: "Padded mailer", kind: "envelope", lengthMm: 305, widthMm: 229, heightMm: 0, weightGrams: 40, isDefault: false },
  ],
  defaultPackageId: "pkg-box",
  unitSystem: "imperial",
  itemsGrams: 1540,
  from: { locationId: LOC, name: "Studio", line: "120 Alder Street, Portland, OR, 97204, United States", address: {} },
  to: { line: "Sam Rivera, 48 Maple Avenue, Apt 3, Denver, CO, 80203, United States", complete: true },
  labels: state.labels,
})

const RATES = [
  { id: "rate_ga", shipmentId: "shp_1", carrier: "USPS", service: "Ground Advantage", serviceCode: "usps_ground_advantage", cents: 612, currency: "USD", days: 5, price: "$6.12" },
  { id: "rate_pri", shipmentId: "shp_1", carrier: "USPS", service: "Priority Mail", serviceCode: "usps_priority", cents: 945, currency: "USD", days: 2, price: "$9.45" },
  { id: "rate_ups", shipmentId: "shp_1", carrier: "UPS", service: "Ground", serviceCode: "ups_ground", cents: 1120, currency: "USD", days: 4, price: "$11.20" },
]

function route(method: string, path: string, body: Record<string, any>, search: URLSearchParams): unknown {
  if (path.endsWith("/label")) {
    if (method === "GET") return search.get("only") === "labels" ? { labels: state.labels, ready: true } : options()
    if (body.action === "rates") return { provider: "shippo", shipmentId: "shp_1", rates: RATES, addressOk: true, warnings: ["Shippo: the apartment number could not be confirmed. Check it with the buyer if the parcel matters."], parcel: { lengthCm: 25.4, widthCm: 20.3, heightCm: 15.2, grams: 1710 } }
    if (body.action === "buy") {
      const rate = RATES.find((r) => r.id === body.rateId)!
      const tracking = "9400111899223197428490"
      state.shipments = [{ id: "f1", status: "shipped", carrier: rate.carrier, trackingNumber: tracking, trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", shippedAt: "2026-10-12T15:00:00Z", deliveredAt: null, createdAt: "2026-10-12T15:00:00Z", locationId: LOC, items: [{ orderId: MUG, quantity: 2 }, { orderId: BOWL, quantity: 1 }] }]
      const label = { id: "lbl1", provider: "shippo", providerName: "Shippo", carrier: rate.carrier, service: rate.service, trackingNumber: tracking, labelUrl: `${location.origin}/label.pdf`, cents: rate.cents, currency: "USD", cost: rate.price, status: "purchased", testMode: true, fulfillmentId: "f1", createdAt: "2026-10-12T15:00:00Z" }
      state.labels = [label]
      return { order: order(), label }
    }
    if (body.action === "void") {
      state.shipments = state.shipments.map((s) => ({ ...s, status: "cancelled" }))
      state.labels = state.labels.map((l) => ({ ...l, status: "void_pending" }))
      return { order: order(), label: state.labels[0] }
    }
  }
  if (path.startsWith("/api/physical/orders/")) return { order: order(), locations: [{ id: LOC, name: "Studio" }] }
  return {}
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.href)
  if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) return realFetch(input, init)
  let body: Record<string, unknown> = {}
  try {
    body = init?.body ? JSON.parse(String(init.body)) : {}
  } catch {
    body = {}
  }
  /* A provider takes a moment: the buttons say so while it does. */
  if (body.action === "rates" || body.action === "buy") await new Promise((r) => setTimeout(r, 450))
  const out = route((init?.method || "GET").toUpperCase(), u.pathname, body as never, u.searchParams)
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}

const shippoState = { provider: "shippo", status: "connected", url: null, keyHint: "8f7a", secretHint: null, lastSyncAt: "2026-10-12T14:58:00Z", lastError: null, account: null, verifiedAt: "2026-10-10T09:12:00Z", mode: "test", autoConfirm: false, webhooks: null, webhookNote: null, location: null, labelsBought: 14, ordersSent: 0 }
const stationState = { provider: "shipstation", status: "connected", url: null, keyHint: "3210", secretHint: null, lastSyncAt: "2026-10-12T14:40:00Z", lastError: "ShipStation: Invalid country code for order #1042.", account: "2 stores in ShipStation", verifiedAt: "2026-10-09T08:00:00Z", mode: null, autoConfirm: false, webhooks: "on", webhookNote: null, location: null, labelsBought: 0, ordersSent: 37 }

function App() {
  if (view === "cards") {
    return (
      <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
        <ul id="shot" className="mx-auto grid max-w-[760px] gap-4 p-4">
          <IntegrationCard provider={providerInfo("shippo")!} state={shippoState as never} loading={false} onSaved={() => {}} />
          <IntegrationCard provider={providerInfo("shipstation")!} state={stationState as never} loading={false} onSaved={() => {}} startOpen={params.has("open")} />
        </ul>
      </div>
    )
  }
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
      <div id="shot" style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
        <PhysicalOrderPanel orderRowId={ORDER} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
