import "server-only"

/**
 * ===========================================================================
 *  WHERE STORELIB'S EVENTS ARE TOLD TO THE QUEUE
 * ===========================================================================
 *   a page view        lib/analytics/collect, once it is recorded (not a
 *                      robot, not the owner, not a repeat): page_view, and
 *                      view_item on a product's page
 *   a purchase         the notification outbox's order.created
 *                      (lib/notify/outbox emit, raised once by
 *                      lib/orders/sale-events whichever path wrote the
 *                      order): read back from the order rows, so the value,
 *                      the currency and the items are the order's own
 *   a refund           order.refunded (Stripe's refund sync, the Orders
 *                      page, a community refund)
 *   a sign up          membership.started
 *   a lead             a OnePage signup (lib/onepage/integrations
 *                      deliver-server) and a newsletter subscribe
 *
 * Never a free claim, never an admin's test sale (lib/analytics/test-sales),
 * the same rules Analytics counts by. The person comes from the request
 * when the request is the visitor's own (their consent cookie, their
 * browser's ids); a Stripe webhook or a seller's screen is nobody's
 * browser, so its events carry no person until the thank you page adds
 * one (noteThanks).
 */

import { createHash } from "node:crypto"
import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { isTestSale } from "@/lib/analytics/test-sales"
import { clientIp } from "@/lib/analytics/anon-visit"
import { HOLD_MS, drain, enqueue, hasDestinations, noteBrowser, afterResponse, type Transport } from "./queue-server"
import { currencyCode, type ForwardItem, type PersonInput } from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex")
const SAFE_REF = /^[A-Za-z0-9_-]{1,64}$/

/* ── the person, from the visitor's own request ────────────────────────── */

export interface RequestLike {
  headers: Headers
  cookie: (name: string) => string | undefined
}

/** GA4's client id from its _ga cookie: GA1.1.123456789.1700000000 is 123456789.1700000000. */
export function gaClientIdOf(cookie: string | undefined): string | null {
  const m = typeof cookie === "string" ? /^GA\d\.\d+\.(\d+\.\d+)$/.exec(cookie.trim()) : null
  return m ? m[1] : null
}

/** What a visitor's request can say about them, consent first. Nothing past the consent record without it. */
export function personOf(req: RequestLike, extra: { visitorId?: string | null; email?: string | null; phone?: string | null } = {}, now = Date.now()): PersonInput {
  const c = parse(req.cookie(CONSENT_COOKIE), now)
  const consent = { analytics: allows(c, "analytics"), marketing: allows(c, "marketing") }
  const country = req.headers.get("x-vercel-ip-country")
  return {
    consent,
    gaClientId: gaClientIdOf(req.cookie("_ga")),
    visitorId: extra.visitorId ?? req.cookie("visitor_id") ?? null,
    email: extra.email ?? null,
    phone: extra.phone ?? null,
    ip: clientIp(req.headers),
    userAgent: req.headers.get("user-agent"),
    fbp: req.cookie("_fbp") ?? null,
    fbc: req.cookie("_fbc") ?? null,
    country: country && /^[A-Z]{2}$/i.test(country) ? country : null,
  }
}

/**
 * The visitor's request, when this code runs inside one and it is a
 * visitor's: next/headers, read inside after() too. A seller's own screen
 * (/app, the Orders page's refund, a marked cash order) is not the buyer.
 */
async function currentVisitor(): Promise<RequestLike | null> {
  try {
    const { cookies, headers } = await import("next/headers")
    const [jar, h] = await Promise.all([cookies(), headers()])
    const ref = h.get("referer") ?? ""
    try {
      if (ref && /^\/(app|admin)(\/|$)/.test(new URL(ref).pathname)) return null
    } catch {
      /* no page: the request's own */
    }
    if (!jar.get(CONSENT_COOKIE)) return null
    return { headers: h, cookie: (n) => jar.get(n)?.value }
  } catch {
    return null
  }
}

async function visitorPerson(extra: { email?: string | null; phone?: string | null } = {}): Promise<PersonInput | null> {
  const req = await currentVisitor()
  return req ? personOf(req, extra) : null
}

