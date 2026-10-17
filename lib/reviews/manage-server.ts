import "server-only"

/**
 * ===========================================================================
 *  STORELIB REVIEWS, MANAGED: WHAT THE PAGE READS AND CHANGES
 * ===========================================================================
 * The integration's own page (components/reviews/manage) asks the routes
 * under /api/app/reviews, and they ask this. Every read is filtered by the
 * creator the route proved (shopCaller, or sellersReview for one review) and
 * runs with the server's key, because the public policy shows published
 * reviews only and a store needs its pending and hidden ones too.
 *
 *   LIST       one page of reviews (PAGE_SIZE), filtered, sorted and counted
 *              on the server: the page and the tab counts, never every row
 *   SUMMARY    the overview's numbers from counts alone, cached for a
 *              minute and cleared by every change the page makes
 *   ANALYTICS  rows of the period and the one before it, read in pages,
 *              added up by lib/reviews/manage (the same functions the
 *              overview's numbers come from)
 *   REQUESTS   one page of review requests, and recent orders to ask by hand
 *   MODERATE   one review, by planModeration, with its photos moved to the
 *              right bucket
 *
 * Every read fails soft: a database without part 134 or 215 answers what it
 * can, and the page says what needs the update.
 */
import { unstable_cache, revalidateTag } from "next/cache"
import { missingColumn } from "./store"
import { readPhotos, sellerView } from "./app-settings"
import { photoViewUrl, removeReviewPhotos, syncReviewPhotos } from "./photos-server"
import {
  PAGE_SIZE,
  REVIEW_TABS,
  applyFilters,
  applySort,
  applyTab,
  funnelFrom,
  pageRange,
  periodTotals,
  planModeration,
  previousPeriod,
  requestShown,
  reviewSeries,
  bucketFor,
  summaryFromCounts,
  type ManagedRequest,
  type ManagedReview,
  type ModeratedRow,
  type Moderation,
  type RequestFunnel,
  type ReviewListAnswer,
  type ReviewListQuery,
  type ReviewTab,
  type ReviewsSummary,
  type StatRow,
  type TabCounts,
} from "./manage"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const reviewsManageTag = (creatorId: string) => `reviews-manage:${creatorId}`

/** Cleared by every change to a store's reviews or requests, so the overview is never more than a beat behind. */
export function forgetReviewsManage(creatorId: string | null | undefined): void {
  if (!creatorId) return
  try {
    revalidateTag(reviewsManageTag(creatorId), { expire: 0 })
  } catch {
    /* Outside a request (tests, scripts): nothing is cached there. */
  }
}

/** A short cache, or the plain read where there is no cache (tests, scripts). */
async function cached<T>(key: string[], tag: string, seconds: number, read: () => Promise<T>): Promise<T> {
  try {
    return await unstable_cache(read, key, { revalidate: seconds, tags: [tag] })()
  } catch {
    return read()
  }
}

const count = async (q: PromiseLike<{ count?: number | null; error?: unknown }>): Promise<number | null> => {
  try {
    const r = await q
    return r.error ? null : (r.count ?? 0)
  } catch {
    return null
  }
}

/* ── Moderation ────────────────────────────────────────────────────────── */

export type ModerateResult = { ok: true; changed: boolean; review: Record<string, unknown> } | { ok: false; status: number; error: string }

export async function moderateReview(db: Db, review: ModeratedRow & { creator_id: string }, action: Moderation, photo?: unknown): Promise<ModerateResult> {
  const now = new Date().toISOString()
  const plan = planModeration(review, action, photo, now)
  if (plan.kind === "refused") return { ok: false, status: plan.status, error: plan.error }
  if (plan.kind === "same") return { ok: true, changed: false, review: plan.review }
  const { data, error } = await db.from("reviews").update({ ...plan.change, updated_at: now }).eq("id", review.id).eq("creator_id", review.creator_id).select("id, status, site_status, verified, featured, photos, hidden_by").single()
  if (error || !data) {
    const code = String((error as { code?: string } | null)?.code ?? "")
    const missing = code === "42703" || code === "PGRST204" || code === "23514"
    return { ok: false, status: missing ? 409 : 500, error: missing ? "Moderation turns on after the database update (SQL part 134)." : "That did not save. Try again." }
  }
  await syncReviewPhotos(db, data)
  forgetReviewsManage(review.creator_id)
  return { ok: true, changed: true, review: data }
}

/* ── The list ──────────────────────────────────────────────────────────── */

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

