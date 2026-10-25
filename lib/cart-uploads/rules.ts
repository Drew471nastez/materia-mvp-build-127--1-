/**
 * ===========================================================================
 *  A BUYER'S PICTURE ON A CART LINE: THE RULES EVERY PART READS
 * ===========================================================================
 * A product form can ask for a picture (a photo on a mug, a logo on a cap):
 * an imported Shopify theme's `<input type="file" name="properties[Photo]">`
 * posted to /cart/add, a theme script's POST /cart/upload, or the Storelib
 * theme's Personalization block posting to /api/cart/uploads. Whichever way
 * it comes, the file is checked, cleaned and kept by lib/cart-uploads/store.ts
 * and the cart line holds this, as the property's value:
 *
 *     /api/cart/uploads/<id>.<sig>/<name>
 *
 * `<id>` is the upload's random id (32 hex), `<sig>` an HMAC over the store,
 * the id and the browser's own cart cookie (lib/cart-uploads/sign.ts), so
 * the value cannot be guessed, cannot be read by anybody else's browser, and
 * means nothing on another store. It is a path on the store's own host, and
 * contains "/uploads/" as a Shopify upload's address does, so a theme that
 * shows an uploaded file as a link (Dawn's `contains '/uploads/'`) shows
 * this one too. Opening it is GET /api/cart/uploads/<id>.<sig>/<name>,
 * which answers the browser that uploaded it, on that store, with a link
 * to the picture that lasts ten minutes, and nobody else.
 *
 * Pure: the browser, the server and the tests read the same rules.
 */

/** Where the value of an uploaded file starts. */
export const CART_UPLOAD_PATH = "/api/cart/uploads/"

/** The picture formats taken. HEIC is refused (no decoder on the server; iOS sends a JPEG when the page asks for one), SVG and GIF too. */
export const CART_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export type CartUploadType = (typeof CART_UPLOAD_TYPES)[number]
export const CART_UPLOAD_EXT: Record<CartUploadType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
/** What an `<input type="file">` asks the phone for: a JPEG from an iPhone rather than a HEIC. */
export const CART_UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp"

/** One file: 10 MB. */
export const CART_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
/** No edge longer than this, and no more pixels than that (a print at 300 dpi of 1 m is under 12000 px). */
export const CART_UPLOAD_MAX_EDGE = 12_000
export const CART_UPLOAD_MAX_PIXELS = 50_000_000
/** Too small to print or to see. */
export const CART_UPLOAD_MIN_EDGE = 16
/** Files in one /cart/add or one upload request. */
export const CART_UPLOADS_PER_REQUEST = 5
/** Uploads one browser may send one store in an hour, and a whole store in an hour (lib/api/rate-limit). */
export const CART_UPLOADS_PER_VISITOR_HOUR = 30
export const CART_UPLOADS_PER_STORE_HOUR = 600
/** An upload no paid order took is removed after this many days: the cart cookie lives 14. */
export const CART_UPLOAD_KEEP_DAYS = 14
/** How long a link to the picture lasts: the buyer's own (a cart, the checkout), the store's order page, a print partner. */
export const BUYER_LINK_SECONDS = 10 * 60
export const CREATOR_LINK_SECONDS = 60 * 60
export const PARTNER_LINK_SECONDS = 7 * 24 * 60 * 60

/** The browser's cart, for uploads: a random id in an httpOnly cookie on the store's host. */
export const CART_VISITOR_COOKIE = "sl_cart_uid"
export const CART_VISITOR_MAX_AGE = 30 * 24 * 60 * 60

const ID = /^[0-9a-f]{32}$/
const SIG = /^[A-Za-z0-9_-]{22}$/
const VALUE = /^\/api\/cart\/uploads\/([0-9a-f]{32})\.([A-Za-z0-9_-]{22})\/([A-Za-z0-9._-]{1,80})$/

export interface UploadValue {
  /** The upload's id, as the row and the stored file are named (32 hex, a uuid without its dashes). */
  id: string
  sig: string
  /** `<id>.<sig>`. */
  ref: string
  /** The file name shown for it. */
  name: string
}

/** A line property's value as the reference to an uploaded picture, or null when it is anything else (the buyer's words). */
export function readUploadValue(value: unknown): UploadValue | null {
  if (typeof value !== "string" || value.length > 200) return null
  const m = value.match(VALUE)
  if (!m) return null
  return { id: m[1], sig: m[2], ref: `${m[1]}.${m[2]}`, name: m[3] }
}

export function isUploadValue(value: unknown): boolean {
  return readUploadValue(value) !== null
}

/** `<id>.<sig>` read alone (the GET route's segment), or null. */
export function readRef(ref: unknown): { id: string; sig: string } | null {
  if (typeof ref !== "string") return null
  const [id, sig, extra] = ref.split(".")
  if (extra !== undefined || !ID.test(id ?? "") || !SIG.test(sig ?? "")) return null
  return { id, sig }
}

/**
 * The name in the value: letters, digits, dot, dash and underscore only, at
 * most 80, with the extension the bytes deserve (a JPEG sent as photo.png is
 * photo.jpg). Anything else in the buyer's name becomes a dash.
 */
export function uploadFileName(name: string, type: CartUploadType): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? ""
  const stem = base.replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60) || "photo"
  return `${stem}.${CART_UPLOAD_EXT[type]}`
}

export function uploadValue(ref: string, fileName: string): string {
  return `${CART_UPLOAD_PATH}${ref}/${fileName}`
}

/** The uploaded pictures a line's properties name, each with the property it is under. */
export function uploadsOf(props: Record<string, string> | null | undefined): { property: string; upload: UploadValue }[] {
  const out: { property: string; upload: UploadValue }[] = []
  for (const [k, v] of Object.entries(props ?? {})) {
    const upload = readUploadValue(v)
    if (upload) out.push({ property: k, upload })
  }
  return out
}

export function hasUploads(props: Record<string, string> | null | undefined): boolean {
  return Object.values(props ?? {}).some(isUploadValue)
}

/** A property's value as words: an uploaded picture by its file name, anything else as it is. */
export function propertyText(value: string): string {
  const upload = readUploadValue(value)
  return upload ? upload.name : value
}

/** Why a picture is refused, in the words the buyer is shown. */
export const UPLOAD_ERRORS = {
  empty: "That file is empty. Choose another picture.",
  too_large: "That picture is over 10 MB. Choose a smaller one.",
  not_image: "That file isn't a picture. Use a JPEG, PNG or WebP.",
  heic: "HEIC photos can't be used. Save it as a JPEG and try again.",
  too_big_dimensions: "That picture is too large. Use one under 12000 pixels on each side.",
  too_small: "That picture is too small to print. Use a bigger one.",
  unreadable: "That picture could not be read. Try another one.",
  too_many: `Send up to ${CART_UPLOADS_PER_REQUEST} pictures at a time.`,
  not_ready: "Picture uploads aren't available on this shop yet.",
  failed: "The picture could not be kept. Try again.",
  limited: "Too many pictures sent. Wait a moment and try again.",
  wrong_place: "Upload the picture from the shop's website.",
  stale: "A picture on this order can't be used any more. Add it to the cart again.",
} as const
export type UploadErrorCode = keyof typeof UPLOAD_ERRORS
