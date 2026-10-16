/**
 * ===========================================================================
 *  STORELIB REVIEWS: THE APP'S SETTINGS AND ITS RULES, WITH NO DATABASE
 * ===========================================================================
 * Settings › Integrations › Storelib Reviews keeps one small object in
 * store_settings.reviews (run-now part 134). Everything that reads it (the
 * settings page, the routes that take a review, the request emails, the
 * website's review sections) goes through readReviewsApp, so a value that was
 * never saved, or was saved by an older version, reads as the default and a
 * value out of range is brought back into it.
 *
 *   enabled      the app is on: the website's review sections draw, visitors
 *                can write (when `who` allows), request emails go out
 *   publish      "auto": a review goes live at once when it has at least
 *                `minStars`; anything under that waits for approval.
 *                "manual": every new review waits in Reviews › Pending.
 *   who          "verified": only buyers, from their email link or receipt.
 *                "anyone": a visitor can write one on the website too; it
 *                is marked verified only when its email bought the product.
 *   photos       buyers may add up to MAX_PHOTOS pictures
 *   request      the review request email: on or off, how many days after a
 *                digital purchase, how many after a physical order shipped
 *                or was delivered, and one reminder after `reminderDays`
 *   display      star colour, what a review card shows, the order, how many
 *                a section shows before "Show more", and whether every
 *                product page gets the stars under its name and the reviews
 *                under the product without the store placing them
 *   editDays     how long a buyer can change their review from their link
 *   videos       buyers may add one short video (run-now part 189 lets the
 *                buckets take video files; until then the upload says so)
 *   spam         hold a review for approval when it carries a link, or one
 *                of the store's own words (spamHold)
 *   email        the request email's own words, sender name and product
 *                picture (lib/reviews/request-copy.ts); empty is the default
 *
 * Nothing here imports a server module, so the settings page shares it.
 */

export const MAX_PHOTOS = 4
export const MAX_TITLE_CHARS = 120
export const MAX_BODY_CHARS = 2000
export const MIN_BODY_CHARS = 2
export const MAX_AUTHOR_CHARS = 40
/** One short video a review, up to this size, uploaded straight to storage (app/api/reviews/video). */
export const MAX_VIDEOS = 1
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024
/** A photo the upload route takes (photos-server REVIEW_PHOTO_MAX_BYTES), said in the browser before it is sent. */
export const REVIEW_PHOTO_UPLOAD_BYTES = 8 * 1024 * 1024
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const
/** The store's own spam words: how many, and how long each. */
export const MAX_SPAM_WORDS = 30
export const MAX_SPAM_WORD_CHARS = 40
/** The request email's own words (lib/reviews/request-copy.ts). */
export const EMAIL_COPY_LIMITS = { subject: 120, heading: 120, body: 800, button: 40, reminderSubject: 120, reminderBody: 800, fromName: 60 } as const

export type PublishMode = "auto" | "manual"
export type WhoCanWrite = "verified" | "anyone"
export type PhysicalFrom = "delivered" | "shipped"
export type ReviewSort = "featured" | "newest" | "highest" | "lowest" | "photos"

export interface ReviewsAppSettings {
  enabled: boolean
  /** When the app was last turned on. Orders from before it are never asked: turning the app on does not email last month's buyers. */
  enabledAt: string | null
  publish: PublishMode
  minStars: number
  photos: boolean
  who: WhoCanWrite
  request: {
    enabled: boolean
    digitalDays: number
    physicalDays: number
    physicalFrom: PhysicalFrom
    reminder: boolean
    reminderDays: number
  }
  display: {
    starColor: string
    showVerified: boolean
    showDate: boolean
    showPhotos: boolean
    showCardRating: boolean
    /** Product pages get the stars under the name and the reviews under the product, unless the page already has its own (lib/website-builder/product-page.ts withProductReviews, compat/storelib-reviews.ts withProductPageReviews). */
    productPage: boolean
    sort: ReviewSort
    perPage: number
  }
  editDays: number
  videos: boolean
  spam: {
    /** A review with a link in it waits for approval. */
    holdLinks: boolean
    /** A review with one of these words waits for approval. Lower case. */
    words: string[]
  }
  email: {
    subject: string
    heading: string
    body: string
    button: string
    reminderSubject: string
    reminderBody: string
    /** The name the inbox shows; empty is the store's name. */
    fromName: string
    showProduct: boolean
  }
}