/* ── orders ────────────────────────────────────────────────────────────── */

type OrderRow = {
  id: string
  creator_id: string
  product_id: string | null
  amount_cents: number | null
  quantity: number | null
  currency: string | null
  status: string | null
  created_at: string | null
  checkout_id?: string | null
  stripe_session_id?: string | null
  source_detail?: unknown
  buyer_email?: string | null
  receipt_token?: string | null
  product?: { title?: string | null } | null
}

const ORDER_COLUMNS = "id, creator_id, product_id, amount_cents, quantity, currency, status, created_at, checkout_id, stripe_session_id, receipt_token, source_detail, buyer_email, product:products(title)"

async function orderOf(db: Db, orderId: string): Promise<OrderRow | null> {
  let { data, error } = await db.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle()
  /* A database without checkout_id (before the physical parts): the rest. */
  if (error) ({ data, error } = await db.from("orders").select("id, creator_id, product_id, amount_cents, quantity, currency, status, created_at, stripe_session_id, source_detail, buyer_email").eq("id", orderId).maybeSingle())
  return error ? null : ((data as OrderRow | null) ?? null)
}

/** The whole purchase: a shipped cart's checkout, a digital basket's session, or the one row. */
async function basketOf(db: Db, order: OrderRow): Promise<OrderRow[]> {
  const read = async (col: "checkout_id" | "stripe_session_id", v: string) => {
    const { data, error } = await db.from("orders").select(ORDER_COLUMNS).eq("creator_id", order.creator_id).eq(col, v).limit(100)
    return error || !Array.isArray(data) || data.length === 0 ? null : (data as OrderRow[])
  }
  if (order.checkout_id) return (await read("checkout_id", order.checkout_id)) ?? [order]
  if (order.stripe_session_id) return (await read("stripe_session_id", order.stripe_session_id)) ?? [order]
  return [order]
}

/**
 * The id the store's browser pixel used for this purchase on the thank you
 * page (app/checkout/site/thanks): a shipped cart's checkout id, else the
 * order that holds the receipt (the purchase's first). Its refund is told by
 * the same id.
 */
export function purchaseRef(order: Pick<OrderRow, "id" | "checkout_id">, lines: Pick<OrderRow, "id" | "created_at" | "receipt_token">[] = []): string {
  if (order.checkout_id) return String(order.checkout_id)
  if (lines.length > 1) {
    const sorted = [...lines].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
    return String((sorted.find((l) => !!l.receipt_token) ?? sorted[0]).id)
  }
  return order.id
}

function itemsOf(lines: OrderRow[]): ForwardItem[] {
  return lines
    .filter((l) => l.product_id)
    .map((l) => {
      const q = Math.max(1, Number(l.quantity) || 1)
      return { id: String(l.product_id), name: l.product?.title ?? null, priceCents: Math.round((Number(l.amount_cents) || 0) / q), quantity: q }
    })
}

async function phoneOf(db: Db, checkoutId: string | null | undefined): Promise<string | null> {
  if (!checkoutId) return null
  try {
    const { data } = await db.from("commerce_checkouts").select("shipping_address").eq("id", checkoutId).maybeSingle()
    const phone = (data?.shipping_address as { phone?: unknown } | null)?.phone
    return typeof phone === "string" ? phone : null
  } catch {
    return null
  }
}

/* ── the outbox's events ───────────────────────────────────────────────── */

export interface OutboxEvent {
  name: string
  key: string
  creatorId?: string | null
  payload?: Record<string, unknown> | null
}

export const FORWARDED = new Set(["order.created", "order.refunded", "membership.started"])

