/**
 * ===========================================================================
 *  STORELIB REVIEWS, MANAGED: THE RULES THE MANAGEMENT PAGE SHARES
 * ===========================================================================
 * The integration's own page (components/reviews/manage) has Overview,
 * Reviews, Requests, Widgets, Analytics and Settings. Everything it counts,
 * filters and changes is decided here, once, so the list, the counts, the
 * overview, the analytics and the routes cannot disagree:
 *
 *   TABS        where a review stands on the store's website
 *               (app-settings websiteStatus), as database filters
 *   FILTERS     search, rating, product, verified, has photos, dates, sort,
 *               page, read from the address and never trusted
 *   MODERATION  what publish, hide, feature and a photo off or back change,
 *               for one review or many (the trust rules from round F: a
 *               verified buyer's review is Storelib's, so the store's say is
 *               about its website only and it is never deleted by the store)
 *   NUMBERS     the summary from counts, the analytics from rows, the
 *               request funnel, each a pure function
 *
 * Pure: no database client is imported. A route hands its query builder to
 * applyTab / applyFilters.
 */
import { isVerifiedReview, readPhotos, readSiteStatus } from "./app-settings"

/* ── Tabs ──────────────────────────────────────────────────────────────── */

export const REVIEW_TABS = ["all", "published", "pending", "hidden", "reported", "unanswered"] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]

export const PAGE_SIZE = 25
export const MAX_SEARCH = 80

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest"