export const DEFAULT_STAR_COLOR = "#f5a623"

export const REVIEWS_APP_DEFAULTS: ReviewsAppSettings = {
  enabled: false,
  enabledAt: null,
  publish: "auto",
  minStars: 1,
  photos: true,
  who: "verified",
  request: { enabled: true, digitalDays: 7, physicalDays: 7, physicalFrom: "delivered", reminder: true, reminderDays: 7 },
  display: { starColor: DEFAULT_STAR_COLOR, showVerified: true, showDate: true, showPhotos: true, showCardRating: true, productPage: true, sort: "featured", perPage: 6 },
  editDays: 30,
  videos: false,
  spam: { holdLinks: true, words: [] },
  email: { subject: "", heading: "", body: "", button: "", reminderSubject: "", reminderBody: "", fromName: "", showProduct: true },
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)
function int(v: unknown, d: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
  if (!Number.isFinite(n)) return d
  return Math.min(max, Math.max(min, Math.round(n)))
}
function pick<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d
}

/** A colour a style attribute can carry: #rgb or #rrggbb, lower case. Anything else is the default. */
export function cleanHexColor(v: unknown, d = DEFAULT_STAR_COLOR): string {
  if (typeof v !== "string") return d
  const s = v.trim().toLowerCase()
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(s) ? s : d
}

/** Whatever was stored, as settings every reader can trust. */
export function readReviewsApp(raw: unknown): ReviewsAppSettings {
  const r = obj(raw)
  const d = REVIEWS_APP_DEFAULTS
  const rq = obj(r.request)
  const dp = obj(r.display)
  const sp = obj(r.spam)
  const em = obj(r.email)
  const copy = (k: keyof typeof EMAIL_COPY_LIMITS) => (k === "body" || k === "reminderBody" ? cleanReviewText(em[k], EMAIL_COPY_LIMITS[k]) : cleanLine(em[k], EMAIL_COPY_LIMITS[k]))
  return {
    enabled: bool(r.enabled, d.enabled),
    enabledAt: typeof r.enabledAt === "string" && Number.isFinite(Date.parse(r.enabledAt)) ? new Date(Date.parse(r.enabledAt)).toISOString() : null,
    publish: pick(r.publish, ["auto", "manual"] as const, d.publish),
    minStars: int(r.minStars, d.minStars, 1, 5),
    photos: bool(r.photos, d.photos),
    who: pick(r.who, ["verified", "anyone"] as const, d.who),
    request: {
      enabled: bool(rq.enabled, d.request.enabled),
      digitalDays: int(rq.digitalDays, d.request.digitalDays, 0, 60),
      physicalDays: int(rq.physicalDays, d.request.physicalDays, 0, 60),
      physicalFrom: pick(rq.physicalFrom, ["delivered", "shipped"] as const, d.request.physicalFrom),
      reminder: bool(rq.reminder, d.request.reminder),
      reminderDays: int(rq.reminderDays, d.request.reminderDays, 1, 30),
    },
    display: {
      starColor: cleanHexColor(dp.starColor),
      showVerified: bool(dp.showVerified, d.display.showVerified),
      showDate: bool(dp.showDate, d.display.showDate),
      showPhotos: bool(dp.showPhotos, d.display.showPhotos),
      showCardRating: bool(dp.showCardRating, d.display.showCardRating),
      productPage: bool(dp.productPage, d.display.productPage),
      sort: pick(dp.sort, ["featured", "newest", "highest", "lowest", "photos"] as const, d.display.sort),
      perPage: int(dp.perPage, d.display.perPage, 3, 24),
    },
    editDays: int(r.editDays, d.editDays, 0, 365),
    videos: bool(r.videos, d.videos),
    spam: { holdLinks: bool(sp.holdLinks, d.spam.holdLinks), words: readSpamWords(sp.words) },
    email: {
      subject: copy("subject"),
      heading: copy("heading"),
      body: copy("body"),
      button: copy("button"),
      reminderSubject: copy("reminderSubject"),
      reminderBody: copy("reminderBody"),
      fromName: copy("fromName"),
      showProduct: bool(em.showProduct, d.email.showProduct),
    },
  }
}

