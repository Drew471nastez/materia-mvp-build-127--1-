/**
 * ===========================================================================
 *  STORELIB REVIEWS ON A WEBSITE: WHAT A SECTION IS HANDED
 * ===========================================================================
 * One shape, made here from rows that were already read, for every surface
 * that draws reviews on a creator's website:
 *
 *   a Storelib theme      `reviews` in the section's template (render.ts),
 *                         read by sections/reviews_*.storelib
 *   an imported theme     `storelib_reviews` in the Liquid context, read by
 *                         the Storelib Reviews section and app block
 *                         (lib/storelib-theme/compat/storelib-reviews.ts)
 *   the builder's canvas  the same, from /api/reviews/storefront, with
 *                         sample reviews while the store has none yet
 *
 * PUBLIC BY CONSTRUCTION. Only published reviews come in, and only what a
 * card shows goes out: the first name and an initial (publicName), the
 * stars, the words, the approved photos, the store's reply, the product it
 * is about. Never an address, an order, a buyer id or why a review was
 * hidden. Every string is plain text: templates escape what they print.
 *
 * Pure: no database, no server modules.
 */
import { publicName, shownPhotos, type ReviewsAppSettings } from "./app-settings"
import { summarize } from "./rules"

export interface StorefrontReview {
  id: string
  rating: number
  title: string
  body: string
  /** "Jane D.", or "Verified buyer" / "Customer" when no name was given. */
  author: string
  /** The author's first letter, for the circle beside the name. */
  initial: string
  /** "Mar 3, 2026". */
  date: string
  iso: string
  /** A verified buyer's, or one the app it was imported from called a verified purchase (run-now part 212). */
  verified: boolean
  featured: boolean
  photos: string[]
  has_photos: boolean
  /** Web addresses of the review's videos, from an import (part 212). */
  videos: string[]
  /**
   * Where the review stands in each order a visitor can pick, 0 first: the
   * section sorts with CSS `order` from these, with no script, so the list
   * the page was sent in is the store's own order and the others are one
   * choice away.
   */
  rank_featured: number
  rank_newest: number
  rank_highest: number
  rank_lowest: number
  rank_photos: number
  reply: string
  product_id: string
  product_title: string
  product_url: string
  product_image: string
}

export interface StorefrontReviewSummary {
  count: number
  /** One decimal, 0 when there are none. */
  average: number
  /** "4.6". */
  average_label: string
  /** How much of five stars is filled, 0 to 100, for a star bar drawn with a width. */
  percent: number
  /** "12 reviews", "1 review". */
  count_label: string
  /** Five rows, five stars first. */
  bars: { stars: number; count: number; percent: number }[]
}

export interface StorefrontReviews {
  /** The app is on for this store. Off, every review section draws nothing on a live page. */
  enabled: boolean
  /** True when these are sample reviews for the builder's canvas. Never on a live page. */
  sample: boolean
  /** Every product page gets the stars and the reviews without the store placing them (the app's "Add to product pages"). */
  product_page: boolean
  star_color: string
  show_verified: boolean
  show_date: boolean
  show_photos: boolean
  /** The store's order for its reviews (the app's display setting): the order the list is sent in, and the one the section's sort starts on. */
  sort: ReviewsAppSettings["display"]["sort"]
  /** Reviews a section shows before Show more, when the section leaves it to the app. */
  per_page: number
  /** A visitor can write a review on the website (the app lets anyone). */
  can_write: boolean
  photos_allowed: boolean
  /** Where the website's review form posts. */
  form_action: string
  photo_action: string
  creator_id: string
  /** The product this page is about, on a product page. */
  product: { id: string; title: string; summary: StorefrontReviewSummary; items: StorefrontReview[] } | null
  /** The whole shop: the newest and featured reviews of every product, and the ones a carousel shows (featured, else four and five stars). */
  all: { summary: StorefrontReviewSummary; items: StorefrontReview[]; featured_items: StorefrontReview[] }
  /** What a Product reviews section draws here: the product's on its page, the shop's anywhere else. */
  here: { scope: "product" | "shop"; product_id: string; summary: StorefrontReviewSummary; items: StorefrontReview[] }
  /** /reviews on this website. */
  page_url: string
}

/** A published review row as read for the storefront. */
export interface StorefrontReviewRow {
  id: string
  product_id: string
  rating: number
  title?: string | null
  content: string
  created_at: string
  reviewer_name?: string | null
  buyer?: { display_name?: string | null } | { display_name?: string | null }[] | null
  verified?: boolean | null
  featured?: boolean | null
  photos?: unknown
  seller_reply?: string | null
  /** Run-now part 212. */
  import_verified?: boolean | null
  videos?: unknown
}

