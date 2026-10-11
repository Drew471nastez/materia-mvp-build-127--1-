/**
 * ===========================================================================
 *  THE CREATOR'S ACTUAL PRODUCTS, FOR A SECTION TO DRAW
 * ===========================================================================
 * A "Product Grid" on a Storelib site was, until this existed, a row of
 * hand-typed text. The block held a title somebody typed, a price somebody
 * typed, a photo somebody uploaded again, and a product picker for the link
 * and nothing else. So a price changed in the shop still read the old number
 * on the website, a product added to the catalogue never appeared, and one
 * that sold out kept selling.
 *
 * This is where the real ones come from, and it is THE PRODUCT DATA API every
 * section, every agent and the docs describe (content/developers/selling.md,
 * "Products reach a section as `products`"). One shape, three readers:
 *
 *   a section              `{% for block in products %}` on every page, and
 *                          `page.product` on a product page (./storefront-
 *                          render.ts, components/website-builder/theme/
 *                          render-product.tsx), resolved on the server
 *   Ask Storelib           read_store (lib/website-builder/agent/loop.ts)
 *   an agent over MCP      storelib_site (lib/agent-access/site-brief.ts)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BLOCK-SHAPED ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * A product comes back as `{ id, type, settings }`, the same shape a block
 * has, so a template loops over `products` with exactly the body it already
 * uses for `blocks`, and a section that offers both is two loops rather than
 * two card designs. The language has no `assign` and no partials, and this
 * is the cheapest honest way round that without changing the language.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT IS IN IT
 * ═══════════════════════════════════════════════════════════════════════════
 * Published products only, belonging to one creator, and only what a visitor
 * of the product's own page could already see: its name, its prices, its
 * pictures, its options, its address and the link that buys it. Not the
 * cost, not the files, not who bought it. A template can print anything it
 * is given, and a section somebody wrote themselves is given exactly this.
 *
 * Money is formatted here rather than in a template. `price_cents` is an
 * integer of USD cents, the language has no arithmetic, and a template that
 * printed the raw column would say "4800". Every price is charged in US
 * dollars (lib/checkout), which is what `currency` says.
 *
 * THE BUY LINK IS BUILT HERE TOO: `checkout_url` is Storelib checkout for
 * this product (a variant's own for one option), with `src=website` so the
 * order is recorded as the website's. The site adds which website and where
 * to come back to as the link is followed (lib/orders/checkout-origin.ts),
 * and checkout checks that address against the creator's own sites
 * (lib/checkout/return-url.ts). A section never builds one by hand.
 */
import { cleanCustomFields } from "@/lib/products/custom-fields"
import type { SectionInstanceData } from "@/lib/storelib-theme/types"
import { mediaUrl } from "@/lib/storage/media-url"
import { withoutCommunityProducts } from "@/lib/communities/listing"
import { uniqueImages } from "@/lib/products/product-page-model"
import { listedOn } from "@/lib/store/channels"
import { offChannel } from "@/lib/store/channel-filter"
import { readReviewsApp } from "@/lib/reviews/app-settings"

/** One product, in the shape a block has. */
export type ProductBlock = NonNullable<SectionInstanceData["blocks"]>[string] & { id?: string }

/** Every price on Storelib is charged in US dollars. */
export const SHOP_CURRENCY = "USD"

/** One option of a product, as a section reads it. */
export interface ProductVariantCard {
  id: string
  name: string
  /** Formatted, or "" when this option is free. */
  price: string
  /** Formatted, or "" when there is nothing to compare against. */
  compare_price: string
  free: boolean
  available: boolean
  /** Storelib checkout for this option. "" when it cannot be bought. */
  checkout_url: string
}