/** One outbox event, onto the queue. Never throws. */
/** `transport`: the tests' fake; the real one otherwise. */
export async function forwardOutboxEvent(db: Db, e: OutboxEvent, person?: PersonInput | null, transport?: Transport): Promise<number> {
  try {
    if (!FORWARDED.has(e.name) || !e.creatorId) return 0
    if (!(await hasDestinations(db, e.creatorId))) return 0
    const p = e.payload ?? {}
    const creatorId = e.creatorId
    if (e.name === "order.created") {
      const orderId = typeof p.orderId === "string" ? p.orderId : null
      const amount = Number(p.amountCents) || 0
      if (!orderId || amount <= 0) return 0
      const order = await orderOf(db, orderId)
      if (!order || order.creator_id !== creatorId || isTestSale(order)) return 0
      const lines = await basketOf(db, order)
      if (lines.some(isTestSale)) return 0
      /* The purchase's first order is the one raiseSaleEvents names. */
      const ref = purchaseRef(order)
      if (!SAFE_REF.test(ref)) return 0
      const currency = currencyCode(typeof p.currency === "string" ? p.currency : order.currency) ?? "USD"
      const who = person === undefined ? await visitorPerson({ email: order.buyer_email ?? (typeof p.buyerEmail === "string" ? p.buyerEmail : null), phone: await phoneOf(db, order.checkout_id) }) : person
      const r = await enqueue(db, {
        creatorId,
        event: "purchase",
        key: `purchase:${ref}`,
        facts: { ref, at: order.created_at ?? new Date().toISOString(), valueCents: amount, currency, items: itemsOf(lines) },
        person: who,
        holdMs: HOLD_MS,
      })
      return r.queued
    }
    if (e.name === "order.refunded") {
      const orderId = typeof p.orderId === "string" ? p.orderId : null
      const refundId = typeof p.refundId === "string" ? p.refundId.slice(0, 80) : null
      const amount = Number(p.amountCents) || 0
      if (!orderId || amount <= 0) return 0
      const order = await orderOf(db, orderId)
      if (!order || order.creator_id !== creatorId || isTestSale(order)) return 0
      const lines = order.checkout_id || order.stripe_session_id ? await basketOf(db, order) : [order]
      const ref = purchaseRef(order, lines)
      if (!SAFE_REF.test(ref)) return 0
      const currency = currencyCode(typeof p.currency === "string" ? p.currency : order.currency) ?? "USD"
      /* A partial refund names its line; a whole one does not need to. */
      const items = p.full === true ? [] : itemsOf([order]).map((i) => ({ ...i, priceCents: null }))
      const r = await enqueue(db, { creatorId, event: "refund", key: `refund:${orderId}:${refundId ?? e.key}`, facts: { ref, at: new Date().toISOString(), valueCents: amount, currency, refundId, items }, person: null })
      if (r.queued) await drain(db, { creatorId, limit: 20, budgetMs: 15_000, transport })
      return r.queued
    }
    /* membership.started: a sign up, with what it costs. The first payment is its own purchase. */
    const id = typeof p.membershipId === "string" ? p.membershipId : null
    if (!id || !SAFE_REF.test(id)) return 0
    const currency = currencyCode(typeof p.currency === "string" ? p.currency : null)
    const who = person === undefined ? await visitorPerson({ email: typeof p.buyerEmail === "string" ? p.buyerEmail : null }) : person
    const r = await enqueue(db, { creatorId, event: "sign_up", key: `signup:membership:${id}`, facts: { ref: id, at: new Date().toISOString(), form: "membership", valueCents: Number(p.amountCents) || null, currency }, person: who, holdMs: HOLD_MS })
    return r.queued
  } catch {
    return 0
  }
}

/** From emit(), after the response. Never throws, never waits the caller. */
export function forwardOutboxSoon(db: Db, e: OutboxEvent): void {
  if (!FORWARDED.has(e.name) || !e.creatorId) return
  afterResponse(() => forwardOutboxEvent(db, e))
}

/* ── a page view ───────────────────────────────────────────────────────── */

export interface ViewRow {
  creator_id?: unknown
  product_id?: unknown
  visitor_id?: unknown
  path?: unknown
  page_url?: unknown
  page_title?: unknown
  referrer?: unknown
  created_at?: unknown
}

