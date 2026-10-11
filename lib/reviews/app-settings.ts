/**
 * ===========================================================================
 *  STORELIB REVIEWS: THE APP'S SETTINGS AND ITS RULES, WITH NO DATABASE
 * ===========================================================================
 * Settings › Integrations › Storelib Reviews keeps one small object in
 * store_settings.reviews (run-now part 133). Everything that reads it (the
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
 *                a section shows before "Show more"
 *   editDays     how long a buyer can change their review from their link
 *
 * Nothing here imports a server module, so the settings page shares it.
 */

export const MAX_PHOTOS = 4
export const MAX_TITLE_CHARS = 120
export const MAX_BODY_CHARS = 2000
export const MIN_BODY_CHARS = 2
export const MAX_AUTHOR_CHARS = 40

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
    sort: ReviewSort
    perPage: number
  }
  editDays: number
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
  display: { starColor: DEFAULT_STAR_COLOR, showVerified: true, showDate: true, showPhotos: true, showCardRating: true, sort: "featured", perPage: 6 },
  editDays: 30,
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
      sort: pick(dp.sort, ["featured", "newest", "highest", "lowest", "photos"] as const, d.display.sort),
      perPage: int(dp.perPage, d.display.perPage, 3, 24),
    },
    editDays: int(r.editDays, d.editDays, 0, 365),
  }
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
 * The name a review shows: the first name and the first letter of the last,
 * "Jane D.", never a full name and never an address. One word stays as it
 * is. Null when nothing usable is left, and the card says "Verified buyer"
 * or "Customer".
 */
export function publicName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const clean = raw.replace(/[\u0000-\u001f<>@"`\\]/g, " ").replace(/\s+/g, " ").trim()
  if (!clean || /\w\.\w+\.\w/.test(clean) || /https?:|www\./i.test(clean)) return null
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

export type ReviewPhoto = { path: string; url: string; status: "approved" | "removed" }

/** A review's photos as stored, keeping only well formed entries. */
export function readPhotos(raw: unknown): ReviewPhoto[] {
  if (!Array.isArray(raw)) return []
  const out: ReviewPhoto[] = []
  for (const p of raw) {
    const o = obj(p)
    if (typeof o.path !== "string" || typeof o.url !== "string" || !/^https:\/\//.test(o.url)) continue
    out.push({ path: o.path, url: o.url, status: o.status === "removed" ? "removed" : "approved" })
    if (out.length >= MAX_PHOTOS + 2) break
  }
  return out
}

/** The photos a visitor may see. */
export function shownPhotos(raw: unknown): string[] {
  return readPhotos(raw)
    .filter((p) => p.status === "approved")
    .slice(0, MAX_PHOTOS)
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
export function checkAppReviewInput(body: Record<string, unknown> | null | undefined, opts: { creatorId: string; photos: boolean }): AppReviewInput {
  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Choose from one to five stars." }
  const content = cleanReviewText(body?.content, MAX_BODY_CHARS + 1)
  if (content.length < MIN_BODY_CHARS) return { ok: false, error: "Write a few words about it." }
  if (content.length > MAX_BODY_CHARS) return { ok: false, error: `Keep it under ${MAX_BODY_CHARS} characters.` }
  const title = cleanLine(body?.title, MAX_TITLE_CHARS)
  const name = publicName(cleanLine(body?.name, MAX_AUTHOR_CHARS))
  const asked = Array.isArray(body?.photos) ? (body?.photos as unknown[]) : []
  if (asked.length > MAX_PHOTOS) return { ok: false, error: `Add up to ${MAX_PHOTOS} photos.` }
  const photoPaths = opts.photos ? [...new Set(asked.filter((p): p is string => isReviewPhotoPath(p, opts.creatorId)))] : []
  return { ok: true, rating, title, content, name, photoPaths }
}
