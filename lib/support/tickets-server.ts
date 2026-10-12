import "server-only"

/**
 * ===========================================================================
 *  SUPPORT REQUESTS: THE SERVER HALF
 * ===========================================================================
 * Reads and writes for support_tickets and support_ticket_messages (SQL part
 * 114), for both sides:
 *
 *   the store    its own requests only, found by id AND its creator id, and
 *                never Storelib's internal notes
 *   Storelib     every request, from /admin behind the admin cookie
 *
 * Every write is the server's (the tables give signed in people read access
 * at most). An email goes to Storelib's support inbox when a request opens
 * or the store replies, and to the store when Storelib replies; an internal
 * note goes to nobody. A failed email never fails the message.
 */
import { loggable } from "@/lib/admin/plain-reason"
import { sendMailgunOnce } from "@/lib/mailgun"
import { emailDocument, emailKit, emailText, plainOf } from "@/lib/emails/layout"
import { appUrl } from "@/lib/notify/urls"
import { escapeHtml } from "@/lib/notify/templates/escape"
import { SUPPORT_EMAIL } from "@/lib/help/articles"
import { MAX_OPEN, PRIORITIES, STATUSES, TOPIC_LABELS, statusAfter, type Priority, type TicketMessage, type TicketStatus, type TicketSummary, type Topic } from "@/lib/support/tickets"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type Failure = { ok: false; error: string; status: number }
const MISSING = new Set(["42P01", "PGRST205"])
const NOT_READY: Failure = { ok: false, error: "Support requests aren't switched on yet. Email support@storelib.com and we'll help from there.", status: 503 }

type TicketRow = { id: string; creator_id: string; opened_by: string | null; topic: Topic; subject: string; status: TicketStatus; priority: Priority; order_ref: string | null; dispute_id: string | null; creator_unread: boolean; created_at: string; updated_at: string; last_message_at: string; resolved_at: string | null }
type MessageRow = { id: number; ticket_id: string; author: "creator" | "storelib"; internal: boolean; body: string; created_at: string }

const TICKET_COLUMNS = "id, creator_id, opened_by, topic, subject, status, priority, order_ref, dispute_id, creator_unread, created_at, updated_at, last_message_at, resolved_at"

function summary(r: TicketRow): TicketSummary {
  return { id: r.id, topic: r.topic, subject: r.subject, status: r.status, priority: r.priority, orderRef: r.order_ref, createdAt: r.created_at, lastMessageAt: r.last_message_at, unread: r.creator_unread }
}
function message(r: MessageRow): TicketMessage {
  return { id: r.id, author: r.author, internal: r.internal, body: r.body, createdAt: r.created_at }
}
function failed(where: string, error: { code?: string } | null | undefined, said: string): Failure {
  if (error && MISSING.has(error.code ?? "")) return NOT_READY
  console.error(`[support] ${where}: ${loggable(error)}`)
  return { ok: false, error: said, status: 500 }
}

/* ─────────────────────────────── the store ─────────────────────────────── */

export async function listTickets(db: Db, creatorId: string): Promise<{ ok: true; tickets: TicketSummary[] } | Failure> {
  const { data, error } = await db.from("support_tickets").select(TICKET_COLUMNS).eq("creator_id", creatorId).order("last_message_at", { ascending: false }).limit(100)
  if (error) return failed("list", error, "Your requests could not be read. Try again in a moment.")
  return { ok: true, tickets: ((data ?? []) as TicketRow[]).map(summary) }
}

