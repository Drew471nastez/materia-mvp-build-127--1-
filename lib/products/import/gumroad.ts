/**
 * ===========================================================================
 *  A GUMROAD PRODUCT, READ AS A STORELIB DRAFT
 * ===========================================================================
 * Products › Import from Gumroad (app/app/products/import/gumroad). The seller
 * pastes an access token they made in Gumroad (Settings › Advanced ›
 * Applications › Generate access token). The server uses it once, for
 * GET https://api.gumroad.com/v2/products, and forgets it
 * (./gumroad-server.ts). What comes back is read here.
 *
 * WHAT GUMROAD'S API GIVES, per product (Gumroad's own source, antiwork/
 * gumroad app/models/concerns/product/as_json.rb as_json_for_api, and its
 * API page gumroad.com/api#get-/products):
 *
 *   id, name, description (HTML from their editor, or old plain text),
 *   price (in the currency's smallest unit; whole units for JPY and VND,
 *   config/currencies.json single_unit), currency (lowercase), customizable_
 *   price (pay what you want, price is then the minimum), custom_permalink,
 *   short_url, thumbnail_url, covers [{ url, original_url, type }], tags,
 *   published, deleted, require_shipping, is_tiered_membership,
 *   subscription_duration, bundle_products, variants [{ title, options:
 *   [{ name, price_difference, is_pay_what_you_want }] }].
 *
 * The list endpoint is "slim": no files, no rich content. The files are
 * never copied here: the seller uploads them again in Storelib, and every
 * imported product says so.
 *
 * NOTHING ABOUT BUYERS. The products endpoint carries no customer data
 * except two totals (sales_count, sales_usd_cents) for broad tokens, and this
 * reader never reads them.
 *
 * Pure: no network, no database, so the screen, the route and the tests read
 * the same rules.
 */

/** Where Gumroad's API lives. Fixed: nothing a seller types decides the host. */
export const GUMROAD_API = "https://api.gumroad.com/v2/products"

/**
 * The hosts Gumroad serves product pictures from (antiwork/gumroad config/
 * initializers/cdn_url_map.rb): the public files CDN, the S3 proxy, and the
 * public storage bucket an unmapped URL points at. A picture anywhere else
 * is left behind, never fetched.
 */
export const GUMROAD_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "public-files.gumroad.com",
  "static-2.gumroad.com",
  "gumroad-public-storage.s3.amazonaws.com",
])

/** Currencies Gumroad keeps in whole units, not hundredths (its config/currencies.json `single_unit`). */
const GUMROAD_WHOLE_UNIT = new Set(["JPY", "VND"])

export const MAX_IMAGES = 8
export const MAX_DESCRIPTION_IMAGES = 10
export const MAX_VARIANTS = 30
export const MAX_TAGS = 20
export const MAX_TITLE = 200
/** As much HTML as one product's description may bring along. */
export const MAX_DESCRIPTION_CHARS = 200_000

/** Why a Gumroad product cannot become a Storelib digital product here. */
export type Unsupported = "membership" | "physical" | "bundle"

/** Something the seller should know about one product, said on its row. */
export type ImportNote = "currency" | "variants_trimmed" | "images_left" | "unpublished"

export interface ImportVariant {
  name: string
  /** Its whole price in the store's currency, or null when the seller has to type it. */
  priceCents: number | null
  payWhatYouWant: boolean
}

