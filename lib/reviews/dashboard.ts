/**
 * ===========================================================================
 *  REVIEWS IN THE APP: THE LIST'S TABS AND FILTERS, AND WHAT A STORE'S
 *  ACTIONS DO TO A REVIEW
 * ===========================================================================
 * Reviews › Reviews (app/app/reviews/list) reads through these, and so do
 * its routes and the tests, so a tab's count, the rows under it and what an
 * action is allowed to do are one rule.
 *
 * THE TABS, as the store's website sees each review (app-settings
 * sellerView, which already knows that a verified buyer's review stays on
 * Storelib whatever the store does on its own website):
 *
 *   published    shown on the website
 *   pending      waiting for the store's approval
 *   rejected     hidden by the store (kept: it can be published again)
 *   reported     hidden after a report, while Storelib looks (only Storelib
 *                brings it back)
 *   unanswered   shown, and the store has not replied yet
 *
 * THE ACTIONS (planModeration). Approve and reject are for a pending
 * review; publish brings a rejected one back; unpublish takes a shown one
 * off. Each says "nothing to do" rather than failing when the review is
 * already where the action would put it, so a bulk action over a mixed
 * selection does what it can and counts the rest. For a verified buyer's
 * review every one of them moves the website only (site_status); delete is
 * refused, as is publishing a review a report hid. A photo or video can be
 * hidden (kept, restorable), shown again, or removed for good.
 *
 * Pure: no database.
 */
import { isVerifiedReview, readPhotos, readSiteStatus, sellerView, type ReviewPhoto } from "./app-settings"

export const REVIEW_TABS = ["all", "pending", "published", "rejected", "reported", "unanswered"] as const
export type ReviewTab = (typeof REVIEW_TABS)[number]
export type ReviewBucket = "published" | "pending" | "rejected" | "reported"

export const PAGE_SIZE = 20
export const MAX_BULK = 100

export interface ModeratedRow {
  featured?: unknown
  status?: unknown
  site_status?: unknown
  hidden_by?: unknown
  verified?: unknown
  seller_reply?: unknown
  photos?: unknown
}

/** Where the review is, as the list's tabs sort it. */
export function bucketOf(row: ModeratedRow): ReviewBucket {
  const v = sellerView(row)
  if (v.status === "published") return "published"
  if (v.status === "pending") return "pending"
  return v.hidden_by === "seller" ? "rejected" : "reported"
}

export function inTab(row: ModeratedRow, tab: ReviewTab): boolean {
  if (tab === "all") return true
  const b = bucketOf(row)
  if (tab === "unanswered") return b === "published" && !(typeof row.seller_reply === "string" && row.seller_reply.trim())
  return b === tab
}

export const hasMedia = (row: ModeratedRow) => readPhotos(row.photos).length > 0

export interface ReviewFilters {
  tab: ReviewTab
  /** Words in the review, its title, its author's name or its product's title. */
  q: string
  /** 1 to 5, or 0 for any. */
  rating: number
  /** A product id, or "" for every product. */
  product: string
  verified: "" | "yes" | "no"
  media: "" | "yes"
  page: number
}

export const NO_FILTERS: ReviewFilters = { tab: "all", q: "", rating: 0, product: "", verified: "", media: "", page: 1 }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A search as the database can take it: no PostgREST punctuation, no wildcards, at most 80 characters. */
export function cleanSearch(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[,()%*\\:"'.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : ""
}

/** The filters in an address (?tab=pending&q=strap&rating=1), each one checked. Old links say ?status=pending. */
export function readFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): ReviewFilters {
  const get = (k: string): string => {
    if (params instanceof URLSearchParams) return params.get(k) ?? ""
    const v = params[k]
    return (Array.isArray(v) ? v[0] : v) ?? ""
  }
  const tabRaw = get("tab") || get("status")
  const tab = tabRaw === "hidden" ? "rejected" : (REVIEW_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as ReviewTab) : "all"
  const rating = Number(get("rating"))
  const page = Math.floor(Number(get("page")))
  const verified = get("verified")
  return {
    tab,
    q: cleanSearch(get("q")),
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
    product: UUID.test(get("product")) ? get("product").toLowerCase() : "",
    verified: verified === "yes" || verified === "no" ? verified : "",
    media: get("media") === "yes" ? "yes" : "",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  }
}

/** The filters as an address's query, leaving out every default, so the plain list is /app/reviews/list. */
export function filtersToQuery(f: Partial<ReviewFilters>): string {
  const p = new URLSearchParams()
  if (f.tab && f.tab !== "all") p.set("tab", f.tab)
  if (f.q) p.set("q", f.q)
  if (f.rating) p.set("rating", String(f.rating))
  if (f.product) p.set("product", f.product)
  if (f.verified) p.set("verified", f.verified)
  if (f.media) p.set("media", f.media)
  if (f.page && f.page > 1) p.set("page", String(f.page))
  const s = p.toString()
  return s ? `?${s}` : ""
}

