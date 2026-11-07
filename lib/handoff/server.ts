import "server-only"

import { createHash } from "node:crypto"
import { businessGroup } from "@/lib/businesses/server"
import { businessAlias } from "@/lib/businesses/email-alias"
import { groupIds, ownerOf, UUID_PATTERN } from "@/lib/businesses/rules"
import { currentEmailIsVerified } from "@/lib/auth/verified-email"
import { baseUrl } from "@/lib/notify/urls"
import { onePageUrlDisplay } from "@/lib/onepage/address"
import type { Db, HandoffDeps } from "./deps"
import { handoffAcceptedEmail, handoffInviteEmail } from "./email"
import {
  BLOCKER_TEXT,
  DEFAULT_TTL_DAYS,
  RESEND_COOLDOWN_MS,
  claimPath,
  claimStateOf,
  handoffEmail,
  isFounderAccess,
  refusalOf,
  refusalOfSql,
  tokenShapeOk,
  ttlDays,
  type Blocker,
  type BusinessShown,
  type ClaimState,
  type FounderAccess,
  type HandoffRow,
  type Viewer,
} from "./rules"

/**
 * ===========================================================================
 *  HANDING A BUSINESS OVER, ON THE SERVER
 * ===========================================================================
 * The founder's side (Settings, Team, in the business being handed over):
 * make a claim link, send it again or make a new one, revoke it. The
 * recipient's side (app/(storelib)/team/claim/[token]): read the link,
 * accept it. Every read and write goes through the service role, after the
 * checks below; the tables are the server's (SQL 20271131, row level
 * security on). The move itself is one transaction in the database
 * (business_handoff_accept), which checks everything again. After it
 * commits, finishHandoff does what only Supabase Auth and the caches can:
 * the business's sign in address is made from the new owner's, every
 * session it had (the founder's browser and phones) is ended, and the
 * OnePage, store, domain and payments caches forget it. A finish that fails
 * halfway is run again the next time the new owner opens the link.
 *
 * Only the SHA-256 of a token is stored. The link itself is shown once, to
 * the founder who made it, and is in the email; sending again or Copy a new
 * link makes a new token and the old one stops working.
 */

export const NOT_SET_UP = "Handing over a business is not set up on Storelib yet. Try again later."

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function claimLink(token: string): string {
  return `${baseUrl()}${claimPath(token)}`
}

/** The tables are not there yet (SQL 20271131 not run): said, never thrown. */
export function handoffMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ["42P01", "PGRST205", "PGRST202", "42883"].includes(error.code ?? "") || /business_handoff/.test(error.message ?? "")
}

const HANDOFF_COLUMNS =
  "id, business_user_id, creator_id, from_owner_id, recipient_email, keep_founder, founder_access, ttl_days, status, expires_at, created_at, last_sent_at, send_count, accepted_at, accepted_by, revoked_at, finished_at"

type Result<T> = ({ ok: true } & T) | { ok: false; status: number; error: string }

export interface RequestMeta {
  ip: string | null
  userAgent: string | null
}

export function metaOf(request: Request): RequestMeta {
  return {
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || null,
    userAgent: request.headers.get("user-agent")?.slice(0, 300) || null,
  }
}

/** One line in the record. Never throws: the record is not the handoff. */
export async function logEvent(
  deps: HandoffDeps,
  e: { handoffId: string | null; businessUserId: string | null; event: "created" | "sent" | "renewed" | "viewed" | "accepted" | "finished" | "revoked" | "failed"; actorId: string | null; meta?: RequestMeta | null; detail?: Record<string, unknown> },
): Promise<void> {
  try {
    await deps.db.from("business_handoff_events").insert({
      handoff_id: e.handoffId,
      business_user_id: e.businessUserId,
      event: e.event,
      actor_id: e.actorId,
      ip: e.meta?.ip ?? null,
      user_agent: e.meta?.userAgent ?? null,
      detail: e.detail ?? {},
    })
  } catch {
    /* the record is not the handoff */
  }
}

/* ── The business, as both sides see it ──────────────────────────────── */

interface CreatorRow {
  id: string
  user_id: string
  slug: string | null
  username: string | null
  display_name: string | null
  avatar_url: string | null
  stripe_account_id?: string | null
}