/** A recorded page view, and a product page's view_item. Only for a store with a tool connected (./queue-server caches that), only with consent. */
export async function forwardPageView(db: Db, row: ViewRow, req: RequestLike, now = Date.now(), transport?: Transport): Promise<number> {
  try {
    const creatorId = typeof row.creator_id === "string" ? row.creator_id : null
    if (!creatorId) return 0
    const person = personOf(req, { visitorId: typeof row.visitor_id === "string" ? row.visitor_id : null }, now)
    /* Nothing leaves without analytics or marketing consent: a page view is the visitor's own. */
    if (!person.consent.analytics && !person.consent.marketing) return 0
    const at = typeof row.created_at === "string" ? row.created_at : new Date(now).toISOString()
    const path = typeof row.path === "string" ? row.path : null
    /* The page itself: the beacon's Referer is the page that sent it; the row's page_url is where the visit landed. */
    const referer = req.headers.get("referer")
    const url = referer && /^https:\/\//.test(referer) ? referer.slice(0, 1000) : typeof row.page_url === "string" ? row.page_url : null
    const ref = sha(`${creatorId}|${String(row.visitor_id ?? "")}|${path ?? ""}|${at}`).slice(0, 32)
    const base = { at, url, path, title: typeof row.page_title === "string" ? row.page_title : null, referrer: typeof row.referrer === "string" ? row.referrer : null }
    let n = (await enqueue(db, { creatorId, event: "page_view", key: `view:${ref}`, facts: { ref: `pv-${ref}`, ...base }, person, now })).queued
    const productId = typeof row.product_id === "string" ? row.product_id : null
    if (productId) n += (await enqueue(db, { creatorId, event: "view_item", key: `item:${ref}`, facts: { ref: `vi-${ref}`, ...base, productId, items: [{ id: productId, name: base.title, priceCents: null, quantity: 1 }] }, person, now })).queued
    /* The caller's clock, moving: a test's fixed moment, the real one otherwise. */
    const offset = now - Date.now()
    if (n) await drain(db, { creatorId, limit: 20, budgetMs: 15_000, transport, now: () => Date.now() + offset })
    return n
  } catch {
    return 0
  }
}

/* ── a lead ────────────────────────────────────────────────────────────── */

export interface LeadInput {
  email: string
  form: string
  /** The lead's own id when the page's pixel was given it (Meta's eventID), so the two are one. */
  eventId?: string | null
  /** What makes the same person on the same form the same lead (lib/onepage deliveryKey). */
  key: string
  url?: string | null
  at?: string
}

export async function forwardLead(db: Db, creatorId: string | null | undefined, lead: LeadInput, person?: PersonInput | null, transport?: Transport): Promise<number> {
  try {
    if (!creatorId || !lead.email) return 0
    if (!(await hasDestinations(db, creatorId))) return 0
    const ref = lead.eventId && SAFE_REF.test(lead.eventId) ? lead.eventId : `lead-${sha(lead.key).slice(0, 24)}`
    const who = person === undefined ? await visitorPerson({ email: lead.email }) : person
    const form = /^[a-z_]{1,32}$/.test(lead.form) ? lead.form : "signup"
    const r = await enqueue(db, { creatorId, event: "lead", key: `lead:${sha(lead.key)}`, facts: { ref, at: lead.at ?? new Date().toISOString(), form, url: lead.url ?? null }, person: who ?? { consent: { analytics: false, marketing: false }, email: lead.email } })
    if (r.queued) await drain(db, { creatorId, limit: 20, budgetMs: 15_000, transport })
    return r.queued
  } catch {
    return 0
  }
}

/* ── the thank you page ────────────────────────────────────────────────── */

/**
 * The buyer's own browser opened their order page: the purchase's rows, still
 * held, take what the buyer's consent allows, and go. The cookies are read
 * now (a server component cannot read them inside after()); the rows after
 * the response. Never throws.
 */
export async function noteThanks(db: Db, creatorId: string, ref: string, email: string | null): Promise<void> {
  try {
    if (!SAFE_REF.test(ref)) return
    const who = await visitorPerson({ email })
    if (!who) return
    afterResponse(async () => {
      if ((await noteBrowser(db, creatorId, ref, who)) > 0) await drain(db, { creatorId, limit: 20, budgetMs: 15_000, transport })
    })
  } catch {
    /* the cron sends it as it is */
  }
}