/** The store's spam words: lower case, trimmed, each once, at most MAX_SPAM_WORDS of MAX_SPAM_WORD_CHARS. A string is read as one a line or comma. */
export function readSpamWords(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,]+/) : []
  const out: string[] = []
  for (const w of list) {
    if (typeof w !== "string") continue
    const clean = w.replace(/[\u0000-\u001f<>"`\\]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MAX_SPAM_WORD_CHARS)
    if (clean.length >= 2 && !out.includes(clean)) out.push(clean)
    if (out.length >= MAX_SPAM_WORDS) break
  }
  return out
}

const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]{2,}\.(?:com|net|org|io|co|shop|store|xyz|ru|cn|info|biz|top|site|online|link|click)\b/i

/**
 * Why a new review waits for the store whatever the publish rule says: it
 * carries a link (when the store holds those), or one of the store's own
 * words, matched as a whole word in any case. Null when nothing holds it.
 * Pure, so the routes and the tests share it.
 */
export function spamHold(settings: Pick<ReviewsAppSettings, "spam">, text: { title?: unknown; content?: unknown; name?: unknown }): "link" | "word" | null {
  const all = [text.title, text.content, text.name].filter((t): t is string => typeof t === "string").join("\n")
  if (!all) return null
  if (settings.spam.holdLinks && LINK.test(all)) return "link"
  const lower = all.toLowerCase()
  for (const w of settings.spam.words) {
    let at = lower.indexOf(w)
    while (at >= 0) {
      const before = at === 0 ? "" : lower[at - 1]
      const after = lower[at + w.length] ?? ""
      if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return "word"
      at = lower.indexOf(w, at + 1)
    }
  }
  return null
}

/** A change from the settings page laid over what is saved, then read back through the same rules. */
export function mergeReviewsApp(current: unknown, patch: unknown, at: Date = new Date()): ReviewsAppSettings {
  const now = readReviewsApp(current)
  const { enabledAt: _ignored, ...p } = obj(patch)
  void _ignored
  const next = readReviewsApp({
    ...now,
    ...p,
    request: { ...now.request, ...obj(p.request) },
    display: { ...now.display, ...obj(p.display) },
    spam: { ...now.spam, ...obj(p.spam) },
    email: { ...now.email, ...obj(p.email) },
  })
  /* The moment it is turned on is the app's to record, never the page's. */
  next.enabledAt = next.enabled && !now.enabled ? at.toISOString() : now.enabledAt
  return next
}

/** Where a new review starts: live, or waiting for the store. */
export function initialStatus(settings: Pick<ReviewsAppSettings, "publish" | "minStars">, rating: number): "published" | "pending" {
  if (settings.publish === "manual") return "pending"
  return rating >= settings.minStars ? "published" : "pending"
}

/**
 * ===========================================================================
 *  WHO DECIDES WHERE A REVIEW SHOWS
 * ===========================================================================
 * Explore, the product page, the creator page and every Storelib rating
 * read `status`. A store's website (the Storelib Reviews sections, its
 * cards' stars and its structured data) reads `status` and `site_status`.
 *
 * A verified buyer's review is Storelib's: its `status` follows Storelib's
 * own rule (published, until a report or Storelib hides it), so a store
 * cannot take a real buyer's review out of its marketplace rating. The
 * store's approval and hide are about its own website and move
 * `site_status` only, and the store cannot delete it (it can report it,
 * and only Storelib removes a review for policy).
 *
 * An unverified review (a visitor's, an imported one) is the store's own:
 * the store's approval, hide and delete move `status`, as before.
 */
export type SiteStatus = "shown" | "pending" | "hidden"

export function readSiteStatus(v: unknown): SiteStatus {
  return v === "pending" || v === "hidden" ? v : "shown"
}

/** Tied to a purchase. A row from before run-now part 134 has no column, and every one of those was a buyer's. */
export function isVerifiedReview(row: { verified?: unknown }): boolean {
  return row.verified !== false
}