export interface ReviewListQuery {
  tab: ReviewTab
  q: string
  rating: number
  product: string
  verified: "any" | "yes" | "no"
  source: "any" | "import"
  media: boolean
  from: string
  to: string
  sort: ReviewSort
  page: number
  /** One review by its id (a link from the bell or an email), whatever the other filters say. */
  id: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A search as a PostgREST filter can carry it: no commas, brackets, quotes, wildcards or backslashes. */
export function cleanSearch(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .replace(/[,()*%\\"':;]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH)
}

export function isDay(v: unknown): v is string {
  return typeof v === "string" && DAY.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`))
}

type Params = URLSearchParams | Record<string, string | string[] | undefined | null>
function param(p: Params, key: string): string {
  if (p instanceof URLSearchParams) return p.get(key) ?? ""
  const v = p[key]
  return Array.isArray(v) ? v[0] ?? "" : typeof v === "string" ? v : ""
}

/** The list's query from an address, every value checked. */
export function readListQuery(p: Params): ReviewListQuery {
  const tab = param(p, "tab")
  const rating = Number(param(p, "rating"))
  const product = param(p, "product")
  const verified = param(p, "verified")
  const sort = param(p, "sort")
  const page = Math.floor(Number(param(p, "page")))
  const from = param(p, "from")
  const to = param(p, "to")
  return {
    tab: (REVIEW_TABS as readonly string[]).includes(tab) ? (tab as ReviewTab) : "all",
    q: cleanSearch(param(p, "q")),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
    product: UUID.test(product) ? product.toLowerCase() : "",
    verified: verified === "yes" || verified === "no" ? verified : "any",
    source: param(p, "source") === "import" ? "import" : "any",
    media: param(p, "media") === "1",
    from: isDay(from) ? from : "",
    to: isDay(to) ? to : "",
    sort: sort === "oldest" || sort === "highest" || sort === "lowest" ? sort : "newest",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
    id: UUID.test(param(p, "id")) ? param(p, "id").toLowerCase() : "",
  }
}

/** The query back as an address, only what differs from the default. */
export function listQueryString(q: Partial<ReviewListQuery>): string {
  const out = new URLSearchParams()
  if (q.tab && q.tab !== "all") out.set("tab", q.tab)
  if (q.q) out.set("q", q.q)
  if (q.rating) out.set("rating", String(q.rating))
  if (q.product) out.set("product", q.product)
  if (q.verified && q.verified !== "any") out.set("verified", q.verified)
  if (q.source === "import") out.set("source", "import")
  if (q.media) out.set("media", "1")
  if (q.from) out.set("from", q.from)
  if (q.to) out.set("to", q.to)
  if (q.sort && q.sort !== "newest") out.set("sort", q.sort)
  if (q.page && q.page > 1) out.set("page", String(q.page))
  if (q.id) out.set("id", q.id)
  return out.toString()
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Builder = any

/**
 * WHERE A REVIEW STANDS, AS FILTERS. Read against `status` (Storelib's) and
 * `site_status` (the store's website's), as websiteStatus decides it:
 *
 *   published    live on the website: published and shown there
 *   pending      waiting for the store: pending anywhere, never hidden
 *   hidden       hidden by the store: an unverified one it hid, or a
 *                verified buyer's it took off its website (still on Storelib)
 *   reported     hidden by a report or by Storelib: Storelib's to bring back
 *   unanswered   not hidden and no reply yet
 */
export function applyTab(q: Builder, tab: ReviewTab): Builder {
  switch (tab) {
    case "published":
      return q.eq("status", "published").eq("site_status", "shown")
    case "pending":
      return q.neq("status", "hidden").or("status.eq.pending,site_status.eq.pending")
    case "hidden":
      return q.or("and(status.eq.hidden,hidden_by.eq.seller),and(status.eq.published,site_status.eq.hidden)")
    case "reported":
      return q.eq("status", "hidden").or("hidden_by.is.null,hidden_by.neq.seller")
    case "unanswered":
      return q.neq("status", "hidden").is("seller_reply", null)
    default:
      return q
  }
}

/** The day after a YYYY-MM-DD, as the end of a date filter (exclusive). */
export function dayAfter(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString()
}

/**
 * Every filter but the tab. `productMatches` are the store's products whose
 * title matches the search, so a search for "apron" finds reviews of the
 * Linen apron as well as reviews that say "apron".
 */
export function applyFilters(q: Builder, f: ReviewListQuery, productMatches: string[] = []): Builder {
  if (f.id) return q.eq("id", f.id)
  if (f.rating) q = q.eq("rating", f.rating)
  if (f.product) q = q.eq("product_id", f.product)
  if (f.verified === "yes") q = q.eq("verified", true)
  if (f.verified === "no") q = q.eq("verified", false)
  if (f.source === "import") q = q.eq("source", "import")
  if (f.media) q = q.neq("photos", "[]")
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00.000Z`)
  if (f.to) q = q.lt("created_at", dayAfter(f.to))
  if (f.q) {
    const like = `*${f.q}*`
    const terms = [`content.ilike.${like}`, `title.ilike.${like}`, `reviewer_name.ilike.${like}`]
    const ids = productMatches.filter((id) => UUID.test(id)).slice(0, 100)
    if (ids.length) terms.push(`product_id.in.(${ids.join(",")})`)
    q = q.or(terms.join(","))
  }
  return q
}

export function applySort(q: Builder, sort: ReviewSort): Builder {
  if (sort === "oldest") return q.order("created_at", { ascending: true })
  if (sort === "highest") return q.order("rating", { ascending: false }).order("created_at", { ascending: false })
  if (sort === "lowest") return q.order("rating", { ascending: true }).order("created_at", { ascending: false })
  return q.order("created_at", { ascending: false })
}

/** The page's rows as PostgREST's range: [from, to], inclusive. */
export function pageRange(page: number, size = PAGE_SIZE): [number, number] {
  const p = Math.max(1, Math.floor(page))
  return [(p - 1) * size, p * size - 1]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ── Moderation ────────────────────────────────────────────────────────── */

export const MODERATIONS = ["publish", "hide", "feature", "unfeature", "remove_photo", "restore_photo"] as const
export type Moderation = (typeof MODERATIONS)[number]
export const BULK_ACTIONS = ["publish", "hide", "feature", "unfeature"] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]
export const MAX_BULK = 100

export const isModeration = (v: unknown): v is Moderation => typeof v === "string" && (MODERATIONS as readonly string[]).includes(v)
export const isBulkAction = (v: unknown): v is BulkAction => typeof v === "string" && (BULK_ACTIONS as readonly string[]).includes(v)

export interface ModeratedRow {
  id: string
  status?: string | null
  site_status?: string | null
  hidden_by?: string | null
  verified?: unknown
  featured?: unknown
  photos?: unknown
}

export type ModerationPlan =
  | { kind: "change"; change: Record<string, unknown> }
  | { kind: "same"; review: Record<string, unknown> }
  | { kind: "refused"; status: number; error: string }

export const REPORTED_ERROR = "Storelib is looking at the report on this review. It comes back if Storelib restores it."

/**
 * WHAT ONE ACTION CHANGES ON ONE REVIEW. The trust rules from round F:
 *
 *   publish  a pending review goes live, or one the store hid comes back.
 *            One a report hid stays where Storelib put it.
 *   hide     a verified buyer's: off the store's website only, still on
 *            Storelib and in its ratings. Unverified: off everywhere, kept.
 *   feature  first in Featured order and in the carousel
 *   photo    one photo off or back; the review stays
 *
 * A verified review's Storelib `status` is only touched to undo a store's
 * own wait or hide from before that rule.
 */
export function planModeration(review: ModeratedRow, action: Moderation, photo?: unknown, now = new Date().toISOString()): ModerationPlan {
  const verified = isVerifiedReview(review)
  const reported = review.status === "hidden" && review.hidden_by !== "seller"
  const backToStorelib = { status: "published", hidden_by: null, hidden_at: null, hidden_reason: null, published_at: now }
  switch (action) {
    case "publish":
      if (reported) return { kind: "refused", status: 409, error: REPORTED_ERROR }
      return { kind: "change", change: verified ? { site_status: "shown", ...(review.status === "published" ? {} : backToStorelib) } : backToStorelib }
    case "hide":
      if (verified) {
        if (reported) return { kind: "same", review: { id: review.id, status: "hidden", hidden_by: review.hidden_by ?? null, site_status: readSiteStatus(review.site_status), verified } }
        return { kind: "change", change: { site_status: "hidden", ...(review.status === "published" ? {} : backToStorelib) } }
      }
      if (review.status === "hidden") return { kind: "same", review: { id: review.id, status: "hidden", hidden_by: review.hidden_by ?? null, verified } }
      return { kind: "change", change: { status: "hidden", hidden_by: "seller", hidden_at: now, hidden_reason: "seller" } }
    case "feature":
      return { kind: "change", change: { featured: true } }
    case "unfeature":
      return { kind: "change", change: { featured: false } }
    case "remove_photo":
    case "restore_photo": {
      const photos = readPhotos(review.photos)
      const path = typeof photo === "string" ? photo : ""
      if (!photos.some((p) => p.path === path)) return { kind: "refused", status: 404, error: "That photo is not on this review." }
      return { kind: "change", change: { photos: photos.map((p) => (p.path === path ? { ...p, status: action === "remove_photo" ? "removed" : "approved" } : p)) } }
    }
  }
}

/** Ids for a bulk action: unique uuids, at most MAX_BULK. Null when there are none, or too many. */
export function readBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((v): v is string => typeof v === "string" && UUID.test(v)).map((v) => v.toLowerCase()))]
  if (ids.length === 0 || ids.length > MAX_BULK) return null
  return ids
}