async function creatorOf(db: Db, userId: string): Promise<CreatorRow | null> {
  const { data } = await db.from("creators").select("id, user_id, slug, username, display_name, avatar_url, stripe_account_id").eq("user_id", userId).maybeSingle()
  return (data as CreatorRow | null) ?? null
}

/** The name buyers see (Store details), else the profile's, else the creator's, else the handle. */
async function businessShown(db: Db, userId: string, creator: CreatorRow | null): Promise<BusinessShown & { handle: string | null }> {
  const [{ data: profile }, settings] = await Promise.all([
    db.from("profiles").select("username, display_name, avatar_url").eq("id", userId).maybeSingle(),
    creator ? db.from("store_settings").select("store_name").eq("creator_id", creator.id).maybeSingle().then((r: { data: unknown }) => r, () => ({ data: null })) : Promise.resolve({ data: null }),
  ])
  const p = (profile ?? {}) as { username?: string | null; display_name?: string | null; avatar_url?: string | null }
  const storeName = ((settings as { data: { store_name?: string | null } | null }).data?.store_name ?? "").trim()
  const handle = p.username || creator?.username || creator?.slug || null
  const name = storeName || (p.display_name ?? "").trim() || (creator?.display_name ?? "").trim() || handle || "A Storelib business"
  return { name, avatarUrl: p.avatar_url || creator?.avatar_url || null, handle }
}

export interface BusinessPreview {
  name: string
  avatarUrl: string | null
  storeAddress: string | null
  onePageAddress: string | null
  products: number
  websites: number
  domains: string[]
  sender: string | null
}

/** What the claim page shows before anybody accepts: read only, a handful of reads. */
export async function previewOf(db: Db, handoff: HandoffRow): Promise<BusinessPreview> {
  const creator = await creatorOf(db, handoff.business_user_id).catch(() => null)
  const shown = await businessShown(db, handoff.business_user_id, creator).catch(() => ({ name: "A Storelib business", avatarUrl: null, handle: null }))
  const none = { data: null, count: 0 }
  const safe = (p: PromiseLike<unknown>) => Promise.resolve(p).then((r) => r as { data: unknown; count?: number | null }, () => none)
  const [page, products, sites, domains, sender] = await Promise.all([
    safe(db.from("onepages").select("slug").eq("owner_id", handoff.business_user_id).limit(1).maybeSingle()),
    creator ? safe(db.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creator.id)) : Promise.resolve(none),
    creator ? safe(db.from("sites").select("id", { count: "exact", head: true }).eq("creator_id", creator.id)) : Promise.resolve(none),
    creator ? safe(db.from("custom_domains").select("domain, status").eq("creator_id", creator.id).limit(10)) : Promise.resolve(none),
    safe(db.from("profiles").select("display_name").eq("id", handoff.from_owner_id).maybeSingle()),
  ])
  const pageSlug = (page.data as { slug?: string | null } | null)?.slug ?? null
  const domainRows = Array.isArray(domains.data) ? (domains.data as { domain?: string | null }[]) : []
  return {
    name: shown.name,
    avatarUrl: shown.avatarUrl,
    storeAddress: shown.handle ? `${baseUrl().replace(/^https?:\/\//, "")}/${shown.handle.toLowerCase()}` : null,
    onePageAddress: pageSlug ? onePageUrlDisplay(pageSlug) : null,
    products: typeof products.count === "number" ? products.count : 0,
    websites: typeof sites.count === "number" ? sites.count : 0,
    domains: domainRows.map((d) => (d.domain ?? "").trim()).filter(Boolean),
    sender: ((sender.data as { display_name?: string | null } | null)?.display_name ?? "").trim() || null,
  }
}

/**
 * What stops a business being handed over right now. The database checks
 * the plan and the memberships again inside the transfer; the payout
 * balance is Stripe's to say, so it is asked here, when `payouts` is set
 * (creating a link and accepting one), and not on every page view.
 */