/** One of the store's own requests with its thread, minus Storelib's notes; reading it clears its unread mark. */
export async function getTicket(db: Db, creatorId: string, id: string): Promise<{ ok: true; ticket: TicketSummary; messages: TicketMessage[] } | Failure> {
  const { data: t, error } = await db.from("support_tickets").select(TICKET_COLUMNS).eq("id", id).eq("creator_id", creatorId).maybeSingle()
  if (error) return failed("get", error, "That request could not be read.")
  if (!t) return { ok: false, error: "Not found.", status: 404 }
  const { data: msgs, error: mErr } = await db.from("support_ticket_messages").select("id, ticket_id, author, internal, body, created_at").eq("ticket_id", id).eq("internal", false).order("id", { ascending: true }).limit(500)
  if (mErr) return failed("thread", mErr, "That request could not be read.")
  if ((t as TicketRow).creator_unread) await db.from("support_tickets").update({ creator_unread: false }).eq("id", id).eq("creator_id", creatorId)
  return { ok: true, ticket: { ...summary(t as TicketRow), unread: false }, messages: ((msgs ?? []) as MessageRow[]).map(message) }
}

export async function openTicket(db: Db, who: { creatorId: string; userId: string }, input: { topic: Topic; subject: string; message: string; orderRef: string | null }): Promise<{ ok: true; ticket: TicketSummary } | Failure> {
  const { count, error: cErr } = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("creator_id", who.creatorId).neq("status", "resolved")
  if (cErr) return failed("count", cErr, "Your request could not be sent. Try again in a moment.")
  if ((count ?? 0) >= MAX_OPEN) return { ok: false, error: `You have ${MAX_OPEN} requests open. Reply on one of those, or mark one resolved, before opening another.`, status: 429 }
  const { data: t, error } = await db.from("support_tickets").insert({ creator_id: who.creatorId, opened_by: who.userId, topic: input.topic, subject: input.subject, order_ref: input.orderRef, status: "open" }).select(TICKET_COLUMNS).single()
  if (error || !t) return failed("open", error, "Your request could not be sent. Try again in a moment.")
  const { error: mErr } = await db.from("support_ticket_messages").insert({ ticket_id: t.id, author: "creator", body: input.message })
  if (mErr) {
    await db.from("support_tickets").delete().eq("id", t.id)
    return failed("first message", mErr, "Your request could not be sent. Try again in a moment.")
  }
  await tellStorelib(db, "new", t as TicketRow, input.message)
  return { ok: true, ticket: summary(t as TicketRow) }
}

export async function replyAsStore(db: Db, who: { creatorId: string }, id: string, body: string): Promise<{ ok: true } | Failure> {
  const { data: t, error } = await db.from("support_tickets").select(TICKET_COLUMNS).eq("id", id).eq("creator_id", who.creatorId).maybeSingle()
  if (error) return failed("reply read", error, "Your reply could not be sent.")
  if (!t) return { ok: false, error: "Not found.", status: 404 }
  const { error: mErr } = await db.from("support_ticket_messages").insert({ ticket_id: id, author: "creator", body })
  if (mErr) return failed("reply", mErr, "Your reply could not be sent.")
  const now = new Date().toISOString()
  await db.from("support_tickets").update({ status: statusAfter("creator"), resolved_at: null, last_message_at: now, updated_at: now }).eq("id", id).eq("creator_id", who.creatorId)
  await tellStorelib(db, "reply", t as TicketRow, body)
  return { ok: true }
}

