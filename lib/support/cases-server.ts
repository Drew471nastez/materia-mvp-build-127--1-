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
import { appUrl } from "@/lib/notify/urls"
import { escapeHtml } from "@/lib/notify/templates/escape"
import { SUPPORT_EMAIL } from "@/lib/help/articles"
import { orderNumberOf } from "@/lib/receipts/rules"
import { storeIdentity, type StoreIdentity } from "@/lib/store/identity-server"
import { CASE_REASON_LABELS, CASE_STATUSES, caseLink, statusAfterMessage, type CaseAuthor, type CaseMessage, type CaseReason, type CaseStatus, type CaseSummary } from "@/lib/support/cases"

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
type MessageRow = { id: number; case_id: string; author: CaseAuthor; internal: boolean; body: string; created_at: string }

const COLUMNS = "id, creator_id, checkout_id, order_id, order_ref, buyer_email, buyer_name, reason, status, escalated, escalated_by, escalated_at, access_hash, store_unread, buyer_unread, created_at, last_message_at, resolved_at"
const MESSAGE_COLUMNS = "id, case_id, author, internal, body, created_at"

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex")

function summary(r: CaseRow, unread: boolean): CaseSummary {
  return { id: r.id, reason: r.reason, status: r.status, escalated: r.escalated, escalatedBy: r.escalated_by, orderRef: r.order_ref, kind: r.checkout_id ? "physical" : "digital", buyerEmail: r.buyer_email, buyerName: r.buyer_name, createdAt: r.created_at, lastMessageAt: r.last_message_at, unread }
}
const message = (r: MessageRow): CaseMessage => ({ id: r.id, author: r.author, internal: r.internal, body: r.body, createdAt: r.created_at })

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
export async function openCase(db: Db, order: FoundOrder, input: { reason: CaseReason; message: string }, origin: string): Promise<{ ok: true; id: string; link: string; existing: boolean } | Failure> {
  const col = order.checkoutId ? "checkout_id" : "order_id"
  const ref = order.checkoutId ?? order.orderId
  const { data: open, error: oErr } = await db.from("order_cases").select(COLUMNS).eq(col, ref).neq("status", "resolved").order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (oErr) return failed("open lookup", oErr, "Your message could not be sent. Try again in a moment.")
  if (open) {
    /* The same order's open case: this message joins it. */
    const r = await addMessage(db, open as CaseRow, "buyer", input.message, { origin })
    if (!r.ok) return r
    return { ok: true, id: open.id, link: caseLink(origin, open.id, orderCaseSecret(open.id)), existing: true }
  }
  /* The id is made here so the link's secret can be derived from it before the row is written. */
  const id = crypto.randomUUID()
  const secret = orderCaseSecret(id)
  const { data: c, error } = await db
    .from("order_cases")
    .insert({ id, creator_id: order.creatorId, checkout_id: order.checkoutId, order_id: order.orderId, order_ref: order.orderRef, buyer_email: order.buyerEmail, buyer_name: order.buyerName, reason: input.reason, status: "store", access_hash: hash(secret), store_unread: true })
    .select(COLUMNS)
    .single()
  if (error || !c) return failed("open", error, "Your message could not be sent. Try again in a moment.")
  const { error: mErr } = await db.from("order_case_messages").insert({ case_id: c.id, author: "buyer", body: input.message })
  if (mErr) {
    await db.from("order_cases").delete().eq("id", c.id)
    return failed("first message", mErr, "Your message could not be sent. Try again in a moment.")
  }
  const link = caseLink(origin, c.id, secret)
  const store = await storeIdentity(db, order.creatorId).catch(() => null)
  await Promise.all([emailStoreNewMessage(c as CaseRow, store, input.message, true), emailBuyerOpened(c as CaseRow, store, link)])
  return { ok: true, id: c.id, link, existing: false }
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

export async function getCaseForBuyer(db: Db, id: string, secret: string): Promise<{ ok: true; case: CaseSummary; messages: CaseMessage[]; store: StoreIdentity } | Failure> {
  const found = await caseForBuyer(db, id, secret)
  if (!found.ok) return found
  const { data: msgs, error } = await db.from("order_case_messages").select(MESSAGE_COLUMNS).eq("case_id", id).eq("internal", false).order("id", { ascending: true }).limit(500)
  if (error) return failed("buyer thread", error, "This case could not be read.")
  if (found.row.buyer_unread) await db.from("order_cases").update({ buyer_unread: false }).eq("id", id)
  return { ok: true, case: summary(found.row, false), messages: ((msgs ?? []) as MessageRow[]).map(message), store: await storeIdentity(db, found.row.creator_id) }
}

export async function buyerAct(db: Db, id: string, secret: string, action: { kind: "reply"; body: string } | { kind: "escalate"; body: string | null } | { kind: "resolve" }, origin: string): Promise<{ ok: true } | Failure> {
  const found = await caseForBuyer(db, id, secret)
  if (!found.ok) return found
  return act(db, found.row, "buyer", action, origin)
}

/* ─────────────────────────────── the store ─────────────────────────────── */

export async function listCasesForStore(db: Db, creatorId: string): Promise<{ ok: true; cases: CaseSummary[] } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("creator_id", creatorId).order("last_message_at", { ascending: false }).limit(200)
  if (error) return failed("store list", error, "Buyer cases could not be read. Try again in a moment.")
  return { ok: true, cases: ((data ?? []) as CaseRow[]).map((r) => summary(r, r.store_unread)) }
}

