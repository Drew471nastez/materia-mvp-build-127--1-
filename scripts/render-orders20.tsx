/**
 * The real Orders page (app/(storelib)/app/orders/orders-client.tsx) with physical
 * commerce on, for scripts/check-orders20.mjs: downloads, an order still to
 * ship from two places, a mixed order with one parcel on its way, and one
 * delivered. The probe's server answers /api/physical/orders/[id] as the
 * real route does, keeping what each action changed.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OrdersClient } from "./fixtures/orders-client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import type { OrderRow } from "@/lib/orders/order-view"

const NOW = Date.now()
const H = 3_600_000
const at = (h: number) => new Date(NOW - h * H).toISOString()

function row(id: string, over: Partial<OrderRow>): OrderRow {
  return {
    id,
    product_id: "p-digital",
    amount_cents: 1900,
    fee_cents: 60,
    status: "completed",
    created_at: at(30),
    buyer_email: "ana.pop@example.com",
    buyer_first_name: "Ana",
    buyer_last_name: "Pop",
    buyer_country: "Romania",
    buyer_country_code: "RO",
    card_brand: "visa",
    card_last4: "4242",
    payment_method: "card",
    receipt_token: `tok-${id}`,
    stripe_payment_intent_id: `pi_${id}`,
    stripe_session_id: null,
    buyer_notified_at: at(29.9),
    source: "website",
    product: { id: "p-digital", title: "Lightroom preset pack", type: "digital", thumbnail_url: null },
    ...over,
  }
}

const tee = { id: "p-tee", title: "Linen shirt", type: "physical", thumbnail_url: null }
const mug = { id: "p-mug", title: "Stoneware mug", type: "physical", thumbnail_url: null }

export const ROWS: OrderRow[] = [
  row("d-1", { created_at: at(2) }),
  /* To ship: two lines, from two places. */
  row("u-1", { product_id: tee.id, product: tee, amount_cents: 9500, quantity: 2, checkout_id: "11111111-1111-4111-8111-111111111111", stripe_session_id: "cs_unf", shipping_cents: 500, physical_fulfillment: "unfulfilled", physical_return: "none", physical_method: "Standard", physical_pickup: false, variant_name: "M / Natural", created_at: at(5), buyer_first_name: "Jordan", buyer_last_name: "Blake", buyer_email: "jordan@example.com", buyer_notified_at: null }),
  row("u-2", { product_id: mug.id, product: mug, amount_cents: 2400, quantity: 1, checkout_id: "11111111-1111-4111-8111-111111111111", stripe_session_id: "cs_unf", shipping_cents: 0, physical_fulfillment: "unfulfilled", physical_return: "none", physical_method: "Standard", physical_pickup: false, created_at: at(5), buyer_first_name: "Jordan", buyer_last_name: "Blake", buyer_email: "jordan@example.com", buyer_notified_at: null }),
  /* Mixed: a download and a parcel on its way. */
  row("m-1", { product_id: tee.id, product: tee, amount_cents: 5200, quantity: 1, checkout_id: "22222222-2222-4222-8222-222222222222", stripe_session_id: "cs_mix", shipping_cents: 700, physical_fulfillment: "fulfilled", physical_return: "none", physical_method: "Express", physical_pickup: false, created_at: at(50), buyer_notified_at: null }),
  row("m-2", { checkout_id: "22222222-2222-4222-8222-222222222222", stripe_session_id: "cs_mix", created_at: at(50) }),
  /* Delivered. */
  row("v-1", { product_id: mug.id, product: mug, amount_cents: 2900, quantity: 1, checkout_id: "33333333-3333-4333-8333-333333333333", stripe_session_id: "cs_del", shipping_cents: 500, physical_fulfillment: "delivered", physical_return: "none", physical_method: "Standard", physical_pickup: false, created_at: at(120), buyer_first_name: "Sam", buyer_last_name: "Rivera", buyer_email: "sam@example.com", buyer_notified_at: null }),
  row("d-2", { created_at: at(200), product: { id: "p-course", title: "Portrait course", type: "course", thumbnail_url: null }, product_id: "p-course" }),
]

function App() {
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 58, flex: "none", background: "#131316" }} />
        <div className="app-content-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <OrdersClient
            rows={ROWS}
            products={[
              { id: "p-digital", title: "Lightroom preset pack" },
              { id: tee.id, title: tee.title },
              { id: mug.id, title: mug.title },
            ]}
            stripeConnected
            hiddenColumns={[]}
            initialRange={null}
            timeZone="Europe/Bucharest"
            now={NOW}
          />
        </div>
      </div>
    </PlatformSettingsProvider>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