export async function resolveAsStore(db: Db, creatorId: string, id: string): Promise<{ ok: true } | Failure> {
  const now = new Date().toISOString()
  const { data, error } = await db.from("support_tickets").update({ status: "resolved", resolved_at: now, updated_at: now }).eq("id", id).eq("creator_id", creatorId).select("id").maybeSingle()
  if (error) return failed("resolve", error, "That could not be saved.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

/* ─────────────────────────────── Storelib ──────────────────────────────── */

export interface AdminTicket extends TicketSummary {
  creatorId: string
  store: { name: string | null; slug: string | null }
  disputeId: string | null
  resolvedAt: string | null
}

type Joined = TicketRow & { creator?: { display_name?: string | null; slug?: string | null } | null }
function adminTicket(r: Joined): AdminTicket {
  return { ...summary(r), creatorId: r.creator_id, store: { name: r.creator?.display_name ?? null, slug: r.creator?.slug ?? null }, disputeId: r.dispute_id, resolvedAt: r.resolved_at }
}

export async function adminList(db: Db, opts: { status?: string | null; q?: string | null }): Promise<{ ok: true; tickets: AdminTicket[]; counts: Record<TicketStatus, number> } | Failure> {
  let q = db.from("support_tickets").select(`${TICKET_COLUMNS}, creator:creators(display_name, slug)`)
  if (opts.status && STATUSES.includes(opts.status as TicketStatus)) q = q.eq("status", opts.status)
  const words = (opts.q ?? "").replace(/[%,()]/g, " ").trim().slice(0, 80)
  if (words) q = q.ilike("subject", `%${words}%`)
  const { data, error } = await q.order("last_message_at", { ascending: false }).limit(200)
  if (error) return failed("admin list", error, "Requests could not be read.")
  const counts = { open: 0, waiting: 0, resolved: 0 } as Record<TicketStatus, number>
  await Promise.all(
    STATUSES.map(async (s) => {
      const { count } = await db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", s)
      counts[s] = count ?? 0
    }),
  )
  const order: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
  const tickets = ((data ?? []) as Joined[]).map(adminTicket)
  /* Storelib's turn first, the most pressing at the top, oldest wait first among equals. */
  if (opts.status === "open") tickets.sort((a, b) => order[a.priority] - order[b.priority] || a.lastMessageAt.localeCompare(b.lastMessageAt))
  return { ok: true, tickets, counts }
}

export async function adminGet(db: Db, id: string): Promise<{ ok: true; ticket: AdminTicket; messages: TicketMessage[]; contact: string | null } | Failure> {
  const { data: t, error } = await db.from("support_tickets").select(`${TICKET_COLUMNS}, creator:creators(display_name, slug)`).eq("id", id).maybeSingle()
  if (error) return failed("admin get", error, "That request could not be read.")
  if (!t) return { ok: false, error: "Not found.", status: 404 }
  const { data: msgs, error: mErr } = await db.from("support_ticket_messages").select("id, ticket_id, author, internal, body, created_at").eq("ticket_id", id).order("id", { ascending: true }).limit(500)
  if (mErr) return failed("admin thread", mErr, "That request could not be read.")
  return { ok: true, ticket: adminTicket(t as Joined), messages: ((msgs ?? []) as MessageRow[]).map(message), contact: await contactOf(db, (t as TicketRow).opened_by) }
}

/** A reply to the store (emailed to them) or an internal note (to nobody), and whose turn it is after. */
export async function adminReply(db: Db, id: string, input: { body: string; internal: boolean; status?: TicketStatus | null }): Promise<{ ok: true } | Failure> {
  const { data: t, error } = await db.from("support_tickets").select(TICKET_COLUMNS).eq("id", id).maybeSingle()
  if (error) return failed("admin reply read", error, "The reply could not be sent.")
  if (!t) return { ok: false, error: "Not found.", status: 404 }
  const { error: mErr } = await db.from("support_ticket_messages").insert({ ticket_id: id, author: "storelib", internal: input.internal, body: input.body })
  if (mErr) return failed("admin reply", mErr, "The reply could not be sent.")
  const now = new Date().toISOString()
  const status = input.status && STATUSES.includes(input.status) ? input.status : statusAfter("storelib", input.internal, (t as TicketRow).status)
  const patch: Record<string, unknown> = { status, updated_at: now, resolved_at: status === "resolved" ? now : null }
  if (!input.internal) Object.assign(patch, { last_message_at: now, creator_unread: true })
  await db.from("support_tickets").update(patch).eq("id", id)
  if (!input.internal) await tellStore(db, t as TicketRow, input.body)
  return { ok: true }
}

export async function adminUpdate(db: Db, id: string, input: { status?: unknown; priority?: unknown }): Promise<{ ok: true } | Failure> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (STATUSES.includes(input.status as TicketStatus)) Object.assign(patch, { status: input.status, resolved_at: input.status === "resolved" ? patch.updated_at : null })
  if (PRIORITIES.includes(input.priority as Priority)) patch.priority = input.priority
  if (Object.keys(patch).length === 1) return { ok: false, error: "Nothing to change.", status: 400 }
  const { data, error } = await db.from("support_tickets").update(patch).eq("id", id).select("id").maybeSingle()
  if (error) return failed("admin update", error, "That could not be saved.")
  if (!data) return { ok: false, error: "Not found.", status: 404 }
  return { ok: true }
}

/* ─────────────────────────────── emails ────────────────────────────────── */

async function contactOf(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    const email = data?.user?.email as string | undefined
    /* The app's own relay addresses (+slb-) are never shown or written to. */
    return email && !/\+slb-/i.test(email) ? email : null
  } catch {
    return null
  }
}

