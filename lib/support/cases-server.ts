import "server-only"

/**
 * ===========================================================================
 *  BUYER CASES: THE SERVER HALF
 * ===========================================================================
 * Reads and writes for order_cases and order_case_messages (SQL part 117),
 * for the three sides (lib/support/cases.ts says how a case moves):
 *
 *   the buyer    opens a case with their order's own receipt token, the key
 *                they already hold; afterwards reads and writes it with the
 *                case's private link (only its SHA-256 is stored)
 *   the store    its own cases, by id AND its creator id
 *   Storelib     every case, from /admin behind the admin cookie
 *
 * The buyer's email and name always come from the order, never from what
 * the page sent. Every write is the server's. Emails: the store hears of a
 * new case and every buyer message; the buyer hears every reply; Storelib's
 * inbox hears when it is asked to step in. A failed email never fails the
 * message.
 */
import { createHash } from "node:crypto"
import { orderCaseSecret } from "@/lib/checkout/cart-tokens"
import { loggable } from "@/lib/admin/plain-reason"
import { sendMailgunOnce } from "@/lib/mailgun"
import { emailDocument, emailKit, emailText, plainOf, type EmailSender } from "@/lib/emails/layout"
import { appUrl } from "@/lib/notify/urls"
import { escapeHtml } from "@/lib/notify/templates/escape"
import { SUPPORT_EMAIL } from "@/lib/help/articles"
import { orderNumberOf } from "@/lib/receipts/rules"
import { storeIdentity, type StoreIdentity } from "@/lib/store/identity-server"
import { sellerOrderNumber, sellerOrderNumbers } from "@/lib/orders/order-number-server"
import { CASE_REASON_LABELS, CASE_STATUSES, ESCALATABLE, REASONS_SINCE_164, buyerEscalation, caseLink, statusAfterMessage, type CaseAuthor, type CaseMessage, type CasePhotoRef, type CaseReason, type CaseStatus, type CaseSummary } from "@/lib/support/cases"
import { keepCasePhotos, refsOf, removeCasePhotos, signCasePhotos, type IncomingPhoto } from "@/lib/support/case-photos-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Failure = { ok: false; error: string; status: number }
const MISSING = new Set(["42P01", "PGRST205"])
const NOT_READY: Failure = { ok: false, error: "Help with orders isn't switched on yet. Write to the store from your order email.", status: 503 }

type CaseRow = {
  id: string
  creator_id: string
  checkout_id: string | null
  order_id: string | null
  order_ref: string | null
  buyer_email: string
  buyer_name: string | null
  reason: CaseReason
  status: CaseStatus
  escalated: boolean
  escalated_by: "buyer" | "store" | null
  escalated_at: string | null
  access_hash: string
  store_unread: boolean
  buyer_unread: boolean
  created_at: string
  last_message_at: string
  resolved_at: string | null
}
type MessageRow = { id: number; case_id: string; author: CaseAuthor; internal: boolean; body: string; created_at: string; photos?: unknown }

const COLUMNS = "id, creator_id, checkout_id, order_id, order_ref, buyer_email, buyer_name, reason, status, escalated, escalated_by, escalated_at, access_hash, store_unread, buyer_unread, created_at, last_message_at, resolved_at"
const MESSAGE_COLUMNS = "id, case_id, author, internal, body, created_at"

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex")

function summary(r: CaseRow, unread: boolean): CaseSummary {
  return { id: r.id, reason: r.reason, status: r.status, escalated: r.escalated, escalatedBy: r.escalated_by, orderRef: r.order_ref, kind: r.checkout_id ? "physical" : "digital", buyerEmail: r.buyer_email, buyerName: r.buyer_name, createdAt: r.created_at, lastMessageAt: r.last_message_at, unread }
}
const message = (r: MessageRow): CaseMessage => ({ id: r.id, author: r.author, internal: r.internal, body: r.body, createdAt: r.created_at })

/** A missing column (SQL part 164's `photos` not there yet), however PostgREST says it. */
const missingColumn = (e: { code?: string } | null | undefined) => e?.code === "42703" || e?.code === "PGRST204"

/**
 * A case's thread, oldest first, with each message's photos as links that
 * last an hour. Storelib's internal notes only for Storelib. Before part
 * 164 there are no photos and the thread is read without them.
 */
