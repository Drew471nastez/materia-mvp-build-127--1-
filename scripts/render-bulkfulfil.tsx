/**
 * Bulk fulfilment and several parcels, for scripts/check-bulkfulfil.mjs:
 *   ?view=list   the real Orders page (orders-client.tsx) with orders to ship;
 *                its selection bar's Mark as fulfilled and Packing slips, and
 *                Import tracking in its top bar
 *   ?view=order  the real order panel (order-panel.tsx) of an order of 3 lamps
 *                and a shade, whose Fulfill dialog splits into parcels
 * The probe's server answers every /api call.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OrdersClient } from "@/app/app/orders/orders-client"
import { PhysicalFulfillment, usePhysicalOrder } from "@/components/physical/order-panel"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import type { OrdersListing } from "@/lib/orders/paged"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "list"
const NOW = Date.now()
/* The page of orders, as the probe's server also answers /api/app/orders/list with it (scripts/check-bulkfulfil.mjs). */
const LISTING = (window as unknown as { __LISTING__: OrdersListing }).__LISTING__
const C = (n: number) => `${n}`.repeat(8) + "-" + `${n}`.repeat(4) + "-4" + `${n}`.repeat(3) + "-8" + `${n}`.repeat(3) + "-" + `${n}`.repeat(12)

function SellerOrder() {
  const state = usePhysicalOrder(C(7), 0)
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto grid max-w-[760px] gap-4 p-4">
        <PhysicalFulfillment state={state} />
      </div>
    </div>
  )
}

function App() {
  if (view === "order") return <SellerOrder />
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 58, flex: "none", background: "#131316" }} />
      <div className="app-content-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <OrdersClient
          listing={LISTING}
          listingKey="probe"
          products={[
            { id: "p-lamp", title: "Desk lamp" },
            { id: "p-shade", title: "Linen shade" },
          ]}
          stripeConnected
          hiddenColumns={[]}
          initialRange={null}
          timeZone="Europe/Berlin"
          now={NOW}
        />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <App />
  </PlatformSettingsProvider>,
)
