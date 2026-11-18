import "server-only"

/**
 * ===========================================================================
 *  COMMUNITIES, AS STORELIB'S OWN ADMIN SEES THEM
 * ===========================================================================
 * The reads and the four actions behind /admin/communities
 * (app/api/admin/communities). Every figure is counted from rows, by the
 * database where it can (`count: "exact", head: true`, so no row travels),
 * and a figure that could not be read says so instead of reading as zero.
 *
 *   totals       communities, published, paid and free, members active in
 *                the last 30 days, community revenue in the last 30 days,
 *                open and escalated reports, failed community jobs
 *   list         searchable, a page at a time, newest first
 *   reports      the escalated queue: what was reported and why, never the
 *                body of the post, comment or message itself. A private
 *                community's content stays its members'.
 *   actions      suspend, unsuspend, hide from discovery, show again. Each is
 *                written to the community's own audit log with actor_kind
 *                'platform' (the route records it in admin_actions too).
 *
 * COMMUNITY REVENUE IS ORDERS. A membership invoice becomes an `orders` row
 * (lib/memberships/sync.ts recordPaidInvoice) and a one time community
 * purchase is an ordinary order (lib/checkout/fulfil-payment.ts), so the
 * money here is counted by the same rule as Home and Analytics
 * (lib/analytics/home-figures.ts homeTotals: one payment is one sale, failed,
 * pending and disputed payments are not, money less refunds), over the
 * orders of the products that sell or grant a community: products with
 * `community_id`, and the products in `community_access_products`.
 */
import { homeTotals } from "@/lib/analytics/home-figures"
import { KEYSET_PAGE, keysetFrom, readByKeyset } from "@/lib/analytics/keyset"
import type { OrderRow } from "@/lib/orders/order-view"
import { audit } from "./audit"
import { communityPublicChanged } from "./public-cache"
import { missing, nowIso, reasonOf, type Db } from "./db"

const DAY_MS = 86_400_000
export const ADMIN_PAGE_SIZE = 25
/** Order ids per `.in()` read, so a long list never makes an address too long for the server. */
const IN_CHUNK = 100
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A figure, or the reason it could not be read. */
export type Figure = { value: number; unreadable?: undefined } | { value: null; unreadable: string }

export interface CommunityTotals {
  communities: Figure
  published: Figure
  paid: Figure
  free: Figure
  activeMembers30d: Figure
  revenue30dCents: Figure
  /** The currency the revenue is counted in, when every order shares one. */
  revenueCurrency: string | null
  openReports: Figure
  escalatedReports: Figure
  failedJobs: Figure
}

export interface AdminCommunityRow {
  id: string
  slug: string
  name: string
  status: string
  visibility: string
  access: string
  memberCount: number
  postCount: number
  platformHidden: boolean
  suspendedAt: string | null
  suspendedReason: string | null
  createdAt: string
  creator: { id: string | null; name: string | null; username: string | null }
}

export interface AdminReportRow {
  id: string
  community: { id: string; name: string; slug: string } | null
  targetType: string
  reason: string
  status: string
  createdAt: string
  resolvedAt: string | null
}

const NOT_READY = "The communities tables are not there yet (supabase/sql/run-now/81_communities.sql)."

function unreadable(error: unknown): Figure {
  return { value: null, unreadable: missing(error as { code?: string }) ? NOT_READY : `The database said: ${reasonOf(error).slice(0, 160)}` }
}