export interface ProductCard {
  id: string
  type: "product"
  settings: {
    title: string
    /** Formatted, e.g. "$48.00". "" when it costs nothing. The minimum for pay what you want. Templates do not do money. */
    price: string
    /** "" when there is nothing to compare against. */
    compare_price: string
    /** "USD". */
    currency: string
    /** True when it costs nothing. */
    free: boolean
    /** The product's custom fields by name, plain words (lib/products/custom-fields.ts): `{{ block.settings.fields.material }}`. */
    fields?: Record<string, string>
    /** True when the buyer chooses the amount, from `price` up. */
    pay_what_you_want: boolean
    /** The main picture, or "". */
    image: string
    /** Every picture, the main one first. */
    images: string[]
    /** Where the card goes: this product's page on the website. */
    url: string
    slug: string
    /** "digital", "physical", "course" and so on, as the product was made. */
    kind: string
    /** Whether it can be bought right now. */
    available: boolean
    /** "Sold out" or "", from the product's own state, never free text. */
    tag: string
    /** Storelib checkout for this product. "" when it cannot be bought. */
    checkout_url: string
    /** Its options, cheapest first. Empty when it has none. */
    variants: ProductVariantCard[]
    /** Its category as the creator filed it, or "". */
    category?: string
    /** A shipped product's options, such as Size and Colour, with their values. Empty for the rest. */
    options?: { name: string; values: string[] }[]
  }
  /**
   * Storelib Reviews, while the store has it on with stars on cards
   * (withRatings): the average of its published reviews to one decimal
   * (`value`), how many there are, the share of five stars filled, 0 to 100,
   * for a star bar drawn with a width, and the store's star colour. Beside
   * the settings, not in them: it is the shop's fact, not a block's setting.
   * Absent otherwise, and a card draws none: `{% if block.rating.count > 0 %}`.
   */
  rating?: CardRating
}

export interface CardRating {
  value: number
  count: number
  percent: number
  color: string
}

/** A product page's product: the card, and the words of its page. */
export interface ProductPageData extends ProductCard {
  settings: ProductCard["settings"] & {
    /** Plain text with its line breaks, never HTML: print it, do not | raw it. */
    description: string
  }
}

/** `price_cents` is USD cents. One place, so every section agrees. */
export function formatPrice(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return ""
  return `$${(cents / 100).toFixed(2)}`
}

/** Never more than this, whatever a section asks for. */
export const MAX_SHOP_PRODUCTS = 24

/** Pictures a card carries at most. A product page shows a gallery, not an archive. */
const MAX_IMAGES = 12

export interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  status: string | null
  inventory_count?: number | null
  track_inventory?: boolean | null
  /** Named plain values (SQL part 107), when the row was read with them. */
  custom_fields?: unknown
  gallery_urls?: unknown
  type?: string | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  description?: string | null
  category?: string | null
}

export interface VariantRow {
  id: string
  product_id: string
  name: string | null
  price_cents: number | null
  compare_at_price_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  position?: number | null
}

/**
 * The address of Storelib checkout for a product, or one of its options.
 * Relative on purpose: on a creator's own address the proxy sends /checkout
 * to the platform, and the site adds which website it came from on the way.
 */
export function checkoutUrl(productId: string, variantId?: string | null): string {
  const q = new URLSearchParams({ productId })
  if (variantId) q.set("variantId", variantId)
  q.set("src", "website")
  return `/checkout?${q.toString()}`
}

/** A pay-what-you-want price is its minimum; anything else is its price. */
function askingCents(row: { price_cents: number | null; pay_what_you_want?: boolean | null; pwyw_min_price_cents?: number | null }): number {
  if (row.pay_what_you_want) return Math.max(0, row.pwyw_min_price_cents ?? 0)
  return row.price_cents ?? 0
}

function wasPrice(now: number, was: number | null | undefined): string {
  // Only when it is actually more than the price. A "was" that is lower
  // than the "now" is a mistake somewhere, and printing it is worse than
  // leaving it out.
  return typeof was === "number" && was > now ? formatPrice(was) : ""
}

/**
 * Picture addresses a page can load (http(s) or a path of ours), each once.
 * The main picture is usually the gallery's first entry as well, and the
 * same picture under two query strings is still one picture: the one rule
 * the product page uses too (lib/products/product-page-model.ts).
 */
function pictures(row: ProductRow): string[] {
  /* Storelib's own address for each, never the storage host's (lib/storage/media-url.ts). */
  return uniqueImages([row.thumbnail_url, ...(Array.isArray(row.gallery_urls) ? row.gallery_urls : [])].map((u) => mediaUrl(u)), MAX_IMAGES)
}

/** One option, as a section reads it. */
export function toVariant(productId: string, v: VariantRow, available: boolean): ProductVariantCard {
  const cents = askingCents(v)
  return {
    id: v.id,
    name: (v.name ?? "").trim() || "Option",
    price: formatPrice(cents),
    compare_price: wasPrice(cents, v.compare_at_price_cents),
    free: cents <= 0 && !v.pay_what_you_want,
    available,
    checkout_url: available ? checkoutUrl(productId, v.id) : "",
  }
}