/** The store's products whose title has the search in it, for "apron" to find the Linen apron's reviews. */
async function productsMatching(db: Db, creatorId: string, q: string): Promise<string[]> {
  if (!q) return []
  const { data } = await db.from("products").select("id").eq("creator_id", creatorId).ilike("title", `%${q}%`).limit(100)
  return ((data ?? []) as { id: string }[]).map((p) => p.id)
}

export async function tabCounts(db: Db, creatorId: string, f: ReviewListQuery, matches: string[]): Promise<TabCounts> {
  const each = await Promise.all(
    REVIEW_TABS.map((tab) => count(applyFilters(applyTab(db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", creatorId), tab), f, matches))),
  )
  return Object.fromEntries(REVIEW_TABS.map((t, i) => [t, each[i] ?? 0])) as TabCounts
}

export async function listReviews(db: Db, creatorId: string, f: ReviewListQuery): Promise<ReviewListAnswer> {
  const matches = await productsMatching(db, creatorId, f.q)
  const [from, to] = pageRange(f.page)
  /* With Storelib Reviews' columns (part 134), the buyer's profile and the order's address; written out here so tests/review-columns.test.ts reads them. */
  let res = await applySort(
    applyFilters(
      applyTab(
        db
          .from("reviews")
          .select("id, product_id, order_id, buyer_id, rating, title, content, created_at, edited_at, status, site_status, hidden_by, verified, source, featured, photos, reviewer_name, seller_reply, seller_reply_at, buyer:profiles!buyer_id(display_name, avatar_url), order:orders!order_id(buyer_email, buyer_first_name, created_at)")
          .eq("creator_id", creatorId),
        f.tab,
      ),
      f,
      matches,
    ),
    f.sort,
  ).range(from, to)
  let ready = true
  if (res.error && missingColumn(res.error)) {
    /* Before part 134: the plain list, newest first, without the tabs that need its columns. */
    ready = false
    res = await db.from("reviews").select("id, product_id, order_id, buyer_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, buyer:profiles!buyer_id(display_name, avatar_url)").eq("creator_id", creatorId).order("created_at", { ascending: false }).range(from, to)
  }
  const raw = (res.data ?? []) as Record<string, any>[]
  const counts = ready ? await tabCounts(db, creatorId, f, matches) : ({ all: raw.length, published: 0, pending: 0, hidden: 0, reported: 0, unanswered: 0 } as TabCounts)
  const productIds = [...new Set(raw.map((r) => r.product_id).filter(Boolean))]
  const { data: products } = productIds.length ? await db.from("products").select("id, title, slug, thumbnail_url").in("id", productIds) : { data: [] }
  const byId = new Map(((products ?? []) as { id: string; title: string | null; slug: string | null; thumbnail_url: string | null }[]).map((p) => [p.id, p]))
  const rows = await Promise.all(
    raw.map(async (r): Promise<ManagedReview> => {
      const p = byId.get(r.product_id)
      const order = one(r.order) as { buyer_email?: string | null; buyer_first_name?: string | null; created_at?: string | null } | null
      const photos = await Promise.all(readPhotos(r.photos).map(async (ph) => ({ path: ph.path, url: (await photoViewUrl(db, r, ph).catch(() => null)) ?? ph.url, status: ph.status })))
      return {
        id: r.id,
        product_id: r.product_id,
        rating: Number(r.rating) || 0,
        title: r.title ?? null,
        content: r.content ?? "",
        created_at: r.created_at,
        edited_at: r.edited_at ?? null,
        ...sellerView(r),
        verified: r.verified !== false,
        source: typeof r.source === "string" ? r.source : "storelib",
        featured: r.featured === true,
        photos,
        reviewer_name: r.reviewer_name ?? null,
        seller_reply: r.seller_reply ?? null,
        seller_reply_at: r.seller_reply_at ?? null,
        buyer: one(r.buyer),
        customer: order ? { email: order.buyer_email ?? null, first_name: order.buyer_first_name ?? null, ordered_at: order.created_at ?? null } : null,
        product: p ? { id: p.id, title: p.title || "Untitled product", slug: p.slug, thumbnail_url: p.thumbnail_url } : null,
      }
    }),
  )
  return { rows, total: counts[f.tab] ?? rows.length, page: f.page, pageSize: PAGE_SIZE, counts, ready }
}

/** The store's products for the filter: every one with a review, by name. */
export async function reviewedProducts(db: Db, creatorId: string): Promise<{ id: string; title: string }[]> {
  const { data } = await db.from("products").select("id, title, reviews_count").eq("creator_id", creatorId).neq("status", "deleted").order("title", { ascending: true }).limit(500)
  return ((data ?? []) as { id: string; title: string | null }[]).map((p) => ({ id: p.id, title: p.title || "Untitled product" }))
}

/* ── The overview ──────────────────────────────────────────────────────── */

export interface OverviewAnswer {
  summary: ReviewsSummary
  funnel: RequestFunnel
  recent: { id: string; rating: number; title: string | null; excerpt: string; name: string | null; created_at: string; status: ManagedReview["status"]; verified: boolean; product: string | null }[]
  ready: boolean
}

async function readSummary(db: Db, creatorId: string): Promise<{ summary: ReviewsSummary; ready: boolean }> {
  const base = () => db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  const tab = (t: ReviewTab) => count(applyTab(base(), t))
  const [total, published, pending, hidden, reported, unanswered, verifiedPublished, ...stars] = await Promise.all([
    count(base()),
    tab("published"),
    tab("pending"),
    tab("hidden"),
    tab("reported"),
    tab("unanswered"),
    count(applyTab(base(), "published").eq("verified", true)),
    ...[1, 2, 3, 4, 5].map((n) => count(applyTab(base(), "published").eq("rating", n))),
  ])
  const ready = published !== null
  return {
    ready,
    summary: summaryFromCounts({
      total: total ?? 0,
      published: published ?? 0,
      pending: pending ?? 0,
      hidden: hidden ?? 0,
      reported: reported ?? 0,
      unanswered: unanswered ?? 0,
      verifiedPublished: verifiedPublished ?? 0,
      stars: { 1: stars[0] ?? 0, 2: stars[1] ?? 0, 3: stars[2] ?? 0, 4: stars[3] ?? 0, 5: stars[4] ?? 0 },
    }),
  }
}

/** The request funnel, all time or for [from, to) by when each was sent. */
export async function requestFunnel(db: Db, creatorId: string, range?: { from: string; to: string }): Promise<RequestFunnel> {
  const base = () => {
    let q = db.from("review_requests").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
    if (range) q = q.gte("sent_at", range.from).lt("sent_at", range.to)
    return q
  }
  const [sent, delivered, opened, clicked, submitted, scheduled] = await Promise.all([
    count(base().not("sent_at", "is", null)),
    count(base().not("delivered_at", "is", null)),
    count(base().not("opened_at", "is", null)),
    count(base().not("clicked_at", "is", null)),
    count(base().eq("status", "reviewed")),
    range ? Promise.resolve(0) : count(base().eq("status", "scheduled")),
  ])
  /* Nothing tracked yet reads as unknown, not as zero opened. */
  const tracked = (n: number | null) => (n === null || (n === 0 && (sent ?? 0) > 0) ? null : n)
  return funnelFrom({ sent: sent ?? 0, delivered: tracked(delivered), opened: tracked(opened), clicked: tracked(clicked), submitted: submitted ?? 0, scheduled: scheduled ?? 0 })
}

export function reviewsOverview(db: Db, creatorId: string): Promise<OverviewAnswer> {
  return cached(["reviews-manage-overview", creatorId], reviewsManageTag(creatorId), 60, async () => {
    const [{ summary, ready }, funnel, recentRes] = await Promise.all([
      readSummary(db, creatorId),
      requestFunnel(db, creatorId),
      db.from("reviews").select("id, product_id, rating, title, content, created_at, status, site_status, hidden_by, verified, reviewer_name").eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(6),
    ])
    const rows = (recentRes.data ?? []) as Record<string, any>[]
    const ids = [...new Set(rows.map((r) => r.product_id))]
    const { data: products } = ids.length ? await db.from("products").select("id, title").in("id", ids) : { data: [] }
    const titles = new Map(((products ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title]))
    return {
      summary,
      funnel,
      ready,
      recent: rows.map((r) => ({
        id: r.id,
        rating: Number(r.rating) || 0,
        title: r.title ?? null,
        excerpt: String(r.content ?? "").slice(0, 160),
        name: r.reviewer_name ?? null,
        created_at: r.created_at,
        status: sellerView(r).status,
        verified: r.verified !== false,
        product: titles.get(r.product_id) ?? null,
      })),
    }
  })
}

/* ── Analytics ─────────────────────────────────────────────────────────── */

export const ANALYTICS_ROW_CAP = 20_000

/** Rows written in [from, to), a thousand at a time (PostgREST's page), up to the cap. */
async function statRows(db: Db, creatorId: string, fromIso: string, toIso: string): Promise<{ rows: StatRow[]; capped: boolean }> {
  const rows: StatRow[] = []
  for (let at = 0; at < ANALYTICS_ROW_CAP; at += 1000) {
    let { data, error } = await db.from("reviews").select("rating, status, site_status, verified, created_at").eq("creator_id", creatorId).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: true }).range(at, at + 999)
    if (error && missingColumn(error)) ({ data, error } = await db.from("reviews").select("rating, status, created_at").eq("creator_id", creatorId).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: true }).range(at, at + 999))
    if (error) break
    const page = (data ?? []) as StatRow[]
    rows.push(...page)
    if (page.length < 1000) return { rows, capped: false }
  }
  return { rows, capped: rows.length >= ANALYTICS_ROW_CAP }
}

