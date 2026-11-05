/**
 * Courier tracking in the real components (scripts/check-tracking24.mjs):
 * the buyer's order page (OrderStatusView), the seller's order panel
 * (PhysicalOrderPanel) and Settings › Integrations › Courier tracking
 * (TrackingAppPanel), with made up data shaped like loadOrder's. `?view=`
 * picks the screen, `?mode=` auto, paused, off or returned. Every /api request
 * is answered here; nothing leaves the page.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { TrackingAppPanel } from "@/components/app/settings/tracking-app-panel"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "buyer"
const mode = (params.get("mode") || "auto") as "auto" | "paused" | "off" | "returned"
const ORDER = "0f3a9c2e-1111-4222-8333-444455556666"
const LINE = "11111111-1111-4111-8111-111111111111"
const H = 3_600_000
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString()
const eta = new Date(Date.now() + 2 * 24 * H).toISOString().slice(0, 10) + "T00:00:00.000Z"

const returned = mode === "returned"
const checkpoints = mode === "off"
  ? []
  : [
      ...(returned ? [{ at: at(2), status: "returned", message: "Returned to sender: addressee unknown", location: "Denver, CO, USA" }] : []),
      { at: at(5), status: "out_for_delivery", message: "Out for delivery", location: "Denver, CO, USA" },
      { at: at(14), status: "in_transit", message: "Arrived at USPS Regional Destination Facility", location: "Denver, CO, USA" },
      { at: at(30), status: "in_transit", message: "In transit to next facility", location: "Salt Lake City, UT, USA" },
      { at: at(44), status: "in_transit", message: "Departed USPS Regional Facility", location: "Portland, OR, USA" },
      { at: at(50), status: "in_transit", message: "Accepted at USPS Origin Facility", location: "Portland, OR, USA" },
      { at: at(52), status: "info_received", message: "Shipping label created, USPS awaiting item", location: "Portland, OR, USA" },
    ]
const shipmentStatus = returned ? "failed" : mode === "off" ? "shipped" : "out_for_delivery"
const tracking = { mode: returned ? "auto" : mode, status: returned ? "returned" : mode === "off" ? null : "out_for_delivery", estimatedDelivery: mode === "off" || returned ? null : eta, checkedAt: mode === "off" ? null : at(0.4), providerName: mode === "off" ? null : "AfterShip", error: null }

const shipment = {
  id: "f1", status: shipmentStatus, carrier: "USPS", trackingNumber: "9400100000000000000000", trackingUrl: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400100000000000000000",
  shippedAt: at(52), deliveredAt: null, createdAt: at(52), locationId: "loc", provider: "manual",
  items: [{ orderId: LINE, quantity: 2 }],
  events: [{ status: shipmentStatus, message: "From USPS", occurredAt: at(5) }, { status: "in_transit", message: "From USPS", occurredAt: at(44) }, { status: "shipped", message: "USPS 9400100000000000000000", occurredAt: at(52) }],
  checkpoints,
  tracking,
}

const sellerOrder = {
  id: ORDER, status: "paid", fulfillmentStatus: "fulfilled", returnStatus: "none", currency: "USD", buyerName: "Sam Rivera", buyerPhone: null,
  totalCents: 7000, refundedCents: 0, shippingCents: 600, shippingDiscountCents: 0,
  address: { name: "Sam Rivera", line1: "48 Maple Avenue", city: "Denver", region: "CO", postalCode: "80203", country: "US" },
  delivery: { name: "Standard", priceCents: 600, minDays: 3, maxDays: 5 }, deliveryMethod: "ship", pickup: null, processingAt: null,
  buyerNote: null, merchantNote: null, cancelledAt: null,
  lines: [{ orderId: LINE, title: "Speckled mug", variantName: "12 oz / Sand", sku: "MUG-12-S", imageUrl: null, type: "physical", quantity: 2, unitCents: 3200, discountCents: 0, requiresShipping: true, locationId: "loc", fulfillmentMethod: "self", fulfilled: 2, returned: 0, amountCents: 6400, refundedCents: 0 }],
  shipments: [shipment],
  returns: [],
  events: [{ id: 3, kind: "fulfillment.out_for_delivery", message: "Shipment out for delivery", actor: "webhook", createdAt: at(5) }, { id: 1, kind: "payment.paid", message: "Payment of $70.00 received", actor: "webhook", createdAt: at(60) }],
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.href)
  if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) return realFetch(input, init)
  let out: unknown = {}
  if (u.pathname.startsWith("/api/physical/orders/")) {
    if ((init?.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"))
      if (body.action === "tracking_auto") shipment.tracking = { ...shipment.tracking, mode: body.on === false ? "paused" : "auto" }
    }
    out = { order: sellerOrder, locations: [{ id: "loc", name: "Studio" }] }
  } else if (u.pathname === "/api/store/tracking-app") {
    out = {
      tracking: {
        platform: { on: mode !== "off", providerName: mode === "off" ? null : "AfterShip", webhooks: mode !== "off" },
        ready: true,
        own: params.has("own") ? { provider: "aftership", providerName: "AfterShip", status: "connected", keyHint: "9f2c", secretHint: "a1b2", lastError: null, verifiedAt: at(24), lastWebhookAt: at(1), webhookUrl: "https://storelib.com/api/tracking/webhooks/aftership/0f3a9c2e-1111-4222-8333-444455556666.Q2xvc2VkVG9rZW5Gb3JEZW1vT25seQ" } : null,
        following: mode === "off" ? 0 : 7,
        lastCheckedAt: mode === "off" ? null : at(0.2),
      },
    }
  }
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}

const Page = ({ children, width = 760 }: { children: React.ReactNode; width?: number }) => (
  <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
    <div id="shot" style={{ maxWidth: width, margin: "0 auto", padding: 16 }}>
      {children}
    </div>
  </div>
)

function App() {
  if (view === "seller") return <Page><PhysicalOrderPanel orderRowId={ORDER} /></Page>
  if (view === "settings") return <Page><div className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 sm:p-6"><TrackingAppPanel /></div></Page>
  return (
    <OrderStatusView
      token="tok_demo_demo_demo_demo_demo"
      justPaid={false}
      shop={{ name: "Fern & Clay", avatar: null, email: "hello@fernandclay.example" }}
      canReturn={false}
      order={{
        id: ORDER, status: "paid", fulfillmentStatus: "fulfilled", cancelled: false, createdAt: at(60), email: "sam@example.com", name: "Sam Rivera",
        address: sellerOrder.address, delivery: sellerOrder.delivery, pickup: null, processing: true,
        totals: { subtotal: 6400, discount: 0, shipping: 600, tax: 0, taxIncluded: false, total: 7000, refunded: 0, currency: "USD" },
        lines: [{ orderId: LINE, title: "Speckled mug", variantName: "12 oz / Sand", imageUrl: null, quantity: 2, cents: 6400, type: "physical", receiptToken: null, returnable: 0 }],
        shipments: [{ id: "f1", status: shipmentStatus, carrier: "USPS", trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl, shippedAt: shipment.shippedAt, deliveredAt: null, items: shipment.items, updates: [...shipment.events].reverse().map((e) => ({ status: e.status, at: e.occurredAt })), checkpoints, tracking: mode === "off" ? null : { status: tracking.status, estimatedDelivery: tracking.estimatedDelivery, auto: true } }],
        returns: [],
      }}
    />
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