async function readThread(db: Db, caseId: string, withNotes: boolean): Promise<{ ok: true; messages: CaseMessage[] } | { ok: false; error: { code?: string } }> {
  const ask = (cols: string) => {
    let q = db.from("order_case_messages").select(cols).eq("case_id", caseId)
    if (!withNotes) q = q.eq("internal", false)
    return q.order("id", { ascending: true }).limit(500)
  }
  let { data, error } = await ask(`${MESSAGE_COLUMNS}, photos`)
  if (error && missingColumn(error)) ({ data, error } = await ask(MESSAGE_COLUMNS))
  if (error) return { ok: false, error }
  const rows = (data ?? []) as MessageRow[]
  const messages = await Promise.all(
    rows.map(async (r) => {
      const refs = refsOf(r.photos, caseId)
      const m = message(r)
      if (refs.length) m.photos = await signCasePhotos(db, refs)
      return m
    }),
  )
  return { ok: true, messages }
}

/** One message on a case, with its photos when the database keeps them (part 164); without, the words still go and the photos are given back. */
async function insertMessage(db: Db, row: { case_id: string; author: CaseAuthor; body: string; internal?: boolean }, photos: CasePhotoRef[] = []): Promise<{ error: { code?: string } | null; photosDropped: boolean }> {
  row = { ...row, internal: row.internal === true }
  if (photos.length) {
    const { error } = await db.from("order_case_messages").insert({ ...row, photos })
    if (!error) return { error: null, photosDropped: false }
    if (!missingColumn(error)) {
      await removeCasePhotos(db, photos)
      return { error, photosDropped: false }
    }
    await removeCasePhotos(db, photos)
    const again = await db.from("order_case_messages").insert(row)
    return { error: again.error ?? null, photosDropped: true }
  }
  const { error } = await db.from("order_case_messages").insert(row)
  return { error: error ?? null, photosDropped: false }
}

function failed(where: string, error: { code?: string } | null | undefined, said: string): Failure {
  if (error && MISSING.has(error.code ?? "")) return NOT_READY
  console.error(`[cases] ${where}: ${loggable(error)}`)
  return { ok: false, error: said, status: 500 }
}

/** Whether the tables exist, for the pages to offer the button only when it can work. */
export async function casesReady(db: Db): Promise<boolean> {
  const { error } = await db.from("order_cases").select("id", { head: true, count: "exact" }).limit(1)
  return !error || !MISSING.has(error.code ?? "")
}

/* ─────────────────────────────── the order ─────────────────────────────── */

type FoundOrder = { kind: "physical" | "digital"; creatorId: string; checkoutId: string | null; orderId: string | null; orderRef: string; buyerEmail: string; buyerName: string | null }

/** The order a receipt token opens: a cart checkout that ships, or a digital purchase. */
export async function orderForToken(db: Db, kind: "physical" | "digital", token: string): Promise<FoundOrder | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  if (kind === "physical") {
    const { data } = await db.from("commerce_checkouts").select("id, creator_id, buyer_email, buyer_name, status").eq("receipt_token", token).maybeSingle()
    if (!data || !["paid", "refunded", "partially_refunded"].includes(data.status) || !data.buyer_email) return null
    return { kind, creatorId: data.creator_id, checkoutId: data.id, orderId: null, orderRef: orderNumberOf(data.id), buyerEmail: String(data.buyer_email).toLowerCase(), buyerName: data.buyer_name ?? null }
  }
  const { data } = await db.from("orders").select("id, product_id, buyer_email, buyer_name, status").eq("receipt_token", token).maybeSingle()
  if (!data?.product_id || !data.buyer_email) return null
  const { data: product } = await db.from("products").select("creator_id").eq("id", data.product_id).maybeSingle()
  if (!product?.creator_id) return null
  return { kind, creatorId: product.creator_id, checkoutId: null, orderId: data.id, orderRef: orderNumberOf(data.id), buyerEmail: String(data.buyer_email).toLowerCase(), buyerName: data.buyer_name ?? null }
}

/* ─────────────────────────────── the buyer ─────────────────────────────── */

/**
 * A new case, or the open one this order already has (its link is sent
 * again: a buyer who lost it asks twice and gets one case). The secret comes
 * back once, to be put in the buyer's link and nowhere else.
 */