export async function getCaseForStore(db: Db, creatorId: string, id: string): Promise<{ ok: true; case: CaseSummary; messages: CaseMessage[] } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (error) return failed("store read", error, "That case could not be read.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  const { data: msgs, error: mErr } = await db.from("order_case_messages").select(MESSAGE_COLUMNS).eq("case_id", id).eq("internal", false).order("id", { ascending: true }).limit(500)
  if (mErr) return failed("store thread", mErr, "That case could not be read.")
  if ((data as CaseRow).store_unread) await db.from("order_cases").update({ store_unread: false }).eq("id", id).eq("creator_id", creatorId)
  return { ok: true, case: summary(data as CaseRow, false), messages: ((msgs ?? []) as MessageRow[]).map(message) }
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
  const { data: msgs, error: mErr } = await db.from("order_case_messages").select(MESSAGE_COLUMNS).eq("case_id", id).order("id", { ascending: true }).limit(500)
  if (mErr) return failed("admin thread", mErr, "That case could not be read.")
  return { ok: true, case: adminCase(data as Joined), messages: ((msgs ?? []) as MessageRow[]).map(message), store: await storeIdentity(db, (data as CaseRow).creator_id) }
}

/** Storelib's message (to both, or an internal note), and whose turn it is after: the buyer's unless it says the store's. */
export async function adminCaseReply(db: Db, id: string, input: { body: string; internal: boolean; to?: "buyer" | "store"; status?: CaseStatus | null }, origin: string): Promise<{ ok: true } | Failure> {
  const { data, error } = await db.from("order_cases").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) return failed("admin reply read", error, "The reply could not be sent.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  const row = data as CaseRow
  const { error: mErr } = await db.from("order_case_messages").insert({ case_id: id, author: "storelib", internal: input.internal, body: input.body })
  if (mErr) return failed("admin reply", mErr, "The reply could not be sent.")
  const now = new Date().toISOString()
  const status = input.status && CASE_STATUSES.includes(input.status) ? input.status : statusAfterMessage("storelib", row, { internal: input.internal, to: input.to })
  const patch: Record<string, unknown> = { status, updated_at: now, resolved_at: status === "resolved" ? now : null, resolved_by: status === "resolved" ? "storelib" : null }
  if (!input.internal) Object.assign(patch, { last_message_at: now, store_unread: true, buyer_unread: true })
  await db.from("order_cases").update(patch).eq("id", id)
  if (!input.internal) {
    const store = await storeIdentity(db, row.creator_id).catch(() => null)
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

async function addMessage(db: Db, row: CaseRow, author: "buyer" | "store", body: string, opts: { origin: string }): Promise<{ ok: true } | Failure> {
  const { error } = await db.from("order_case_messages").insert({ case_id: row.id, author, body })
  if (error) return failed("message", error, "Your message could not be sent.")
  const now = new Date().toISOString()
  const status = statusAfterMessage(author, row.status === "resolved" ? { ...row, status: "store" } : row)
  await db.from("order_cases").update({ status, resolved_at: null, resolved_by: null, last_message_at: now, updated_at: now, ...(author === "buyer" ? { store_unread: true } : { buyer_unread: true }) }).eq("id", row.id)
  const store = await storeIdentity(db, row.creator_id).catch(() => null)
  if (author === "buyer") await emailStoreNewMessage(row, store, body, false)
  else await emailBuyerReply(row, store, "store", body, opts.origin, status)
  if (row.escalated) await emailStorelib(row, store, author, body)
  return { ok: true }
}

async function act(db: Db, row: CaseRow, who: "buyer" | "store", action: { kind: "reply"; body: string } | { kind: "escalate"; body: string | null } | { kind: "resolve" }, origin: string): Promise<{ ok: true } | Failure> {
  const now = new Date().toISOString()
  if (action.kind === "reply") return addMessage(db, row, who, action.body, { origin })
  if (action.kind === "resolve") {
    const { error } = await db.from("order_cases").update({ status: "resolved", resolved_at: now, resolved_by: who, updated_at: now }).eq("id", row.id)
    if (error) return failed("resolve", error, "That could not be saved.")
    return { ok: true }
  }
  /* Asking Storelib in: once. A note with it is a message like any other. */
  if (row.escalated) return { ok: true }
  if (action.body) {
    const { error: mErr } = await db.from("order_case_messages").insert({ case_id: row.id, author: who, body: action.body })
    if (mErr) return failed("escalate note", mErr, "That could not be sent.")
  }
  const { error } = await db.from("order_cases").update({ escalated: true, escalated_by: who, escalated_at: now, status: "storelib", resolved_at: null, resolved_by: null, last_message_at: now, updated_at: now, ...(who === "buyer" ? { store_unread: true } : { buyer_unread: true }) }).eq("id", row.id)
  if (error) return failed("escalate", error, "That could not be sent.")
  const store = await storeIdentity(db, row.creator_id).catch(() => null)
  const said = action.body ?? "(no message with it)"
  await Promise.all([emailStorelib({ ...row, escalated: true, escalated_by: who }, store, who, said, true), who === "buyer" ? emailStoreNewMessage(row, store, `The buyer asked Storelib to step in.${action.body ? `\n\n${action.body}` : ""}`, false) : emailBuyerReply(row, store, "store", `${store?.name ?? "The store"} asked Storelib to help with this case. Storelib will write to you both here.${action.body ? `\n\n${action.body}` : ""}`, origin, "storelib")])
  return { ok: true }
}

/* ─────────────────────────────── emails ────────────────────────────────── */

const paragraphs = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#1a1a2e">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")

/** A short email in the store's name: its logo, the words, one button, and how to reach the store. */
function shell(store: StoreIdentity | null, heading: string, inner: string, button?: { href: string; label: string }, footer?: string): string {
  const logo = store?.logoUrl ? `<img src="${escapeHtml(store.logoUrl)}" alt="${escapeHtml(store.name)}" height="40" style="display:block;max-height:40px;max-width:180px;margin:0 0 20px;border-radius:8px">` : store ? `<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1a1a2e">${escapeHtml(store.name)}</p>` : ""
  return `<!doctype html><html><body style="margin:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:28px 24px">${logo}<h1 style="margin:0 0 16px;font-size:19px;line-height:26px;color:#1a1a2e">${escapeHtml(heading)}</h1>${inner}${button ? `<a href="${escapeHtml(button.href)}" style="display:inline-block;margin-top:8px;background:#1a1a2e;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(button.label)}</a>` : ""}</div>${footer ? `<p style="margin:16px 4px 0;font-size:12px;line-height:18px;color:#9ca3af">${footer}</p>` : ""}</div></body></html>`
}

const reachStore = (store: StoreIdentity | null) =>
  store ? [escapeHtml(store.name), store.email ? escapeHtml(store.email) : null, store.phone ? escapeHtml(store.phone) : null].filter(Boolean).join(" · ") : ""

async function emailBuyerOpened(row: CaseRow, store: StoreIdentity | null, link: string): Promise<void> {
  try {
    const name = store?.name ?? "the store"
    const inner = `<p style="margin:0 0 12px;font-size:15px;line-height:22px;color:#1a1a2e">We sent your message about order #${escapeHtml(row.order_ref ?? "")} to ${escapeHtml(name)}. Their reply comes to this address, and you can follow the case and write back with the button below.</p><p style="margin:0 0 12px;font-size:13px;color:#6b7280">${escapeHtml(CASE_REASON_LABELS[row.reason])}</p><p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4b5563">If it isn't sorted out, you can ask Storelib to step in from the same page.</p>`
    await sendMailgunOnce({ to: row.buyer_email, subject: `We sent your message to ${name}`, html: shell(store, "Your message is with the store", inner, { href: link, label: "See your case" }, reachStore(store)), ...(store?.email ? { replyTo: store.email } : {}), tags: ["order-case", "order-case-opened"] })
  } catch (e) {
    console.error(`[cases] buyer email not sent: ${loggable(e)}`)
  }
}

async function emailBuyerReply(row: CaseRow, store: StoreIdentity | null, from: "store" | "storelib", body: string, origin: string, status: CaseStatus): Promise<void> {
  try {
    const who = from === "storelib" ? "Storelib" : store?.name ?? "The store"
    const intro = `<p style="margin:0 0 12px;font-size:13px;color:#6b7280">${escapeHtml(who)} wrote about order #${escapeHtml(row.order_ref ?? "")}.</p>`
    const link = caseLink(origin, row.id, orderCaseSecret(row.id))
    await sendMailgunOnce({ to: row.buyer_email, subject: `${who} replied about order #${row.order_ref ?? ""}`, html: shell(store, `${who} replied`, intro + paragraphs(body), { href: link, label: status === "resolved" ? "See your case" : "Reply" }, reachStore(store)), ...(from === "store" && store?.email ? { replyTo: store.email } : {}), tags: ["order-case", "order-case-reply"] })
  } catch (e) {
    console.error(`[cases] buyer reply email not sent: ${loggable(e)}`)
  }
}

async function emailStoreNewMessage(row: CaseRow, store: StoreIdentity | null, body: string, first: boolean, from: "buyer" | "storelib" = "buyer"): Promise<void> {
  try {
    const to = store?.email
    if (!to) return
    const subject = first ? `A buyer needs help with order #${row.order_ref ?? ""}` : from === "storelib" ? `Storelib wrote about order #${row.order_ref ?? ""}` : `The buyer replied about order #${row.order_ref ?? ""}`
    const facts = `<p style="margin:0 0 12px;font-size:13px;color:#6b7280">${escapeHtml(CASE_REASON_LABELS[row.reason])} · ${escapeHtml(row.buyer_name || row.buyer_email)}</p>`
    await sendMailgunOnce({ to, subject, html: shell(null, subject, facts + paragraphs(body), { href: appUrl(`/app/support?case=${row.id}`), label: first ? "Answer the buyer" : "Open the case" }, "Answer within two days where you can. If the buyer asks Storelib to step in, Storelib reads the whole case."), replyTo: from === "buyer" ? row.buyer_email : undefined, tags: ["order-case", "order-case-store"] })
  } catch (e) {
    console.error(`[cases] store email not sent: ${loggable(e)}`)
  }
}

async function emailStorelib(row: CaseRow, store: StoreIdentity | null, from: "buyer" | "store", body: string, justEscalated = false): Promise<void> {
  try {
    const to = process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL
    const subject = justEscalated ? `[Case] ${from === "buyer" ? "A buyer" : store?.name ?? "A store"} asked Storelib to step in: order #${row.order_ref ?? ""}` : `[Case] New message on order #${row.order_ref ?? ""}`
    const facts = `<p style="margin:0 0 12px;font-size:13px;color:#6b7280">${escapeHtml(store?.name ?? "")} · ${escapeHtml(CASE_REASON_LABELS[row.reason])} · ${escapeHtml(row.buyer_email)}</p>`
    await sendMailgunOnce({ to, subject, html: shell(null, subject, facts + paragraphs(body), { href: appUrl(`/admin/resolution?case=${row.id}`), label: "Open in Resolution center" }), tags: ["order-case", "order-case-storelib"] })
  } catch (e) {
    console.error(`[cases] inbox email not sent: ${loggable(e)}`)
  }
}