/** Where a new review starts: `status` for Storelib, `site_status` for the store's website. */
export function startingStatus(settings: Pick<ReviewsAppSettings, "publish" | "minStars">, rating: number, verified: boolean): { status: "published" | "pending"; site_status: SiteStatus } {
  const store = initialStatus(settings, rating)
  return verified ? { status: "published", site_status: store === "pending" ? "pending" : "shown" } : { status: store, site_status: "shown" }
}

/** What the store's website does with a review: show it, wait for the store, or leave it off. */
export function websiteStatus(row: { status?: unknown; site_status?: unknown }): "published" | "pending" | "hidden" {
  if (row.status === "hidden") return "hidden"
  if (row.status === "pending") return "pending"
  const site = readSiteStatus(row.site_status)
  return site === "shown" ? "published" : site
}

/**
 * The store's list (Reviews in the app): `status` is where the review is on
 * the store's own website, `hidden_by` says who hid it ("seller" for the
 * store, anything else a report or Storelib), and `on_storelib` whether
 * Explore and the product page show it, which a verified buyer's review
 * does whatever the store chose for its website.
 */
export function sellerView(row: { status?: unknown; site_status?: unknown; hidden_by?: unknown }): { status: "published" | "pending" | "hidden"; hidden_by: string | null; on_storelib: boolean } {
  const status = websiteStatus(row)
  const hidden_by = row.status === "hidden" ? (typeof row.hidden_by === "string" ? row.hidden_by : null) : status === "hidden" ? "seller" : null
  return { status, hidden_by, on_storelib: row.status !== "hidden" && row.status !== "pending" }
}

/**
 * The name a review shows: the first name and the first letter of the last,
 * "Jane D.", never a full name and never an address. One word stays as it
 * is. Null when nothing usable is left, and the card says "Verified buyer"
 * or "Customer".
 */
export function publicName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  if (/@/.test(raw)) return null
  const clean = raw.replace(/[\u0000-\u001f<>"`\\]/g, " ").replace(/\s+/g, " ").trim()
  /* An address or a link is not a name: "jane@x.com", "www.x", "spam.shop". "J.R. Smith" is. */
  if (!clean || /\w\.[a-z]{2,}\b/i.test(clean) || /https?:/i.test(clean)) return null
  const words = clean.split(" ").filter(Boolean)
  const first = words[0].slice(0, 24)
  if (words.length === 1) return first
  const last = words[words.length - 1]
  const initial = Array.from(last)[0]
  return initial && /\p{L}/u.test(initial) ? `${first} ${initial.toUpperCase()}.` : first
}

/**
 * A review's words as stored: plain text, never markup (every page escapes
 * it as it prints), with control characters gone, line breaks kept and at
 * most two in a row, and cut to `max`.
 */
export function cleanReviewText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return ""
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}

/** One line: a title or a name. */
export function cleanLine(raw: unknown, max: number): string {
  return cleanReviewText(raw, max * 2).replace(/\n+/g, " ").trim().slice(0, max)
}

/** A plausible email: one @, a dotted host, no spaces, at most 254 characters. Lower case. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const s = raw.trim().toLowerCase()
  if (s.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/.test(s)) return null
  return s
}

/**
 * A review's pictures and its video, in `reviews.photos` (one list, so the
 * part 134 column and its limits hold both). Each is approved (shown with the
 * review), removed (taken off by the store, kept and restorable) or held: a
 * video waits for the store to look at it before it is ever public, since no
 * reader checks a video the way the picture reader checks a photo.
 */
export type ReviewPhoto = { path: string; url: string; status: "approved" | "removed" | "held"; kind?: "video" }

export const isVideoPath = (path: string) => /\.(mp4|webm|mov)$/i.test(path)

