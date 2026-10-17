/**
 * ===========================================================================
 *  REVIEW IMPORT: WHICH APP WROTE THE FILE, AND WHICH COLUMN IS WHAT
 * ===========================================================================
 * Each review app's export, as its header row names its columns. A file is
 * read as the app whose columns it has most of (detectPlatform), and each
 * Storelib field is found under that app's own names first, then under the
 * names any app uses (autoMapping). The mapping step shows the result and
 * the creator can change any of it, or read the file as Other and map every
 * column by hand.
 *
 * Header names are compared after normalising (headerKey): "Review Score",
 * "review_score", "reviewScore" and "REVIEW-SCORE" are one name.
 *
 * Pure: no database, no server modules.
 */
import type { ImportStatus } from "./normalize"

export type FieldId =
  | "product_handle"
  | "product_url"
  | "product_sku"
  | "product_id"
  | "product_title"
  | "rating"
  | "title"
  | "body"
  | "author"
  | "email"
  | "date"
  | "verified"
  | "photos"
  | "videos"
  | "reply"
  | "reply_date"
  | "status"
  | "external_id"
  | "parent_id"

/** In the order the mapping step lists them. */
export const FIELDS: FieldId[] = ["product_handle", "product_url", "product_sku", "product_id", "product_title", "rating", "body", "title", "author", "email", "date", "verified", "photos", "videos", "reply", "reply_date", "status", "external_id", "parent_id"]

export const PRODUCT_FIELDS: FieldId[] = ["product_handle", "product_url", "product_sku", "product_id", "product_title"]

export type PlatformId =
  | "judgeme"
  | "yotpo"
  | "loox"
  | "stamped"
  | "okendo"
  | "shopify"
  | "reviewsio"
  | "trustpilot"
  | "trustpilot_product"
  | "google"
  | "etsy"
  | "amazon"
  | "woocommerce"
  | "fera"
  | "alireviews"
  | "rivyo"
  | "other"

export interface Platform {
  id: PlatformId
  label: string
  /** Header sets that say "this app": the best share of any one of them decides. */
  signatures: string[][]
  /** This app's own names for a field, tried before the common ones. */
  fields?: Partial<Record<FieldId, string[]>>
  /** Names this app uses for something else, never read as a field by the common names. */
  not?: Partial<Record<FieldId, string[]>>
  /** Every review from this app is from a buyer (Etsy only lets buyers review). */
  verifiedByDefault?: boolean
  /** The app's own words in its status column. */
  statusMap?: Record<string, ImportStatus>
  /** Slash dates in this app's exports are day first. */
  dayFirst?: boolean
}

