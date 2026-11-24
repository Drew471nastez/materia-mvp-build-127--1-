/**
 * The real LiveBeacon (components/platform/live-beacon.tsx) on a page with a
 * search field, an email field and an Add to cart button, for
 * scripts/check-live-beacon-r62.mjs. next/navigation is stubbed so the check
 * can change the route; the clock runs sixty times fast so a minute takes a
 * second. `?host=site` mounts it as a creator's website does.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { LiveBeacon } from "@/components/platform/live-beacon"
import { noteLive } from "@/lib/live/live-client"

const SPEED = 60
const realNow = Date.now.bind(Date)
const start = realNow()
Date.now = () => start + (realNow() - start) * SPEED
const realInterval = window.setInterval.bind(window)
window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => realInterval(fn, Math.max(1, (ms ?? 0) / SPEED), ...rest)) as typeof window.setInterval

const host = new URLSearchParams(location.search).get("host") === "site" ? "site" : "storelib"

function Page() {
  return (
    <main style={{ padding: 24, fontFamily: "Inter, sans-serif" }}>
      <input id="search" placeholder="Search" />
      <input id="email" type="email" placeholder="Email" />
      <button id="add" type="button" onClick={() => noteLive("cart.add")}>
        Add to cart
      </button>
      <LiveBeacon host={host} />
    </main>
  )
}

createRoot(document.getElementById("root")!).render(<Page />)