export async function reviewsAnalytics(db: Db, creatorId: string, fromMs: number, toMs: number) {
  const [prevFrom] = previousPeriod(fromMs, toMs)
  const iso = (ms: number) => new Date(ms).toISOString()
  const [{ rows, capped }, funnel, previousFunnel] = await Promise.all([
    statRows(db, creatorId, iso(prevFrom), iso(toMs)),
    requestFunnel(db, creatorId, { from: iso(fromMs), to: iso(toMs) }),
    requestFunnel(db, creatorId, { from: iso(prevFrom), to: iso(fromMs) }),
  ])
  const inRange = (a: number, b: number) => rows.filter((r) => {
    const t = Date.parse(r.created_at)
    return t >= a && t < b
  })
  const current = inRange(fromMs, toMs)
  const bucket = bucketFor(fromMs, toMs)
  return {
    from: iso(fromMs),
    to: iso(toMs),
    bucket,
    series: reviewSeries(current, fromMs, toMs, bucket),
    current: periodTotals(current),
    previous: periodTotals(inRange(prevFrom, fromMs)),
    funnel,
    previousFunnel,
    capped,
  }
}

/* ── Requests ──────────────────────────────────────────────────────────── */

export const REQUEST_FILTERS = ["all", "scheduled", "sent", "opened", "submitted", "skipped"] as const
export type RequestFilter = (typeof REQUEST_FILTERS)[number]