/**
 * Whether a product has sold out: its stock is counted and none is left. A
 * product whose stock is not counted (no such column, or null) never sells
 * out. One rule for the card's tag and for the availability a search result
 * is told, on the website's product page and storelib.com's alike.
 */
export function soldOut(row: { inventory_count?: number | null; track_inventory?: boolean | null }): boolean {
  /* A product set not to track stock is never sold out, whatever its count says. */
  if (row.track_inventory === false) return false
  return typeof row.inventory_count === "number" && row.inventory_count <= 0
}

/** A row to the card a section draws. Exported so a test can drive it. */
export function toCard(row: ProductRow, variants: VariantRow[] = [], optionRows: OptionRow[] = []): ProductCard {
  const cents = askingCents(row)
  const images = pictures(row)
  const available = !soldOut(row)
  const options = variants
    .filter((v) => v.product_id === row.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || askingCents(a) - askingCents(b))
    .map((v) => toVariant(row.id, v, available))
  return {
    id: row.id,
    type: "product",
    settings: {
      title: row.title ?? "",
      /* A membership's price is per month, "$9.00/month", as on Storelib's own cards (lib/pricing/list-price). */
      price: row.type === "membership" && cents > 0 ? `${formatPrice(cents)}/month` : formatPrice(cents),
      compare_price: wasPrice(cents, row.compare_at_cents),
      currency: SHOP_CURRENCY,
      free: cents <= 0 && !row.pay_what_you_want,
      pay_what_you_want: row.pay_what_you_want === true,
      image: mediaUrl(row.thumbnail_url) ?? images[0] ?? "",
      images,
      url: row.slug ? `/products/${row.slug}` : "",
      slug: row.slug ?? "",
      kind: row.type ?? "",
      available,
      tag: available ? "" : "Sold out",
      checkout_url: available ? checkoutUrl(row.id) : "",
      variants: options,
      category: typeof row.category === "string" ? row.category : "",
      fields: cleanCustomFields(row.custom_fields),
      options: optionRows
        .filter((o) => o.product_id === row.id && typeof o.name === "string" && Array.isArray(o.values))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((o) => ({ name: o.name.trim(), values: o.values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()) }))
        .filter((o) => o.name && o.values.length > 0),
    },
  }
}

/** One option of a shipped product, as product_options holds it. */
export interface OptionRow {
  product_id: string
  name: string
  values: unknown[]
  position?: number | null
}

/**
 * The options (Size, Colour) of these products, for the shop's filters. Only
 * shipped products have them. Never throws: a shop whose options will not
 * load is filtered without them.
 */
export async function productOptions(db: Db, productIds: string[]): Promise<OptionRow[]> {
  if (productIds.length === 0) return []
  try {
    const q = db.from("product_options").select("product_id, name, values, position")
    if (typeof q.in !== "function") return []
    const { data, error } = await q.in("product_id", productIds).order("position", { ascending: true })
    return error ? [] : ((data ?? []) as OptionRow[])
  } catch {
    return []
  }
}

/** Tags after which words must not run together. */
const BLOCK_END = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr)>|<br\s*\/?>/gi

/**
 * A product description as plain text that keeps its paragraphs. It is stored
 * as rich text from the product editor, and a section prints it escaped
 * rather than trusting it as markup: the product page's own renderer does
 * the same, for the same reason (a stored description is user input).
 */
export function plainDescription(html: string | null | undefined, max = 5_000): string {
  if (!html) return ""
  const text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(BLOCK_END, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** The product a product page is about, from the row its route already read. */
export function toProductPage(row: ProductRow, variants: VariantRow[] = []): ProductPageData {
  const card = toCard(row, variants)
  return { ...card, settings: { ...card.settings, description: plainDescription(row.description) } }
}

/**
 * Two `eq`s, and the type says so. The first version of this filtered on
 * `status` alone, which would have put every creator's catalogue on every
 * creator's website. A shape that only allows one filter is a shape that
 * cannot express the query this has to make.
 */
interface Filter {
  eq: (col: string, val: string) => Filter
  order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null; error?: unknown }> }
}
interface VariantQuery {
  in: (col: string, vals: string[]) => { order: (col: string, opts: { ascending: boolean }) => PromiseLike<{ data: unknown[] | null; error?: unknown }> }
}
type Db = { from: (table: string) => { select: (cols: string) => Filter & Partial<VariantQuery> } }

