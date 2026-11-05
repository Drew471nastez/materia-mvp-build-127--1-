/**
 * The page scripts/check-commerce-r51.mjs measures: the website checkout's
 * shop bar (app/(storelib)/checkout/parts/shop-bar.tsx) in each of Settings › Checkout ›
 * Top of checkout's choices, with a wide wordmark, a long name and no logo;
 * and the Orders page's packing slip button on a computer (components/
 * physical/order-panel printSlip) with the notice it now shows
 * (components/physical/slip-share SlipNotice).
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ShopBar, type ShopBrand } from "@/app/(storelib)/checkout/parts/shop-bar"
import { SlipNotice } from "@/components/physical/slip-share"
import { printSlip } from "@/components/physical/order-panel"

const LOGO = "https://cdn.storelib.test/logo-wide.png"
const LOGO_SQUARE = "https://cdn.storelib.test/logo-square.png"

const bars: { id: string; brand: ShopBrand }[] = [
  { id: "both", brand: { name: "Mona Modes", imageUrl: LOGO, kind: "logo", shows: "both" } },
  { id: "both-square", brand: { name: "Mona Modes", imageUrl: LOGO_SQUARE, kind: "logo", shows: "both" } },
  { id: "both-long", brand: { name: "The Very Long Name Of A Ceramics Studio In Berlin", imageUrl: LOGO, kind: "logo", shows: "both" } },
  { id: "logo", brand: { name: "Mona Modes", imageUrl: LOGO, kind: "logo", shows: "logo" } },
  { id: "name", brand: { name: "Mona Modes", imageUrl: LOGO, kind: "logo", shows: "name" } },
  { id: "logo-none", brand: { name: "Mona Modes", imageUrl: null, kind: null, shows: "logo" } },
  { id: "default", brand: { name: "Mona Modes", imageUrl: LOGO, kind: "logo" } },
]

function Page() {
  const only = new URLSearchParams(location.search).get("only")
  if (only === "slip") {
    return (
      <div style={{ padding: 24 }}>
        <button type="button" data-print="" onClick={() => void printSlip("/api/physical/orders/probe/packing-slip")}>Packing slip</button>
        <SlipNotice />
      </div>
    )
  }
  return (
    <div>
      {bars.map((b) => (
        <div key={b.id} data-bar={b.id} style={{ marginBottom: 12 }}>
          <ShopBar brand={b.brand} backTo="https://mona.example/cart" shopUrl="https://mona.example/" />
        </div>
      ))}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
