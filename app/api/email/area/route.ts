import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireTeamPermission, type TeamGate } from "@/lib/team/server"
import { REPLY_PAGE, threadRows } from "@/lib/site-contact/reply"
import { displayEmail, ownerAddress } from "@/lib/businesses/email-alias"
import { verifiedSender } from "@/lib/emails/sending-domain-server"
import { storeReplyTo } from "@/lib/emails/reply-to-server"
import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { storelibFromAddress } from "@/lib/mailgun"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  /app/emails, READ AND CHANGED ON THE SERVER (round 40)
 * ===========================================================================
 * The Emails page read its subscribers, its contact form messages, its
 * automations and a contact's history straight from the browser, under row
 * level security, which answers only for the store's owner. A team member
 * given Marketing (lib/team) works in somebody else's store, so the page
 * asks here instead, for everyone: the owner on their own client as before,
 * a member through the service role, and every query names the store's id,
 * found by the server from the session (requireTeamPermission), never from
 * the request.
 *
 *   GET  ?part=subscribers        { rows, buyers }
 *   GET  ?part=messages           { available, rows }
 *   GET  ?part=flows              FlowRow[] with each one's totals
 *   GET  ?part=contact&email=     { runs, messages, customer }: one contact's last twenty runs and
 *                                 messages, and what they bought here (ContactCustomer)
 *   GET  ?part=sender             who the composer draws as sending, for this store, and the
 *                                 address it leaves from (fromAddress, ownDomain)
 *   POST { action: "unsubscribe", id }       a subscriber taken off the list
 *   POST { action: "delete_campaign", id }   an email that has not been sent, deleted
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The owner's own client (row level security as before), or the service role for a member, filtered by the store below. */
async function clientFor(gate: TeamGate): Promise<Db> {
  return gate.isOwner ? await createClient() : gate.db
}

/* source_detail says which message a reply answers (lib/site-contact/reply.ts); threadRows takes it off again. */
const MESSAGE_COLUMNS = "id, email, name, subject, message, site, page, consent, subscriber_id, source_detail, created_at"

async function subscribers(db: Db, creatorId: string) {
  /* The products are asked for alongside the list, not after it: one round trip fewer on every read, a pull to refresh's included. `.then` sends it now; a query is not sent until something waits on it. */
  const productsRead = db.from("products").select("id").eq("creator_id", creatorId).then((r: { data: { id: string }[] | null }) => r)
  const { data, error } = await db
    .from("subscribers")
    .select("id, email, name, source, source_detail, consent_text, status, subscribed_at, unsubscribed_at")
    .eq("creator_id", creatorId)
    .order("subscribed_at", { ascending: false })
  let rows = data as Array<{ email: string }> | null
  if (error) {
    /* Before the contact-source columns existed. */
    const basic = await db.from("subscribers").select("id, email, name, source, status, subscribed_at, unsubscribed_at").eq("creator_id", creatorId).order("subscribed_at", { ascending: false })
    if (basic.error) return json({ error: "Could not load your subscribers." }, 500)
    rows = basic.data
  }
  const list = rows ?? []
  let buyers = 0
  const { data: products } = await productsRead
  if (products && products.length > 0) {
    const { data: orders } = await db
      .from("orders")
      .select("buyer_email")
      .in("product_id", (products as { id: string }[]).map((p) => p.id))
      .eq("status", "completed")
    const onList = new Set(list.map((s) => s.email.toLowerCase()))
    buyers = new Set(((orders ?? []) as { buyer_email?: string | null }[]).map((o) => o.buyer_email?.toLowerCase()).filter((e): e is string => !!e && !onList.has(e))).size
  }
  return json({ rows: list, buyers })
}