/** Everything the data API reads, and what an older database can answer. */
/* With the column that marks a product selling a community tier, which the shop does not list (lib/communities/listing). */
/* And with stock, so a sold out product says so on its card (soldOut); a database without the columns falls back to the next. */
const PRODUCT_COLUMNS_WITH_STOCK = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents, community_id, category, inventory_count, track_inventory"
/* And with the category the shop's filters read. */
const PRODUCT_COLUMNS_WITH_CATEGORY = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents, community_id, category"
const PRODUCT_COLUMNS_WITH_COMMUNITY = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents, community_id"
const PRODUCT_COLUMNS = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents"
const PRODUCT_COLUMNS_MINIMAL = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status"
const VARIANT_COLUMNS = "id, product_id, name, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, position"
const VARIANT_COLUMNS_MINIMAL = "id, product_id, name, price_cents, position"

/**
 * Every option of these products, or none. Never throws: a product whose
 * options will not load is still a product, bought at its own price.
 */
export async function productVariants(db: Db, productIds: string[]): Promise<VariantRow[]> {
  if (productIds.length === 0) return []
  for (const cols of [VARIANT_COLUMNS, VARIANT_COLUMNS_MINIMAL]) {
    try {
      const q = db.from("product_variants").select(cols)
      if (typeof q.in !== "function") return []
      const { data, error } = await q.in("product_id", productIds).order("position", { ascending: true })
      if (error) continue
      return (data ?? []) as VariantRow[]
    } catch {
      return []
    }
  }
  return []
}

/**
 * Every column a card is made from, most first. A database that does not have
 * a column yet answers with an error, and the next set is asked for, so the
 * cards lose a field rather than the page losing its products. One list for
 * the shop's newest products and for the ones a section picked, so a product
 * reached either way is the same card: its gallery, its kind, its options.
 */
export const PRODUCT_COLUMN_SETS = [PRODUCT_COLUMNS_WITH_STOCK, PRODUCT_COLUMNS_WITH_CATEGORY, PRODUCT_COLUMNS_WITH_COMMUNITY, PRODUCT_COLUMNS, PRODUCT_COLUMNS_MINIMAL] as const

/** Rows to cards, with their options (variants) and a shipped product's Size and Colour. Never throws. */
export async function cardsFromRows(db: unknown, rows: ProductRow[], creatorId?: string): Promise<ProductCard[]> {
  if (rows.length === 0) return []
  const physical = rows.filter((r) => r.type === "physical").map((r) => r.id)
  /* In batches, so a long shop does not ask for hundreds of ids in one address. */
  const [variants, options] = await Promise.all([variantsInBatches(db as Db, rows.map((r) => r.id)), optionsInBatches(db as Db, physical)])
  const cards = rows.map((r) => toCard(r, variants, options))
  const stocked = creatorId ? await withPhysicalStock(db as Db, creatorId, rows, cards).catch(() => cards) : cards
  const fielded = await withCustomFields(db as Db, stocked).catch(() => stocked)
  return creatorId ? await withRatings(db as Db, creatorId, fielded).catch(() => fielded) : fielded
}

/**
 * STORELIB REVIEWS' STARS ON A CARD. With the app on and "Stars on product
 * cards" on (lib/reviews/app-settings.ts), each card that has published
 * reviews carries its rating: products.reviews_average and reviews_count,
 * which the reviews trigger keeps for published reviews only. A product
 * card section draws stars from it; an imported Shopify theme reads it as
 * product.metafields.reviews.rating (lib/storelib-theme/compat/objects.ts).
 * The app off, or no reviews: nothing is added. Never throws.
 */
export async function withRatings(db: Db, creatorId: string, cards: ProductCard[]): Promise<ProductCard[]> {
  if (cards.length === 0) return cards
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: app, error: appError } = await any.from("store_settings").select("reviews").eq("creator_id", creatorId).maybeSingle()
  if (appError) return cards
  const settings = readReviewsApp((app as { reviews?: unknown } | null)?.reviews)
  if (!settings.enabled || !settings.display.showCardRating) return cards
  const byId = new Map<string, { count: number; average: number }>()
  for (let i = 0; i < cards.length; i += 80) {
    const { data, error } = await any.from("products").select("id, reviews_count, reviews_average").eq("status", "published").in("id", cards.slice(i, i + 80).map((c) => c.id))
    if (error) return cards
    for (const r of (data ?? []) as { id: string; reviews_count?: number | null; reviews_average?: number | string | null }[]) {
      const count = Math.max(0, Math.floor(Number(r.reviews_count) || 0))
      const average = Math.round((Number(r.reviews_average) || 0) * 10) / 10
      if (count > 0 && average > 0) byId.set(r.id, { count, average })
    }
  }
  return cards.map((c) => {
    const r = byId.get(c.id)
    return r ? { ...c, rating: { value: r.average, count: r.count, percent: Math.round((r.average / 5) * 100), color: settings.display.starColor } } : c
  })
}

