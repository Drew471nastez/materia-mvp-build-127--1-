import "server-only"

/**
 * ===========================================================================
 *  REVIEWS IN THE APP: WHAT EACH TAB READS
 * ===========================================================================
 * The store's reviews read with the server's key and filtered by the
 * creator the caller is (the public policy shows published reviews only,
 * and a store needs to see the ones waiting and the ones it hid).
 *
 *   listReviews     Reviews: one page of a tab, filtered in the database
 *                   (lib/reviews/dashboard.ts says what each tab is), with
 *                   every tab's count under the same filters
 *   loadOverview    Overview: the numbers and what happened lately
 *   loadAnalytics   Analytics: the reviews and request emails of a period
 *                   and the one before it, for lib/reviews/analytics.ts
 *   listRequests    Requests: the request emails, newest first
 *
 * Every number is counted by the database (a head count), never from a page
 * of rows, so a store with more reviews than one read returns gets the
 * right ones. Before run-now part 134 the table has no site_status, and the
 * list falls back to reading the newest 500 and filtering them here, with
 * the same rules.
 */
import { missingColumn } from "./store"
import { readPhotos, sellerView, type ReviewPhoto } from "./app-settings"
import { withViewUrls } from "./photos-server"
import { MAX_IMPORT_ROWS } from "./import-csv"
import { NO_FILTERS, PAGE_SIZE, REVIEW_TABS, inTab, matchesFilters, pageOf, tabCounts, type ReviewFilters, type ReviewTab } from "./dashboard"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface SellerReview {
  id: string
  product_id: string
  rating: number
  content: string
  created_at: string
  edited_at: string | null
  /* On the store's website (app-settings sellerView): pending waits for the store; hidden was hidden by the store or a report (hidden_by). */
  status: "published" | "hidden" | "pending"
  hidden_by: string | null
  /* Shown on Explore and the product page. A verified buyer's review stays there whatever the store does on its website. */
  on_storelib: boolean
  title: string | null
  /** `view`: where the store's list shows it (photos-server withViewUrls), signed while it is not public. */
  photos: (ReviewPhoto & { view?: string })[]
  featured: boolean
  verified: boolean
  source: string
  reviewer_name: string | null
  seller_reply: string | null
  seller_reply_at: string | null
  /** What the list's tabs and actions read again after a change (dashboard bucketOf). */
  site_status: string | null
  /** The order a verified review came with, for "Verified purchase" with its date. */
  order_id: string | null
  buyer: { display_name: string | null; avatar_url: string | null } | null
}

export interface SellerProduct {
  id: string
  title: string
  slug: string | null
  thumbnail_url: string | null
}

const BUYER = "buyer:profiles!buyer_id(display_name, avatar_url)"
const FULL = `id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, title, photos, featured, verified, source, hidden_by, site_status, order_id, ${BUYER}`
const PART_52 = `id, product_id, rating, content, created_at, edited_at, status, reviewer_name, seller_reply, seller_reply_at, order_id, ${BUYER}`
const OLDEST = `id, product_id, rating, content, created_at, order_id, ${BUYER}`

export function toSellerReview(r: Record<string, any>): SellerReview {
  return {
    id: r.id,
    product_id: r.product_id,
    rating: Number(r.rating) || 0,
    content: r.content ?? "",
    created_at: r.created_at,
    edited_at: r.edited_at ?? null,
    ...sellerView(r),
    title: r.title ?? null,
    photos: readPhotos(r.photos),
    featured: r.featured === true,
    verified: r.verified !== false,
    source: typeof r.source === "string" ? r.source : "storelib",
    reviewer_name: r.reviewer_name ?? null,
    seller_reply: r.seller_reply ?? null,
    seller_reply_at: r.seller_reply_at ?? null,
    site_status: typeof r.site_status === "string" ? r.site_status : null,
    order_id: r.order_id ?? null,
    buyer: (Array.isArray(r.buyer) ? r.buyer[0] : r.buyer) ?? null,
  }
}

/** The store's products, by title, for the product filter, the import and every row's product line. */
export async function storeProducts(db: Db, creatorId: string): Promise<SellerProduct[]> {
  const { data } = await db.from("products").select("id, title, slug, thumbnail_url, status").eq("creator_id", creatorId).neq("status", "deleted").order("title", { ascending: true }).limit(1000)
  return ((data ?? []) as (SellerProduct & { status?: string })[]).map(({ id, title, slug, thumbnail_url }) => ({ id, title: title || "", slug: slug ?? null, thumbnail_url: thumbnail_url ?? null }))
}

