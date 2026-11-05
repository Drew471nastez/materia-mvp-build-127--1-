/**
 * Round 27 (B27) probe pages, for scripts/check-buyer27.mjs: the real buyer
 * components with a fixture shop and order, every /api request answered here.
 *
 *   ?view=confirmed  paid, being prepared: two T-shirts in S, one in M, a mug;
 *                    a code; Cancel order (cancels at once); help panel
 *   ?view=shipped    two parcels (FAN Courier on its way with scans, DPD
 *                    delivered), part of a line still to send
 *   ?view=delivered  delivered three days ago: the return window as a date
 *                    from the seller's 14 days, Return items with steppers
 *   ?view=thanks     the thank you page after paying (ThanksView under the
 *                    website's own bar)
 *   &lang=ro|en      the page's language (Romanian curated words, or English)
 *
 * Cancel order answers "cancelled" and the page draws itself again cancelled,
 * as router.refresh does on the server.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { OrderStatusView } from "@/app/(storelib)/checkout/physical/order/[token]/order-status-view"
import { ThanksView } from "@/app/(storelib)/checkout/site/thanks/[token]/thanks-view"
import { ShopBar } from "@/app/(storelib)/checkout/parts/shop-bar"
import { CheckoutWords } from "@/app/(storelib)/checkout/parts/words"
import { checkoutWordsIn } from "@/lib/markets/checkout-words"

const q = new URLSearchParams(location.search)
const view = q.get("view") ?? "confirmed"
const lang = q.get("lang") === "en" ? "en" : "ro"
const words = lang === "ro" ? checkoutWordsIn("ro", null) : {}
const day = 86_400_000
const ago = (n: number) => new Date(Date.now() - n * day).toISOString()
const pic = (a: string, b: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${a}"/><circle cx="100" cy="92" r="46" fill="${b}"/></svg>`)
const logo = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64"><text x="0" y="46" font-family="Georgia,serif" font-size="44" font-weight="700" fill="#1a1a2e">Andrew<tspan fill="#b45309">Rullz</tspan></text></svg>`)
const TOKEN = "fI-H-y2syDHluY12QHIiPdMlLVq69mKd"
const CO = "da0d603d-0000-4000-8000-000000000027"

declare global {
  interface Window {
    __calls?: string[]
    __probeRefresh?: () => void
  }
}
const calls: string[] = (window.__calls = [])
let cancelled = false
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const method = init?.method ?? "GET"
  calls.push(`${method} ${url}${init?.body && typeof init.body === "string" ? ` ${init.body}` : ""}`)
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  if (url.endsWith("/cancel") && method === "POST") {
    cancelled = true
    return json({ ok: true, done: "cancelled", refundedCents: 18900, pending: false })
  }
  if (url.endsWith("/return") && method === "POST") return json({ ok: true })
  if (url.startsWith("/api/physical/order-status/")) return json({ v: cancelled ? "after" : "before" })
  return json({ error: "not in the probe" }, 404)
}) as typeof fetch

const shirtS = { orderId: "l1", title: "Black Sleeve T-shirt", variantName: "S", imageUrl: pic("#1f2937", "#374151"), quantity: 2, unitCents: 6000, cents: 12000, type: "physical", receiptToken: null, returnable: 0, shipped: 0, returned: 0 }
const shirtM = { ...shirtS, orderId: "l2", variantName: "M", quantity: 1, cents: 6000 }
const mug = { orderId: "l3", title: "Stoneware mug", variantName: "Sand / 350 ml", imageUrl: pic("#e7dccb", "#c9b8a6"), quantity: 1, unitCents: 3900, cents: 2900, type: "physical", receiptToken: null, returnable: 0, shipped: 0, returned: 0 }
const address = { name: "Andrei Test Radu", line1: "Str. Patului nr. 6", line2: "Ap. 44", city: "București", postalCode: "010121", country: "RO", phone: "+40751048522" }
const shop = { name: "AndrewRullz", avatar: logo, avatarKind: "logo" as const, email: "shop@andrewrullz.ro", phone: "+40 751 048 522", websiteUrl: "https://andrewrullz.storelib.com", legal: null }
const totals = { subtotal: 21900, discount: 1000, shipping: 0, tax: 0, taxIncluded: false, total: 20900, refunded: 0, currency: "RON" }

function order(state: "confirmed" | "shipped" | "delivered" | "cancelled") {
  const base = {
    id: CO, status: "paid", fulfillmentStatus: "unfulfilled", cancelled: false, createdAt: ago(3), email: "andrei@example.com", name: "Andrei Test Radu", address,
    delivery: { name: "Standard", priceCents: 0, minDays: 3, maxDays: 5, kind: "ship" as const }, coupon: "TOAMNA10", pickup: null, processing: false, totals,
    lines: [shirtS, shirtM, mug], shipments: [] as any[], returns: [] as any[], returnPolicy: { days: 14, endsAt: null as string | null, open: true, started: false, assumed: false },
  }
  if (state === "cancelled") return { ...base, cancelled: true, status: "refunded", fulfillmentStatus: "cancelled", totals: { ...totals, refunded: 20900 } }
  if (state === "confirmed") return base
  if (state === "shipped") {
    return {
      ...base, fulfillmentStatus: "partially_fulfilled", processing: true,
      lines: [{ ...shirtS, shipped: 1 }, { ...shirtM, shipped: 1 }, { ...mug, shipped: 1 }],
      shipments: [
        { id: "s1", status: "in_transit", carrier: "FAN Courier", trackingNumber: "2150004433221", trackingUrl: "https://www.fancourier.ro/awb-tracking/?tracking=2150004433221", shippedAt: ago(2), deliveredAt: null, items: [{ orderId: "l1", quantity: 1 }, { orderId: "l2", quantity: 1 }], tracking: { status: "in_transit", estimatedDelivery: new Date(Date.now() + day).toISOString().slice(0, 10), auto: true }, checkpoints: [{ at: ago(0.3), status: "in_transit", message: "Coletul a ajuns în depozitul București", location: "București" }, { at: ago(1.2), status: "in_transit", message: "Preluat de curier", location: "Cluj-Napoca" }] },
        { id: "s2", status: "delivered", carrier: "DPD", trackingNumber: "09981234567", trackingUrl: "https://tracking.dpd.de/status/en_US/parcel/09981234567", shippedAt: ago(2.5), deliveredAt: ago(0.5), items: [{ orderId: "l3", quantity: 1 }], updates: [{ status: "shipped", at: ago(2.5) }, { status: "delivered", at: ago(0.5) }] },
      ],
      returnPolicy: { days: 14, endsAt: null, open: true, started: false, assumed: true },
    }
  }
  return {
    ...base, fulfillmentStatus: "fulfilled", processing: true,
    lines: [{ ...shirtS, shipped: 2, returnable: 2 }, { ...shirtM, shipped: 1, returnable: 1 }, { ...mug, shipped: 1, returnable: 1 }],
    shipments: [{ id: "s1", status: "delivered", carrier: "Sameday", trackingNumber: "1ONB24027", trackingUrl: "https://sameday.ro/#awb=1ONB24027", shippedAt: ago(5), deliveredAt: ago(3), items: [{ orderId: "l1", quantity: 2 }, { orderId: "l2", quantity: 1 }, { orderId: "l3", quantity: 1 }], updates: [{ status: "shipped", at: ago(5) }, { status: "out_for_delivery", at: ago(3.2) }, { status: "delivered", at: ago(3) }] }],
    returnPolicy: { days: 14, endsAt: new Date(Date.now() + 11 * day).toISOString(), open: true, started: true, assumed: false },
  }
}

function Status() {
  const [state, setState] = React.useState<"confirmed" | "shipped" | "delivered" | "cancelled">(view === "shipped" ? "shipped" : view === "delivered" ? "delivered" : view === "cancelled" ? "cancelled" : "confirmed")
  React.useEffect(() => {
    window.__probeRefresh = () => {
      if (cancelled) setState("cancelled")
    }
  }, [])
  return (
    <OrderStatusView
      token={TOKEN}
      justPaid={false}
      shop={shop}
      orderUrl={`https://andrewrullz.storelib.com/checkout/physical/order/${TOKEN}`}
      help={{ openCase: null }}
      reasons={[]}
      order={order(state) as any}
      canReturn={state === "delivered"}
      cancel={state === "confirmed" ? "can_request" : state === "cancelled" ? "cancelled" : "closed"}
      cancelNow
    />
  )
}

function Thanks() {
  return (
    <div className="min-h-dvh bg-[#f8f9fa]">
      <ShopBar brand={{ name: "AndrewRullz", imageUrl: logo, kind: "logo" }} backTo={null} shopUrl="https://andrewrullz.storelib.com/" />
      <ThanksView
        shopUrl="https://andrewrullz.storelib.com/"
        lang={lang}
        words={words}
        map={null}
        order={{
          email: "andrei@example.com", firstName: "Andrei", totalCents: 20900, shippingCents: 0, taxCents: 0, shipTo: null, receipt: `/checkout/physical/order/${TOKEN}`, ga: { id: CO, items: [], currency: "RON" },
          lines: [shirtS, shirtM, mug].map((l) => ({ title: l.title, variantName: l.variantName, imageUrl: l.imageUrl, quantity: l.quantity, unitCents: l.unitCents, cents: l.cents })),
          shipped: { number: "#DA0D603D", placedAt: ago(0), subtotalCents: 21900, discountCents: 1000, coupon: "TOAMNA10", address, method: { name: "Standard", minDays: 3, maxDays: 5, local: false, note: null } },
        }}
      />
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<CheckoutWords lang={lang} words={words}>{view === "thanks" ? <Thanks /> : <Status />}</CheckoutWords>)