export async function blockersOf(deps: HandoffDeps, creator: Pick<CreatorRow, "id" | "stripe_account_id"> | null, opts: { payouts: boolean }): Promise<Blocker[]> {
  if (!creator) return []
  const out: Blocker[] = []
  const [plan, members] = await Promise.all([
    deps.db.from("subscriptions").select("id").eq("creator_id", creator.id).not("stripe_subscription_id", "is", null).in("status", ["active", "trialing", "past_due", "unpaid", "incomplete"]).limit(1),
    deps.db.from("memberships").select("id").eq("creator_id", creator.id).in("status", ["active", "trialing", "past_due"]).limit(1),
  ])
  if (!plan.error && Array.isArray(plan.data) && plan.data.length > 0) out.push("paid_plan")
  if (!members.error && Array.isArray(members.data) && members.data.length > 0) out.push("live_memberships")
  if (opts.payouts && creator.stripe_account_id) {
    const balance = await deps.payoutBalance(creator.stripe_account_id)
    if (balance === "held") out.push("payout_balance")
    if (balance === "unreachable") out.push("payouts_unreachable")
  }
  return out
}

/* ── The founder's side ───────────────────────────────────────────────── */

export interface PendingView {
  id: string
  email: string | null
  expiresAt: string
  createdAt: string
  lastSentAt: string | null
  expired: boolean
  keepFounder: boolean
  founderAccess: FounderAccess
  ttlDays: number
}

export interface EventView {
  event: string
  at: string
}

export type PanelState =
  | { ready: false; error: string }
  | { ready: true; eligible: false; reason: "first_business" | "on_its_own" }
  | { ready: true; eligible: true; business: BusinessShown; blockers: Blocker[]; blockerText: string[]; pending: PendingView | null; events: EventView[] }

/**
 * Who may hand this business over: the business itself, signed in (the
 * founder switched into it, lib/businesses), and only a business that is
 * not its login's first. The founder's login is the group's owner.
 */
async function founderScope(deps: HandoffDeps, sessionUserId: string): Promise<{ ok: true; ownerId: string } | { ok: false; reason: "first_business" | "on_its_own" }> {
  const group = await businessGroup(sessionUserId, deps.db)
  if (!group) return { ok: false, reason: "on_its_own" }
  if (group.ownerId === sessionUserId) return { ok: false, reason: "first_business" }
  return { ok: true, ownerId: group.ownerId }
}

function pendingView(row: HandoffRow, now: number): PendingView {
  return {
    id: row.id,
    email: row.recipient_email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastSentAt: row.last_sent_at,
    expired: Date.parse(row.expires_at) <= now,
    keepFounder: row.keep_founder,
    founderAccess: row.founder_access,
    ttlDays: row.ttl_days,
  }
}

async function openHandoff(db: Db, businessUserId: string): Promise<{ row: HandoffRow | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await db.from("business_handoffs").select(HANDOFF_COLUMNS).eq("business_user_id", businessUserId).eq("status", "pending").maybeSingle()
  return { row: (data as HandoffRow | null) ?? null, error }
}

export async function panelFor(deps: HandoffDeps, sessionUserId: string): Promise<PanelState> {
  const scope = await founderScope(deps, sessionUserId)
  if (scope.ok === false) return { ready: true, eligible: false, reason: scope.reason }
  const open = await openHandoff(deps.db, sessionUserId)
  if (open.error) return { ready: false, error: handoffMissing(open.error) ? NOT_SET_UP : "Could not read the handover. Try again." }
  const creator = await creatorOf(deps.db, sessionUserId)
  const [shown, blockers, events] = await Promise.all([
    businessShown(deps.db, sessionUserId, creator),
    blockersOf(deps, creator, { payouts: false }),
    open.row
      ? deps.db.from("business_handoff_events").select("event, created_at").eq("handoff_id", open.row.id).order("created_at", { ascending: false }).limit(8).then((r: { data: unknown }) => r.data, () => null)
      : Promise.resolve(null),
  ])
  return {
    ready: true,
    eligible: true,
    business: { name: shown.name, avatarUrl: shown.avatarUrl },
    blockers,
    blockerText: blockers.map((b) => BLOCKER_TEXT[b]),
    pending: open.row ? pendingView(open.row, deps.now()) : null,
    events: Array.isArray(events) ? (events as { event: string; created_at: string }[]).map((e) => ({ event: e.event, at: e.created_at })) : [],
  }
}