/** A tab as PostgREST filters, or the or-group it needs (dashboard inTab, the same rule). */
function tabFilter(tab: ReviewTab): { eq: [string, string][]; isNull: string[]; or: string | null } {
  switch (tab) {
    case "published":
      return { eq: [["status", "published"], ["site_status", "shown"]], isNull: [], or: null }
    case "unanswered":
      return { eq: [["status", "published"], ["site_status", "shown"]], isNull: ["seller_reply"], or: null }
    case "pending":
      return { eq: [], isNull: [], or: "status.eq.pending,and(status.eq.published,site_status.eq.pending)" }
    case "rejected":
      return { eq: [], isNull: [], or: "and(status.eq.hidden,hidden_by.eq.seller),and(status.eq.published,site_status.eq.hidden)" }
    case "reported":
      return { eq: [["status", "hidden"]], isNull: [], or: "hidden_by.is.null,hidden_by.neq.seller" }
    default:
      return { eq: [], isNull: [], or: null }
  }
}

/** Every filter on one query. Two or-groups go in one `and(...)` so PostgREST reads them as both. */
function filtered(q: any, f: ReviewFilters, tab: ReviewTab, searchOr: string | null) {
  const t = tabFilter(tab)
  for (const [c, v] of t.eq) q = q.eq(c, v)
  for (const c of t.isNull) q = q.is(c, null)
  const groups = [t.or, searchOr].filter((g): g is string => !!g)
  if (groups.length === 1) q = q.or(groups[0])
  else if (groups.length > 1) q = q.or(`and(${groups.map((g) => `or(${g})`).join(",")})`)
  if (f.rating) q = q.eq("rating", f.rating)
  if (f.product) q = q.eq("product_id", f.product)
  if (f.verified === "yes") q = q.neq("verified", false)
  if (f.verified === "no") q = q.eq("verified", false)
  if (f.media === "yes") q = q.neq("photos", "[]")
  return q
}

function searchGroup(q: string, products: SellerProduct[]): string | null {
  if (!q) return null
  const like = `%${q}%`
  const ids = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 50).map((p) => p.id)
  return [`content.ilike.${like}`, `title.ilike.${like}`, `reviewer_name.ilike.${like}`, ...(ids.length ? [`product_id.in.(${ids.join(",")})`] : [])].join(",")
}

export interface ReviewList {
  rows: SellerReview[]
  total: number
  page: number
  pages: number
  counts: Record<ReviewTab, number>
  /** Replies and reports work (part 52); moderation, photos and import work (part 134). */
  ready: { replies: boolean; app: boolean }
}

export async function listReviews(db: Db, creatorId: string, f: ReviewFilters = NO_FILTERS, products?: SellerProduct[]): Promise<ReviewList> {
  const list = products ?? (await storeProducts(db, creatorId))
  const searchOr = searchGroup(f.q, list)
  const base = (columns: string, opts?: { count: "exact"; head?: boolean }) => db.from("reviews").select(columns, opts).eq("creator_id", creatorId)
  const from = (Math.max(1, f.page) - 1) * PAGE_SIZE
  const page = await filtered(base(FULL, { count: "exact" }), f, f.tab, searchOr).order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1)
  if (!page.error) {
    const counts = Object.fromEntries(
      await Promise.all(
        REVIEW_TABS.map(async (t) => {
          const r = await filtered(base("id", { count: "exact", head: true }), f, t, searchOr)
          return [t, r.error ? 0 : (r.count ?? 0)] as const
        }),
      ),
    ) as Record<ReviewTab, number>
    const total = page.count ?? counts[f.tab] ?? 0
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    /* A page past the end (a filter narrowed the list): the last page instead. */
    if (f.page > pages && total > 0) return listReviews(db, creatorId, { ...f, page: pages }, list)
    const rows = await withViewUrls(db, ((page.data ?? []) as Record<string, any>[]).map(toSellerReview))
    return { rows, total, page: Math.min(f.page, pages), pages, counts, ready: { replies: true, app: true } }
  }
  /* Before part 134 (no site_status), or 52 (no status): the newest 500, filtered here by the same rules. */
  if (!missingColumn(page.error)) return { rows: [], total: 0, page: 1, pages: 1, counts: tabCounts([]), ready: { replies: true, app: true } }
  let res = await base(PART_52).order("created_at", { ascending: false }).limit(500)
  const replies = !(res.error && missingColumn(res.error))
  if (!replies) res = await base(OLDEST).order("created_at", { ascending: false }).limit(500)
  const all = ((res.data ?? []) as Record<string, any>[]).map(toSellerReview)
  const titles = new Map(list.map((p) => [p.id, p.title]))
  const matching = all.filter((r) => matchesFilters(r, f, (id) => titles.get(id) ?? ""))
  const shown = pageOf(matching.filter((r) => inTab(r, f.tab)), f.page)
  return { rows: shown.rows, total: shown.total, page: shown.page, pages: shown.pages, counts: tabCounts(matching), ready: { replies, app: false } }
}