const REQUEST_COLUMNS = "id, order_id, product_id, email, first_name, status, due_at, sent_at, reminded_at, review_id, skip_reason, created_at"
const REQUEST_TRACKED = `${REQUEST_COLUMNS}, opened_at, clicked_at, delivered_at, manual`

export async function listRequests(db: Db, creatorId: string, opts: { filter: RequestFilter; page: number; q: string }): Promise<{ rows: ManagedRequest[]; total: number; page: number; pageSize: number; tracked: boolean; ready: boolean }> {
  const [from, to] = pageRange(opts.page)
  const read = (columns: string, tracked: boolean) => {
    let q = db.from("review_requests").select(columns, { count: "exact" }).eq("creator_id", creatorId)
    if (opts.filter === "scheduled") q = q.eq("status", "scheduled")
    if (opts.filter === "sent") q = q.in("status", ["sent", "reminded"])
    if (opts.filter === "opened") q = tracked ? q.in("status", ["sent", "reminded"]).not("opened_at", "is", null) : q.eq("status", "__none__")
    if (opts.filter === "submitted") q = q.eq("status", "reviewed")
    if (opts.filter === "skipped") q = q.in("status", ["skipped", "failed"])
    if (opts.q) q = q.ilike("email", `%${opts.q}%`)
    return q.order("created_at", { ascending: false }).range(from, to)
  }
  let tracked = true
  let res = await read(REQUEST_TRACKED, true)
  if (res.error && missingColumn(res.error)) {
    tracked = false
    res = await read(REQUEST_COLUMNS, false)
  }
  if (res.error) return { rows: [], total: 0, page: opts.page, pageSize: PAGE_SIZE, tracked, ready: false }
  const raw = (res.data ?? []) as Record<string, any>[]
  const ids = [...new Set(raw.map((r) => r.product_id).filter(Boolean))]
  const { data: products } = ids.length ? await db.from("products").select("id, title").in("id", ids) : { data: [] }
  const titles = new Map(((products ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title || "Untitled product"]))
  return {
    rows: raw.map((r) => ({
      id: r.id,
      order_id: r.order_id,
      product: r.product_id ? { id: r.product_id, title: titles.get(r.product_id) ?? "Untitled product" } : null,
      email: r.email,
      first_name: r.first_name ?? null,
      shown: requestShown(r),
      skip_reason: r.skip_reason ?? null,
      due_at: r.due_at ?? null,
      sent_at: r.sent_at ?? null,
      reminded_at: r.reminded_at ?? null,
      opened_at: r.opened_at ?? null,
      review_id: r.review_id ?? null,
      manual: r.manual === true,
      created_at: r.created_at,
    })),
    total: res.count ?? raw.length,
    page: opts.page,
    pageSize: PAGE_SIZE,
    tracked,
    ready: true,
  }
}