const paragraphs = (body: string) =>
  body
    .split(/\n{2,}/)
    .map((p) => `<p class="e-text" style="margin:0 0 16px;font-size:16px;line-height:26px;color:#374151">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")

/** A short Storelib support email in the shared layout (lib/emails/layout.ts), with its plain text twin. */
function shell(heading: string, inner: string, button?: { href: string; label: string }): { html: string; text: string } {
  const k = emailKit({ kind: "storelib" })
  const html = emailDocument({
    sender: { kind: "storelib" },
    subject: heading,
    preview: plainOf(inner).replace(/\s+/g, " ").trim().slice(0, 140),
    rows: [k.heading(heading), k.raw(inner, 8), button ? k.button(button.label, button.href) : ""],
    footer: { reason: "Storelib support" },
  })
  const text = emailText([heading, plainOf(inner.replace(/<\/p>/g, "</p>\n\n")).trim(), button ? `${button.label}:\n${button.href}` : null], ["Storelib support"])
  return { html, text }
}

async function tellStorelib(db: Db, kind: "new" | "reply", ticket: TicketRow, body: string): Promise<void> {
  try {
    const to = process.env.SUPPORT_INBOX?.trim() || SUPPORT_EMAIL
    const { data: creator } = await db.from("creators").select("display_name").eq("id", ticket.creator_id).maybeSingle()
    const replyTo = await contactOf(db, ticket.opened_by)
    const e = { kind, ticket, body, replyTo }
    const store = (creator?.display_name as string | undefined) || "A store"
    const subject = e.kind === "new" ? `[Support] ${store}: ${e.ticket.subject}` : `[Support] ${store} replied: ${e.ticket.subject}`
    const facts = `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(TOPIC_LABELS[e.ticket.topic])}${e.ticket.order_ref ? ` · Order #${escapeHtml(e.ticket.order_ref)}` : ""}</p>`
    await sendMailgunOnce({ to, subject, ...shell(e.ticket.subject, facts + paragraphs(e.body), { href: appUrl(`/admin/resolution?ticket=${e.ticket.id}`), label: "Open in Resolution center" }), ...(e.replyTo ? { replyTo: e.replyTo } : {}), tags: ["support-ticket"] })
  } catch (err) {
    console.error(`[support] inbox email not sent: ${loggable(err)}`)
  }
}

async function tellStore(db: Db, ticket: TicketRow, body: string): Promise<void> {
  try {
    const to = await contactOf(db, ticket.opened_by)
    if (!to) return
    const intro = `<p class="e-muted" style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">Storelib replied to your request.</p>`
    await sendMailgunOnce({ to, subject: `Re: ${ticket.subject}`, ...shell(ticket.subject, intro + paragraphs(body), { href: appUrl(`/app/support?ticket=${ticket.id}`), label: "Reply" }), tags: ["support-reply"] })
  } catch (err) {
    console.error(`[support] store email not sent: ${loggable(err)}`)
  }
}
