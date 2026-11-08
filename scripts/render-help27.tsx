/**
 * Round 27 (H27) probe pages, for scripts/check-help27.mjs: the real
 * components, every /api request answered here from one in-memory case, so
 * what one side writes the other side reads back through its own route.
 *
 *   ?view=buyer&lang=en|ro   the buyer's conversation (app/(storelib)/order-help)
 *   ?view=seller             Support › From buyers, the case open
 *   ?view=support            Support › From buyers, the list
 *   ?view=both               the buyer's page and the store's thread side by
 *                            side, sharing the case: what the store sends
 *                            shows on the buyer's page without a reload
 *   ?view=admin              Storelib's Resolution center, the case open
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { CaseView } from "@/app/(storelib)/order-help/[id]/case-view"
import { BuyerCaseThread } from "@/app/(storelib)/app/support/buyer-cases"
import { SupportClient } from "@/app/(storelib)/app/support/support-client"
import { ResolutionCenter } from "@/app/(storelib)/admin/resolution/resolution-center"
import { CheckoutWords } from "@/components/checkout/parts/words"
import { checkoutWordsIn } from "@/lib/markets/checkout-words"
import { buyerEscalation, type CaseMessage, type CaseSummary } from "@/lib/support/cases"

const q = new URLSearchParams(location.search)
const view = q.get("view") ?? "buyer"
const lang = q.get("lang") === "ro" ? "ro" : "en"
const ro = lang === "ro"
const CASE = "17fad1e1-c6e7-4b99-9f15-7b910f41ab52"
const day = 86_400_000
const ago = (n: number, h = 0) => new Date(Date.now() - n * day - h * 3_600_000).toISOString()
const pic = (fill: string, w = 1200, h = 900) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${fill}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h / 4}" fill="rgba(255,255,255,0.35)"/></svg>`)

declare global {
  interface Window {
    __calls?: string[]
    __case?: { messages: (CaseMessage & { internal: boolean })[]; summary: CaseSummary }
  }
}

const summary: CaseSummary = { id: CASE, reason: "damaged", status: "store", escalated: false, escalatedBy: null, orderRef: "DA0D603D", sellerNumber: "#1042", kind: "physical", buyerEmail: "ana.radu@example.com", buyerName: "Ana Radu", createdAt: ago(2, 3), lastMessageAt: ago(0, 2), unread: true }
const words = ro
  ? ["Bună! Cana a ajuns cu o fisură pe toată partea laterală. Am atașat poze.", "Ne pare foarte rău, Ana. Poți să ne trimiți și o poză cu ambalajul? Așa putem deschide dosarul la curier.", "Sigur, uite cutia. Era deja turtită la colț când a venit curierul.", "Mulțumim! Trimitem azi o cană nouă și o să primești AWB-ul pe e-mail."]
  : ["Hi! The mug arrived with a crack down the whole side. Photos attached.", "We're really sorry, Ana. Could you send a photo of the box too? Then we can open a claim with the courier.", "Sure, here is the box. One corner was already crushed when the courier handed it over.", "Thank you! A new mug goes out today and you'll get the tracking number by email."]
const messages: (CaseMessage & { internal: boolean })[] = [
  { id: 1, author: "buyer", internal: false, body: words[0], createdAt: ago(2, 3), photos: [{ url: pic("#c9b8a6"), name: "mug-side.jpg" }, { url: pic("#a9b8c6", 900, 1200), name: "mug-close.jpg" }] },
  { id: 2, author: "store", internal: false, body: words[1], createdAt: ago(1, 20) },
  { id: 3, author: "buyer", internal: false, body: words[2], createdAt: ago(0, 3), photos: [{ url: pic("#d8cbb8"), name: "box.jpg" }] },
]
if (view === "admin") messages.push({ id: 4, author: "store", internal: false, body: words[3], createdAt: ago(0, 2) })
if (view === "admin") messages.push({ id: 5, author: "storelib", internal: true, body: "Courier claim opened by the store, AWB 1ONB2427. Watch for the replacement scan.", createdAt: ago(0, 1) })
const state = (window.__case = { messages, summary: { ...summary } })
let next = messages.length + 1

const visible = () => state.messages.filter((m) => !m.internal)
const escalation = () => buyerEscalation(state.summary, visible())
const admin = () => ({ ...state.summary, creatorId: "c27", store: { name: "AndrewRullz", slug: "andrewrullz" }, escalated: true, escalatedBy: "buyer", escalatedAt: ago(0, 1), resolvedAt: null, checkoutId: "co27", orderId: null, status: "storelib" })
const order = {
  placedAt: ago(9),
  status: "paid",
  fulfillment: "delivered",
  returns: "none",
  currency: "RON",
  totalCents: 12900,
  refundedCents: 0,
  cancelledAt: null,
  lines: [
    { title: "Speckled mug", variant: "12 oz / Sand", quantity: 2 },
    { title: "Serving bowl", variant: null, quantity: 1 },
  ],
  shipments: [{ status: "delivered", carrier: "Sameday", trackingNumber: "1ONB2427", trackingUrl: "https://sameday.ro/#awb=1ONB2427", shippedAt: ago(7), deliveredAt: ago(2, 6) }],
}
const store = { name: "AndrewRullz", email: "hello@andrewrullz.ro", phone: "+40 712 345 678", websiteUrl: "https://andrewrullz.storelib.com" }

const add = (author: "buyer" | "store" | "storelib", body: string, internal = false) => {
  state.messages.push({ id: next++, author, internal, body, createdAt: new Date().toISOString() })
  if (!internal) state.summary = { ...state.summary, status: author === "buyer" ? "store" : "buyer", lastMessageAt: new Date().toISOString() }
}
const after = (url: URL) => Number(url.searchParams.get("after") ?? 0)

const calls: string[] = (window.__calls = [])
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input), location.href)
  const method = init?.method ?? "GET"
  calls.push(`${method} ${url.pathname}${url.search}`)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  const body = async (): Promise<Record<string, string>> => {
    if (init?.body instanceof FormData) return Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>
    return init?.body ? JSON.parse(String(init.body)) : {}
  }
  const p = url.pathname
  if (p === `/api/order-help/${CASE}`) {
    if (method === "POST") {
      const b = await body()
      if (b.action === "reply") add("buyer", b.body)
      if (b.action === "resolve") state.summary = { ...state.summary, status: "resolved" }
      return json({ case: state.summary, messages: visible(), escalation: escalation() })
    }
    return json({ case: state.summary, messages: visible().filter((m) => m.id > after(url)), escalation: escalation() })
  }
  if (p === `/api/store/cases/${CASE}`) {
    if (method === "POST") {
      const b = await body()
      if (b.action === "reply") add("store", b.body)
      return json({ case: state.summary, messages: visible(), answerBy: null, live: null })
    }
    const a = after(url)
    return json({ case: a ? { ...state.summary, sellerNumber: undefined } : state.summary, messages: visible().filter((m) => m.id > a), answerBy: state.summary.status === "store" ? new Date(Date.now() + 2 * day).toISOString() : null, live: null })
  }
  if (p === "/api/store/cases") return json({ cases: [state.summary, { ...summary, id: "ca5e0000-0000-4000-8000-000000000002", reason: "question", status: "buyer", unread: false, orderRef: "7C21B0AA", sellerNumber: "#1039", buyerName: "Mihai Pop", buyerEmail: "mihai@example.com", lastMessageAt: ago(3) }, { ...summary, id: "ca5e0000-0000-4000-8000-000000000003", reason: "not_arrived", status: "resolved", unread: false, orderRef: "11A0C3F2", sellerNumber: "#1021", buyerName: null, buyerEmail: "ioana.m@example.com", lastMessageAt: ago(12) }] })
  if (p === "/api/support/tickets") return json({ tickets: [] })
  if (p === "/api/admin/support") return json({ tickets: [], counts: { open: 0, waiting: 1, resolved: 4 } })
  if (p === "/api/admin/cases") return json({ cases: [admin()], counts: { storelib: 1, escalated: 3, all: 12 } })
  if (p === `/api/admin/cases/${CASE}`) {
    if (method === "POST") {
      const b = await body()
      if (b.action === "reply") add("storelib", b.body, !!b.internal)
    }
    const a = after(url)
    return json({ case: admin(), messages: state.messages.filter((m) => m.id > a), ...(a ? {} : { store, order }), live: null })
  }
  return json({})
}) as typeof fetch

function Buyer() {
  return (
    <CheckoutWords lang={lang} words={ro ? checkoutWordsIn("ro", null) : {}}>
      <CaseView id={CASE} k="demo-key" initial={{ case: state.summary, messages: visible(), escalation: { can: false, from: new Date(Date.now() + 1 * day).toISOString() } }} store={{ name: "AndrewRullz", logoUrl: null, email: store.email, phone: store.phone, websiteUrl: store.websiteUrl }} order={{ path: "/checkout/physical/order/fI-H-y2syDHluY12QHIiPdMlLVq69mKd" }} live={null} />
    </CheckoutWords>
  )
}

function App() {
  if (view === "seller") {
    if (!location.search.includes("case=")) history.replaceState(null, "", `${location.pathname}?view=seller&case=${CASE}`)
    return <div style={{ background: "#f8f9fa", height: "100vh" }}><SupportClient /></div>
  }
  if (view === "support") return <div style={{ background: "#f8f9fa", height: "100vh" }}><SupportClient /></div>
  if (view === "admin") {
    if (!location.search.includes("case=")) history.replaceState(null, "", `${location.pathname}?view=admin&case=${CASE}`)
    return <ResolutionCenter />
  }
  if (view === "both")
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh" }}>
        <div style={{ overflow: "auto" }} data-pane="buyer">
          <Buyer />
        </div>
        <div style={{ overflow: "auto", background: "#f8f9fa", padding: 16 }} data-pane="seller">
          <BuyerCaseThread id={CASE} onChanged={() => undefined} />
        </div>
      </div>
    )
  return <Buyer />
}

createRoot(document.getElementById("app")!).render(<App />)