async function sendInvite(deps: HandoffDeps, row: { recipient_email: string | null; ttl_days: number; from_owner_id: string; business_user_id: string }, token: string): Promise<boolean> {
  if (!row.recipient_email) return false
  const creator = await creatorOf(deps.db, row.business_user_id).catch(() => null)
  const [shown, sender] = await Promise.all([
    businessShown(deps.db, row.business_user_id, creator).catch(() => ({ name: "A Storelib business", avatarUrl: null, handle: null })),
    deps.db.from("profiles").select("display_name").eq("id", row.from_owner_id).maybeSingle().then((r: { data: unknown }) => r.data as { display_name?: string | null } | null, () => null),
  ])
  const mail = handoffInviteEmail({ businessName: shown.name, senderName: sender?.display_name ?? null, email: row.recipient_email, link: claimLink(token), days: row.ttl_days })
  return deps.sendEmail({ to: row.recipient_email, subject: mail.subject, text: mail.text, html: mail.html })
}

export async function createHandoff(
  deps: HandoffDeps,
  sessionUser: { id: string; email: string | null },
  input: { email?: unknown; days?: unknown; keepFounder?: unknown; founderAccess?: unknown },
  meta: RequestMeta,
): Promise<Result<{ link: string; pending: PendingView; emailed: boolean }>> {
  const scope = await founderScope(deps, sessionUser.id)
  if (scope.ok === false) return { ok: false, status: 403, error: scope.reason === "first_business" ? "Your first business is your login, so it can't be handed over. Hand over a business you added from the account menu." : "Only a business you added from the account menu can be handed over." }
  const rawEmail = typeof input.email === "string" ? input.email.trim() : ""
  const email = rawEmail ? handoffEmail(rawEmail) : null
  if (rawEmail && !email) return { ok: false, status: 400, error: "Enter a valid email, or leave it empty." }
  const days = ttlDays(input.days)
  if (days === null) return { ok: false, status: 400, error: "Choose how long the link works: 1 to 30 days." }
  const keepFounder = input.keepFounder === true
  const founderAccess: FounderAccess = isFounderAccess(input.founderAccess) ? input.founderAccess : "full"

  const owner = await deps.authUser(scope.ownerId)
  if (email && owner?.email && email === owner.email.trim().toLowerCase()) return { ok: false, status: 400, error: "That is your own email. Enter the email of the person taking it over." }

  const creator = await creatorOf(deps.db, sessionUser.id)
  const blockers = await blockersOf(deps, creator, { payouts: true })
  if (blockers.length > 0) return { ok: false, status: 409, error: blockers.map((b) => BLOCKER_TEXT[b]).join(" ") }

  const open = await openHandoff(deps.db, sessionUser.id)
  if (open.error) return { ok: false, status: handoffMissing(open.error) ? 503 : 500, error: handoffMissing(open.error) ? NOT_SET_UP : "Could not read the handover. Try again." }
  if (open.row) {
    if (Date.parse(open.row.expires_at) > deps.now()) return { ok: false, status: 409, error: "A claim link is already open. Send it again, make a new one, or revoke it." }
    /* An expired link makes way for the new one, and says so in the record. */
    await deps.db.from("business_handoffs").update({ status: "expired", updated_at: new Date(deps.now()).toISOString() }).eq("id", open.row.id).eq("status", "pending")
  }

  const token = deps.randomBytes(32).toString("base64url")
  const nowIso = new Date(deps.now()).toISOString()
  const row = {
    business_user_id: sessionUser.id,
    creator_id: creator?.id ?? null,
    from_owner_id: scope.ownerId,
    created_by: sessionUser.id,
    token_hash: hashToken(token),
    recipient_email: email,
    keep_founder: keepFounder,
    founder_access: founderAccess,
    ttl_days: days,
    status: "pending",
    expires_at: new Date(deps.now() + days * 86_400_000).toISOString(),
    created_at: nowIso,
    updated_at: nowIso,
  }
  const { data, error } = await deps.db.from("business_handoffs").insert(row).select(HANDOFF_COLUMNS).single()
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, status: 409, error: "A claim link is already open. Send it again, make a new one, or revoke it." }
    return { ok: false, status: handoffMissing(error) ? 503 : 500, error: handoffMissing(error) ? NOT_SET_UP : "Could not make the link. Try again." }
  }
  const made = data as HandoffRow
  await logEvent(deps, { handoffId: made.id, businessUserId: sessionUser.id, event: "created", actorId: sessionUser.id, meta, detail: { email: !!email, days, keep_founder: keepFounder, founder_access: founderAccess } })
  let emailed = false
  if (email) {
    emailed = await sendInvite(deps, made, token)
    if (emailed) {
      await deps.db.from("business_handoffs").update({ last_sent_at: nowIso, send_count: 1 }).eq("id", made.id)
      made.last_sent_at = nowIso
      await logEvent(deps, { handoffId: made.id, businessUserId: sessionUser.id, event: "sent", actorId: sessionUser.id, meta })
    }
  }
  return { ok: true, link: claimLink(token), pending: pendingView(made, deps.now()), emailed }
}