/** One count, by the database. */
async function count(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<Figure> {
  try {
    const { count: n, error } = await build()
    if (error) return unreadable(error)
    return { value: Math.max(0, n ?? 0) }
  } catch (e) {
    return unreadable(e)
  }
}

/* ── Revenue ──────────────────────────────────────────────────────────── */

const SALE_COLUMNS = "id, product_id, amount_cents, status, created_at, stripe_session_id, refund_amount_cents, currency"

/** Splits a list into pieces of `size`. */
export function chunks<T>(list: readonly T[], size = IN_CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The products that sell or grant a community: every product with
 * `community_id` (the tiers' own selling products), and every product in
 * `community_access_products`. One community's, or every community's when
 * `communityId` is null.
 */
export async function communityProductIds(db: Db, communityId: string | null): Promise<string[]> {
  const ids = new Set<string>()
  let sold = db.from("products").select("id")
  sold = communityId ? sold.eq("community_id", communityId) : sold.not("community_id", "is", null)
  let granted = db.from("community_access_products").select("product_id")
  if (communityId) granted = granted.eq("community_id", communityId)
  const [a, b] = await Promise.all([sold.limit(10_000), granted.limit(10_000)])
  if (a.error) throw a.error
  if (b.error) throw b.error
  for (const r of (a.data as { id: string }[] | null) ?? []) ids.add(r.id)
  for (const r of (b.data as { product_id: string }[] | null) ?? []) ids.add(r.product_id)
  return [...ids]
}

/** Every order of these products since a time, a page at a time per chunk of products. */
async function ordersOf(db: Db, productIds: string[], sinceIso: string): Promise<(OrderRow & { currency?: string | null })[]> {
  const rows: (OrderRow & { currency?: string | null })[] = []
  for (const part of chunks(productIds)) {
    const read = await readByKeyset<OrderRow & { currency?: string | null }>((after) =>
      keysetFrom(db.from("orders").select(SALE_COLUMNS).in("product_id", part), sinceIso, after)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(KEYSET_PAGE),
    )
    rows.push(...read.rows)
  }
  return rows
}

export interface RevenueFigure {
  /** Money less refunds, in the smallest unit of `currency`. */
  cents: number
  /** Payments counted as sales (Home's rule). */
  sales: number
  /** The orders' currency when they share one; null when there were none or they differ. */
  currency: string | null
}

/**
 * ONE COMMUNITY'S REVENUE SINCE A TIME, counted the way Home and Analytics
 * count a creator's (homeTotals over its products' orders). Cheap enough to
 * call per community on a creator's overview: two small reads for the
 * product ids, then only the orders of those products in the window.
 * Throws when the database cannot be read, so a caller can say so rather
 * than show zero.
 */
export async function communityRevenue(db: Db, communityId: string, sinceIso: string): Promise<RevenueFigure> {
  if (!UUID.test(communityId)) return { cents: 0, sales: 0, currency: null }
  return revenueOver(db, await communityProductIds(db, communityId), sinceIso)
}

/** Every community's revenue since a time: the admin's figure. */
export async function allCommunitiesRevenue(db: Db, sinceIso: string): Promise<RevenueFigure> {
  return revenueOver(db, await communityProductIds(db, null), sinceIso)
}

async function revenueOver(db: Db, productIds: string[], sinceIso: string): Promise<RevenueFigure> {
  if (productIds.length === 0) return { cents: 0, sales: 0, currency: null }
  const rows = await ordersOf(db, productIds, sinceIso)
  return revenueOfRows(rows)
}

/** The money in these order rows by Home's rule (exported for the tests). */
export function revenueOfRows(rows: (OrderRow & { currency?: string | null })[]): RevenueFigure {
  const { totalOrders, totalRevenue } = homeTotals(rows)
  const currencies = new Set(rows.map((r) => (r.currency || "usd").toLowerCase()))
  return { cents: Math.max(0, totalRevenue), sales: totalOrders, currency: currencies.size === 1 ? [...currencies][0] : null }
}

/* ── Totals ───────────────────────────────────────────────────────────── */

export async function communityTotals(db: Db, now: number = Date.now()): Promise<CommunityTotals> {
  const since = nowIso(now - 30 * DAY_MS)
  const head = { count: "exact" as const, head: true }
  const live = () => db.from("communities").select("id", head).is("deleted_at", null)
  const [communities, published, paid, free, activeMembers30d, openReports, escalatedReports, failedJobs, revenue] = await Promise.all([
    count(() => live()),
    count(() => live().eq("status", "published")),
    count(() => live().eq("access", "paid")),
    count(() => live().eq("access", "free")),
    count(() => db.from("community_members").select("id", head).eq("status", "active").gte("last_active_at", since)),
    count(() => db.from("community_reports").select("id", head).in("status", ["open", "reviewing"])),
    count(() => db.from("community_reports").select("id", head).eq("escalated", true).in("status", ["open", "reviewing"])),
    count(() => db.from("community_jobs").select("id", head).eq("state", "failed")),
    allCommunitiesRevenue(db, since).then(
      (r): { figure: Figure; currency: string | null } => ({ figure: { value: r.cents }, currency: r.currency }),
      (e): { figure: Figure; currency: string | null } => ({ figure: unreadable(e), currency: null }),
    ),
  ])
  return { communities, published, paid, free, activeMembers30d, revenue30dCents: revenue.figure, revenueCurrency: revenue.currency, openReports, escalatedReports, failedJobs }
}

/* ── The list ─────────────────────────────────────────────────────────── */

export const ADMIN_FILTERS = ["all", "published", "draft", "suspended", "hidden", "archived"] as const
export type AdminFilter = (typeof ADMIN_FILTERS)[number]

const LIST_COLUMNS = "id, slug, name, status, visibility, access, member_count, post_count, platform_hidden, suspended_at, suspended_reason, created_at, creator_id"

/** A search box's words made safe for an ilike pattern inside an `or()` filter. */
export function searchPattern(q: string): string | null {
  const words = q.replace(/[%_,()*\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
  return words ? `%${words}%` : null
}

export async function listCommunities(
  db: Db,
  opts: { q?: string; filter?: AdminFilter; page?: number },
): Promise<{ rows: AdminCommunityRow[]; total: number; page: number; pages: number } | { unavailable: string }> {
  const page = Math.max(1, Math.min(10_000, Math.floor(opts.page ?? 1)))
  const from = (page - 1) * ADMIN_PAGE_SIZE
  let q = db.from("communities").select(LIST_COLUMNS, { count: "exact" }).is("deleted_at", null)
  const pattern = searchPattern(opts.q ?? "")
  if (pattern) {
    const id = (opts.q ?? "").trim()
    q = UUID.test(id) ? q.eq("id", id) : q.or(`name.ilike.${pattern},slug.ilike.${pattern}`)
  }
  switch (opts.filter) {
    case "published":
      q = q.eq("status", "published")
      break
    case "draft":
      q = q.eq("status", "draft")
      break
    case "suspended":
      q = q.not("suspended_at", "is", null)
      break
    case "hidden":
      q = q.eq("platform_hidden", true)
      break
    case "archived":
      q = q.eq("status", "archived")
      break
  }
  const { data, count: total, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1)
  if (error) return { unavailable: missing(error) ? NOT_READY : "The communities could not be read." }
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const creatorIds = [...new Set(rows.map((r) => r.creator_id).filter((v): v is string => typeof v === "string"))]
  const creators = new Map<string, { name: string | null; username: string | null }>()
  if (creatorIds.length) {
    const { data: cs } = await db.from("creators").select("id, display_name, username, slug").in("id", creatorIds)
    for (const c of (cs as { id: string; display_name: string | null; username: string | null; slug: string | null }[] | null) ?? []) {
      creators.set(c.id, { name: c.display_name, username: c.username ?? c.slug })
    }
  }
  const n = Math.max(0, total ?? rows.length)
  return {
    rows: rows.map((r) => {
      const creatorId = typeof r.creator_id === "string" ? r.creator_id : null
      const c = creatorId ? creators.get(creatorId) : undefined
      return {
        id: String(r.id),
        slug: String(r.slug),
        name: String(r.name),
        status: String(r.status),
        visibility: String(r.visibility),
        access: String(r.access),
        memberCount: Number(r.member_count) || 0,
        postCount: Number(r.post_count) || 0,
        platformHidden: r.platform_hidden === true,
        suspendedAt: (r.suspended_at as string | null) ?? null,
        suspendedReason: (r.suspended_reason as string | null) ?? null,
        createdAt: String(r.created_at),
        creator: { id: creatorId, name: c?.name ?? null, username: c?.username ?? null },
      }
    }),
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / ADMIN_PAGE_SIZE)),
  }
}

/* ── Escalated reports: what and why, never the content ───────────────── */

/** The report columns this view reads. The reported post, comment or message is never read. */
export const REPORT_META_COLUMNS = "id, community_id, target_type, reason, status, created_at, resolved_at"

export async function escalatedReports(db: Db, opts: { page?: number; open?: boolean }): Promise<{ rows: AdminReportRow[]; total: number; page: number; pages: number } | { unavailable: string }> {
  const page = Math.max(1, Math.min(10_000, Math.floor(opts.page ?? 1)))
  const from = (page - 1) * ADMIN_PAGE_SIZE
  let q = db.from("community_reports").select(REPORT_META_COLUMNS, { count: "exact" }).eq("escalated", true)
  if (opts.open !== false) q = q.in("status", ["open", "reviewing"])
  const { data, count: total, error } = await q.order("created_at", { ascending: false }).range(from, from + ADMIN_PAGE_SIZE - 1)
  if (error) return { unavailable: missing(error) ? NOT_READY : "The reports could not be read." }
  const rows = (data as Record<string, unknown>[] | null) ?? []
  const ids = [...new Set(rows.map((r) => r.community_id).filter((v): v is string => typeof v === "string"))]
  const names = new Map<string, { name: string; slug: string }>()
  if (ids.length) {
    const { data: cs } = await db.from("communities").select("id, name, slug").in("id", ids)
    for (const c of (cs as { id: string; name: string; slug: string }[] | null) ?? []) names.set(c.id, { name: c.name, slug: c.slug })
  }
  const n = Math.max(0, total ?? rows.length)
  return {
    rows: rows.map((r) => {
      const cid = typeof r.community_id === "string" ? r.community_id : null
      const c = cid ? names.get(cid) : undefined
      return {
        id: String(r.id),
        community: cid && c ? { id: cid, ...c } : null,
        targetType: String(r.target_type),
        reason: String(r.reason),
        status: String(r.status),
        createdAt: String(r.created_at),
        resolvedAt: (r.resolved_at as string | null) ?? null,
      }
    }),
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / ADMIN_PAGE_SIZE)),
  }
}

/* ── Actions ──────────────────────────────────────────────────────────── */

export const ADMIN_ACTIONS = ["suspend", "unsuspend", "hide", "unhide"] as const
export type AdminCommunityAction = (typeof ADMIN_ACTIONS)[number]

export const REASON_MAX = 500

export type ActionResult =
  | { ok: true; community: { id: string; slug: string; name: string; status: string; platformHidden: boolean; suspendedAt: string | null }; changed: boolean; audited: boolean }
  | { ok: false; status: number; error: string }

/**
 * Suspends, unsuspends, hides or shows one community. A suspension keeps
 * everything: the community, its members, its posts and its billing. It
 * closes the community to everybody (lib/communities/server/context.ts
 * communityOpen) until it is lifted, when the status it had before comes
 * back. Hiding only takes it out of discovery; members use it as before.
 */
export async function applyAdminAction(db: Db, action: AdminCommunityAction, communityId: string, reason: string): Promise<ActionResult> {
  if (!UUID.test(communityId)) return { ok: false, status: 400, error: "That is not a community id." }
  const why = reason.trim().slice(0, REASON_MAX)
  if ((action === "suspend" || action === "hide") && !why) return { ok: false, status: 400, error: "Say why. The reason is kept in the community's audit log." }
  const { data: row, error } = await db.from("communities").select("id, slug, name, status, platform_hidden, suspended_at, archived_at, creator_id").eq("id", communityId).is("deleted_at", null).maybeSingle()
  if (error) return { ok: false, status: missing(error) ? 503 : 500, error: missing(error) ? NOT_READY : "The community could not be read." }
  if (!row) return { ok: false, status: 404, error: "No such community." }

  const now = nowIso()
  let patch: Record<string, unknown> | null = null
  let previousStatus: string | null = null
  if (action === "suspend" && !row.suspended_at) {
    patch = { status: "suspended", suspended_at: now, suspended_reason: why }
    previousStatus = row.status === "suspended" ? null : row.status
  } else if (action === "unsuspend" && (row.suspended_at || row.status === "suspended")) {
    patch = { status: await statusBeforeSuspension(db, communityId, row.archived_at ? "archived" : "published"), suspended_at: null, suspended_reason: null }
  } else if (action === "hide" && !row.platform_hidden) {
    patch = { platform_hidden: true }
  } else if (action === "unhide" && row.platform_hidden) {
    patch = { platform_hidden: false }
  }

  let next = row as { id: string; slug: string; name: string; status: string; platform_hidden: boolean; suspended_at: string | null }
  if (patch) {
    const { data: updated, error: writeError } = await db
      .from("communities")
      .update({ ...patch, updated_at: now })
      .eq("id", communityId)
      .select("id, slug, name, status, platform_hidden, suspended_at")
      .maybeSingle()
    if (writeError) return { ok: false, status: 500, error: "The change was not saved. Nothing was changed." }
    if (updated) next = updated
    /* Its page reads the row live; what is held of it, and its card on the creator's page, go too (./public-cache.ts). */
    communityPublicChanged(communityId, (row as { creator_id?: string | null }).creator_id ?? null, (row as { slug?: string | null }).slug ?? null)
  }
  const audited = patch
    ? await audit(db, {
        communityId,
        actorId: null,
        actorKind: "platform",
        action: `community.${action === "hide" ? "hidden" : action === "unhide" ? "shown" : action === "suspend" ? "suspended" : "unsuspended"}`,
        targetType: "community",
        targetId: communityId,
        targetLabel: row.name,
        reason: why || null,
        detail: { by: "storelib admin", ...(previousStatus ? { previous_status: previousStatus } : {}), ...(patch.status ? { status: patch.status } : {}) },
      })
    : false
  return {
    ok: true,
    changed: Boolean(patch),
    audited,
    community: { id: next.id, slug: next.slug, name: next.name, status: next.status, platformHidden: next.platform_hidden === true, suspendedAt: next.suspended_at ?? null },
  }
}

/** The status a suspended community had, from the audit entry that suspended it. */
async function statusBeforeSuspension(db: Db, communityId: string, fallback: string): Promise<string> {
  try {
    const { data } = await db
      .from("community_audit_log")
      .select("detail")
      .eq("community_id", communityId)
      .eq("action", "community.suspended")
      .order("created_at", { ascending: false })
      .limit(1)
    const prev = ((data as { detail?: Record<string, unknown> }[] | null) ?? [])[0]?.detail?.previous_status
    return prev === "draft" || prev === "published" || prev === "archived" ? prev : fallback
  } catch {
    return fallback
  }
}