async function variantsInBatches(db: Db, ids: string[]): Promise<VariantRow[]> {
  const out: VariantRow[] = []
  for (let i = 0; i < ids.length; i += 80) out.push(...(await productVariants(db, ids.slice(i, i + 80))))
  return out
}

/**
 * ===========================================================================
 *  A SHIPPED PRODUCT'S STOCK, PER OPTION, ON ITS CARD
 * ===========================================================================
 * A physical product's stock is held per variant and per location
 * (inventory_levels), and the buy box and the product page read it
 * (lib/physical/storefront-stock.ts). The shop's cards read only the
 * product's own count, so a tote sold out in every size still said In stock
 * on the grid, and each option copied the product.
 *
 * Here, with the same rule as the buy box: a variant that tracks stock and
 * does not keep selling is sold out when the locations that fulfil orders
 * hold none of it. Each option says so on its own, and the product is sold
 * out when every option is. A database without these tables, or a product
 * with no live variants, keeps what the card already said.
 */
type StockRow = { id: string; product_id: string; name: string | null; active?: boolean | null; track_inventory?: boolean | null; inventory_policy?: string | null }

async function withPhysicalStock(db: Db, creatorId: string, rows: ProductRow[], cards: ProductCard[]): Promise<ProductCard[]> {
  const physical = rows.filter((r) => r.type === "physical").map((r) => r.id)
  if (physical.length === 0) return cards
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const live: StockRow[] = []
  for (let i = 0; i < physical.length; i += 80) {
    const { data, error } = await any.from("product_variants").select("id, product_id, name, active, track_inventory, inventory_policy").in("product_id", physical.slice(i, i + 80))
    if (error) return cards
    for (const v of (data ?? []) as StockRow[]) if (v.active !== false && !/^Archived /.test(v.name ?? "")) live.push(v)
  }
  if (live.length === 0) return cards
  const { data: locations, error: locError } = await any.from("inventory_locations").select("id").eq("creator_id", creatorId).eq("active", true).eq("fulfills_orders", true)
  if (locError) return cards
  const locIds = ((locations ?? []) as { id: string }[]).map((l) => l.id)
  const held = new Map<string, number>()
  if (locIds.length) {
    for (let i = 0; i < live.length; i += 80) {
      const { data, error } = await any.from("inventory_levels").select("variant_id, available").in("variant_id", live.slice(i, i + 80).map((v) => v.id)).in("location_id", locIds)
      if (error) return cards
      for (const l of (data ?? []) as { variant_id: string; available: number }[]) held.set(l.variant_id, (held.get(l.variant_id) ?? 0) + Math.max(0, l.available))
    }
  }
  const { data: keep } = await any.from("products").select("id, continue_selling").eq("status", "published").in("id", physical)
  const keepSelling = new Set(((keep ?? []) as { id: string; continue_selling?: boolean | null }[]).filter((p) => p.continue_selling === true).map((p) => p.id))
  const rowOf = new Map(rows.map((r) => [r.id, r]))
  const soldOutVariant = new Map<string, boolean>()
  for (const v of live) {
    const tracked = v.track_inventory ?? rowOf.get(v.product_id)?.track_inventory ?? true
    const keeps = v.inventory_policy === "continue" || keepSelling.has(v.product_id)
    soldOutVariant.set(v.id, tracked && !keeps && (held.get(v.id) ?? 0) <= 0)
  }
  return cards.map((card) => {
    const mine = live.filter((v) => v.product_id === card.id)
    if (mine.length === 0) return card
    const variants = card.settings.variants.map((opt) => {
      const out = soldOutVariant.get(opt.id)
      if (out === undefined) return opt
      return { ...opt, available: !out, checkout_url: out ? "" : checkoutUrl(card.id, opt.id) }
    })
    const available = mine.some((v) => soldOutVariant.get(v.id) === false)
    return { ...card, settings: { ...card.settings, variants, available, tag: available ? card.settings.tag === "Sold out" ? "" : card.settings.tag : "Sold out", checkout_url: available ? checkoutUrl(card.id) : "" } }
  })
}