/**
 * A fresh link for the open handoff: the old token stops working at once,
 * the expiry starts again, and with `send` it is emailed. The only way to
 * see a link again, because the link itself is never stored.
 */
export async function renewHandoff(deps: HandoffDeps, sessionUser: { id: string }, id: unknown, opts: { send: boolean }, meta: RequestMeta): Promise<Result<{ link: string; pending: PendingView; emailed: boolean }>> {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { ok: false, status: 400, error: "Say which link." }
  const { data, error } = await deps.db.from("business_handoffs").select(HANDOFF_COLUMNS).eq("id", id).eq("business_user_id", sessionUser.id).maybeSingle()
  if (error) return { ok: false, status: handoffMissing(error) ? 503 : 500, error: handoffMissing(error) ? NOT_SET_UP : "Could not read the link. Try again." }
  const row = data as HandoffRow | null
  if (!row || row.status !== "pending") return { ok: false, status: 404, error: "This link is no longer open." }
  const scope = await founderScope(deps, sessionUser.id)
  if (scope.ok === false || scope.ownerId !== row.from_owner_id) return { ok: false, status: 403, error: "This business is no longer yours to hand over." }
  if (opts.send && !row.recipient_email) return { ok: false, status: 400, error: "This link has no email to send to. Copy it instead." }
  const sentAt = row.last_sent_at ? Date.parse(row.last_sent_at) : NaN
  if (opts.send && Number.isFinite(sentAt) && deps.now() - sentAt < RESEND_COOLDOWN_MS) {
    return { ok: false, status: 429, error: `It was just sent. You can send it again in ${Math.ceil((sentAt + RESEND_COOLDOWN_MS - deps.now()) / 1000)} seconds.` }
  }
  const token = deps.randomBytes(32).toString("base64url")
  const nowIso = new Date(deps.now()).toISOString()
  const changes: Record<string, unknown> = { token_hash: hashToken(token), expires_at: new Date(deps.now() + row.ttl_days * 86_400_000).toISOString(), updated_at: nowIso }
  const { data: updated, error: upErr } = await deps.db.from("business_handoffs").update(changes).eq("id", row.id).eq("status", "pending").select(HANDOFF_COLUMNS)
  if (upErr || !Array.isArray(updated) || updated.length === 0) return { ok: false, status: 409, error: "This link is no longer open." }
  const fresh = updated[0] as HandoffRow
  await logEvent(deps, { handoffId: row.id, businessUserId: sessionUser.id, event: "renewed", actorId: sessionUser.id, meta })
  let emailed = false
  if (opts.send) {
    emailed = await sendInvite(deps, fresh, token)
    if (emailed) {
      await deps.db.from("business_handoffs").update({ last_sent_at: nowIso, send_count: (row.send_count ?? 0) + 1 }).eq("id", row.id)
      fresh.last_sent_at = nowIso
      await logEvent(deps, { handoffId: row.id, businessUserId: sessionUser.id, event: "sent", actorId: sessionUser.id, meta })
    }
  }
  return { ok: true, link: claimLink(token), pending: pendingView(fresh, deps.now()), emailed }
}