/** One Gumroad product as the review screen shows it and the import writes it. */
export interface ImportCandidate {
  gumroadId: string
  title: string
  /** Gumroad's description as it came, never drawn as HTML on the screen; sanitised when imported. */
  descriptionHtml: string
  /** The first lines of it, as text, for the review. */
  excerpt: string
  /** In the store's currency's hundredths; null when Gumroad sells it in another currency. */
  priceCents: number | null
  /** Gumroad's own price, for the review to show beside it. */
  gumroadPrice: { amount: number; currency: string }
  payWhatYouWant: boolean
  published: boolean
  /** The product's Gumroad address, when it is one. */
  gumroadUrl: string | null
  /** Pictures on Gumroad's CDN, the first one the cover. */
  images: string[]
  variants: ImportVariant[]
  tags: string[]
  unsupported: Unsupported | null
  notes: ImportNote[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

const str = (v: unknown): string => (typeof v === "string" ? v : "")
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? Math.round(n) : null
}

/** A Gumroad id: what their API calls `id`, an opaque string. Anything else is not one. */
export function gumroadIdOf(raw: unknown): string | null {
  const id = typeof raw === "string" ? raw.trim() : ""
  return id && id.length <= 200 && /^[A-Za-z0-9_\-=+]+$/.test(id) ? id : null
}

/** A Gumroad picture address that may be fetched: https, a Gumroad CDN host, no credentials, no port. */
export function gumroadImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let value = raw.trim()
  if (value.startsWith("//")) value = `https:${value}`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  if (!GUMROAD_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null
  return url.toString()
}

/** The product's page on Gumroad, shown as a link back; only an https gumroad.com address. */
function gumroadPageUrl(raw: unknown): string | null {
  try {
    const url = new URL(str(raw))
    const host = url.hostname.toLowerCase()
    return url.protocol === "https:" && (host === "gumroad.com" || host.endsWith(".gumroad.com")) ? url.toString() : null
  } catch {
    return null
  }
}

/** Gumroad's amount as hundredths of its currency, the unit Storelib keeps prices in. */
export function gumroadToHundredths(amount: number, currency: string): number {
  return GUMROAD_WHOLE_UNIT.has(currency.toUpperCase()) ? amount * 100 : amount
}

/**
 * A Gumroad amount in the store's money, or null when it is in another
 * currency. Nothing is converted: a rate picked here would be a price the
 * seller never chose.
 */
export function storePrice(amount: number | null, gumroadCurrency: string, storeCurrency: string): number | null {
  if (amount === null || amount < 0) return null
  if (gumroadCurrency.toUpperCase() !== storeCurrency.toUpperCase()) return null
  return gumroadToHundredths(amount, gumroadCurrency)
}

/**
 * Gumroad's variant categories as Storelib's one list of options. One
 * category: each option. More: every combination ("Large / Red"), its price
 * the base plus each option's difference, up to MAX_VARIANTS.
 */
export function mapVariants(
  categories: unknown,
  base: number | null,
  gumroadCurrency: string,
  storeCurrency: string,
): { variants: ImportVariant[]; trimmed: boolean } {
  const cats = (Array.isArray(categories) ? categories : [])
    .map((c: Raw) =>
      (Array.isArray(c?.options) ? c.options : [])
        .map((o: Raw) => ({ name: str(o?.name).trim().slice(0, 120), diff: int(o?.price_difference) ?? 0, pwyw: o?.is_pay_what_you_want === true }))
        .filter((o: { name: string }) => o.name),
    )
    .filter((opts: unknown[]) => opts.length > 0)
  if (cats.length === 0) return { variants: [], trimmed: false }

  type Combo = { names: string[]; diff: number; pwyw: boolean }
  let combos: Combo[] = [{ names: [], diff: 0, pwyw: false }]
  let trimmed = false
  for (const opts of cats) {
    const next: Combo[] = []
    for (const c of combos) {
      for (const o of opts) {
        if (next.length >= MAX_VARIANTS) {
          trimmed = true
          break
        }
        next.push({ names: [...c.names, o.name], diff: c.diff + o.diff, pwyw: c.pwyw || o.pwyw })
      }
    }
    combos = next
  }
  const variants = combos.map((c) => ({
    name: c.names.join(" / ").slice(0, 200),
    priceCents: base === null ? null : storePrice(Math.max(0, base + c.diff), gumroadCurrency, storeCurrency),
    payWhatYouWant: c.pwyw,
  }))
  return { variants, trimmed }
}

/** The pictures in a description: Gumroad-hosted <img> addresses, in order, without repeats. */
export function descriptionImages(html: string): string[] {
  const out: string[] = []
  const re = /<img\b[^>]*?\bsrc\s*=\s*("([^"]*)"|'([^']*)')/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) && out.length < MAX_DESCRIPTION_IMAGES) {
    const src = (m[2] ?? m[3] ?? "").replace(/&amp;/g, "&")
    const ok = gumroadImageUrl(src)
    if (ok && !out.includes(ok)) out.push(ok)
  }
  return out
}