export async function openCase(db: Db, order: FoundOrder, input: { reason: CaseReason; message: string; photos?: IncomingPhoto[] }, origin: string): Promise<{ ok: true; id: string; link: string; existing: boolean; photosNotKept?: boolean } | Failure> {
  const col = order.checkoutId ? "checkout_id" : "order_id"
  const ref = order.checkoutId ?? order.orderId
  const { data: open, error: oErr } = await db.from("order_cases").select(COLUMNS).eq(col, ref).neq("status", "resolved").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (oErr) return failed("open lookup", oErr, "Your message could not be sent. Try again in a moment.")
  if (open) {
    /* The same order's open case: this message joins it, under its topic when it is a new one. */
    const words = open.reason === input.reason ? input.message : `${CASE_REASON_LABELS[input.reason]}:\n${input.message}`
    const kept = await keepCasePhotos(db, open.id, input.photos ?? [])
    if (kept.ok === false) return { ok: false, error: kept.error, status: 400 }
    /*
      A problem Storelib can step in on (it arrived damaged, never came, a
      refund) joining a case opened for a question: the case is about the
      problem now. Kept under the question, the buyer could never ask
      Storelib in about it while the case stayed open.
    */
    if (ESCALATABLE.has(input.reason) && !ESCALATABLE.has(open.reason as CaseReason)) {
      const { error: moveError } = await db.from("order_cases").update({ reason: input.reason }).eq("id", open.id)
      if (!moveError) open.reason = input.reason
    }
    const r = await addMessage(db, open as CaseRow, "buyer", words, { origin, photos: kept.refs })
    if (r.ok === false) return r
    return { ok: true, id: open.id, link: caseLink(origin, open.id, orderCaseSecret(open.id)), existing: true, photosNotKept: kept.notKept || r.photosDropped }
  }
  /* The id is made here so the link's secret can be derived from it before the row is written. */
  const id = crypto.randomUUID()
  const secret = orderCaseSecret(id)
  const row = { id, creator_id: order.creatorId, checkout_id: order.checkoutId, order_id: order.orderId, order_ref: order.orderRef, buyer_email: order.buyerEmail, buyer_name: order.buyerName, reason: input.reason, status: "store", access_hash: hash(secret), store_unread: true }
  let { data: c, error } = await db.from("order_cases").insert(row).select(COLUMNS).single()
  let words = input.message
  /* A topic part 164 adds, on a database that hasn't run it (its check refuses it): filed under Something else, the topic in the first line. */
  if (error?.code === "23514" && REASONS_SINCE_164.has(input.reason)) {
    ;({ data: c, error } = await db.from("order_cases").insert({ ...row, reason: "other" }).select(COLUMNS).single())
    words = `${CASE_REASON_LABELS[input.reason]}:\n${input.message}`
  }
  if (error || !c) return failed("open", error, "Your message could not be sent. Try again in a moment.")
  const kept = await keepCasePhotos(db, c.id, input.photos ?? [])
  if (kept.ok === false) {
    await db.from("order_cases").delete().eq("id", c.id)
    return { ok: false, error: kept.error, status: 400 }
  }
  const { error: mErr, photosDropped } = await insertMessage(db, { case_id: c.id, author: "buyer", body: words }, kept.refs)
  if (mErr) {
    await db.from("order_cases").delete().eq("id", c.id)
    return failed("first message", mErr, "Your message could not be sent. Try again in a moment.")
  }
  const link = caseLink(origin, c.id, secret)
  const store = await storeFor(db, c as CaseRow)
  const photoCount = photosDropped ? 0 : kept.refs.length
  await Promise.all([emailStoreNewMessage(c as CaseRow, store, words, true, "buyer", photoCount), emailBuyerOpened(c as CaseRow, store, link)])
  return { ok: true, id: c.id, link, existing: false, photosNotKept: kept.notKept || photosDropped }
}

/** The link a buyer opens their case with, for the order page's button. */
export const buyerCaseLink = (origin: string, id: string) => caseLink(origin, id, orderCaseSecret(id))

/** The order's open case, when there is one, for the order page to show instead of a second form. */
export async function openCaseFor(db: Db, ref: { checkoutId?: string | null; orderId?: string | null }): Promise<{ id: string; status: CaseStatus } | null> {
  const col = ref.checkoutId ? "checkout_id" : ref.orderId ? "order_id" : null
  if (!col) return null
  const { data, error } = await db.from("order_cases").select("id, status").eq(col, ref.checkoutId ?? ref.orderId).neq("status", "resolved").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return { id: data.id, status: data.status }
}