/* ── Overview ───────────────────────────────────────────────────────── */

export interface OverviewData {
  /** What the website's review sections show: published there. */
  website: { count: number; average: number; stars: Record<1 | 2 | 3 | 4 | 5, number> }
  /** Storelib's own rating (verified buyers only), as Explore and the product page show it. */
  storelib: { count: number; average: number }
  total: number
  pending: number
  rejected: number
  reported: number
  unanswered: number
  requests: { sent: number; reviewed: number; scheduled: number } | null
  recentReviews: SellerReview[]
  recentRequests: { id: string; product_id: string | null; sent_at: string | null; reminded_at: string | null; first_name: string | null }[]
}

/* Named apart, so a check that reads the selects after `.from("reviews")` (tests/review-columns) reads only the reviews table's. */
const RECENT_REQUEST_COLUMNS = "id, product_id, sent_at, reminded_at, first_name"
const CREATOR_RATING_COLUMNS = "reviews_count, reviews_average"

export async function loadOverview(db: Db, creatorId: string): Promise<OverviewData> {
  const head = () => db.from("reviews").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
  const count = async (q: any) => {
    const r = await q
    return r.error ? null : (r.count ?? 0)
  }
  const tab = (t: ReviewTab) => count(filtered(head(), NO_FILTERS, t, null))
  const [total, published, pending, rejected, reported, unanswered, ...stars] = await Promise.all([
    count(head()),
    tab("published"),
    tab("pending"),
    tab("rejected"),
    tab("reported"),
    tab("unanswered"),
    ...[1, 2, 3, 4, 5].map((n) => count(filtered(head(), NO_FILTERS, "published", null).eq("rating", n))),
  ])
  const requestCount = (statuses: string[] | null, sent: boolean) => {
    let q = db.from("review_requests").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
    if (statuses) q = q.in("status", statuses)
    if (sent) q = q.not("sent_at", "is", null)
    return count(q)
  }
  const [sent, reviewed, scheduled, recent, recentRequests, creator] = await Promise.all([
    requestCount(null, true),
    requestCount(["reviewed"], true),
    requestCount(["scheduled"], false),
    db.from("reviews").select(FULL).eq("creator_id", creatorId).order("created_at", { ascending: false }).limit(8),
    db.from("review_requests").select(RECENT_REQUEST_COLUMNS).eq("creator_id", creatorId).not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(8),
    db.from("creators").select(CREATOR_RATING_COLUMNS).eq("id", creatorId).maybeSingle(),
  ])
  const starCounts = { 1: stars[0] ?? 0, 2: stars[1] ?? 0, 3: stars[2] ?? 0, 4: stars[3] ?? 0, 5: stars[4] ?? 0 } as Record<1 | 2 | 3 | 4 | 5, number>
  const shown = Object.values(starCounts).reduce((a, b) => a + b, 0)
  const sum = ([1, 2, 3, 4, 5] as const).reduce((a, n) => a + n * starCounts[n], 0)
  /* Before part 134 the tab counts cannot be asked: what the table holds, every one of them published. */
  const fallback = published === null
  const c = (creator.data ?? {}) as { reviews_count?: number | null; reviews_average?: number | null }
  return {
    website: { count: fallback ? (total ?? 0) : shown, average: shown ? Math.round((sum / shown) * 10) / 10 : 0, stars: starCounts },
    storelib: { count: Number(c.reviews_count) || 0, average: Number(c.reviews_average) || 0 },
    total: total ?? 0,
    pending: pending ?? 0,
    rejected: rejected ?? 0,
    reported: reported ?? 0,
    unanswered: unanswered ?? 0,
    requests: sent === null ? null : { sent, reviewed: reviewed ?? 0, scheduled: scheduled ?? 0 },
    recentReviews: recent.error ? [] : ((recent.data ?? []) as Record<string, any>[]).map(toSellerReview),
    recentRequests: recentRequests.error ? [] : (recentRequests.data ?? []),
  }
}

/* ── Analytics ──────────────────────────────────────────────────────── */

export interface AnalyticsRows {
  reviews: { created_at: string; rating: number; verified: boolean; media: boolean }[]
  requests: { status: string; skip_reason: string | null; sent_at: string | null; reminded_at: string | null; due_at: string | null; updated_at: string | null }[]
  /** More rows than one read takes: the numbers count the first ones. */
  capped: boolean
}

const PAGE = 1000
const MAX_PAGES = 20