/* ── Numbers ───────────────────────────────────────────────────────────── */

export interface ReviewsSummary {
  /** Every review of the store, whatever its status. */
  total: number
  /** Live on the website (published and shown there). */
  published: number
  pending: number
  hidden: number
  reported: number
  unanswered: number
  /** Of the published ones: a verified buyer's. */
  verifiedPublished: number
  /** Published ones by stars, 5 first. */
  distribution: { stars: number; count: number }[]
  /** Of the published ones, to one decimal. 0 with none. */
  average: number
}

/** The summary from counts: the average from the five star counts, so it is exact without reading a row. */
export function summaryFromCounts(c: { total: number; published: number; pending: number; hidden: number; reported: number; unanswered: number; verifiedPublished: number; stars: Record<number, number> }): ReviewsSummary {
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: Math.max(0, c.stars[stars] ?? 0) }))
  const n = distribution.reduce((a, b) => a + b.count, 0)
  const sum = distribution.reduce((a, b) => a + b.stars * b.count, 0)
  return {
    total: c.total,
    published: c.published,
    pending: c.pending,
    hidden: c.hidden,
    reported: c.reported,
    unanswered: c.unanswered,
    verifiedPublished: c.verifiedPublished,
    distribution,
    average: n ? Math.round((sum / n) * 10) / 10 : 0,
  }
}