export async function revokeHandoff(deps: HandoffDeps, sessionUser: { id: string }, id: unknown, meta: RequestMeta): Promise<Result<Record<never, never>>> {
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { ok: false, status: 400, error: "Say which link." }
  const nowIso = new Date(deps.now()).toISOString()
  const { data, error } = await deps.db
    .from("business_handoffs")
    .update({ status: "revoked", revoked_at: nowIso, revoked_by: sessionUser.id, updated_at: nowIso })
    .eq("id", id)
    .eq("business_user_id", sessionUser.id)
    .eq("status", "pending")
    .select("id")
  if (error) return { ok: false, status: handoffMissing(error) ? 503 : 500, error: handoffMissing(error) ? NOT_SET_UP : "Could not revoke the link. Try again." }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, status: 404, error: "This link is no longer open." }
  await logEvent(deps, { handoffId: id, businessUserId: sessionUser.id, event: "revoked", actorId: sessionUser.id, meta })
  return { ok: true }
}

/* ── The recipient's side ─────────────────────────────────────────────── */

/**
 * Who is looking at a claim link: their login (the group's first account,
 * whichever business this browser is in), its own email as Supabase Auth
 * has it, and whether that email is the one they proved.
 */
export async function viewerOf(deps: HandoffDeps, sessionUser: { id: string; email: string | null } | null): Promise<Viewer | null> {
  if (!sessionUser) return null
  const group = await businessGroup(sessionUser.id, deps.db)
  const loginId = ownerOf(group, sessionUser.id)
  const login = await deps.authUser(loginId)
  const email = login?.email ?? (loginId === sessionUser.id ? sessionUser.email : null)
  const emailVerified = login ? await currentEmailIsVerified(deps.db, login) : false
  return { loginId, sessionId: sessionUser.id, email: email ?? null, emailVerified, groupIds: groupIds(group, sessionUser.id) }
}

export interface ClaimRead {
  state: ClaimState
  handoff: HandoffRow | null
  preview: BusinessPreview | null
}

export async function readClaim(deps: HandoffDeps, token: unknown, viewer: Viewer | null, opts: { payouts: boolean } = { payouts: false }): Promise<Result<ClaimRead>> {
  const now = deps.now()
  if (!tokenShapeOk(token)) return { ok: true, state: claimStateOf({ token, handoff: null, business: null, stillFounders: false, viewer, blockers: [], now }), handoff: null, preview: null }
  const { data, error } = await deps.db.from("business_handoffs").select(HANDOFF_COLUMNS).eq("token_hash", hashToken(token)).maybeSingle()
  if (error) return { ok: false, status: handoffMissing(error) ? 503 : 500, error: handoffMissing(error) ? NOT_SET_UP : "Could not read the link. Try again." }
  const handoff = (data as HandoffRow | null) ?? null
  if (!handoff) return { ok: true, state: claimStateOf({ token, handoff: null, business: null, stillFounders: false, viewer, blockers: [], now }), handoff: null, preview: null }
  const [preview, link] = await Promise.all([
    previewOf(deps.db, handoff),
    deps.db.from("business_links").select("owner_id").eq("member_id", handoff.business_user_id).maybeSingle().then((r: { data: unknown }) => r.data as { owner_id?: string } | null, () => null),
  ])
  const stillFounders = link?.owner_id === handoff.from_owner_id
  const live = handoff.status === "pending" && stillFounders && !!viewer
  const creator = live ? await creatorOf(deps.db, handoff.business_user_id).catch(() => null) : null
  const blockers = live ? await blockersOf(deps, creator, opts) : []
  const state = claimStateOf({ token, handoff, business: { name: preview.name, avatarUrl: preview.avatarUrl }, stillFounders, viewer, blockers, now })
  return { ok: true, state, handoff, preview }
}

export type AcceptResult = Result<{ businessUserId: string; name: string; finished: boolean }> & { code?: string }

/**
 * Accept a claim link, signed in. Every state is checked here first, the
 * payout balance with Stripe included, and then again inside the database
 * in one transaction (business_handoff_accept): if anything there fails,
 * nothing changed, the link still works, and the reason is recorded.
 */