export interface StorefrontProductRow {
  id: string
  title?: string | null
  slug?: string | null
  thumbnail_url?: string | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Mar 3, 2026", the same everywhere, without the server's locale. */
export function reviewDate(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ""
  const d = new Date(t)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

export function summaryOf(ratings: readonly number[]): StorefrontReviewSummary {
  const s = summarize(ratings)
  const bars = ([5, 4, 3, 2, 1] as const).map((n) => ({ stars: n, count: s.stars[n], percent: s.count ? Math.round((s.stars[n] / s.count) * 100) : 0 }))
  return {
    count: s.count,
    average: s.average,
    average_label: s.count ? s.average.toFixed(1) : "0.0",
    percent: Math.round((s.average / 5) * 100),
    count_label: `${s.count} ${s.count === 1 ? "review" : "reviews"}`,
    bars,
  }
}

function buyerName(row: StorefrontReviewRow): string | null {
  const b = Array.isArray(row.buyer) ? row.buyer[0] : row.buyer
  return publicName(b?.display_name) ?? publicName(row.reviewer_name)
}

export function toStorefrontReview(row: StorefrontReviewRow, product: StorefrontProductRow | undefined, showPhotos = true): StorefrontReview {
  const buyer = row.verified !== false
  const verified = buyer || row.import_verified === true
  const author = buyerName(row) ?? (buyer ? "Verified buyer" : "Customer")
  const photos = showPhotos ? shownPhotos(row.photos) : []
  const videos = Array.isArray(row.videos) ? (row.videos as unknown[]).filter((v): v is string => typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v)).slice(0, 2) : []
  const rating = Math.max(1, Math.min(5, Math.round(Number(row.rating) || 0)))
  return {
    id: row.id,
    rating,
    title: (row.title ?? "").trim(),
    body: (row.content ?? "").trim(),
    author,
    initial: Array.from(author)[0]?.toUpperCase() ?? "",
    date: reviewDate(row.created_at),
    iso: row.created_at,
    verified,
    featured: row.featured === true,
    photos,
    has_photos: photos.length > 0,
    videos: showPhotos ? videos : [],
    rank_featured: 0,
    rank_newest: 0,
    rank_highest: 0,
    rank_lowest: 0,
    rank_photos: 0,
    reply: (row.seller_reply ?? "").trim(),
    product_id: row.product_id,
    product_title: (product?.title ?? "").trim(),
    product_url: product?.slug ? `/products/${product.slug}` : "",
    product_image: product?.thumbnail_url ?? "",
  }
}

/** The order a section shows reviews in, by the app's setting. */
export function sortReviews<T extends { rating: number; featured: boolean; iso: string; has_photos: boolean }>(list: T[], sort: ReviewsAppSettings["display"]["sort"]): T[] {
  const newest = (a: T, b: T) => (b.iso > a.iso ? 1 : b.iso < a.iso ? -1 : 0)
  const out = [...list]
  switch (sort) {
    case "highest":
      return out.sort((a, b) => b.rating - a.rating || newest(a, b))
    case "lowest":
      return out.sort((a, b) => a.rating - b.rating || newest(a, b))
    case "photos":
      return out.sort((a, b) => Number(b.has_photos) - Number(a.has_photos) || newest(a, b))
    case "newest":
      return out.sort(newest)
    default:
      return out.sort((a, b) => Number(b.featured) - Number(a.featured) || newest(a, b))
  }
}

export function emptyStorefrontReviews(settings: ReviewsAppSettings, creatorId: string): StorefrontReviews {
  return {
    enabled: settings.enabled,
    sample: false,
    product_page: settings.display.productPage,
    star_color: settings.display.starColor,
    show_verified: settings.display.showVerified,
    show_date: settings.display.showDate,
    show_photos: settings.display.showPhotos,
    sort: settings.display.sort,
    per_page: settings.display.perPage,
    can_write: settings.enabled && settings.who === "anyone",
    photos_allowed: settings.photos,
    form_action: "/api/reviews/site",
    photo_action: "/api/reviews/photo",
    creator_id: creatorId,
    product: null,
    all: { summary: summaryOf([]), items: [], featured_items: [] },
    here: { scope: "shop", product_id: "", summary: summaryOf([]), items: [] },
    page_url: "/reviews",
  }
}

/**
 * The stars under a product's name on its page (the product section's Star
 * rating block): the product's own summary, while the app is on and it has
 * published reviews. Null otherwise, and the block draws nothing. Sample
 * reviews never count: a product with none says so in the builder.
 */
export interface ProductRating {
  count: number
  average: number
  average_label: string
  percent: number
  count_label: string
  star_color: string
}

export function productRating(reviews: Pick<StorefrontReviews, "enabled" | "sample" | "product" | "star_color"> | null | undefined): ProductRating | null {
  if (!reviews || !reviews.enabled || reviews.sample || !reviews.product) return null
  const s = reviews.product.summary
  if (!(s.count > 0)) return null
  return { count: s.count, average: s.average, average_label: s.average_label, percent: s.percent, count_label: s.count_label, star_color: reviews.star_color }
}

/** The carousel's reviews: the featured ones, or when none is featured, the four and five star ones. */
export function featuredOf(items: StorefrontReview[]): StorefrontReview[] {
  const featured = items.filter((r) => r.featured)
  return featured.length ? featured : items.filter((r) => r.rating >= 4)
}

/** Each review's place in every order a visitor can pick (StorefrontReview rank_*). */
export function withRanks<T extends StorefrontReview>(items: T[]): T[] {
  for (const sort of ["featured", "newest", "highest", "lowest", "photos"] as const) {
    sortReviews(items, sort).forEach((r, i) => {
      r[`rank_${sort}`] = i
    })
  }
  return items
}

/** Fills `here` and `all.featured_items` from what is already in it. */
function finish(out: StorefrontReviews): StorefrontReviews {
  withRanks(out.all.items)
  if (out.product && out.product.items !== out.all.items) withRanks(out.product.items)
  out.all.featured_items = featuredOf(out.all.items)
  out.here = out.product ? { scope: "product", product_id: out.product.id, summary: out.product.summary, items: out.product.items } : { scope: "shop", product_id: "", summary: out.all.summary, items: out.all.items }
  return out
}

/**
 * Everything a website's review sections read, from the rows the loader
 * read: the shop's reviews, and the product's when the page is about one.
 */
export function buildStorefrontReviews(input: {
  settings: ReviewsAppSettings
  creatorId: string
  rows: StorefrontReviewRow[]
  /** Every published rating of the shop, for its summary; the rows when absent. */
  shopRatings?: number[]
  products: StorefrontProductRow[]
  product?: { id: string; title?: string | null; rows: StorefrontReviewRow[]; ratings: number[] } | null
  limit?: number
}): StorefrontReviews {
  const { settings } = input
  const base = emptyStorefrontReviews(settings, input.creatorId)
  const byId = new Map(input.products.map((p) => [p.id, p]))
  const limit = Math.max(1, Math.min(100, input.limit ?? 24))
  const show = settings.display.showPhotos
  const all = sortReviews(input.rows.map((r) => toStorefrontReview(r, byId.get(r.product_id), show)), settings.display.sort).slice(0, limit)
  base.all = { summary: summaryOf(input.shopRatings ?? input.rows.map((r) => Number(r.rating))), items: all, featured_items: [] }
  if (input.product) {
    const items = sortReviews(input.product.rows.map((r) => toStorefrontReview(r, byId.get(r.product_id), show)), settings.display.sort).slice(0, limit)
    base.product = { id: input.product.id, title: (input.product.title ?? "").trim(), summary: summaryOf(input.product.ratings), items }
  }
  return finish(base)
}

/**
 * What the builder's canvas shows while a store has no reviews yet, so the
 * section can be laid out and styled before the first one arrives. Marked
 * `sample`, and never drawn on a live page.
 */
export function sampleStorefrontReviews(settings: ReviewsAppSettings, creatorId: string, product?: { id: string; title?: string | null } | null): StorefrontReviews {
  const now = Date.now()
  const day = 86_400_000
  const mk = (i: number, rating: number, title: string, body: string, author: string, extra: Partial<StorefrontReview> = {}): StorefrontReview => {
    const iso = new Date(now - (i + 2) * 3 * day).toISOString()
    return {
      id: `sample-${i}`,
      rating,
      title,
      body,
      author,
      initial: author[0],
      date: reviewDate(iso),
      iso,
      verified: true,
      featured: i === 0,
      photos: [],
      has_photos: false,
      videos: [],
      rank_featured: 0,
      rank_newest: 0,
      rank_highest: 0,
      rank_lowest: 0,
      rank_photos: 0,
      reply: "",
      product_id: product?.id ?? "sample",
      product_title: product?.title ?? "Sample product",
      product_url: "",
      product_image: "",
      ...extra,
    }
  }
  const items = [
    mk(0, 5, "Exactly what I hoped for", "Clear, well made and easy to get started with. I used it the same day.", "Maya R."),
    mk(1, 5, "Worth it", "Good value. The details are what sold me, and the support answered quickly.", "Jonas K.", { reply: "Thanks Jonas, glad it helped." }),
    mk(2, 4, "Really good", "Does what it says. I would like one more example, but I am happy with it.", "Priya S."),
    mk(3, 5, "Bought a second one", "I gave the first one away as a gift and had to get another for myself.", "Sam T."),
  ]
  const ratings = items.map((r) => r.rating)
  const out = emptyStorefrontReviews(settings, creatorId)
  out.sample = true
  out.all = { summary: summaryOf(ratings), items, featured_items: [] }
  if (product) out.product = { id: product.id, title: (product.title ?? "").trim(), summary: summaryOf(ratings), items }
  return finish(out)
}