async function messages(db: Db, creatorId: string) {
  const read = (columns: string) => db.from("site_contact_messages").select(columns).eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(500)
  let { data, error } = await read(`${MESSAGE_COLUMNS}, read_at`)
  if (error && /read_at|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
    ;({ data, error } = await read(MESSAGE_COLUMNS))
    if (!error) return json({ available: true, rows: threadRows(((data ?? []) as Array<{ id: string; message: string; created_at: string }>).map((m) => ({ ...m, read_at: m.created_at }))) })
  }
  if (error) {
    /* Before the contact form's own part has run there is no table: nothing to show, said plainly. */
    if (/42P01|PGRST205|does not exist/i.test(`${error.code} ${error.message}`)) return json({ available: false, rows: [] })
    return json({ error: "Could not load your messages." }, 500)
  }
  /* The replies sent from here hang under the message they answer, never in the list as messages of their own. */
  return json({ available: true, rows: threadRows((data ?? []) as Array<{ id: string; message: string; created_at: string }>) })
}

type Totals = { sent: number; opened: number; clicked: number; failed: number; in_progress: number }

/** What each automation has sent, counted for this store's own automations only. */
async function totalsFor(db: Db, gate: TeamGate, ids: string[]): Promise<Map<string, Totals>> {
  const out = new Map<string, Totals>()
  if (ids.length === 0) return out
  if (gate.isOwner) {
    /* The engine's own function, as the page asked it before (row level security keeps it to this owner's automations). */
    const { data } = await db.rpc("email_flow_totals").then((r: { data: unknown }) => r, () => ({ data: null }))
    for (const t of Array.isArray(data) ? (data as Array<Totals & { flow_id: string }>) : []) out.set(t.flow_id, t)
    return out
  }
  /* A member: counted here, by the store's id, never across every store the function could see through the service role. */
  const count = async (table: string, flowId: string, more: (q: Db) => Db) => {
    const { count: n } = await more(db.from(table).select("id", { count: "exact", head: true }).eq("creator_id", gate.creatorId).eq("flow_id", flowId)).then((r: { count: number | null }) => r, () => ({ count: 0 }))
    return n ?? 0
  }
  await Promise.all(
    ids.slice(0, 50).map(async (id) => {
      const [sent, opened, clicked, failed, active] = await Promise.all([
        count("email_flow_sends", id, (q) => q.eq("status", "sent")),
        count("email_flow_sends", id, (q) => q.not("opened_at", "is", null)),
        count("email_flow_sends", id, (q) => q.not("clicked_at", "is", null)),
        count("email_flow_jobs", id, (q) => q.eq("state", "failed")),
        count("email_flow_runs", id, (q) => q.eq("status", "active")),
      ])
      out.set(id, { sent, opened, clicked, failed, in_progress: active })
    }),
  )
  return out
}

async function flows(db: Db, gate: TeamGate) {
  const { data, error } = await db
    .from("email_flows")
    .select("id, name, trigger_type, trigger_config, status, steps, updated_at")
    .eq("creator_id", gate.creatorId)
    .order("created_at", { ascending: false })
  if (error) return json({ error: "Could not load your automations." }, 500)
  const rows = (data ?? []) as Array<{ id: string }>
  const totals = await totalsFor(db, gate, rows.map((f) => f.id))
  return json(rows.map((f) => ({ ...f, totals: totals.get(f.id) ?? null })))
}

/** One contact as a customer of this store: orders, spend by currency, the last order, where they are, their tags. Every read fails open. */
interface ContactCustomer {
  /** Paid orders (completed, refunded or partly refunded). */
  orders: number
  /** What they paid less what went back, per currency, largest first. */
  spent: Array<{ currency: string; cents: number }>
  lastOrderAt: string | null
  location: { city: string | null; region: string | null; country: string | null } | null
  tags: string[]
}

