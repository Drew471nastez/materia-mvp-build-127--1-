/**
 * The real Orders page (app/app/orders/orders-client.tsx) with physical
 * commerce on, for scripts/check-orders27.mjs. The page of orders it starts
 * on is the probe's (window.__listing), the same one its stand-in for
 * /api/app/orders/list answers with, so the list never waits on a server.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OrdersClient } from "@/app/app/orders/orders-client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import type { OrdersListing } from "@/lib/orders/paged"

const w = window as unknown as { __listing: OrdersListing; __now: number }

function App() {
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ height: 58, flex: "none", background: "#131316" }} />
        <div className="app-content-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <OrdersClient
            listing={w.__listing}
            listingKey=""
            products={[
              { id: "p-digital", title: "Lightroom preset pack" },
              { id: "p-tee", title: "Linen shirt" },
              { id: "p-mug", title: "Stoneware mug" },
            ]}
            stripeConnected
            canRefund
            hiddenColumns={[]}
            initialRange={null}
            timeZone="Europe/Bucharest"
            now={w.__now}
          />
        </div>
      </div>
    </PlatformSettingsProvider>
  )
}

createRoot(document.getElementById("app")!).render(<App />)
