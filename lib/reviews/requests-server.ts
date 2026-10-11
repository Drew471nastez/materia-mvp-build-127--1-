import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS: THE REVIEW REQUEST EMAILS
 * ===========================================================================
 * Run from the hourly email run (app/api/cron/process-scheduled-emails),
 * beside the automations and the checkout reminder. For every store with
 * the app on and its request email on:
 *
 *   1. PLAN    each order line it sold since the app was turned on, once,
 *              as a review_requests row, the moment it is due
 *              (request-schedule.ts: days after a digital purchase, days
 *              after a parcel shipped or was delivered)
 *   2. SEND    the email, after the rules are checked again on fresh rows
 *              (requestBlock): still theirs, not reviewed, not unsubscribed,
 *              not the store's own. A "no" marks the row skipped with why.
 *   3. REMIND  once, `reminderDays` after, while still unreviewed
 *
 * The row is the lock: it is made with the order's unique key, so two runs
 * cannot both plan one order, and it moves scheduled → sent → reminded with
 * a conditional update, so two runs cannot both send one email.
 *
 * The email is the notification engine's own review request (lib/notify/
 * templates, reviewAsk), sent as the store ("<Store> via Storelib", replies
 * to its support address) with the link to the review page on the address
 * the buyer bought on: the website's own host for a website order, Storelib
 * otherwise. Its unsubscribe link turns review emails off for the address,
 * the same "review_requests" scope the engine's emails use.
 *
 * The reply says how many and never quotes an address.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { renderEmail } from "@/lib/notify/templates"
import { emailProvider } from "@/lib/notify/providers/mailgun"
import { reviewUnsubscribeUrl } from "@/lib/notify/unsubscribe"
import { baseUrl as storelibBase } from "@/lib/notify/urls"
import { siteOrigin } from "@/lib/website-builder/site-seo-data"
import { soldOnStorelib } from "./request-rules"
import { readReviewsApp, type ReviewsAppSettings } from "./app-settings"
import { reminderDueAt, requestBlock, requestDueAt, type RequestFacts, type Shipment } from "./request-schedule"
import { signRequest } from "./request-token"
import { sweepReviewUploads } from "./photos-server"
import { sendReviewDigests } from "./digest-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const ORDER_COLUMNS = "id, creator_id, product_id, buyer_id, buyer_email, buyer_first_name, status, amount_cents, refund_amount_cents, created_at, requires_shipping, checkout_id, source, source_detail"
const LOOKBACK_DAYS = 120
const STORES_PER_RUN = 300
const ORDERS_PER_STORE = 400
const MAX_ATTEMPTS = 3

export interface SweepResult {
  stores: number
  planned: number
  sent: number
  reminded: number
  skipped: number
  failed: number
  /** Unclaimed photo uploads and unconfirmed website reviews swept (photos-server). */
  swept?: { uploads: number; drafts: number }
  /** Stores sent a digest of their new website reviews (digest-server). */
  digests?: number
}

const lower = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "")

/** The stores with the app and its request email on. */
async function storesAsking(db: Db): Promise<{ creatorId: string; settings: ReviewsAppSettings }[]> {
  const { data, error } = await db.from("store_settings").select("creator_id, reviews").eq("reviews->>enabled", "true").limit(STORES_PER_RUN)
  if (error) return []
  return ((data ?? []) as { creator_id: string; reviews: unknown }[])
    .map((r) => ({ creatorId: r.creator_id, settings: readReviewsApp(r.reviews) }))
    .filter((s) => s.settings.enabled && s.settings.request.enabled)
}

/** When each checkout's parcel shipped and was delivered. */
async function shipmentsFor(db: Db, checkoutIds: string[]): Promise<Map<string, Shipment>> {
  const out = new Map<string, Shipment>()
  if (checkoutIds.length === 0) return out
  const [{ data: checkouts }, { data: fulfillments }] = await Promise.all([
    db.from("commerce_checkouts").select("id, delivered_at").in("id", checkoutIds),
    db.from("fulfillments").select("checkout_id, shipped_at, delivered_at, status").in("checkout_id", checkoutIds),
  ])
  for (const c of (checkouts ?? []) as { id: string; delivered_at?: string | null }[]) out.set(c.id, { deliveredAt: c.delivered_at ?? null })
  for (const f of (fulfillments ?? []) as { checkout_id: string; shipped_at?: string | null; delivered_at?: string | null; status?: string | null }[]) {
    if (f.status === "cancelled" || f.status === "failed") continue
    const now = out.get(f.checkout_id) ?? {}
    const earliest = (a?: string | null, b?: string | null) => (a && b ? (a < b ? a : b) : a || b || null)
    out.set(f.checkout_id, { shippedAt: earliest(now.shippedAt, f.shipped_at), deliveredAt: now.deliveredAt || f.delivered_at || null })
  }
  return out
}