const likeExact = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`)
const PAID = new Set(["completed", "refunded", "partially_refunded"])

async function customerOf(db: Db, creatorId: string, key: string): Promise<ContactCustomer> {
  const safe = <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> =>
    Promise.resolve(p).then((r) => (r.error ? null : r.data), () => null)
  const [products, shipped, tagged] = await Promise.all([
    safe<{ id: string }[]>(db.from("products").select("id").eq("creator_id", creatorId)),
    /* Where an order that ships went: the latest address on file (commerce_checkouts). */
    safe<{ shipping_address: Record<string, unknown> | null }[]>(
      db.from("commerce_checkouts").select("shipping_address, created_at").eq("creator_id", creatorId).ilike("buyer_email", likeExact(key)).not("shipping_address", "is", null).order("created_at", { ascending: false }).limit(1),
    ),
    safe<{ tags: string[] | null }[]>(db.from("subscribers").select("tags").eq("creator_id", creatorId).ilike("email", likeExact(key)).limit(1)),
  ])
  const ids = (products ?? []).map((p) => p.id)
  const orders = ids.length
    ? ((await safe<Array<{ created_at: string; status: string | null; amount_cents: number | null; refund_amount_cents: number | null; currency: string | null; tax_country: string | null }>>(
        db.from("orders").select("created_at, status, amount_cents, refund_amount_cents, currency, tax_country").in("product_id", ids).ilike("buyer_email", likeExact(key)).order("created_at", { ascending: false }).limit(500),
      )) ?? [])
    : []
  const paid = orders.filter((o) => PAID.has(String(o.status)))
  const by = new Map<string, number>()
  for (const o of paid) {
    const amount = Math.max(0, Number(o.amount_cents) || 0)
    const back = Number(o.refund_amount_cents) > 0 ? Math.min(Number(o.refund_amount_cents), amount) : o.status === "refunded" ? amount : 0
    const cur = (o.currency || "USD").toUpperCase()
    by.set(cur, (by.get(cur) ?? 0) + amount - back)
  }
  const a = shipped?.[0]?.shipping_address ?? null
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null)
  const country = text(a?.country) ?? text(a?.country_code) ?? text(paid[0]?.tax_country ?? orders[0]?.tax_country)
  const city = text(a?.city)
  const region = text(a?.state) ?? text(a?.region) ?? text(a?.province)
  return {
    orders: paid.length,
    spent: [...by.entries()].sort((x, y) => y[1] - x[1]).map(([currency, cents]) => ({ currency, cents })),
    lastOrderAt: paid[0]?.created_at ?? null,
    location: city || region || country ? { city, region, country } : null,
    tags: ((tagged?.[0]?.tags ?? []) as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "").slice(0, 20),
  }
}

async function contact(db: Db, creatorId: string, email: string) {
  const key = email.trim().toLowerCase()
  if (!key || key.length > 254) return json({ runs: [], messages: [], customer: null })
  const [runs, msgs, customer] = await Promise.all([
    db
      .from("email_flow_runs")
      .select("id, status, exit_reason, started_at, flow_id, email_flows(name)")
      .eq("creator_id", creatorId)
      .eq("email", key)
      .order("started_at", { ascending: false })
      .limit(20)
      .then((r: { data: unknown; error: unknown }) => (r.error ? [] : (r.data ?? [])), () => []),
    db
      .from("site_contact_messages")
      .select("id, subject, message, site, page, emailed_at, created_at")
      .eq("creator_id", creatorId)
      .eq("email", key)
      .order("created_at", { ascending: false })
      .limit(20)
      /* What they wrote, not the replies sent to them (lib/site-contact/reply.ts). */
      .then((r: { data: Array<{ page?: string | null }> | null; error: unknown }) => (r.error ? [] : (r.data ?? []).filter((m) => m.page !== REPLY_PAGE)), () => []),
    customerOf(db, creatorId, key).catch(() => null),
  ])
  return json({ runs, messages: msgs, customer })
}

/** The store's sender: its owner's name and photo, its support address for replies, and the signed in person's own address for a test. */
async function sender(gate: TeamGate) {
  const db = gate.db
  const [{ data: creator }, { data: profile }, own, reply] = await Promise.all([
    db.from("creators").select("id, support_email").eq("id", gate.creatorId).maybeSingle(),
    gate.ownerUserId ? db.from("profiles").select("display_name, username, avatar_url, email").eq("id", gate.ownerUserId).maybeSingle() : Promise.resolve({ data: null }),
    /* The address mail leaves from: the store's own once its domain is verified, else Storelib's (lib/mailgun.ts withStoreSender). */
    verifiedSender(db, gate.creatorId).catch(() => null),
    /* Where a reply goes: the same read every store email's Reply-To is (lib/emails/reply-to-server.ts), fresh, so a contact email just saved shows. */
    storeReplyTo(db, gate.creatorId, { fresh: true }).catch(() => null),
  ])
  const p = (profile ?? {}) as { display_name?: string | null; username?: string | null; avatar_url?: string | null; email?: string | null }
  const c = (creator ?? {}) as { id?: string; support_email?: string | null }
  return json({
    creatorId: c.id ?? gate.creatorId,
    name: (p.display_name || p.username || "").trim() || null,
    username: p.username ?? null,
    avatarUrl: p.avatar_url ?? null,
    email: displayEmail(gate.userEmail),
    replyTo: reply?.address ?? ((c.support_email || ownerAddress(gate.isOwner ? gate.userEmail : p.email) || "").trim().toLowerCase() || null),
    /* Which address that is: Store details' contact email, the support email, or the account's own (lib/emails/reply-to.ts). */
    replyVia: reply?.via ?? (c.support_email ? "support" : "account"),
    fromAddress: own?.address ?? storelibFromAddress(),
    ownDomain: !!own,
    storelibAddress: storelibFromAddress(),
  })
}

export async function GET(request: Request) {
  const gate = await requireTeamPermission("marketing", { read: true })
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const part = url.searchParams.get("part")
  const db = await clientFor(gate)
  switch (part) {
    case "subscribers":
      return subscribers(db, gate.creatorId)
    case "messages":
      return messages(db, gate.creatorId)
    case "flows":
      return flows(db, gate)
    case "contact":
      return contact(db, gate.creatorId, url.searchParams.get("email") ?? "")
    case "sender":
      return sender(gate)
    default:
      return json({ error: "Not found" }, 404)
  }
}

export async function POST(request: Request) {
  const gate = await requireTeamPermission("marketing")
  if (gate instanceof NextResponse) return gate
  const body = (await request.json().catch(() => null)) as { action?: unknown; id?: unknown } | null
  const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id : null
  if (!id) return json({ error: "Not found" }, 404)
  const db = await clientFor(gate)
  if (body?.action === "unsubscribe") {
    const { data, error } = await db.from("subscribers").update({ is_active: false, status: "unsubscribed" }).eq("id", id).eq("creator_id", gate.creatorId).select("id")
    if (error) return json({ error: "Not removed. Try again." }, 500)
    /* Unsubscribed on the store's connected email platforms too, within the minute (lib/contacts/checkout-contact.ts). */
    if (Array.isArray(data) && data.length) await syncPlatformsSoon(gate.db, gate.creatorId).catch(() => undefined)
    return Array.isArray(data) && data.length === 0 && !gate.isOwner ? json({ error: "Not found" }, 404) : json({ ok: true })
  }
  if (body?.action === "delete_campaign") {
    /* As the page deleted it before, now by the store's id as well as the email's. */
    const { data, error } = await db.from("email_campaigns").delete().eq("id", id).eq("creator_id", gate.creatorId).select("id")
    if (error) return json({ error: "The email was not deleted. Try again." }, 500)
    return Array.isArray(data) && data.length === 0 && !gate.isOwner ? json({ error: "Not found" }, 404) : json({ ok: true })
  }
  return json({ error: "Not found" }, 404)
}
