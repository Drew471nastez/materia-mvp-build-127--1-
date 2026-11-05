/**
 * The real Orders page (app/(storelib)/app/orders/orders-client.tsx) inside a stand-in
 * for the /app shell, with a hundred and thirty orders that look like a
 * shop's: baskets from a website, free downloads, a refund, a pending
 * payment, a receipt that bounced. scripts/check-orders-page.mjs renders it
 * on the server, hydrates it in Chromium and measures it.
 */
import React from "react"
import { OrdersClient } from "./fixtures/orders-client"
import type { OrderRow } from "@/lib/orders/order-view"

const g = globalThis as unknown as { __probeNow: number; __probeTz: string }

const NAMES = [
  ["Ana", "Pop"],
  ["Mihai", "Ionescu"],
  ["Elena", "Radu"],
  ["Jordan", "Blake"],
  ["Sam", "Rivera"],
  ["Ioana", "Stan"],
  ["Chris", "Morgan"],
]
const PRODUCTS = [
  { id: "p1", title: "Lightroom preset pack", type: "digital" },
  { id: "p2", title: "Brush set for Procreate", type: "digital" },
  { id: "p3", title: "Portrait course", type: "course" },
]

export function fixtureRows(now: number): OrderRow[] {
  const rows: OrderRow[] = []
  const HOUR = 3_600_000
  for (let i = 0; i < 130; i++) {
    /* Every order a little before the page's own instant, as a real list is:
       an order stamped exactly `now` sits on the window's exclusive end, is left
       out by the server and put back by the browser a second later. */
    const at = new Date(now - 3 * 60_000 - i * 7.3 * HOUR - (i % 5) * 11 * 60_000).toISOString()
    const [first, last] = NAMES[i % NAMES.length]
    const product = PRODUCTS[i % PRODUCTS.length]
    const free = i % 11 === 4
    const base: OrderRow = {
      id: `ord-${String(i).padStart(4, "0")}`,
      product_id: product.id,
      amount_cents: free ? 0 : [1200, 2900, 4900][i % 3],
      fee_cents: free ? 0 : 90,
      status: i === 2 ? "pending" : i === 9 ? "refunded" : "completed",
      created_at: at,
      buyer_email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      buyer_first_name: first,
      buyer_last_name: last,
      buyer_country: "Romania",
      buyer_country_code: "RO",
      buyer_device_type: i % 2 ? "Mobile" : "Desktop",
      buyer_os: i % 2 ? "iOS" : "macOS",
      buyer_browser: "Safari",
      card_brand: free ? null : "visa",
      card_last4: free ? null : "4242",
      payment_method: free ? "free" : "card",
      receipt_token: `tok-${i}`,
      stripe_payment_intent_id: free ? null : `pi_${i}`,
      stripe_session_id: null,
      refund_amount_cents: i === 9 ? 1200 : null,
      refunded_at: i === 9 ? new Date(now - 2 * HOUR).toISOString() : null,
      buyer_notified_at: i === 5 ? null : new Date(Date.parse(at) + 40_000).toISOString(),
      buyer_email_last_error: i === 5 ? "Mailbox unavailable" : null,
      source: i % 3 === 0 ? "website" : "storelib",
      /* Where each checkout began, as lib/orders/order-source records it; the
         oldest orders have none, as orders from before it do. */
      source_detail:
        i > 100
          ? null
          : i % 3 === 0
            ? { surface: "website", site: "andrewrullz.storelib.com", from: i % 2 ? "instagram" : "tiktok", ...(i % 4 === 0 ? { utm_source: "ig", utm_campaign: "fall_drop" } : {}) }
            : { surface: i % 3 === 1 ? "product" : "explore", from: i % 2 ? "google" : "direct" },
      product: { id: product.id, title: product.title, type: product.type, thumbnail_url: null },
    }
    rows.push(base)
    /* Every seventh order is a basket: a second product under the same session. */
    if (i % 7 === 1) {
      base.stripe_session_id = `cs_${i}`
      const extra = PRODUCTS[(i + 1) % PRODUCTS.length]
      rows.push({
        ...base,
        id: `${base.id}-b`,
        product_id: extra.id,
        amount_cents: 900,
        created_at: new Date(Date.parse(at) + 1000).toISOString(),
        product: { id: extra.id, title: extra.title, type: extra.type, thumbnail_url: null },
      })
    }
  }
  return rows
}

export function App() {
  const now = g.__probeNow
  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div data-probe-header style={{ height: 58, flex: "none", background: "#131316" }} />
      <div className="app-content-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <OrdersClient
          rows={fixtureRows(now)}
          products={[
            { id: "p1", title: "Lightroom preset pack" },
            { id: "p2", title: "Brush set for Procreate" },
            { id: "p3", title: "Portrait course" },
          ]}
          stripeConnected
          hiddenColumns={[]}
          initialRange={null}
          timeZone={g.__probeTz}
          now={now}
        />
      </div>
    </div>
  )
}