/** "Review Score", "reviewScore", "review-score" → "review_score". */
export function headerKey(h: string): string {
  return h
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** The names any app uses, after the app's own. Order matters: the first found wins. */
const COMMON: Record<FieldId, string[]> = {
  product_handle: ["product_handle", "handle", "product_slug", "slug", "product_handler", "url_handle"],
  product_url: ["product_url", "product_link", "product_page_url", "product_page", "page_url", "listing_url", "item_url"],
  product_sku: ["product_sku", "sku", "variant_sku", "product_skus", "item_sku", "mpn"],
  product_id: ["product_id", "productid", "external_product_id", "shopify_product_id", "product_external_id", "listing_id", "asin", "product_asin", "comment_post_id", "post_id", "item_id", "product_shopify_id", "product_identifier"],
  product_title: ["product_title", "product_name", "product", "listing_title", "item_name", "item_title", "listing", "item", "product_title_name"],
  rating: ["rating", "stars", "score", "review_score", "review_rating", "star_rating", "review_stars", "star", "rate", "overall_rating", "rating_score", "rating_value", "review_rating_value"],
  body: ["body", "review", "content", "text", "review_body", "review_content", "review_text", "message", "review_message", "review_description", "comment_content", "comment", "description", "feedback", "review_comment", "review_details"],
  title: ["title", "review_title", "heading", "review_heading", "subject", "headline", "review_headline", "review_subject"],
  author: ["reviewer_name", "author", "name", "customer_name", "display_name", "nickname", "full_name", "reviewer", "user_name", "username", "consumer_name", "comment_author", "reviewer_display_name", "buyer_name", "author_name", "author_title", "review_user_name", "profile_name", "first_name"],
  email: ["reviewer_email", "email", "customer_email", "author_email", "comment_author_email", "consumer_email", "user_email", "buyer_email", "review_user_email", "email_address"],
  date: ["review_date", "date", "created_at", "submitted_at", "date_created", "created", "review_created_date_utc", "review_created_utc", "date_reviewed", "comment_date_gmt", "comment_date", "create_time", "published_at", "review_created", "review_datetime_utc", "timestamp", "time", "posted_at", "date_of_review", "creation_date"],
  verified: ["verified", "verified_purchase", "verified_buyer", "is_verified", "verified_order", "user_type", "review_verified_type", "verified_reviewer", "is_verified_buyer", "reviewer_is_verified", "buyer_verified", "verified_review"],
  photos: ["picture_urls", "photo_urls", "photos", "images", "image_urls", "img", "photo_url", "published_image_urls", "review_images", "pictures", "attachment_urls", "review_image_urls", "media_urls", "media", "photo", "image", "image_url", "review_img_urls", "review_photos"],
  videos: ["video_urls", "published_video_urls", "videos", "video", "video_url", "review_videos"],
  reply: ["reply", "reply_content", "store_reply", "seller_reply", "merchant_reply", "public_reply", "response", "owner_response", "review_reply_comment", "company_reply", "reply_text", "shop_reply", "owner_answer", "review_reply", "public_comment", "comment_content_public"],
  reply_date: ["reply_date", "replied_at", "reply_date_utc", "company_reply_date_utc", "review_reply_update_time", "response_date", "owner_answer_timestamp_datetime_utc", "review_reply_date", "reply_created_at"],
  status: ["status", "state", "curated", "published", "review_status", "comment_approved", "published_status", "is_published", "review_state", "visibility", "approved"],
  external_id: ["review_id", "id", "comment_id", "review_identifier", "external_id", "product_review_id", "review_uid", "uuid"],
  parent_id: ["comment_parent", "parent_id", "parent", "reply_to"],
}

export const PLATFORMS: Platform[] = [
  {
    id: "judgeme",
    label: "Judge.me",
    signatures: [["title", "body", "rating", "review_date", "reviewer_name", "reviewer_email", "product_handle", "curated"], ["title", "body", "rating", "review_date", "reviewer_name", "reviewer_email", "product_handle", "picture_urls"]],
    statusMap: { ok: "published", spam: "hidden", "not-yet": "pending", not_yet: "pending" },
  },
  {
    id: "yotpo",
    label: "Yotpo",
    signatures: [["review_score", "review_title", "review_content", "product_id", "display_name"], ["review_score", "review_content", "product_title", "published"], ["review_title", "review_content", "review_score", "date", "product_id", "display_name", "email"]],
    fields: { reply: ["comment_content", "public_comment", "comment"], verified: ["user_type", "verified_buyer"], photos: ["published_image_urls", "published_image_url", "image_urls"], videos: ["published_video_urls", "published_video_url"], status: ["published", "status"] },
    not: { body: ["comment_content", "comment"] },
  },
  {
    id: "loox",
    label: "Loox",
    signatures: [["rating", "email", "nickname", "review", "date", "handle", "img"], ["product_handle", "rating", "author", "email", "body", "created_at", "photo_url", "verified_purchase"], ["id", "status", "rating", "email", "nickname", "full_name", "review", "date", "product_id"]],
    fields: { author: ["nickname", "full_name", "author"], photos: ["img", "photo_url"], status: ["status"] },
    statusMap: { active: "published" },
  },
  {
    id: "stamped",
    label: "Stamped.io",
    signatures: [["product_id", "product_title", "product_handle", "product_image_url", "author", "rating", "body"], ["review_title", "review_message", "review_rating", "review_user_name"], ["product_sku", "product_image_url", "author", "location", "rating", "title", "body"]],
    fields: { author: ["author", "review_user_name"], body: ["body", "review_message"], verified: ["review_verified_type", "verified_type", "verified"], status: ["review_state", "published", "status"] },
  },
  {
    id: "okendo",
    label: "Okendo",
    signatures: [["reviewer_name", "date_created", "is_recommended", "rating", "body"], ["review_id", "product_id", "rating", "title", "body", "reviewer_name", "reviewer_email", "date_created"]],
    fields: { verified: ["reviewer_is_verified", "is_verified_buyer", "verified_buyer", "is_verified"] },
    statusMap: { approved: "published", rejected: "hidden", pending: "pending" },
  },
  {
    id: "shopify",
    label: "Shopify Product Reviews",
    signatures: [["product_handle", "state", "rating", "title", "author", "email", "location", "body", "reply", "created_at", "replied_at"]],
    statusMap: { published: "published", unpublished: "hidden", spam: "hidden" },
  },
  {
    id: "reviewsio",
    label: "Reviews.io",
    signatures: [["product_review_id", "sku", "review", "rating"], ["sku", "product_name", "rating", "review", "name", "email", "order_number"], ["sku", "product_name", "rating", "review", "reviewer", "order_id", "verified"]],
    fields: { body: ["review", "comments"], reply: ["reply", "response", "store_reply"] },
  },
  {
    id: "trustpilot",
    label: "Trustpilot (service reviews)",
    signatures: [["review_id", "review_stars", "review_title", "review_content", "source_of_review"], ["review_created_utc", "review_id", "review_stars", "review_content"], ["review_created_date_utc", "review_stars", "review_content", "reply_content"]],
    fields: { rating: ["review_stars"], body: ["review_content"], title: ["review_title"], date: ["review_created_utc", "review_created_date_utc"], reply: ["reply_content", "company_reply"], reply_date: ["company_reply_date_utc", "reply_date_utc"], author: ["consumer_name", "reviewer_name", "name"] },
    not: { product_url: ["domain_url"] },
    dayFirst: true,
  },
  {
    id: "trustpilot_product",
    label: "Trustpilot (product reviews)",
    signatures: [["review_id", "stars", "content", "sku", "product_name", "consumer_name"], ["review_created_utc", "stars", "content", "sku"], ["stars", "content", "consumer_name", "product_name"]],
    fields: { rating: ["stars"], body: ["content"], author: ["consumer_name"], email: ["consumer_email"], photos: ["attachment_urls", "attachments"] },
    dayFirst: true,
  },
  {
    id: "google",
    label: "Google",
    signatures: [["reviewer_display_name", "star_rating", "comment", "create_time"], ["author_title", "review_text", "review_rating"], ["author_name", "rating", "text", "time", "relative_time_description"]],
    fields: { author: ["reviewer_display_name", "author_title", "author_name"], body: ["comment", "review_text", "text"], rating: ["star_rating", "review_rating", "rating"], date: ["create_time", "review_datetime_utc", "time"], reply: ["review_reply_comment", "owner_answer"], reply_date: ["review_reply_update_time", "owner_answer_timestamp_datetime_utc"], external_id: ["review_id", "name"], photos: ["review_img_urls", "review_photo_urls"] },
    not: { author: ["name"] },
  },
  {
    id: "etsy",
    label: "Etsy",
    signatures: [["reviewer", "date_reviewed", "star_rating", "message", "order_id"], ["reviewer", "date_reviewed", "star_rating", "message"]],
    fields: { author: ["reviewer"], body: ["message"], rating: ["star_rating"], date: ["date_reviewed"], external_id: ["review_id", "order_id"] },
    verifiedByDefault: true,
  },
  {
    id: "amazon",
    label: "Amazon",
    signatures: [["asin", "rating", "title", "body"], ["asin", "review_rating", "review_title", "review_text"], ["date", "author", "verified", "helpful", "title", "body", "rating"], ["review_title", "review_description", "rating_score", "is_verified", "product_asin"]],
    fields: { body: ["body", "review_text", "review_description", "content", "text"], author: ["author", "profile_name", "reviewer_name", "user_name", "name"], verified: ["verified", "verified_purchase", "is_verified"], product_id: ["asin", "product_asin"] },
  },
  {
    id: "woocommerce",
    label: "WooCommerce",
    signatures: [["comment_id", "comment_post_id", "comment_author", "comment_content", "rating"], ["comment_post_id", "comment_author", "comment_author_email", "comment_content", "comment_approved"]],
    fields: { body: ["comment_content", "review_content"], author: ["comment_author"], email: ["comment_author_email"], date: ["comment_date_gmt", "comment_date"], status: ["comment_approved"], external_id: ["comment_id"], parent_id: ["comment_parent"], product_id: ["comment_post_id", "product_id"], product_handle: ["product_slug", "product_handle"], product_sku: ["product_sku", "sku"] },
    not: { reply: ["comment_content"] },
    statusMap: { "1": "published", "0": "pending", approve: "published", hold: "pending", spam: "hidden", trash: "hidden" },
  },
  {
    id: "fera",
    label: "Fera",
    signatures: [["heading", "body", "rating", "customer_name", "customer_email"], ["heading", "body", "rating", "external_product_id"], ["heading", "body", "rating", "is_verified", "state"]],
    fields: { title: ["heading"], verified: ["is_verified", "verified"], status: ["state", "status"] },
    statusMap: { approved: "published", declined: "hidden", pending: "pending" },
  },
  {
    id: "alireviews",
    label: "Ali Reviews",
    signatures: [["star", "author", "content", "country"], ["product_handle", "rating", "author", "country_code", "body"], ["product_id", "star", "content", "created_at", "photos"]],
    fields: { rating: ["star", "rating"], body: ["content", "body"], photos: ["photos", "images", "photo_url", "img"] },
  },
  {
    id: "rivyo",
    label: "Rivyo",
    signatures: [["product_handle", "reviewer_name", "review_title", "review_description"], ["review_title", "review_description", "review_rating", "reviewer_name", "review_date"]],
    fields: { body: ["review_description", "review_content"], status: ["review_status", "status"] },
  },
  { id: "other", label: "Other", signatures: [] },
]

export const PLATFORM_BY_ID: Record<PlatformId, Platform> = Object.fromEntries(PLATFORMS.map((p) => [p.id, p])) as Record<PlatformId, Platform>

export function platformLabel(id: string | null | undefined): string {
  return (id && PLATFORM_BY_ID[id as PlatformId]?.label) || "Other"
}

/**
 * The app that wrote the file: the one whose header set the file has the
 * largest share of, at least three quarters of it. A tie goes to the longer
 * set (more agreement). Nothing close enough is Other.
 */
export function detectPlatform(headers: readonly string[]): { platform: PlatformId; score: number } {
  const have = new Set(headers.map(headerKey))
  let best: { platform: PlatformId; score: number; size: number } = { platform: "other", score: 0, size: 0 }
  for (const p of PLATFORMS) {
    for (const sig of p.signatures) {
      const hits = sig.filter((h) => have.has(h)).length
      const score = hits / sig.length
      if (hits < 3 || score < 0.75) continue
      if (score > best.score || (score === best.score && sig.length > best.size)) best = { platform: p.id, score, size: sig.length }
    }
  }
  return { platform: best.platform, score: best.score }
}

/** Column index per field, -1 for a field the file does not have. */
export type ImportMapping = Record<FieldId, number>

/** Each field's column for this app: its own names first, then the common ones, never one column for two fields. */
export function autoMapping(headers: readonly string[], platform: PlatformId): ImportMapping {
  const keys = headers.map(headerKey)
  const p = PLATFORM_BY_ID[platform] ?? PLATFORM_BY_ID.other
  const used = new Set<number>()
  const out = Object.fromEntries(FIELDS.map((f) => [f, -1])) as ImportMapping
  /* The app's own names claim their columns before any common name can. */
  for (const pass of ["own", "common"] as const) {
    for (const f of FIELDS) {
      if (out[f] >= 0) continue
      const names = pass === "own" ? (p.fields?.[f] ?? []) : COMMON[f].filter((n) => !(p.not?.[f] ?? []).includes(n))
      for (const n of names) {
        const i = keys.findIndex((k, idx) => k === n && !used.has(idx))
        if (i >= 0) {
          out[f] = i
          used.add(i)
          break
        }
      }
    }
  }
  return out
}

/** What a mapping still needs before anything can import: stars, words, and a way to tell the product (or one product for every row). */
export function missingFields(mapping: ImportMapping): FieldId[] {
  const missing: FieldId[] = []
  if (mapping.rating < 0) missing.push("rating")
  if (mapping.body < 0 && mapping.title < 0) missing.push("body")
  return missing
}