/**
 * Each card's custom fields (products.custom_fields, SQL part 107), read in a
 * request of their own so a database without the column still lists its
 * products; then every card has `fields`, empty when it has none.
 */
export async function withCustomFields(db: Db, cards: ProductCard[]): Promise<ProductCard[]> {
  if (cards.length === 0) return cards
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, Record<string, string>>()
  for (let i = 0; i < cards.length; i += 80) {
    const { data, error } = await any.from("products").select("id, custom_fields").eq("status", "published").in("id", cards.slice(i, i + 80).map((c) => c.id))
    if (error) return cards.map((c) => ({ ...c, settings: { ...c.settings, fields: c.settings.fields ?? {} } }))
    for (const r of (data ?? []) as { id: string; custom_fields?: unknown }[]) byId.set(r.id, cleanCustomFields(r.custom_fields))
  }
  return cards.map((c) => ({ ...c, settings: { ...c.settings, fields: byId.get(c.id) ?? {} } }))
}

async function optionsInBatches(db: Db, ids: string[]): Promise<OptionRow[]> {
  const out: OptionRow[] = []
  for (let i = 0; i < ids.length; i += 80) out.push(...(await productOptions(db, ids.slice(i, i + 80))))
  return out
}



/**
 * ONE CREATOR'S published products, newest first, with their options.
 *
 * `creator_id` is not optional and not a convenience: it is the whole of
 * what keeps one person's catalogue off another person's site. An empty
 * creator id returns nothing rather than everything, because a filter that
 * matches nobody is the safe reading of a missing filter.
 *
 * Never throws. A section that cannot reach the catalogue draws no products,
 * which is the same rule as a section whose file will not compile. A column
 * an older database does not have yet is asked for again without it, so the
 * cards lose a field rather than the page losing its products.
 */
export async function shopProducts(db: Db, creatorId: string, limit = MAX_SHOP_PRODUCTS): Promise<ProductCard[]> {
  const n = Math.max(1, Math.min(MAX_SHOP_PRODUCTS, Math.floor(limit) || MAX_SHOP_PRODUCTS))
  return readCards(db, creatorId, n, true)
}

/** Most products the builder's pickers are offered, newest first. */
export const MAX_CATALOG_PRODUCTS = 100

/**
 * EVERY published product a picker may name, as cards: what the builder's
 * canvas resolves a product picker, a product list and a collection against.
 * The shop's own list (`shopProducts`) leaves out a product that sells a
 * community tier; a picker may still name one, as on the live page, where a
 * picked product is read by id whatever it sells.
 */
export async function catalogCards(db: Db, creatorId: string, limit = MAX_CATALOG_PRODUCTS): Promise<ProductCard[]> {
  const n = Math.max(1, Math.min(MAX_CATALOG_PRODUCTS, Math.floor(limit) || MAX_CATALOG_PRODUCTS))
  return readCards(db, creatorId, n, false)
}

/**
 * The whole shop for its own listing pages (/products, /collections/<handle>,
 * /search), newest first, up to MAX_CATALOGUE_PRODUCTS: what the pages of
 * catalogPage are cut from. The sections everywhere else keep the newest 24.
 * Variants are read in batches, so a long shop does not ask for 240 ids in
 * one address.
 */
export const MAX_CATALOGUE_PRODUCTS = 240
export async function shopCatalogue(db: Db, creatorId: string): Promise<ProductCard[]> {
  return readCards(db, creatorId, MAX_CATALOGUE_PRODUCTS, true)
}

async function readCards(db: Db, creatorId: string, n: number, listedOnly: boolean): Promise<ProductCard[]> {
  if (!creatorId) return []
  try {
    let rows: ProductRow[] | null = null
    for (const cols of PRODUCT_COLUMN_SETS) {
      const { data, error } = await db
        .from("products")
        .select(cols)
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(n)
      if (error) continue
      rows = listedOnly ? withoutCommunityProducts((data ?? []) as ProductRow[]) : ((data ?? []) as ProductRow[])
      break
    }
    if (!rows) return []
    /* Settings › Sales channels: a product taken off the Online store is in none of its lists (lib/store/channels). */
    rows = listedOn(rows, await offChannel(db, creatorId, "storefront"))
    return await cardsFromRows(db, rows, creatorId)
  } catch {
    return []
  }
}
