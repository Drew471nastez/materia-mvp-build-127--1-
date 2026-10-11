/**
 * The round 23 fulfilment screens, one per ?view=, for
 * scripts/check-fulfil23.mjs: Settings > Shipping and delivery and
 * Locations (the real ShippingSettings), the buyer's order page in each
 * delivery state, the seller's order with a return, the product page's buy
 * box with its delivery line, and the checkout with local delivery. The
 * probe's server answers every /api call.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { PhysicalCheckout } from "@/app/checkout/physical/physical-checkout"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { ShippingSettings } from "@/components/physical/shipping-settings"
import { PhysicalFulfillment, ShippingCard, usePhysicalOrder } from "@/components/physical/order-panel"
import { OrderStatusView } from "@/app/checkout/physical/order/[token]/order-status-view"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "shipping"
const SHOP = "0f3a9c2e-1111-2222-3333-444455556666"
const LINE = "11111111-1111-4111-8111-111111111111"
const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

function SellerOrder() {
  const state = usePhysicalOrder(SHOP, 0)
  return (
    <div className="mx-auto grid max-w-[760px] gap-4 bg-[#f8f9fa] p-4">
      <PhysicalFulfillment state={state} onRefund={() => ((window as unknown as { refundOpened: number }).refundOpened = ((window as unknown as { refundOpened: number }).refundOpened || 0) + 1)} />
      <ShippingCard order={state.order} />
    </div>
  )
}

function Status() {
  const state = params.get("state") || "ship"
  const pickup = state === "pickup"
  const local = state === "local"
  const problem = state === "problem"
  const closed = state === "closed"
  return (
    <OrderStatusView
      token="tok_abcdefghijklmnopqrstuv"
      justPaid={false}
      shop={{ name: "Linen & Co", avatar: null, email: "hello@linen.example", phone: "+40 712 345 678" }}
      canReturn={!closed && !problem}
      reasons={[{ value: "size", label: "Size or fit" }, { value: "damaged", label: "Arrived damaged" }]}
      order={{
        id: SHOP,
        status: "paid",
        fulfillmentStatus: "fulfilled",
        cancelled: false,
        createdAt: day(9),
        email: "mara@example.com",
        name: "Mara Lind",
        address: pickup ? null : { name: "Mara Lind", line1: "Str. Lunga 5", city: "Cluj-Napoca", postalCode: "400001", country: "RO" },
        delivery: local ? { name: "Local delivery", priceCents: 500, minDays: null, maxDays: null, kind: "local", note: "Tuesdays and Fridays, 17:00 to 20:00" } : { name: "Standard", priceCents: 1500, minDays: 2, maxDays: 4 },
        pickup: pickup ? { name: "Studio", address: ["Str. Lunga 1", "Cluj-Napoca 400001", "Romania"], instructions: "Ring the bell at the side door.", ready: "Usually ready in 2 hours", hours: "Mon to Fri 9:00 to 17:00, Sat 10:00 to 14:00" } : null,
        processing: true,
        totals: { subtotal: 9000, discount: 0, shipping: local ? 500 : 1500, tax: 0, taxIncluded: false, total: local ? 9500 : 10500, refunded: 0 },
        lines: [{ orderId: LINE, title: "Linen shirt", variantName: "M / Sand", imageUrl: null, quantity: 2, cents: 9000, type: "physical", receiptToken: null, returnable: 2 }],
        shipments: pickup
          ? [{ id: "s1", status: "shipped", carrier: null, trackingNumber: null, trackingUrl: null, shippedAt: day(1), deliveredAt: null, items: [{ orderId: LINE, quantity: 2 }], updates: [{ status: "shipped", at: day(1) }] }]
          : local
            ? [{ id: "s1", status: "out_for_delivery", carrier: null, trackingNumber: null, trackingUrl: null, shippedAt: day(1), deliveredAt: null, items: [{ orderId: LINE, quantity: 2 }], updates: [{ status: "shipped", at: day(1) }, { status: "out_for_delivery", at: day(0) }] }]
            : [
                {
                  id: "s1",
                  status: problem ? "failed" : "delivered",
                  carrier: "UPS",
                  trackingNumber: "1Z999AA10123456784",
                  trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
                  shippedAt: day(closed ? 45 : 6),
                  deliveredAt: problem ? null : day(closed ? 40 : 3),
                  items: [{ orderId: LINE, quantity: 2 }],
                  updates: problem
                    ? [{ status: "shipped", at: day(6) }, { status: "in_transit", at: day(5) }, { status: "failed", at: day(3) }]
                    : [{ status: "shipped", at: day(closed ? 45 : 6) }, { status: "in_transit", at: day(closed ? 44 : 5) }, { status: "out_for_delivery", at: day(closed ? 40 : 3) }, { status: "delivered", at: day(closed ? 40 : 3) }],
                },
              ],
        returns: closed ? [{ id: "r1", status: "completed", createdAt: day(38), reason: "Size or fit" }] : [],
        returnPolicy: { days: 30, endsAt: new Date(Date.now() + (closed ? -10 : 27) * 86_400_000).toISOString(), open: !closed },
      }}
    />
  )
}

function App() {
  switch (view) {
    case "shipping":
      return (
        <div className="mx-auto max-w-[900px] bg-[#f8f9fa] p-4">
          <form onSubmit={(e) => e.preventDefault()}>
            <ShippingSettings part={(params.get("part") as "delivery" | "locations" | "returns" | null) ?? "delivery"} />
          </form>
        </div>
      )
    case "status":
      return <Status />
    case "order":
      return <SellerOrder />
    case "buybox":
      return (
        <div className="mx-auto max-w-[420px] p-4">
          <PhysicalBuyBox productId={SHOP} />
        </div>
      )
    default:
      return <PhysicalCheckout shopId={SHOP} shopName="Linen & Co" />
  }
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