export interface RequestFunnel {
  sent: number
  /** Null when the database cannot say (before part 215, or the provider never reported). */
  delivered: number | null
  opened: number | null
  clicked: number | null
  submitted: number
  scheduled: number
  /** Submitted over sent, 0 to 100. */
  responseRate: number
}

export function funnelFrom(c: { sent: number; delivered: number | null; opened: number | null; clicked: number | null; submitted: number; scheduled: number }): RequestFunnel {
  return { ...c, responseRate: c.sent > 0 ? Math.round((Math.min(c.submitted, c.sent) / c.sent) * 1000) / 10 : 0 }
}

/** One review as the analytics read it. */
export interface StatRow {
  rating: number
  status?: string | null
  site_status?: string | null
  verified?: unknown
  created_at: string
}

export type Bucket = "day" | "week" | "month"

/** A bucket that keeps a chart readable: days up to two months, weeks up to a year, then months. */
export function bucketFor(fromMs: number, toMs: number): Bucket {
  const days = (toMs - fromMs) / 86_400_000
  return days <= 62 ? "day" : days <= 366 ? "week" : "month"
}

/** The start of the bucket a moment is in, UTC, as YYYY-MM-DD. Weeks start on Monday. */
export function bucketKey(ms: number, bucket: Bucket): string {
  const d = new Date(ms)
  if (bucket === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
  if (bucket === "week") {
    const dow = (d.getUTCDay() + 6) % 7
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

function nextBucket(key: string, bucket: Bucket): string {
  const t = Date.parse(`${key}T00:00:00Z`)
  const d = new Date(t)
  if (bucket === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
  return new Date(t + (bucket === "week" ? 7 : 1) * 86_400_000).toISOString().slice(0, 10)
}

const live = (r: StatRow) => r.status === "published" && readSiteStatus(r.site_status) === "shown"

export interface PeriodTotals {
  received: number
  published: number
  average: number
  verified: number
  /** Verified over received, 0 to 100. */
  verifiedShare: number
  distribution: { stars: number; count: number }[]
}

/** What a period adds up to. Received is every review written in it; the average and the stars are the published ones'. */
export function periodTotals(rows: readonly StatRow[]): PeriodTotals {
  const pub = rows.filter(live)
  const distribution = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: pub.filter((r) => r.rating === stars).length }))
  const verified = rows.filter((r) => isVerifiedReview(r)).length
  return {
    received: rows.length,
    published: pub.length,
    average: pub.length ? Math.round((pub.reduce((a, r) => a + r.rating, 0) / pub.length) * 10) / 10 : 0,
    verified,
    verifiedShare: rows.length ? Math.round((verified / rows.length) * 1000) / 10 : 0,
    distribution,
  }
}

export interface SeriesPoint {
  key: string
  received: number
  /** Average of the published ones written in the bucket, null with none. */
  average: number | null
  verified: number
}

/** Reviews written per bucket from `from` up to `to`, every bucket present, empty ones as zero. */
export function reviewSeries(rows: readonly StatRow[], fromMs: number, toMs: number, bucket: Bucket = bucketFor(fromMs, toMs)): SeriesPoint[] {
  const out = new Map<string, { received: number; sum: number; n: number; verified: number }>()
  const last = bucketKey(toMs - 1, bucket)
  for (let k = bucketKey(fromMs, bucket), guard = 0; k <= last && guard < 800; k = nextBucket(k, bucket), guard++) out.set(k, { received: 0, sum: 0, n: 0, verified: 0 })
  for (const r of rows) {
    const t = Date.parse(r.created_at)
    if (!Number.isFinite(t) || t < fromMs || t >= toMs) continue
    const b = out.get(bucketKey(t, bucket))
    if (!b) continue
    b.received++
    if (isVerifiedReview(r)) b.verified++
    if (live(r)) {
      b.sum += r.rating
      b.n++
    }
  }
  return [...out.entries()].map(([key, b]) => ({ key, received: b.received, average: b.n ? Math.round((b.sum / b.n) * 10) / 10 : null, verified: b.verified }))
}

/** The period before one of the same length, for the comparison. */
export function previousPeriod(fromMs: number, toMs: number): [number, number] {
  return [fromMs - (toMs - fromMs), fromMs]
}

/** Change from `before` to `now` in percent, null when there was nothing before. */
export function changePercent(now: number, before: number): number | null {
  if (!before) return null
  return Math.round(((now - before) / before) * 1000) / 10
}

/* ── Requests ──────────────────────────────────────────────────────────── */

export type RequestShown = "scheduled" | "sent" | "opened" | "reminded" | "submitted" | "skipped" | "failed"

/** One request row as the list shows it: the stored status, with "opened" when the provider said so and it is still waiting. */
export function requestShown(row: { status?: string | null; opened_at?: string | null; clicked_at?: string | null; review_id?: string | null }): RequestShown {
  if (row.status === "reviewed" || row.review_id) return "submitted"
  if (row.status === "skipped") return "skipped"
  if (row.status === "failed") return "failed"
  if (row.status === "scheduled") return "scheduled"
  if (row.opened_at || row.clicked_at) return "opened"
  return row.status === "reminded" ? "reminded" : "sent"
}

/** Why a request was not sent, in a store's words. */
export const SKIP_WORDS: Record<string, string> = {
  no_order: "The order is gone",
  not_open: "Refunded, failed or disputed",
  before_app: "Bought before the app was on",
  test_sale: "A test sale",
  reviewed: "Already reviewed",
  own_order: "Your own order",
  no_product: "The product was deleted",
  unsubscribed: "They turned review emails off",
  too_late: "Too long after it was due",
  send_failed: "The email could not be sent",
  reminder_failed: "The reminder could not be sent",
  asked_recently: "Asked in the last 7 days",
  done: "Already finished",
  app_off: "Storelib Reviews is off",
}

/* ── What the page is handed ───────────────────────────────────────────── */

export interface ManagedPhoto {
  path: string
  /** Public when the review is live on the website; a short signed address otherwise, so the store sees it before it approves. */
  url: string
  status: "approved" | "removed"
}

/** One review as the Reviews tab lists it. */
export interface ManagedReview {
  id: string
  product_id: string
  rating: number
  title: string | null
  content: string
  created_at: string
  edited_at: string | null
  /** On the store's website (app-settings sellerView). */
  status: "published" | "pending" | "hidden"
  hidden_by: string | null
  /** Shown on Explore and the product page. */
  on_storelib: boolean
  verified: boolean
  source: string
  featured: boolean
  photos: ManagedPhoto[]
  reviewer_name: string | null
  seller_reply: string | null
  seller_reply_at: string | null
  buyer: { display_name: string | null; avatar_url: string | null } | null
  /** The buyer as the store knows them from the order: never shown in public. */
  customer: { email: string | null; first_name: string | null; ordered_at: string | null } | null
  product: { id: string; title: string; slug: string | null; thumbnail_url: string | null } | null
}

export type TabCounts = Record<ReviewTab, number>

export interface ReviewListAnswer {
  rows: ManagedReview[]
  total: number
  page: number
  pageSize: number
  counts: TabCounts
  /** Storelib Reviews' columns are there (part 134). */
  ready: boolean
}

/** A request as the Requests tab lists it. */
export interface ManagedRequest {
  id: string
  order_id: string
  product: { id: string; title: string } | null
  email: string
  first_name: string | null
  shown: RequestShown
  skip_reason: string | null
  due_at: string | null
  sent_at: string | null
  reminded_at: string | null
  opened_at: string | null
  review_id: string | null
  manual: boolean
  created_at: string
}