async function caseForBuyer(db: Db, id: string, secret: string): Promise<{ ok: true; row: CaseRow } | Failure> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !secret || secret.length > 100) return { ok: false, error: "Not found.", status: 404 }
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) return failed("buyer read", error, "This case could not be read.")
  if (!data || data.access_hash !== hash(secret)) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true, row: data as CaseRow }
}

export async function getCaseForBuyer(db: Db, id: string, secret: string, now: number = Date.now()): Promise<{ ok: true; case: CaseSummary; messages: CaseMessage[]; store: StoreIdentity; escalation: { can: boolean; from: string | null } } | Failure> {
  const found = await caseForBuyer(db, id, secret)
  if (found.ok === false) return found
  const thread = await readThread(db, id, false)
  if (thread.ok === false) return failed("buyer thread", thread.error, "This case could not be read.")
  if (found.row.buyer_unread) await db.from("order_cases").update({ buyer_unread: false }).eq("id", id)
  const c = summary(found.row, false)
  return { ok: true, case: c, messages: thread.messages, store: await storeIdentity(db, found.row.creator_id), escalation: buyerEscalation(c, thread.messages, now) }
}

export async function buyerAct(db: Db, id: string, secret: string, action: { kind: "reply"; body: string; photos?: IncomingPhoto[] } | { kind: "escalate"; body: string | null } | { kind: "resolve" }, origin: string, now: number = Date.now()): Promise<{ ok: true; photosNotKept?: boolean } | Failure> {
  const found = await caseForBuyer(db, id, secret)
  if (found.ok === false) return found
  if (action.kind === "escalate") {
    /* Asking Storelib in, as a buyer: once the store has left a problem about money or goods unanswered for three days (lib/support/cases.ts buyerEscalation). */
    const thread = await readThread(db, id, false)
    if (thread.ok === false) return failed("escalate read", thread.error, "That could not be sent.")
    const rule = buyerEscalation(summary(found.row, false), thread.messages, now)
    if (!found.row.escalated && !rule.can) return { ok: false, error: rule.from ? `You can ask Storelib for help from ${new Date(rule.from).toUTCString().slice(0, 16)} if the store hasn't answered by then.` : "Storelib steps in on problems with what you received or a refund, once the store hasn't answered for three days.", status: 409 }
  }
  if (action.kind === "reply" && action.photos?.length) {
    const kept = await keepCasePhotos(db, id, action.photos)
    if (kept.ok === false) return { ok: false, error: kept.error, status: 400 }
    const r = await addMessage(db, found.row, "buyer", action.body, { origin, photos: kept.refs })
    if (r.ok === false) return r
    return { ok: true, photosNotKept: kept.notKept || r.photosDropped }
  }
  return act(db, found.row, "buyer", action, origin)
}

/* ─────────────────────────────── the store ─────────────────────────────── */

const withNumber = (c: CaseSummary, r: CaseRow, n: Awaited<ReturnType<typeof sellerOrderNumbers>>): CaseSummary => {
  const v = n ? ((r.checkout_id ? n.byCheckout.get(r.checkout_id) : undefined) ?? (r.order_id ? n.byOrder.get(r.order_id) : undefined)) : undefined
  return v ? { ...c, sellerNumber: `#${v}` } : c
}

export async function listCasesForStore(db: Db, creatorId: string, ref: { checkoutId?: string | null; orderId?: string | null } = {}): Promise<{ ok: true; cases: CaseSummary[] } | Failure> {
  let q = db.from("order_cases").select(COLUMNS).eq("creator_id", creatorId)
  /* One order's cases, for the order page (app/app/orders): a cart that ships by its checkout, a download by its order. */
  if (ref.checkoutId) q = q.eq("checkout_id", ref.checkoutId)
  else if (ref.orderId) q = q.eq("order_id", ref.orderId)
  const { data, error } = await q.order("last_message_at", { ascending: false }).limit(200)
  if (error) return failed("store list", error, "Buyer cases could not be read. Try again in a moment.")
  /* The Orders page's number on each, the way the store names its orders (lib/orders/order-number-server.ts). */
  const numbers = (data ?? []).length ? await sellerOrderNumbers(db, creatorId) : null
  return { ok: true, cases: ((data ?? []) as CaseRow[]).map((r) => withNumber(summary(r, r.store_unread), r, numbers)) }
}