export interface FilterableRow extends ModeratedRow {
  product_id: string
  rating: number
  content?: string | null
  title?: string | null
  reviewer_name?: string | null
  buyer?: { display_name?: string | null } | null
}

/** Whether one row passes every filter but the tab and the page. `productTitle` reads a product's title for the search. */
export function matchesFilters(row: FilterableRow, f: ReviewFilters, productTitle: (id: string) => string = () => ""): boolean {
  if (f.rating && row.rating !== f.rating) return false
  if (f.product && row.product_id !== f.product) return false
  if (f.verified === "yes" && !isVerifiedReview(row)) return false
  if (f.verified === "no" && isVerifiedReview(row)) return false
  if (f.media === "yes" && !hasMedia(row)) return false
  if (f.q) {
    const hay = [row.content, row.title, row.reviewer_name, row.buyer?.display_name, productTitle(row.product_id)].filter(Boolean).join("\n").toLowerCase()
    if (!f.q.toLowerCase().split(" ").every((w) => hay.includes(w))) return false
  }
  return true
}

/** One page of a list, and how many pages there are. A page past the end reads as the last. */
export function pageOf<T>(list: readonly T[], page: number, size = PAGE_SIZE): { rows: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(list.length / size))
  const at = Math.min(Math.max(1, page), pages)
  return { rows: list.slice((at - 1) * size, at * size), page: at, pages, total: list.length }
}

/** How many reviews each tab holds. */
export function tabCounts(rows: readonly ModeratedRow[]): Record<ReviewTab, number> {
  const out = Object.fromEntries(REVIEW_TABS.map((t) => [t, 0])) as Record<ReviewTab, number>
  for (const r of rows) for (const t of REVIEW_TABS) if (inTab(r, t)) out[t]++
  return out
}

/* ── What an action does ─────────────────────────────────────────────── */

export const MODERATION_ACTIONS = ["approve", "reject", "publish", "unpublish", "hide", "feature", "unfeature", "remove_photo", "restore_photo", "delete_photo"] as const
export type ModerationAction = (typeof MODERATION_ACTIONS)[number]
/** What a selection of reviews can be given at once. */
export const BULK_ACTIONS = ["approve", "reject", "publish", "unpublish", "feature", "unfeature", "delete"] as const
export type BulkAction = (typeof BULK_ACTIONS)[number]

export interface ReviewForModeration extends ModeratedRow {
  id: string
  creator_id?: string
}

export type ModerationPlan =
  | { kind: "change"; change: Record<string, unknown>; removeFiles?: string[] }
  | { kind: "noop"; reason: string }
  | { kind: "refuse"; status: number; error: string }

const REPORTED = "Storelib is looking at the report on this review. It comes back if Storelib restores it."

function showChange(review: ReviewForModeration, now: string): ModerationPlan {
  const reported = review.status === "hidden" && review.hidden_by !== "seller"
  if (reported) return { kind: "refuse", status: 409, error: REPORTED }
  if (bucketOf(review) === "published") return { kind: "noop", reason: "already_published" }
  const back = { status: "published", hidden_by: null, hidden_at: null, hidden_reason: null, published_at: now }
  /* Verified: shown on the website again. Storelib's status is only touched to undo a store's hide or wait from before that rule. */
  return { kind: "change", change: isVerifiedReview(review) ? { site_status: "shown", ...(review.status === "published" ? {} : back) } : back }
}

function hideChange(review: ReviewForModeration, now: string): ModerationPlan {
  const b = bucketOf(review)
  if (b === "rejected" || b === "reported") return { kind: "noop", reason: "already_hidden" }
  if (isVerifiedReview(review)) {
    return { kind: "change", change: { site_status: "hidden", ...(review.status === "published" ? {} : { status: "published", hidden_by: null, hidden_at: null, hidden_reason: null, published_at: now }) } }
  }
  return { kind: "change", change: { status: "hidden", hidden_by: "seller", hidden_at: now, hidden_reason: "seller" } }
}