export interface AskableOrder {
  id: string
  email: string
  first_name: string | null
  product: string | null
  created_at: string
  /** What already happened for it: a request's status, or reviewed. */
  request: string | null
}

/** Recent orders of the store to ask by hand, newest first, found by the buyer's email or name. */
export async function askableOrders(db: Db, creatorId: string, q: string): Promise<AskableOrder[]> {
  let query = db.from("orders").select("id, product_id, buyer_email, buyer_first_name, created_at").eq("creator_id", creatorId).not("product_id", "is", null)
  if (q) query = query.or(`buyer_email.ilike.*${q}*,buyer_first_name.ilike.*${q}*`)
  const { data } = await query.order("created_at", { ascending: false }).limit(30)
  const orders = ((data ?? []) as Record<string, any>[]).filter((o) => typeof o.buyer_email === "string" && o.buyer_email.includes("@"))
  if (!orders.length) return []
  const [{ data: reqs }, { data: products }] = await Promise.all([
    db.from("review_requests").select("order_id, status").in("order_id", orders.map((o) => o.id)),
    db.from("products").select("id, title").in("id", [...new Set(orders.map((o) => o.product_id))]),
  ])
  const status = new Map(((reqs ?? []) as { order_id: string; status: string }[]).map((r) => [r.order_id, r.status]))
  const titles = new Map(((products ?? []) as { id: string; title: string | null }[]).map((p) => [p.id, p.title]))
  return orders.map((o) => ({ id: o.id, email: String(o.buyer_email).toLowerCase(), first_name: o.buyer_first_name ?? null, product: titles.get(o.product_id) ?? null, created_at: o.created_at, request: status.get(o.id) ?? null }))
}

/* ── Imports ───────────────────────────────────────────────────────────── */

export interface ImportRecord {
  id: string
  file_name: string | null
  imported: number
  skipped: number
  undone_at: string | null
  created_at: string
  /** Part 232: the app the file came from, rows already on the store, rows that could not be read, and how many Undo took back. */
  platform?: string
  duplicates?: number
  errors?: number
  undone_count?: number | null
}

export async function listImports(db: Db, creatorId: string): Promise<{ ready: boolean; imports: ImportRecord[] }> {
  /* With part 232: the app each came from, and its duplicates and errors apart from the rest skipped (lib/reviews/import-server). */
  const read = (cols: string) => db.from("review_imports").select(cols).eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(10)
  let res = await read("id, file_name, imported, skipped, undone_at, created_at, platform, duplicates, errors, undone_count")
  if (res.error && ["42703", "PGRST204"].includes(String(res.error.code ?? ""))) res = await read("id, file_name, imported, skipped, undone_at, created_at")
  if (res.error) return { ready: false, imports: [] }
  return { ready: true, imports: (res.data ?? []) as ImportRecord[] }
}

/** An import taken back: its own rows only, which are always unverified and never in a Storelib rating. */
export async function undoImport(db: Db, creatorId: string, importId: string): Promise<{ ok: true; removed: number; productIds: string[] } | { ok: false; status: number; error: string }> {
  const { data: rec } = await db.from("review_imports").select("id, creator_id, undone_at").eq("id", importId).eq("creator_id", creatorId).maybeSingle()
  if (!rec) return { ok: false, status: 404, error: "That import is not there any more." }
  if (rec.undone_at) return { ok: false, status: 409, error: "That import was already undone." }
  const { data: gone, error } = await db.from("reviews").delete().eq("creator_id", creatorId).eq("import_id", importId).eq("source", "import").eq("verified", false).select("id, product_id, photos")
  if (error) return { ok: false, status: 500, error: "It could not be undone. Try again." }
  const rows = (gone ?? []) as { product_id: string; photos?: unknown }[]
  /* The photos the import copied into the store's folder go with their reviews; a photo kept as a link was never stored. */
  const files = rows.flatMap((r) => (Array.isArray(r.photos) ? (r.photos as { path?: unknown }[]) : [])).map((p) => (typeof p?.path === "string" ? p.path : "")).filter((p) => p.startsWith(`${creatorId}/`))
  if (files.length) await removeReviewPhotos(db, files)
  const at = new Date().toISOString()
  const marked = await db.from("review_imports").update({ undone_at: at, undone_count: rows.length }).eq("id", importId).eq("creator_id", creatorId)
  if (marked.error) await db.from("review_imports").update({ undone_at: at }).eq("id", importId).eq("creator_id", creatorId)
  forgetReviewsManage(creatorId)
  return { ok: true, removed: rows.length, productIds: [...new Set(rows.map((r) => r.product_id))] }
}