/** Every row of a query in pages of a thousand (PostgREST's own cap), up to twenty thousand. */
async function allRows(make: (from: number, to: number) => any): Promise<{ rows: any[]; capped: boolean; error: unknown }> {
  const rows: any[] = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await make(i * PAGE, i * PAGE + PAGE - 1)
    if (error) return { rows, capped: false, error }
    rows.push(...(data ?? []))
    if ((data ?? []).length < PAGE) return { rows, capped: false, error: null }
  }
  return { rows, capped: true, error: null }
}

/** The reviews written and the request emails of [from, to), ISO dates. */
export async function loadAnalytics(db: Db, creatorId: string, fromIso: string, toIso: string): Promise<AnalyticsRows> {
  const reviews = await allRows((a, b) => db.from("reviews").select("created_at, rating, verified, photos").eq("creator_id", creatorId).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: true }).range(a, b))
  const old = reviews.error && missingColumn(reviews.error as never) ? await allRows((a, b) => db.from("reviews").select("created_at, rating").eq("creator_id", creatorId).gte("created_at", fromIso).lt("created_at", toIso).order("created_at", { ascending: true }).range(a, b)) : reviews
  /* A request belongs to the period it was due in: sent, failed or skipped then. */
  const requests = await allRows((a, b) => db.from("review_requests").select("status, skip_reason, sent_at, reminded_at, due_at, updated_at").eq("creator_id", creatorId).gte("due_at", fromIso).lt("due_at", toIso).order("due_at", { ascending: true }).range(a, b))
  return {
    reviews: old.rows.map((r: any) => ({ created_at: r.created_at, rating: Number(r.rating) || 0, verified: r.verified !== false, media: readPhotos(r.photos).length > 0 })),
    requests: requests.error ? [] : requests.rows,
    capped: old.capped || requests.capped,
  }
}

/* ── Requests ───────────────────────────────────────────────────────── */

export const REQUEST_FILTERS = ["all", "scheduled", "sent", "reviewed", "stopped"] as const
export type RequestFilter = (typeof REQUEST_FILTERS)[number]

export interface RequestRow {
  id: string
  order_id: string
  product_id: string | null
  email: string
  first_name: string | null
  status: string
  skip_reason: string | null
  due_at: string
  sent_at: string | null
  reminded_at: string | null
  last_sent_at: string | null
  review_id: string | null
  created_at: string
}

export interface RequestList {
  rows: RequestRow[]
  total: number
  page: number
  pages: number
  counts: Record<RequestFilter, number>
  /** The table is there (part 134). */
  ready: boolean
}

function requestFiltered(q: any, filter: RequestFilter, search: string) {
  if (filter === "scheduled") q = q.eq("status", "scheduled")
  if (filter === "sent") q = q.in("status", ["sent", "reminded"])
  if (filter === "reviewed") q = q.eq("status", "reviewed")
  if (filter === "stopped") q = q.in("status", ["skipped", "failed"])
  if (search) q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%`)
  return q
}

export const REQUEST_PAGE_SIZE = 25

export async function listRequests(db: Db, creatorId: string, filter: RequestFilter = "all", page = 1, search = ""): Promise<RequestList> {
  const base = (columns: string, opts?: Record<string, unknown>) => db.from("review_requests").select(columns, opts).eq("creator_id", creatorId)
  const from = (Math.max(1, page) - 1) * REQUEST_PAGE_SIZE
  /* Newest first by when it was due: a scheduled one is at the top while it waits. */
  const res = await requestFiltered(base("id, order_id, product_id, email, first_name, status, skip_reason, due_at, sent_at, reminded_at, last_sent_at, review_id, created_at", { count: "exact" }), filter, search)
    .order("due_at", { ascending: false })
    .range(from, from + REQUEST_PAGE_SIZE - 1)
  if (res.error) return { rows: [], total: 0, page: 1, pages: 1, counts: Object.fromEntries(REQUEST_FILTERS.map((f) => [f, 0])) as Record<RequestFilter, number>, ready: false }
  const counts = Object.fromEntries(
    await Promise.all(
      REQUEST_FILTERS.map(async (f) => {
        const r = await requestFiltered(base("id", { count: "exact", head: true }), f, search)
        return [f, r.error ? 0 : (r.count ?? 0)] as const
      }),
    ),
  ) as Record<RequestFilter, number>
  const total = res.count ?? 0
  return { rows: (res.data ?? []) as RequestRow[], total, page: Math.max(1, page), pages: Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE)), counts, ready: true }
}

/** The import's limit, for the page to say. */
export const IMPORT_ROW_LIMIT = MAX_IMPORT_ROWS