/** What one action does to one review, or why it does nothing, or why it may not. */
export function planModeration(review: ReviewForModeration, action: ModerationAction | "delete", opts: { now?: string; photo?: string } = {}): ModerationPlan {
  const now = opts.now ?? new Date().toISOString()
  const b = bucketOf(review)
  switch (action) {
    case "approve":
      return b === "pending" ? showChange(review, now) : { kind: "noop", reason: "not_pending" }
    case "reject":
      return b === "pending" ? hideChange(review, now) : { kind: "noop", reason: "not_pending" }
    case "publish":
      return showChange(review, now)
    case "unpublish":
      return b === "published" ? hideChange(review, now) : { kind: "noop", reason: "not_published" }
    case "hide":
      return hideChange(review, now)
    case "feature":
      if (review.featured === true) return { kind: "noop", reason: "already_featured" }
      return review.status === "published" ? { kind: "change", change: { featured: true } } : { kind: "noop", reason: "not_published" }
    case "unfeature":
      return review.featured === true ? { kind: "change", change: { featured: false } } : { kind: "noop", reason: "not_featured" }
    case "delete":
      if (isVerifiedReview(review)) return { kind: "refuse", status: 403, error: "A verified buyer's review can't be deleted. Hide it on your website, or report it to Storelib." }
      if (b === "reported") return { kind: "refuse", status: 409, error: REPORTED }
      return { kind: "change", change: {}, removeFiles: readPhotos(review.photos).map((p) => p.path).filter((p) => !review.creator_id || p.startsWith(`${review.creator_id}/`)) }
    case "remove_photo":
    case "restore_photo":
    case "delete_photo": {
      const photos = readPhotos(review.photos)
      const path = opts.photo ?? ""
      if (!photos.some((p) => p.path === path)) return { kind: "refuse", status: 404, error: "That photo is not on this review." }
      if (action === "delete_photo") return { kind: "change", change: { photos: photos.filter((p) => p.path !== path) }, removeFiles: [path] }
      const status: ReviewPhoto["status"] = action === "remove_photo" ? "removed" : "approved"
      return { kind: "change", change: { photos: photos.map((p) => (p.path === path ? { ...p, status } : p)) } }
    }
    default:
      return { kind: "refuse", status: 400, error: "Bad request" }
  }
}

/** A row after a change, as the list draws it: the change laid over the row, read again. */
export function applyChange<T extends ModeratedRow>(row: T, change: Record<string, unknown>): T & ReturnType<typeof sellerView> {
  const next = { ...row, ...change } as T
  return { ...next, ...sellerView(next) }
}

/** Where a row is after a bulk action's plan, for the optimistic list: null for a row the action leaves alone or removes. */
export function optimisticRow<T extends ReviewForModeration>(row: T, action: BulkAction, now = new Date().toISOString()): T | null {
  const plan = planModeration(row, action, { now })
  if (plan.kind !== "change" || action === "delete") return null
  return applyChange(row, plan.change) as T
}

export interface BulkOutcome {
  changed: string[]
  deleted: string[]
  /** Left as they were, and why: already there, not pending, a verified buyer's (delete), reported. */
  skipped: { id: string; reason: string }[]
}

/** The site_status a verified review would have after a change, for a test or a log: readSiteStatus over the change. */
export const siteStatusAfter = (row: ModeratedRow, change: Record<string, unknown>) => readSiteStatus("site_status" in change ? change.site_status : row.site_status)

/* ── The overview ───────────────────────────────────────────────────── */

/** Reviews written after a request email, of the emails that went. Null when none went, so nothing reads as 0%. */
export function responseRate(sent: number, reviewed: number): number | null {
  return sent > 0 ? Math.min(1, reviewed / sent) : null
}

export type ActivityKind = "review" | "reply" | "request" | "reminder"

export interface ActivityItem {
  kind: ActivityKind
  at: string
  /** The review or the request it is about. */
  id: string
  rating?: number
  name?: string | null
  productId?: string | null
  bucket?: ReviewBucket
}

/** The latest things that happened, newest first: reviews in, the store's replies, request emails and reminders out. */
export function recentActivity(
  reviews: readonly (ModeratedRow & { id: string; created_at: string; rating: number; product_id: string; reviewer_name?: string | null; seller_reply_at?: string | null })[],
  requests: readonly { id: string; product_id?: string | null; sent_at?: string | null; reminded_at?: string | null; first_name?: string | null }[],
  limit = 8,
): ActivityItem[] {
  const out: ActivityItem[] = []
  for (const r of reviews) {
    out.push({ kind: "review", at: r.created_at, id: r.id, rating: r.rating, name: r.reviewer_name ?? null, productId: r.product_id, bucket: bucketOf(r) })
    if (r.seller_reply_at) out.push({ kind: "reply", at: r.seller_reply_at, id: r.id, productId: r.product_id, name: r.reviewer_name ?? null })
  }
  for (const q of requests) {
    if (q.sent_at) out.push({ kind: "request", at: q.sent_at, id: q.id, productId: q.product_id ?? null, name: q.first_name ?? null })
    if (q.reminded_at) out.push({ kind: "reminder", at: q.reminded_at, id: q.id, productId: q.product_id ?? null, name: q.first_name ?? null })
  }
  return out.filter((a) => Number.isFinite(Date.parse(a.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit)
}