function textExcerpt(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}...` : text
}

/** Why this product cannot come in as a digital product, or null. */
export function unsupportedOf(p: Raw): Unsupported | null {
  if (p.is_tiered_membership === true || (typeof p.subscription_duration === "string" && p.subscription_duration)) return "membership"
  if (p.require_shipping === true) return "physical"
  if (Array.isArray(p.bundle_products) && p.bundle_products.length > 0) return "bundle"
  return null
}

/**
 * One product from GET /v2/products as a candidate, or null when it is not
 * one (no id, or deleted on Gumroad). Reads only the fields named above.
 */
export function mapGumroadProduct(p: unknown, storeCurrency: string): ImportCandidate | null {
  if (!p || typeof p !== "object") return null
  const raw = p as Raw
  const gumroadId = gumroadIdOf(raw.id)
  if (!gumroadId || raw.deleted === true) return null
  const currency = (str(raw.currency) || "usd").toUpperCase().slice(0, 3)
  const amount = Math.max(0, int(raw.price) ?? 0)
  const notes: ImportNote[] = []
  const priceCents = storePrice(amount, currency, storeCurrency)
  if (priceCents === null) notes.push("currency")

  const images: string[] = []
  const add = (u: unknown) => {
    const ok = gumroadImageUrl(u)
    if (ok && !images.includes(ok) && images.length < MAX_IMAGES) images.push(ok)
  }
  let left = 0
  for (const c of Array.isArray(raw.covers) ? raw.covers : []) {
    const type = str(c?.type)
    if (type && type !== "image") continue
    const before = images.length
    add(c?.original_url || c?.url)
    if (images.length === before && (c?.original_url || c?.url)) left++
  }
  if (raw.thumbnail_url && images.length === 0) add(raw.thumbnail_url)
  if (raw.thumbnail_url && !gumroadImageUrl(raw.thumbnail_url)) left++
  if (left > 0) notes.push("images_left")

  const { variants, trimmed } = mapVariants(raw.variants, amount, currency, storeCurrency)
  if (trimmed) notes.push("variants_trimmed")
  if (raw.published === false) notes.push("unpublished")

  const descriptionHtml = str(raw.description).slice(0, MAX_DESCRIPTION_CHARS)
  const tags = [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map((t: unknown) => str(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, MAX_TAGS) as string[]

  return {
    gumroadId,
    title: (str(raw.name).trim() || "Untitled").slice(0, MAX_TITLE),
    descriptionHtml,
    excerpt: textExcerpt(descriptionHtml),
    priceCents,
    gumroadPrice: { amount, currency },
    payWhatYouWant: raw.customizable_price === true,
    published: raw.published !== false,
    gumroadUrl: gumroadPageUrl(raw.short_url),
    images,
    variants,
    tags,
    unsupported: unsupportedOf(raw),
    notes,
  }
}

/** The address a product gets from its title, the product editor's way, with accents read as their letters ("Café" is cafe, not caf). */
export function slugFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "")
}

/* ── what the import is sent, read again on the server ─────────────────── */

export interface ImportItem {
  gumroadId: string
  title: string
  descriptionHtml: string
  priceCents: number
  payWhatYouWant: boolean
  images: string[]
  variants: { name: string; priceCents: number; payWhatYouWant: boolean }[]
  tags: string[]
}

const MAX_PRICE_CENTS = 100_000_000

const cents = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : NaN
  return Number.isInteger(n) && n >= 0 && n <= MAX_PRICE_CENTS ? n : null
}

/**
 * One product as the review sent it, checked as if a stranger had written it:
 * a Gumroad id, a title, a whole price, Gumroad CDN pictures only. Null with
 * the reason when it is not.
 */
export function readImportItem(v: unknown): { ok: true; item: ImportItem } | { ok: false; error: "bad_item" | "no_title" | "no_price" } {
  if (!v || typeof v !== "object") return { ok: false, error: "bad_item" }
  const r = v as Raw
  const gumroadId = gumroadIdOf(r.gumroadId)
  if (!gumroadId) return { ok: false, error: "bad_item" }
  const title = str(r.title).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, MAX_TITLE)
  if (!title) return { ok: false, error: "no_title" }
  const priceCents = cents(r.priceCents)
  if (priceCents === null) return { ok: false, error: "no_price" }
  const images = [...new Set((Array.isArray(r.images) ? r.images : []).map(gumroadImageUrl).filter((u): u is string => !!u))].slice(0, MAX_IMAGES)
  const variants = (Array.isArray(r.variants) ? r.variants : [])
    .slice(0, MAX_VARIANTS)
    .map((x: Raw) => ({ name: str(x?.name).trim().slice(0, 200), priceCents: cents(x?.priceCents) ?? priceCents, payWhatYouWant: x?.payWhatYouWant === true }))
    .filter((x: { name: string }) => x.name)
  const tags = [...new Set((Array.isArray(r.tags) ? r.tags : []).map((t: unknown) => str(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, MAX_TAGS) as string[]
  return {
    ok: true,
    item: {
      gumroadId,
      title,
      descriptionHtml: str(r.descriptionHtml).slice(0, MAX_DESCRIPTION_CHARS),
      priceCents,
      payWhatYouWant: r.payWhatYouWant === true,
      images,
      variants,
      tags,
    },
  }
}