export async function getCaseForStore(db: Db, creatorId: string, id: string): Promise<{ ok: true; case: CaseSummary; messages: CaseMessage[] } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (error) return failed("store read", error, "That case could not be read.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  const thread = await readThread(db, id, false)
  if (thread.ok === false) return failed("store thread", thread.error, "That case could not be read.")
  if ((data as CaseRow).store_unread) await db.from("order_cases").update({ store_unread: false }).eq("id", id).eq("creator_id", creatorId)
  const number = await sellerOrderNumber(db, creatorId, { checkoutId: (data as CaseRow).checkout_id, orderId: (data as CaseRow).order_id })
  return { ok: true, case: { ...summary(data as CaseRow, false), sellerNumber: number }, messages: thread.messages }
}

export async function storeAct(db: Db, creatorId: string, id: string, action: { kind: "reply"; body: string } | { kind: "escalate"; body: string | null } | { kind: "resolve" }, origin: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (error) return failed("store act", error, "That could not be saved.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return act(db, data as CaseRow, "store", action, origin)
}

/* ─────────────────────────────── Storelib ──────────────────────────────── */

export interface AdminCase extends CaseSummary {
  creatorId: string
  store: { name: string | null; slug: string | null }
  escalatedAt: string | null
  resolvedAt: string | null
  checkoutId: string | null
  orderId: string | null
}
type Joined = CaseRow & { creator?: { display_name?: string | null; slug?: string | null } | null }
const adminCase = (r: Joined): AdminCase => ({ ...summary(r, false), creatorId: r.creator_id, store: { name: r.creator?.display_name ?? null, slug: r.creator?.slug ?? null }, escalatedAt: r.escalated_at, resolvedAt: r.resolved_at, checkoutId: r.checkout_id, orderId: r.order_id })

/** The cases Storelib is in (asked to step in), or every case for "all". */
export async function adminListCases(db: Db, opts: { view?: string | null; q?: string | null }): Promise<{ ok: true; cases: AdminCase[]; counts: { storelib: number; escalated: number; all: number } } | Failure> {
  let q = db.from("order_cases").select(`${COLUMNS}, creator:creators(display_name, slug)`)
  if (opts.view === "storelib" || !opts.view) q = q.eq("status", "storelib")
  else if (opts.view === "escalated") q = q.eq("escalated", true)
  else if (opts.view === "resolved") q = q.eq("status", "resolved")
  const words = (opts.q ?? "").replace(/[%,()]/g, " ").trim().slice(0, 80)
  if (words) q = q.or(`buyer_email.ilike.%${words}%,order_ref.ilike.%${words}%`)
  const { data, error } = await q.order("last_message_at", { ascending: !opts.view || opts.view === "storelib" }).limit(200)
  if (error) return failed("admin list", error, "Cases could not be read.")
  const count = async (f: (b: Db) => Db) => (await f(db.from("order_cases").select("id", { count: "exact", head: true }))).count ?? 0
  const [storelib, escalated, all] = await Promise.all([count((b) => b.eq("status", "storelib")), count((b) => b.eq("escalated", true)), count((b) => b)])
  return { ok: true, cases: ((data ?? []) as Joined[]).map(adminCase), counts: { storelib, escalated, all } }
}

export async function adminGetCase(db: Db, id: string): Promise<{ ok: true; case: AdminCase; messages: CaseMessage[]; store: StoreIdentity } | Failure> {
  const { data, error } = await db.from("order_cases").select(`${COLUMNS}, creator:creators(display_name, slug)`).eq("id", id).maybeSingle()
  if (error) return failed("admin get", error, "That case could not be read.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  const thread = await readThread(db, id, true)
  if (thread.ok === false) return failed("admin thread", thread.error, "That case could not be read.")
  const number = await sellerOrderNumber(db, (data as CaseRow).creator_id, { checkoutId: (data as CaseRow).checkout_id, orderId: (data as CaseRow).order_id })
  return { ok: true, case: { ...adminCase(data as Joined), sellerNumber: number }, messages: thread.messages, store: await storeIdentity(db, (data as CaseRow).creator_id) }
}

/** Storelib's message (to both, or an internal note), and whose turn it is after: the buyer's unless it says the store's. */
export async function adminCaseReply(db: Db, id: string, input: { body: string; internal: boolean; to?: "buyer" | "store"; status?: CaseStatus | null }, origin: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) return failed("admin reply read", error, "The reply could not be sent.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  const row = data as CaseRow
  const { error: mErr } = await insertMessage(db, { case_id: id, author: "storelib", internal: input.internal, body: input.body })
  if (mErr) return failed("admin reply", mErr, "The reply could not be sent.")
  const now = new Date().toISOString()
  const status = input.status && CASE_STATUSES.includes(input.status) ? input.status : statusAfterMessage("storelib", row, { internal: input.internal, to: input.to })
  const patch: Record<string, unknown> = { status, updated_at: now, resolved_at: status === "resolved" ? now : null, resolved_by: status === "resolved" ? "storelib" : null }
  if (!input.internal) Object.assign(patch, { last_message_at: now, store_unread: true, buyer_unread: true })
  await db.from("order_cases").update(patch).eq("id", id)
  if (!input.internal) {
    const store = await storeFor(db, row)
    await Promise.all([emailBuyerReply(row, store, "storelib", input.body, origin, status), emailStoreNewMessage(row, store, input.body, false, "storelib")])
  }
  return { ok: true }
}

export async function adminCaseUpdate(db: Db, id: string, input: { status?: unknown }): Promise<{ ok: true } | Failure> {
  if (!CASE_STATUSES.includes(input.status as CaseStatus)) return { ok: false, error: "Nothing to change.", status: 400 }
  const now = new Date().toISOString()
  const resolved = input.status === "resolved"
  const { data, error } = await db.from("order_cases").update({ status: input.status, updated_at: now, resolved_at: resolved ? now : null, resolved_by: resolved ? "storelib" : null }).eq("id", id).select("id").maybeSingle()
  if (error) return failed("admin update", error, "That could not be saved.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

/* ─────────────────────────────── moving a case ─────────────────────────── */

async function addMessage(db: Db, row: CaseRow, author: "buyer" | "store", body: string, opts: { origin: string; photos?: CasePhotoRef[] }): Promise<{ ok: true; photosDropped: boolean } | Failure> {
  /* The same words from the same side inside ten minutes (a double press, a script): kept once. */
  if (!opts.photos?.length) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString()
    const { data: same } = await db.from("order_case_messages").select("id").eq("case_id", row.id).eq("author", author).eq("body", body).gte("created_at", since).limit(1)
    if (Array.isArray(same) && same.length) return { ok: true, photosDropped: false }
  }
  const { error, photosDropped } = await insertMessage(db, { case_id: row.id, author, body }, opts.photos ?? [])
  if (error) return failed("message", error, "Your message could not be sent.")
  const now = new Date().toISOString()
  const status = statusAfterMessage(author, row.status === "resolved" ? { ...row, status: "store" } : row)
  await db.from("order_cases").update({ status, resolved_at: null, resolved_by: null, last_message_at: now, updated_at: now, ...(author === "buyer" ? { store_unread: true } : { buyer_unread: true }) }).eq("id", row.id)
  const store = await storeFor(db, row)
  const photoCount = photosDropped ? 0 : (opts.photos?.length ?? 0)
  if (author === "buyer") await emailStoreNewMessage(row, store, body, false, "buyer", photoCount)
  else await emailBuyerReply(row, store, "store", body, opts.origin, status)
  if (row.escalated) await emailStorelib(row, store, author, body)
  return { ok: true, photosDropped }
}

async function act(db: Db, row: CaseRow, who: "buyer" | "store", action: { kind: "reply"; body: string } | { kind: "escalate"; body: string | null } | { kind: "resolve" }, origin: string): Promise<{ ok: true } | Failure> {
  const now = new Date().toISOString()
  if (action.kind === "reply") {
    const r = await addMessage(db, row, who, action.body, { origin })
    if (r.ok === false) return r
    return { ok: true }
  }
  if (action.kind === "resolve") {
    const { error } = await db.from("order_cases").update({ status: "resolved", resolved_at: now, resolved_by: who, updated_at: now }).eq("id", row.id)
    if (error) return failed("resolve", error, "That could not be saved.")
    return { ok: true }
  }
  /* Asking Storelib in: once. A note with it is a message like any other. */
  if (row.escalated) return { ok: true }
  if (action.body) {
    const { error: mErr } = await insertMessage(db, { case_id: row.id, author: who, body: action.body })
    if (mErr) return failed("escalate note", mErr, "That could not be sent.")
  }
  const { error } = await db.from("order_cases").update({ escalated: true, escalated_by: who, escalated_at: now, status: "storelib", resolved_at: null, resolved_by: null, last_message_at: now, updated_at: now, ...(who === "buyer" ? { store_unread: true } : { buyer_unread: true }) }).eq("id", row.id)
  if (error) return failed("escalate", error, "That could not be sent.")
  const store = await storeFor(db, row)
  const said = action.body ?? "(no message with it)"
  await Promise.all([emailStorelib({ ...row, escalated: true, escalated_by: who }, store, who, said, true), who === "buyer" ? emailStoreNewMessage(row, store, `The buyer asked Storelib to step in.${action.body ? `\n\n${action.body}` : ""}`, false, "buyer", 0, "The buyer asked Storelib to help with") : emailBuyerReply(row, store, "store", `${store?.name ?? "The store"} asked Storelib to help with this case. Storelib will write to you both here.${action.body ? `\n\n${action.body}` : ""}`, origin, "storelib")])
  return { ok: true }
}

/* ─────────────────────────────── emails ────────────────────────────────── */

/**
 * The store, for an email, with the order's number as the Orders page gives
 * it (#1003, lib/orders/order-number-server.ts): what every email the store
 * or Storelib reads names the order by, the buyer's reference beside it.
 * The buyer's emails keep the buyer's reference alone.
 */
type StoreCtx = StoreIdentity & { sellerNumber?: string | null }
async function storeFor(db: Db, row: CaseRow): Promise<StoreCtx | null> {
  const [store, number] = await Promise.all([storeIdentity(db, row.creator_id).catch(() => null), sellerOrderNumber(db, row.creator_id, { checkoutId: row.checkout_id, orderId: row.order_id }).catch(() => null)])
  return store ? { ...store, sellerNumber: number } : null
}
/** "order #1003" (and the buyer's reference in the facts), or the buyer's reference when the number can't be counted. */
const sellerOrderName = (row: CaseRow, store: StoreCtx | null) => `order ${store?.sellerNumber ?? `#${row.order_ref ?? ""}`}`
const buyerRefFact = (row: CaseRow, store: StoreCtx | null) => (store?.sellerNumber && row.order_ref ? ` · Buyer's reference ${escapeHtml(row.order_ref)}` : "")

const paragraphs = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((p) => `<p class="e-text" style="margin:0 0 16px;font-size:16px;line-height:26px;color:#374151">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")

/** A short email: the shared layout (lib/emails/layout.ts), as the store when there is one, else as Storelib. */
function shell(store: StoreIdentity | null, heading: string, inner: string, button?: { href: string; label: string }, footer?: string): { html: string; text: string } {
  const sender: EmailSender = store ? { kind: "store", name: store.name, pictureUrl: store.logoUrl, picture: "mark", url: store.websiteUrl } : { kind: "storelib" }
  const k = emailKit(sender)
  const html = emailDocument({
    sender,
    subject: heading,
    preview: plainOf(inner).replace(/\s+/g, " ").trim().slice(0, 140),
    rows: [k.heading(heading), k.raw(inner, 8), button ? k.button(button.label, button.href) : ""],
    footer: { lines: footer ? [footer] : [] },
  })
  const text = emailText([heading, plainOf(inner.replace(/<\/p>/g, "</p>\n\n")).trim(), button ? `${button.label}:\n${button.href}` : null], footer ? [plainOf(footer)] : [])
  return { html, text }
}

const reachStore = (store: StoreIdentity | null) =>
  store ? [escapeHtml(store.name), store.email ? escapeHtml(store.email) : null, store.phone ? escapeHtml(store.phone) : null].filter(Boolean).join(" · ") : ""

async function emailBuyerOpened(row: CaseRow, store: StoreIdentity | null, link: string): Promise<void> {
  try {
    const name = store?.name ?? "the store"
    const inner = `<p class="e-text" style="margin:0 0 16px;font-size:16px;line-height:26px;color:#374151">We sent your message about order #${escapeHtml(row.order_ref ?? "")} to ${escapeHtml(name)}. Their reply comes to this address, and you can follow the case and write back with the button below.</p><p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(CASE_REASON_LABELS[row.reason])}</p><p class="e-muted" style="margin:0 0 12px;font-size:14px;line-height:21px;color:#6b7280">If it isn't sorted out, you can ask Storelib to step in from the same page.</p>`
    await sendMailgunOnce({ to: row.buyer_email, subject: `We sent your message to ${name}`, ...shell(store, "Your message is with the store", inner, { href: link, label: "See your case" }, reachStore(store)), ...(store?.email ? { replyTo: store.email } : {}), tags: ["order-case", "order-case-opened"] })
  } catch (e) {
    console.error(`[cases] buyer email not sent: ${loggable(e)}`)
  }
}

async function emailBuyerReply(row: CaseRow, store: StoreIdentity | null, from: "store" | "storelib", body: string, origin: string, status: CaseStatus): Promise<void> {
  try {
    const who = from === "storelib" ? "Storelib" : store?.name ?? "The store"
    const intro = `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(who)} wrote about order #${escapeHtml(row.order_ref ?? "")}.</p>`
    const link = caseLink(origin, row.id, orderCaseSecret(row.id))
    await sendMailgunOnce({ to: row.buyer_email, subject: `${who} replied about order #${row.order_ref ?? ""}`, ...shell(store, `${who} replied`, intro + paragraphs(body), { href: link, label: status === "resolved" ? "See your case" : "Reply" }, reachStore(store)), ...(from === "store" && store?.email ? { replyTo: store.email } : {}), tags: ["order-case", "order-case-reply"] })
  } catch (e) {
    console.error(`[cases] buyer reply email not sent: ${loggable(e)}`)
  }
}

async function emailStoreNewMessage(row: CaseRow, store: StoreCtx | null, body: string, first: boolean, from: "buyer" | "storelib" = "buyer", photos = 0, asked?: string): Promise<void> {
  try {
    const to = store?.email
    if (!to) return
    const name = sellerOrderName(row, store)
    /* Its own subject when the buyer asks Storelib in, so it never reads as a second copy of their last message. */
    const subject = asked ? `${asked} ${name}` : first ? `A buyer needs help with ${name}` : from === "storelib" ? `Storelib wrote about ${name}` : `The buyer replied about ${name}`
    const facts = `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(CASE_REASON_LABELS[row.reason])} · ${escapeHtml(row.buyer_name || row.buyer_email)}${buyerRefFact(row, store)}</p>`
    const withPhotos = photos > 0 ? `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${photos === 1 ? "1 photo" : `${photos} photos`} with this message. Open the case to see ${photos === 1 ? "it" : "them"}.</p>` : ""
    await sendMailgunOnce({ to, subject, ...shell(null, subject, facts + paragraphs(body) + withPhotos, { href: appUrl(`/app/support?case=${row.id}`), label: first ? "Answer the buyer" : "Open the case" }, "Answer from the case within three days. A reply to this email reaches the buyer but is not kept on the case, and a problem with what the buyer received or a refund left unanswered for three days can be taken to Storelib."), replyTo: from === "buyer" ? row.buyer_email : undefined, tags: ["order-case", "order-case-store"] })
  } catch (e) {
    console.error(`[cases] store email not sent: ${loggable(e)}`)
  }
}

async function emailStorelib(row: CaseRow, store: StoreCtx | null, from: "buyer" | "store", body: string, justEscalated = false): Promise<void> {
  try {
    const to = process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL
    const subject = justEscalated ? `[Case] ${from === "buyer" ? "A buyer" : store?.name ?? "A store"} asked Storelib to step in: ${sellerOrderName(row, store)}` : `[Case] New message on ${sellerOrderName(row, store)}`
    const facts = `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(store?.name ?? "")} · ${escapeHtml(CASE_REASON_LABELS[row.reason])} · ${escapeHtml(row.buyer_email)}${buyerRefFact(row, store)}</p>`
    await sendMailgunOnce({ to, subject, ...shell(null, subject, facts + paragraphs(body), { href: appUrl(`/admin/resolution?case=${row.id}`), label: "Open in Resolution center" }), tags: ["order-case", "order-case-storelib"] })
  } catch (e) {
    console.error(`[cases] inbox email not sent: ${loggable(e)}`)
  }
}
