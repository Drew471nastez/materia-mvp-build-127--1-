/**
 * Round AE3 in the real components (scripts/check-fulfilment-ae3.mjs): the
 * seller's order panel (PhysicalOrderPanel) on an order with one part the
 * shop ships and one part Printful prints, which Printful refused; and the
 * buyer's order page (OrderStatusView) with two parcels. `?view=` picks the
 * screen. Every /api request is answered here, keeping what each action did,
 * so Hold, Release and Send again move the order as the route would.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "seller"
const ORDER = "0f3a9c2e-1111-4222-8333-444455556666"
const LAMP = "11111111-1111-4111-8111-111111111111"
const TEE = "22222222-2222-4222-8222-222222222222"
const PF_LOC = "33333333-3333-4333-8333-333333333333"
const H = 3_600_000
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * H).toISOString()
let nextId = 10

const line = (orderId: string, title: string, variantName: string | null, sku: string, quantity: number, unitCents: number, locationId: string, fulfillmentMethod: string, fulfilled = 0) => ({
  orderId, title, variantName, sku, imageUrl: null, type: "physical", quantity, unitCents, discountCents: 0, requiresShipping: true, locationId, fulfillmentMethod, fulfilled, returned: 0, amountCents: unitCents * quantity, refundedCents: 0,
})

const order = {
  id: ORDER, status: "paid", fulfillmentStatus: "unfulfilled", returnStatus: "none", currency: "EUR", buyerName: "Bea Buyer", buyerPhone: "+49 30 1234567",
  totalCents: 10500, refundedCents: 0, shippingCents: 500, shippingDiscountCents: 0,
  address: { name: "Bea Buyer", line1: "Gartenweg 2", city: "Berlin", postalCode: "10117", country: "DE" },
  delivery: { name: "Standard", priceCents: 500, minDays: 1, maxDays: 3 }, deliveryMethod: "ship", pickup: null, processingAt: null,
  buyerNote: "Please ring twice.", merchantNote: null, cancelledAt: null, cartAttributes: { "Gift message": "Happy birthday, Ana" },
  lines: [line(LAMP, "Desk Lamp", "Brass", "LAMP-BR", 1, 5000, "loc", "self"), line(TEE, "Studio Tee", "M / Natural", "TEE-M", 2, 2500, PF_LOC, "print_on_demand")],
  shipments: [] as unknown[],
  returns: [],
  events: [
    { id: 2, kind: "fulfillment.manual_needed", message: "Printful has no product with SKU TEE-M. Give the Printful variant the same SKU as in Storelib. The order was not sent. Send it yourself.", actor: "system", createdAt: at(1), detail: { location_id: PF_LOC, provider: "printful" } },
    { id: 1, kind: "payment.paid", message: "Payment of €105.00 received", actor: "webhook", createdAt: at(2), detail: null },
  ] as { id: number; kind: string; message: string; actor: string; createdAt: string; detail: Record<string, unknown> | null }[],
}
const LOCATIONS = [{ id: "loc", name: "Workshop" }, { id: PF_LOC, name: "Printful" }]

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const u = new URL(url, location.href)
  if (u.origin !== location.origin || !u.pathname.startsWith("/api/")) return realFetch(input, init)
  if (u.pathname.endsWith("/packing-slip")) return realFetch(input, init)
  let out: unknown = {}
  if (/^\/api\/physical\/orders\/[^/]+$/.test(u.pathname)) {
    if ((init?.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"))
      ;(window as unknown as { __posts: unknown[] }).__posts.push(body)
      const now = new Date().toISOString()
      if (body.action === "hold") order.events.unshift({ id: nextId++, kind: "fulfillment.hold", message: "Fulfillment on hold", actor: "creator", createdAt: now, detail: { reason: body.reason, ...(body.note ? { note: body.note } : {}) } })
      if (body.action === "release_hold") order.events.unshift({ id: nextId++, kind: "fulfillment.hold_released", message: "Hold released", actor: "creator", createdAt: now, detail: null })
      if (body.action === "resend") order.events.unshift({ id: nextId++, kind: "fulfillment.resent", message: "Sending this order to Printful again.", actor: "creator", createdAt: now, detail: { location_id: body.locationId } })
    }
    out = { order: JSON.parse(JSON.stringify(order)), locations: LOCATIONS }
  } else if (/\/label$/.test(u.pathname)) {
    out = { apps: [], packages: [], labels: [] }
  } else if (u.pathname === "/api/physical/carriers") {
    /* The shop's carrier stars and its connected carriers: none. */
    out = u.searchParams.has("connected") ? { carriers: [], errors: [] } : { favourites: [], defaultCarrier: null, lastCarrier: null, custom: [] }
  }
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } })
}
;(window as unknown as { __posts: unknown[] }).__posts = []

const Page = ({ children, width = 760 }: { children: React.ReactNode; width?: number }) => (
  <div style={{ background: "#f8f9fa", minHeight: "100vh" }}>
    <div id="shot" style={{ maxWidth: width, margin: "0 auto", padding: 16 }}>
      {children}
    </div>
  </div>
)

function App() {
  if (view === "seller") return <Page><PhysicalOrderPanel orderRowId={ORDER} /></Page>
  const shipped = (id: string, status: string, carrier: string, number: string, url: string, hours: number, items: { orderId: string; quantity: number }[]) => ({
    id, status, carrier, trackingNumber: number, trackingUrl: url, shippedAt: at(hours), deliveredAt: status === "delivered" ? at(hours - 30) : null, items,
    updates: [{ status: "shipped", at: at(hours) }, ...(status === "delivered" ? [{ status: "delivered", at: at(hours - 30) }] : [{ status: "in_transit", at: at(hours - 10) }])],
    checkpoints: [], tracking: null,
  })
  return (
    <OrderStatusView
      token="tok_demo_demo_demo_demo_demo"
      justPaid={false}
      shop={{ name: "Hana Shop", avatar: null, email: "hello@hana.example" }}
      canReturn={false}
      order={{
        id: ORDER, status: "paid", fulfillmentStatus: "partially_fulfilled", cancelled: false, createdAt: at(80), email: "bea@example.com", name: "Bea Buyer",
        address: order.address, delivery: order.delivery, pickup: null, processing: true,
        totals: { subtotal: 10000, discount: 0, shipping: 500, tax: 0, taxIncluded: false, total: 10500, refunded: 0, currency: "EUR" },
        lines: [
          { orderId: LAMP, title: "Desk Lamp", variantName: "Brass", imageUrl: null, quantity: 1, cents: 5000, type: "physical", receiptToken: null, returnable: 0 },
          { orderId: TEE, title: "Studio Tee", variantName: "M / Natural", imageUrl: null, quantity: 2, cents: 5000, type: "physical", receiptToken: null, returnable: 0 },
        ],
        shipments: [
          shipped("f1", "delivered", "DHL", "00340434161234567890", "https://www.dhl.com/global-en/home/tracking.html?tracking-id=00340434161234567890&submit=1", 70, [{ orderId: LAMP, quantity: 1 }]),
          shipped("f2", "in_transit", "DPD", "01234567890123", "https://tracking.dpd.de/status/en_US/parcel/01234567890123", 20, [{ orderId: TEE, quantity: 2 }]),
        ],
        returns: [],
      } as never}
    />
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