/** A review's photos as stored, keeping only well formed entries. */
export function readPhotos(raw: unknown): ReviewPhoto[] {
  if (!Array.isArray(raw)) return []
  const out: ReviewPhoto[] = []
  for (const p of raw) {
    const o = obj(p)
    if (typeof o.path !== "string" || typeof o.url !== "string" || !/^https:\/\//.test(o.url)) continue
    const video = o.kind === "video" || isVideoPath(o.path)
    out.push({ path: o.path, url: o.url, status: o.status === "removed" ? "removed" : o.status === "held" ? "held" : "approved", ...(video ? { kind: "video" as const } : {}) })
    if (out.length >= MAX_PHOTOS + MAX_VIDEOS + 1) break
  }
  return out
}

/** The photos a visitor may see. */
export function shownPhotos(raw: unknown): string[] {
  return readPhotos(raw)
    .filter((p) => p.status === "approved" && p.kind !== "video")
    .slice(0, MAX_PHOTOS)
    .map((p) => p.url)
}

/** The video a visitor may see: one the store let through. */
export function shownVideos(raw: unknown): string[] {
  return readPhotos(raw)
    .filter((p) => p.status === "approved" && p.kind === "video")
    .slice(0, MAX_VIDEOS)
    .map((p) => p.url)
}

/** Whether a review can still be changed from its link. */
export function canEditUntil(createdAt: string | null | undefined, editDays: number, now = Date.now()): boolean {
  if (!createdAt || editDays <= 0) return false
  const t = Date.parse(createdAt)
  return Number.isFinite(t) && now - t <= editDays * 86_400_000
}

/** A storage path a review photo may have: the creator's folder, a random name, a picture extension. */
export function isReviewPhotoPath(path: unknown, creatorId: string): path is string {
  return typeof path === "string" && new RegExp(`^${creatorId}/[0-9a-f]{32}\\.(jpg|jpeg|png|webp|gif|avif)$`).test(path)
}

/** The same for a review's video (app/api/reviews/video names it). */
export function isReviewVideoPath(path: unknown, creatorId: string): path is string {
  return typeof path === "string" && new RegExp(`^${creatorId}/[0-9a-f]{32}\\.(mp4|webm|mov)$`).test(path)
}

/** A form sent sooner than a person could fill it in. */
export const MIN_FORM_MS = 2500

/**
 * Whether a review form was sent by a script: the field nobody sees
 * (`website`) is filled in, or it went less than MIN_FORM_MS after the page
 * opened (`openedAt`, the page's own clock). A form with no time is not
 * judged by it (an older page).
 */
export function looksAutomated(body: Record<string, unknown> | null | undefined, now = Date.now()): "honeypot" | "too_fast" | null {
  if (typeof body?.website === "string" && body.website.trim() !== "") return "honeypot"
  const opened = Number(body?.openedAt)
  if (Number.isFinite(opened) && opened > 0 && now - opened >= 0 && now - opened < MIN_FORM_MS) return "too_fast"
  return null
}

export type AppReviewInput =
  | { ok: true; rating: number; title: string; content: string; name: string | null; photoPaths: string[] }
  | { ok: false; error: string }

/**
 * What the review form sent, checked for shape and never trusted: whole
 * stars from one to five, words of the right length once cleaned, a name
 * that becomes "Jane D.", and at most MAX_PHOTOS photo paths, each in this
 * creator's folder (the upload route made them). Photos are dropped when
 * the store does not take them.
 */
export function checkAppReviewInput(body: Record<string, unknown> | null | undefined, opts: { creatorId: string; photos: boolean; videos?: boolean }): AppReviewInput {
  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose from one to five stars." }
  const content = cleanReviewText(body?.content, MAX_BODY_CHARS + 1)
  if (content.length < MIN_BODY_CHARS) return { ok: false, error: "Write a few words about it." }
  if (content.length > MAX_BODY_CHARS) return { ok: false, error: `Keep it under ${MAX_BODY_CHARS} characters.` }
  const title = cleanLine(body?.title, MAX_TITLE_CHARS)
  const name = publicName(cleanLine(body?.name, MAX_AUTHOR_CHARS))
  const asked = Array.isArray(body?.photos) ? (body?.photos as unknown[]) : []
  const videos = asked.filter((p) => typeof p === "string" && isVideoPath(p)).length
  if (asked.length - videos > MAX_PHOTOS) return { ok: false, error: `Add up to ${MAX_PHOTOS} photos.` }
  if (videos > MAX_VIDEOS) return { ok: false, error: "Add one video at most." }
  const photoPaths = [
    ...(opts.photos ? asked.filter((p): p is string => isReviewPhotoPath(p, opts.creatorId)) : []),
    ...(opts.videos ? asked.filter((p): p is string => isReviewVideoPath(p, opts.creatorId)) : []),
  ].filter((p, i, all) => all.indexOf(p) === i)
  return { ok: true, rating, title, content, name, photoPaths }
}