interface RequestRow {
  id: string
  creator_id: string
  order_id: string
  product_id: string | null
  email: string
  first_name: string | null
  origin: string | null
  status: string
  due_at: string
  sent_at: string | null
  reminded_at?: string | null
  last_sent_at?: string | null
  attempts: number
}

/** The facts the rule reads, fresh. */
async function factsFor(db: Db, row: RequestRow): Promise<RequestFacts & { product: { id: string; title: string | null; thumbnail_url: string | null } | null; storeName: string | null }> {
  const { data: order } = await db.from("orders").select(ORDER_COLUMNS).eq("id", row.order_id).maybeSingle()
  const o = order as Record<string, any> | null
  const productId = row.product_id ?? o?.product_id ?? null
  const [{ data: product }, { data: creator }, reviewed, suppressed] = await Promise.all([
    productId ? db.from("products").select("id, title, thumbnail_url, status").eq("id", productId).maybeSingle() : Promise.resolve({ data: null }),
    db.from("creators").select("id, user_id, support_email, display_name, slug").eq("id", row.creator_id).maybeSingle(),
    (async () => {
      const byOrder = await db.from("reviews").select("id").eq("order_id", row.order_id).limit(1)
      if ((byOrder.data ?? []).length) return true
      if (o?.buyer_id && productId) {
        const byBuyer = await db.from("reviews").select("id").eq("buyer_id", o.buyer_id).eq("product_id", productId).limit(1)
        if ((byBuyer.data ?? []).length) return true
      }
      if (productId) {
        const byAddress = await db.from("review_authors").select("review_id").eq("creator_id", row.creator_id).eq("email", lower(row.email)).eq("product_id", productId).limit(1)
        if ((byAddress.data ?? []).length) return true
        const same = await db.from("orders").select("id").eq("buyer_email", lower(row.email)).eq("product_id", productId)
        const ids = ((same.data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => id !== row.order_id)
        if (ids.length) {
          const other = await db.from("reviews").select("id").in("order_id", ids).limit(1)
          if ((other.data ?? []).length) return true
        }
      }
      return false
    })(),
    (async () => {
      const { data } = await db.from("email_suppressions").select("scope").eq("email", lower(row.email)).is("lifted_at", null)
      return ((data ?? []) as { scope: string }[]).map((r) => r.scope)
    })(),
  ])
  const p = product as { id: string; title: string | null; thumbnail_url: string | null; status?: string | null } | null
  const c = creator as { user_id?: string | null; support_email?: string | null; display_name?: string | null; slug?: string | null } | null
  let storeName: string | null = null
  try {
    const { data: s } = await db.from("store_settings").select("store_name").eq("creator_id", row.creator_id).maybeSingle()
    storeName = (s as { store_name?: string | null } | null)?.store_name ?? null
  } catch {
    storeName = null
  }
  return {
    order: o,
    productExists: !!p && p.status !== "deleted",
    reviewed,
    sellerUserId: c?.user_id ?? null,
    sellerSupportEmail: c?.support_email ?? null,
    suppressed,
    product: p ? { id: p.id, title: p.title, thumbnail_url: p.thumbnail_url } : null,
    storeName: storeName || c?.display_name || c?.slug || null,
  }
}

/** The email, rendered and sent. True when the provider took it. */
async function sendAsk(row: RequestRow, facts: Awaited<ReturnType<typeof factsFor>>, settings: ReviewsAppSettings, reminder: boolean): Promise<"sent" | "retry" | "failed"> {
  const token = signRequest(row.id)
  if (!token) return "failed"
  const base = row.origin || storelibBase()
  const unsubscribe = reviewUnsubscribeUrl(row.order_id)
  /* The footer link on the host the email links to: /api passes through on a website's own host. */
  const unsubscribeHere = unsubscribe ? `${base}${new URL(unsubscribe).pathname}${new URL(unsubscribe).search}` : null
  const rendered = renderEmail(
    reminder ? "REVIEW_REMINDER" : "REVIEW_REQUEST",
    {
      productTitle: facts.product?.title ?? "",
      productId: facts.product?.id ?? "",
      productImage: facts.product?.thumbnail_url ?? "",
      creatorName: facts.storeName ?? "",
      creatorSupportEmail: facts.sellerSupportEmail ?? "",
      orderId: row.order_id,
      reviewToken: token,
      reminderOn: settings.request.reminder,
    },
    { baseUrl: base, recipientName: row.first_name, unsubscribeUrl: unsubscribeHere, preferencesUrl: null, when: null },
  )
  const headers: Record<string, string> = { "X-Storelib-Notification": reminder ? "REVIEW_REMINDER" : "REVIEW_REQUEST" }
  if (unsubscribeHere) {
    headers["List-Unsubscribe"] = `<${unsubscribeHere}>`
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
  }
  const result = await emailProvider().send({
    to: row.email,
    subject: rendered.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
    html: rendered.html,
    text: rendered.text,
    fromName: rendered.fromName ? `${rendered.fromName} via Storelib` : undefined,
    replyTo: rendered.replyTo ?? undefined,
    headers,
    tags: ["storelib-reviews", reminder ? "REVIEW_REMINDER" : "REVIEW_REQUEST"],
    variables: { review_request_id: row.id },
    messageId: `<review.${row.id}.${reminder ? 2 : 1}@storelib.com>`,
  })
  if (result.status === "sent" || result.status === "unknown") return "sent"
  return result.status === "retry" ? "retry" : "failed"
}

async function step(db: Db, row: RequestRow, settings: ReviewsAppSettings, reminder: boolean, now: number, out: SweepResult): Promise<void> {
  const facts = await factsFor(db, row)
  const due = reminder ? reminderDueAt(row.sent_at, settings.request) ?? now : Date.parse(row.due_at)
  const block = requestBlock(facts, settings, due, now)
  const from = reminder ? "sent" : "scheduled"
  if (block) {
    const next = block === "reviewed" ? "reviewed" : "skipped"
    await db.from("review_requests").update({ status: next, skip_reason: block, updated_at: new Date(now).toISOString() }).eq("id", row.id).eq("status", from)
    out.skipped++
    return
  }
  /* Claimed before it is sent: a run beside this one finds it moved and leaves it. */
  const to = reminder ? "reminded" : "sent"
  const stamp = new Date(now).toISOString()
  const claim = await db
    .from("review_requests")
    .update({ status: to, ...(reminder ? { reminded_at: stamp } : { sent_at: stamp }), attempts: (row.attempts ?? 0) + 1, updated_at: stamp })
    .eq("id", row.id)
    .eq("status", from)
    .select("id")
  if (!(claim.data ?? []).length) return
  const sent = await sendAsk(row, facts, settings, reminder).catch(() => "retry" as const)
  if (sent === "sent") {
    if (reminder) out.reminded++
    else out.sent++
    return
  }
  /* Not sent: back where it was to try again next hour, or failed for good after a few. */
  const giveUp = sent === "failed" || (row.attempts ?? 0) + 1 >= MAX_ATTEMPTS
  await db
    .from("review_requests")
    .update({ status: giveUp ? (reminder ? "reminded" : "failed") : from, ...(reminder ? { reminded_at: null } : { sent_at: null }), ...(giveUp ? { skip_reason: reminder ? "reminder_failed" : "send_failed" } : {}), updated_at: stamp })
    .eq("id", row.id)
  out.failed++
}

/** Plan what is due for one store. */
async function planStore(db: Db, creatorId: string, settings: ReviewsAppSettings, now: number, out: SweepResult): Promise<void> {
  const since = new Date(Math.max(now - LOOKBACK_DAYS * 86_400_000, settings.enabledAt ? Date.parse(settings.enabledAt) : 0)).toISOString()
  const { data, error } = await db.from("orders").select(ORDER_COLUMNS).eq("creator_id", creatorId).gte("created_at", since).order("created_at", { ascending: false }).limit(ORDERS_PER_STORE)
  if (error) return
  const orders = ((data ?? []) as Record<string, any>[]).filter((o) => o.product_id && typeof o.buyer_email === "string" && o.buyer_email.includes("@"))
  if (orders.length === 0) return
  const { data: had } = await db.from("review_requests").select("order_id").in("order_id", orders.map((o) => o.id))
  const known = new Set(((had ?? []) as { order_id: string }[]).map((r) => r.order_id))
  const fresh = orders.filter((o) => !known.has(o.id))
  if (fresh.length === 0) return
  const ships = await shipmentsFor(db, [...new Set(fresh.filter((o) => o.requires_shipping && o.checkout_id).map((o) => String(o.checkout_id)))])
  let origin: string | null | undefined
  for (const o of fresh) {
    const due = requestDueAt(o, o.checkout_id ? ships.get(String(o.checkout_id)) ?? null : null, settings.request)
    if (due === null || due > now) continue
    /* A website's order is asked on the website's own address. */
    let at: string | null = null
    if (soldOnStorelib(o) === "website") {
      if (origin === undefined) origin = await originOf(db, creatorId)
      at = origin
    }
    const row = {
      creator_id: creatorId,
      order_id: o.id,
      product_id: o.product_id,
      email: lower(o.buyer_email),
      first_name: typeof o.buyer_first_name === "string" ? o.buyer_first_name.trim().slice(0, 80) || null : null,
      origin: at,
      status: "scheduled",
      due_at: new Date(due).toISOString(),
    }
    const { data: made } = await db.from("review_requests").upsert(row, { onConflict: "order_id", ignoreDuplicates: true }).select("*")
    const planned = ((made ?? []) as RequestRow[])[0]
    if (!planned) continue
    out.planned++
    await step(db, planned, settings, false, now, out)
  }
}

async function originOf(db: Db, creatorId: string): Promise<string | null> {
  try {
    const { data } = await db.from("creators").select("slug").eq("id", creatorId).maybeSingle()
    const name = (data as { slug?: string | null } | null)?.slug
    if (!name) return null
    const o = await siteOrigin(creatorId, name)
    return /^https:\/\/[a-z0-9.-]+$/.test(o) ? o : null
  } catch {
    return null
  }
}

/** Reminders due for one store. */
async function remindStore(db: Db, creatorId: string, settings: ReviewsAppSettings, now: number, out: SweepResult): Promise<void> {
  if (!settings.request.reminder) return
  const cutoff = new Date(now - settings.request.reminderDays * 86_400_000).toISOString()
  const { data } = await db.from("review_requests").select("*").eq("creator_id", creatorId).eq("status", "sent").lte("sent_at", cutoff).limit(200)
  for (const row of (data ?? []) as RequestRow[]) await step(db, row, settings, true, now, out)
}

/** Requests planned but not sent (a run that stopped, a send to try again). */
async function retryStore(db: Db, creatorId: string, settings: ReviewsAppSettings, now: number, out: SweepResult): Promise<void> {
  const { data } = await db.from("review_requests").select("*").eq("creator_id", creatorId).eq("status", "scheduled").lte("due_at", new Date(now).toISOString()).limit(100)
  for (const row of (data ?? []) as RequestRow[]) await step(db, row, settings, false, now, out)
}

export async function sweepReviewRequests(opts: { now?: number; budgetMs?: number; db?: Db } = {}): Promise<SweepResult> {
  const db = opts.db ?? createAdminClient()
  const now = opts.now ?? Date.now()
  const started = Date.now()
  const budget = opts.budgetMs ?? 40_000
  const out: SweepResult = { stores: 0, planned: 0, sent: 0, reminded: 0, skipped: 0, failed: 0 }
  const stores = await storesAsking(db)
  for (const s of stores) {
    if (Date.now() - started > budget) break
    out.stores++
    try {
      await retryStore(db, s.creatorId, s.settings, now, out)
      await planStore(db, s.creatorId, s.settings, now, out)
      await remindStore(db, s.creatorId, s.settings, now, out)
    } catch (e) {
      console.warn("[reviews] request run stopped for a store:", e instanceof Error ? e.message.slice(0, 120) : "unknown")
    }
  }
  out.swept = await sweepReviewUploads(db, now)
  out.digests = await sendReviewDigests(db, now)
  return out
}

/** A form cannot have one order's link sent more often than this. */
export const ASK_AGAIN_MS = 7 * 86_400_000

/**
 * A buyer who typed their address into the website's review form: their own
 * link, now, whatever the schedule says (the form proved nothing, the inbox
 * does). Run after the form has answered (the answer is the same whoever
 * typed what). The request row is made when there is none. Not when the
 * store has its request emails off, not for a request that is done
 * (reviewed, skipped, failed), and not when a link for that order went out
 * in the last seven days, however often the form is sent. The rules still
 * apply (unsubscribed, the store's own order); the schedule and the "too
 * late" rule do not. True when an email went.
 */
export async function askNow(db: Db, creatorId: string, orderId: string, settings: ReviewsAppSettings, nowMs = Date.now()): Promise<boolean> {
  if (!settings.enabled || !settings.request.enabled) return false
  const { data: order } = await db.from("orders").select(ORDER_COLUMNS).eq("id", orderId).maybeSingle()
  const o = order as Record<string, any> | null
  if (!o || !o.product_id || typeof o.buyer_email !== "string") return false
  let at: string | null = null
  if (soldOnStorelib(o) === "website") at = await originOf(db, creatorId)
  const now = nowMs
  await db
    .from("review_requests")
    .upsert(
      { creator_id: creatorId, order_id: orderId, product_id: o.product_id, email: lower(o.buyer_email), first_name: typeof o.buyer_first_name === "string" ? o.buyer_first_name.trim().slice(0, 80) || null : null, origin: at, status: "scheduled", due_at: new Date(now).toISOString() },
      { onConflict: "order_id", ignoreDuplicates: true },
    )
  const { data: row } = await db.from("review_requests").select("*").eq("order_id", orderId).maybeSingle()
  const r = row as RequestRow | null
  if (!r || !["scheduled", "sent", "reminded"].includes(r.status)) return false
  const last = Math.max(...[r.last_sent_at, r.reminded_at, r.sent_at].map((t) => (t ? Date.parse(t) || 0 : 0)))
  if (last > now - ASK_AGAIN_MS) return false
  const facts = await factsFor(db, r)
  const block = requestBlock(facts, { enabledAt: null }, now, now)
  if (block) return false
  const sent = await sendAsk(r, facts, settings, false).catch(() => "retry" as const)
  if (sent !== "sent") return false
  const stamp = new Date().toISOString()
  await db.from("review_requests").update({ status: r.status === "scheduled" ? "sent" : r.status, sent_at: r.sent_at ?? stamp, last_sent_at: stamp, attempts: (r.attempts ?? 0) + 1, updated_at: stamp }).eq("id", r.id)
  return true
}

/* ── The review page's side: a link, back to its request ─────────────── */

export interface RequestContext {
  request: RequestRow & { review_id: string | null }
  order: Record<string, any> | null
  product: { id: string; title: string | null; slug: string | null; thumbnail_url: string | null; creator_id: string; status?: string | null } | null
  creator: { id: string; user_id: string | null; support_email: string | null; display_name: string | null; slug: string | null } | null
  storeName: string
  settings: ReviewsAppSettings
  /** The review this link already led to, when there is one. */
  review: Record<string, any> | null
}

/** Everything the review page and its routes need, from a request id a token named. Null when it is not one. */
export async function requestContext(db: Db, requestId: string): Promise<RequestContext | null> {
  const { data: request } = await db.from("review_requests").select("*").eq("id", requestId).maybeSingle()
  if (!request) return null
  const r = request as RequestContext["request"]
  const [{ data: order }, { data: product }, { data: creator }, { data: store }] = await Promise.all([
    db.from("orders").select("*").eq("id", r.order_id).maybeSingle(),
    r.product_id ? db.from("products").select("id, title, slug, thumbnail_url, creator_id, status").eq("id", r.product_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("creators").select("id, user_id, support_email, display_name, slug").eq("id", r.creator_id).maybeSingle(),
    db.from("store_settings").select("*").eq("creator_id", r.creator_id).maybeSingle(),
  ])
  const settings = readReviewsApp((store as { reviews?: unknown } | null)?.reviews)
  let review: Record<string, any> | null = null
  if (r.review_id) review = (await db.from("reviews").select("*").eq("id", r.review_id).maybeSingle()).data ?? null
  if (!review) review = (await db.from("reviews").select("*").eq("order_id", r.order_id).limit(1).maybeSingle()).data ?? null
  const c = creator as RequestContext["creator"]
  const storeName = ((store as { store_name?: string | null } | null)?.store_name || c?.display_name || c?.slug || "the store").trim()
  return { request: r, order: (order as Record<string, any> | null) ?? null, product: (product as RequestContext["product"]) ?? null, creator: c ?? null, storeName, settings, review }
}