export async function acceptClaim(deps: HandoffDeps, token: unknown, sessionUser: { id: string; email: string | null }, meta: RequestMeta): Promise<AcceptResult> {
  const viewer = await viewerOf(deps, sessionUser)
  const read = await readClaim(deps, token, viewer, { payouts: true })
  if (read.ok === false) return read
  const { state, handoff } = read
  const refused = refusalOf(state)
  if (refused || !handoff || !viewer) {
    const out = refused ?? { status: 400, error: "This link can't be accepted." }
    if (handoff) await logEvent(deps, { handoffId: handoff.id, businessUserId: handoff.business_user_id, event: "failed", actorId: sessionUser.id, meta, detail: { reason: state.kind } })
    return { ok: false, ...out, code: state.kind }
  }
  const founder = handoff.keep_founder ? await deps.authUser(handoff.from_owner_id) : null
  const { data, error } = await deps.db.rpc("business_handoff_accept", {
    p_handoff: handoff.id,
    p_token_hash: hashToken(token as string),
    p_recipient: viewer.loginId,
    p_recipient_email: viewer.email,
    p_founder_email: founder?.email ?? null,
    p_ip: meta.ip,
    p_user_agent: meta.userAgent,
  })
  if (error || !data) {
    const refusal = handoffMissing(error) ? { code: "not_set_up", status: 503, error: NOT_SET_UP } : refusalOfSql(error)
    await logEvent(deps, { handoffId: handoff.id, businessUserId: handoff.business_user_id, event: "failed", actorId: sessionUser.id, meta, detail: { reason: refusal.code } })
    return { ok: false, status: refusal.status, error: refusal.error, code: refusal.code }
  }
  const finished = await finishHandoff(deps, handoff.id, viewer, meta)
  return { ok: true, businessUserId: handoff.business_user_id, name: read.preview?.name ?? "Your business", finished }
}

/**
 * What the database cannot do inside its transaction, after it committed:
 * the business's sign in address is made from the new owner's (so seller
 * emails reach them, not the founder), every session the business had is
 * ended (the founder's browser and phones), the caches forget it, and the
 * founder is told. Safe to run again: the claim page runs it for the new
 * owner while finished_at is empty.
 */
export async function finishHandoff(deps: HandoffDeps, handoffId: string, viewer: Viewer, meta: RequestMeta | null): Promise<boolean> {
  const { data } = await deps.db.from("business_handoffs").select(HANDOFF_COLUMNS).eq("id", handoffId).maybeSingle()
  const row = data as HandoffRow | null
  if (!row || row.status !== "accepted" || row.finished_at) return !!row?.finished_at
  /* Only the new owner: the login that took it (the viewer read just before the transfer does not list it yet), or a session of its group after. */
  if (row.accepted_by !== viewer.loginId && !viewer.groupIds.includes(row.business_user_id)) return false
  const steps: Record<string, boolean> = {}
  const alias = businessAlias(viewer.email, deps.randomBytes(4).toString("hex"))
  steps.address = await deps.updateAuthUser(row.business_user_id, {
    email: alias,
    email_confirm: true,
    app_metadata: { business_owner: viewer.loginId, verified_email: alias },
  })
  if (steps.address) {
    const { error } = await deps.db.from("profiles").update({ email: alias }).eq("id", row.business_user_id)
    steps.profile = !error
  }
  steps.sessions = await deps.signOutEverywhere(row.business_user_id)
  await deps.forgetCaches({ userId: row.business_user_id, creatorId: row.creator_id }).catch(() => undefined)
  const done = Object.values(steps).every(Boolean)
  if (!done) {
    await logEvent(deps, { handoffId: row.id, businessUserId: row.business_user_id, event: "failed", actorId: viewer.sessionId, meta, detail: { stage: "finish", steps } })
    return false
  }
  await deps.db.from("business_handoffs").update({ finished_at: new Date(deps.now()).toISOString() }).eq("id", row.id).is("finished_at", null)
  await logEvent(deps, { handoffId: row.id, businessUserId: row.business_user_id, event: "finished", actorId: viewer.sessionId, meta, detail: { steps } })
  /* The founder hears it from Storelib, not from a support ticket. Best effort. */
  try {
    const founder = await deps.authUser(row.from_owner_id)
    if (founder?.email) {
      const creator = await creatorOf(deps.db, row.business_user_id).catch(() => null)
      const shown = await businessShown(deps.db, row.business_user_id, creator)
      const mail = handoffAcceptedEmail({ businessName: shown.name, takenBy: viewer.email, keptFounder: row.keep_founder })
      await deps.sendEmail({ to: founder.email, subject: mail.subject, text: mail.text, html: mail.html })
    }
  } catch {
    /* the handoff is done either way */
  }
  return true
}

export { DEFAULT_TTL_DAYS }
