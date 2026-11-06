import {withKnownVariantPrices} from "@/lib/pricing/variant-price"
import {listPrice} from "@/lib/pricing/list-price"
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
import { cleanSwatches } from "@/lib/products/option-swatches"
import { salesStandings } from "@/lib/products/sales-standings"
import { salesSoldOut, type SalesStanding } from "@/lib/products/sales-limit"
import { cleanCustomFields } from "@/lib/products/custom-fields"
import type { PersonalizationField } from "@/lib/products/personalization"
import { personalizationOf } from "@/lib/products/personalization-read"
import type { SectionInstanceData } from "@/lib/storelib-theme/types"
import { mediaUrl } from "@/lib/storage/media-url"
import { withoutCommunityProducts } from "@/lib/communities/listing"
import { uniqueImages } from "@/lib/products/product-page-model"
import { listedOn } from "@/lib/store/channels"
import { offChannel } from "@/lib/store/channel-filter"
import { readReviewsApp } from "@/lib/reviews/app-settings"
import { imagesOnly, isPosterName, isVideoUrl } from "@/lib/media/video"
import { plainDescription } from "@/lib/products/plain-description"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { NO_ROWS, readLadder } from "@/lib/supabase/missing-memory"
import { oncePerClient } from "@/lib/supabase/per-client"

/** One product, in the shape a block has. */
export type ProductBlock = NonNullable<SectionInstanceData["blocks"]>[string] & { id?: string }

/** The currency every store's prices are in and charged in (lib/store/shop-money.ts): not always dollars. */
export { SHOP_CURRENCY }

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
  /** This option's own photo (the product editor's variant photo), or absent. An imported theme's `variant.featured_media`. */
  image?: string
  /** Its value for each option (Size, Colour), as the product editor set them; absent on an older database. An imported theme's `variant.options`. */
  options?: (string | null)[]
  /** Its asking price in the store's currency's minor units, for the shop's filters and sort (lib/products/catalog-filters.ts), never printed. */
  price_cents?: number
}

export interface ProductCard {
  id: string
  type: "product"
  /**
   * Round 12: its asking price in the store's currency's minor units, for the
   * shop's filters and sort (lib/products/catalog-filters.ts), which cannot
   * read every currency back from the formatted price. Beside the settings,
   * not in them: a template is handed money as words and never does sums.
   */
  price_cents?: number
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
    /** Round 12, for the shop's filters (lib/products/catalog-filters.ts): its tags and its brand (vendor) as Products holds them; absent on a database without them. */
    tags?: string[]
    vendor?: string
    /** Round 12: the product's description from Products as cleaned markup, on the cards a section featuring a product reads (lib/website-builder/product-descriptions.ts). */
    description_html?: string
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

/** `price_cents` is hundredths of the store's own currency (lib/store/selling-currency). One place, so every section agrees. */
export function formatPrice(cents: number | null | undefined, currency: string = SHOP_CURRENCY): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return ""
  return shopMoneyIn(cents, currency)
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
  sold_out?:boolean
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
  /** Round 12: a shipped product's tags and brand (Products), for the shop's filters. */
  tags?: unknown
  vendor?: string | null
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
  image_url?: string | null
  /** Its value for each option, as the product editor set them (SQL part 78). */
  option1?: string | null
  option2?: string | null
  option3?: string | null
  /** False once the editor switched it off; an archived one is named "Archived …". Neither is offered. */
  active?: boolean | null
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

function wasPrice(now: number, was: number | null | undefined, currency: string = SHOP_CURRENCY): string {
  // Only when it is actually more than the price. A "was" that is lower
  // than the "now" is a mistake somewhere, and printing it is worse than
  // leaving it out.
  return typeof was === "number" && was > now ? formatPrice(was, currency) : ""
}

/**
 * Picture addresses a page can load (http(s) or a path of ours), each once.
 * The main picture is usually the gallery's first entry as well, and the
 * same picture under two query strings is still one picture: the one rule
 * the product page uses too (lib/products/product-page-model.ts).
 */
function pictures(row: ProductRow): string[] {
  /* Storelib's own address for each, never the storage host's (lib/storage/media-url.ts). */
  return uniqueImages(imagesOnly([row.thumbnail_url, ...(Array.isArray(row.gallery_urls) ? row.gallery_urls : [])]).map((u) => mediaUrl(u)), MAX_IMAGES)
}

/**
 * The photos and videos in their order, for a product page's gallery (an
 * imported theme's product.media, lib/storelib-theme/compat/objects.ts), only
 * when there is a video among them: a video's first frame (the thumbnail when
 * the video is first) is left out, since the video itself is there.
 */
function mediaWithVideos(row: ProductRow): string[] | null {
  const gallery = Array.isArray(row.gallery_urls) ? (row.gallery_urls as unknown[]) : []
  if (!gallery.some((u) => typeof u === "string" && isVideoUrl(u))) return null
  return uniqueImages([row.thumbnail_url, ...gallery].filter((u) => typeof u === "string" && !isPosterName(u)).map((u) => mediaUrl(u as string)), MAX_IMAGES)
}

/** One option, as a section reads it. */
export function toVariant(productId: string, v: VariantRow, available: boolean, currency: string = SHOP_CURRENCY): ProductVariantCard {
  const cents = askingCents(v)
  return {
    id: v.id,
    name: (v.name ?? "").trim() || "Option",
    price: formatPrice(cents, currency),
    compare_price: wasPrice(cents, v.compare_at_price_cents, currency),
    free: cents <= 0 && !v.pay_what_you_want,
    available,
    price_cents: cents,
    checkout_url: available ? checkoutUrl(productId, v.id) : "",
    ...(typeof v.image_url === "string" && /^https:\/\//.test(v.image_url.trim()) ? { image: mediaUrl(v.image_url.trim()) } : {}),
    ...([v.option1, v.option2, v.option3].some((x) => typeof x === "string" && x.trim() !== "") ? { options: [v.option1 ?? null, v.option2 ?? null, v.option3 ?? null] } : {}),
  }
}

/** A variant that is on sale: not switched off, not one the editor archived (lib/physical/storefront-stock.ts liveVariant). */
function onSale(v: VariantRow): boolean {
  return v.active !== false && !/^Archived /.test(v.name ?? "")
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
export function toCard(row: ProductRow, variants: VariantRow[] = [], optionRows: OptionRow[] = [], currency: string = SHOP_CURRENCY): ProductCard {
  const ownVariants=variants.filter(v=>v.product_id===row.id)
  row=withKnownVariantPrices(row,ownVariants)
  const priceLabel=listPrice(row,c=>formatPrice(c,currency))
  const cents = askingCents(row)
  const images = pictures(row)
  const available = !soldOut(row) && row.sold_out!==true
  const options = variants
    .filter((v) => v.product_id === row.id && onSale(v))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || askingCents(a) - askingCents(b))
    .map((v) => toVariant(row.id, v, available, currency))
  return {
    id: row.id,
    type: "product",
    price_cents: cents,
    settings: {
      title: row.title ?? "",
      /* A membership's price is per month, "$9.00/month", as on Storelib's own cards (lib/pricing/list-price). */
      price: ownVariants.length ? priceLabel.main : row.type === "membership" && cents > 0 ? `${formatPrice(cents, currency)}/month` : formatPrice(cents, currency),
      compare_price: wasPrice(cents, row.compare_at_cents, currency),
      currency,
      free: ownVariants.length ? options.length>0 && options.every(v=>v.free) : cents <= 0 && !row.pay_what_you_want,
      pay_what_you_want: row.pay_what_you_want === true,
      image: mediaUrl(row.thumbnail_url) ?? images[0] ?? "",
      images,
      ...(mediaWithVideos(row) ? { media: mediaWithVideos(row) } : {}),
      url: row.slug ? `/products/${row.slug}` : "",
      slug: row.slug ?? "",
      kind: row.type ?? "",
      available,
      tag: available ? "" : "Sold out",
      checkout_url: available ? checkoutUrl(row.id,options.length===1?options[0].id:undefined) : "",
      variants: options,
      category: typeof row.category === "string" ? row.category : "",
      fields: cleanCustomFields(row.custom_fields),
      options: optionRows
        .filter((o) => o.product_id === row.id && typeof o.name === "string" && Array.isArray(o.values))
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((o) => {
          const values = o.values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
          const swatches = cleanSwatches(o.swatches, values)
          return { name: o.name.trim(), values, ...(Object.keys(swatches).length ? { swatches } : {}) }
        })
        .filter((o) => o.name && o.values.length > 0),
      ...(Array.isArray(row.tags) ? { tags: [...new Set((row.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()))] } : {}),
      ...(typeof row.vendor === "string" && row.vendor.trim() ? { vendor: row.vendor.trim() } : {}),
    },
  }
}

/** One option of a shipped product, as product_options holds it. */
export interface OptionRow {
  product_id: string
  name: string
  values: unknown[]
  position?: number | null
  /** Each value's own swatch (part 286, lib/products/option-swatches.ts); absent before it. */
  swatches?: unknown
}

/**
 * The options (Size, Colour) of these products, for the shop's filters. Only
 * shipped products have them. Never throws: a shop whose options will not
 * load is filtered without them.
 */
export async function productOptions(db: Db, productIds: string[]): Promise<OptionRow[]> {
  if (productIds.length === 0) return []
  try {
    /* With each value's own swatch (part 286); a database before it is asked again without. */
    if (typeof db.from("product_options").select("product_id").in !== "function") return []
    /* Remembered ten minutes when the swatches are missing (lib/supabase/missing-memory.ts), not refused on every list. */
    const { data, error } = await readLadder(
      "product_options:cards",
      ["product_id, name, values, position, swatches", "product_id, name, values, position"].map((cols) => () => db.from("product_options").select(cols).in!("product_id", productIds).order("position", { ascending: true })),
    )
    return error ? [] : ((data ?? []) as OptionRow[])
  } catch {
    return []
  }
}

/* A product description as plain text that keeps its paragraphs (lib/products/plain-description.ts), here for the callers that always read it from this file. */
export { plainDescription }

/** The product a product page is about, from the row its route already read. */
export function toProductPage(row: ProductRow, variants: VariantRow[] = [], currency: string = SHOP_CURRENCY): ProductPageData {
  const card = toCard(row, variants, [], currency)
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
/* Round 12: and the tags and the brand the shop's filters offer (physical commerce's columns). */
const PRODUCT_COLUMNS_WITH_TAGS = `${PRODUCT_COLUMNS_WITH_STOCK}, tags, vendor`
/* And with the category the shop's filters read. */
const PRODUCT_COLUMNS_WITH_CATEGORY = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents, community_id, category"
const PRODUCT_COLUMNS_WITH_COMMUNITY = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents, community_id"
const PRODUCT_COLUMNS = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status, gallery_urls, type, pay_what_you_want, pwyw_min_price_cents"
const PRODUCT_COLUMNS_MINIMAL = "id, title, slug, price_cents, compare_at_cents, thumbnail_url, status"
/* With each option's values and whether it is on sale, then its photo; a database without a column answers with an error and the next set is asked for. */
const VARIANT_COLUMNS_WITH_OPTIONS = "id, product_id, name, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, position, image_url, option1, option2, option3, active"
const VARIANT_COLUMNS_WITH_IMAGE = "id, product_id, name, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, position, image_url"
const VARIANT_COLUMNS = "id, product_id, name, price_cents, compare_at_price_cents, pay_what_you_want, pwyw_min_price_cents, position"
const VARIANT_COLUMNS_MINIMAL = "id, product_id, name, price_cents, position"

/**
 * Every option of these products, or none. Never throws: a product whose
 * options will not load is still a product, bought at its own price.
 */
export async function productVariants(db: Db, productIds: string[]): Promise<VariantRow[]> {
  if (productIds.length === 0) return []
  try {
    if (typeof db.from("product_variants").select(VARIANT_COLUMNS_MINIMAL).in !== "function") return []
    /* Each set fewer only when a column is missing, remembered ten minutes (lib/supabase/missing-memory.ts). */
    const { data, error } = await readLadder(
      "product_variants:cards",
      [VARIANT_COLUMNS_WITH_OPTIONS, VARIANT_COLUMNS_WITH_IMAGE, VARIANT_COLUMNS, VARIANT_COLUMNS_MINIMAL].map((cols) => () => db.from("product_variants").select(cols).in!("product_id", productIds).order("position", { ascending: true })),
    )
    return error ? [] : ((data ?? []) as VariantRow[])
  } catch {
    return []
  }
}

/**
 * Every column a card is made from, most first. A database that does not have
 * a column yet answers with an error, and the next set is asked for, so the
 * cards lose a field rather than the page losing its products. One list for
 * the shop's newest products and for the ones a section picked, so a product
 * reached either way is the same card: its gallery, its kind, its options.
 */
export const PRODUCT_COLUMN_SETS = [PRODUCT_COLUMNS_WITH_TAGS, PRODUCT_COLUMNS_WITH_STOCK, PRODUCT_COLUMNS_WITH_CATEGORY, PRODUCT_COLUMNS_WITH_COMMUNITY, PRODUCT_COLUMNS, PRODUCT_COLUMNS_MINIMAL] as const

/**
 * Rows to cards, with their options (variants) and a shipped product's Size and Colour. Never throws.
 *
 * EVERY READ AT ONCE. The variants, the options, the stock, the sales limits,
 * the custom fields and the stars each depend on the rows alone, and were
 * asked one after another: seven round trips in a row before the first
 * visitor of a website saw a product. They are asked together now and laid
 * over the cards in the same order as before, so a card comes out the same.
 */
export async function cardsFromRows(db: unknown, rows: ProductRow[], creatorId?: string, currency?: string | Promise<string>): Promise<ProductCard[]> {
  if (rows.length === 0) return []
  const physical = rows.filter((r) => r.type === "physical").map((r) => r.id)
  const ids = rows.map((r) => r.id)
  /* In batches, so a long shop does not ask for hundreds of ids in one address. */
  const [shown, variants, options, stock, standings, fields, ratings, asks] = await Promise.all([
    /* In the store's own currency (Settings › Country & Currency), the one its prices are in. */
    currency ?? (creatorId ? readStoreCurrency(db, creatorId).then((c) => c.currency) : SHOP_CURRENCY),
    variantsInBatches(db as Db, ids),
    optionsInBatches(db as Db, physical),
    creatorId ? physicalStockFacts(db as Db, creatorId, rows).catch(() => null) : null,
    salesStandingsOf(db, rows).catch(() => null),
    customFieldsOf(db as Db, ids).catch(() => undefined),
    creatorId ? ratingsOf(db as Db, creatorId, ids).catch(() => null) : null,
    /* Personalization (SQL part 307, lib/products/personalization): only a product that ships asks; none when the column is not there. */
    physical.length ? personalizationOf(db, physical).catch(() => null) : null,
  ])
  const cards = rows.map((r) => toCard(r, variants, options, shown))
  /* Laid over in the order they always were: stock, sales limits, custom fields, stars. */
  const stocked = stock ? withStockFacts(rows, cards, stock) : cards
  const capped = standings ? withStandings(stocked, standings) : stocked
  /* A read that threw leaves the cards as they were, as it always did. */
  const fielded = fields === undefined ? capped : withFieldsRead(capped, fields)
  const rated = ratings ? withRatingsRead(fielded, ratings) : fielded
  return asks?.size ? withPersonalization(rated, asks) : rated
}

/**
 * A card's personalization fields, as `settings.personalization` (what an
 * imported theme reads as product.metafields.storelib.personalization, and
 * what its cart holds an add to). A product that asks for a required answer
 * has no straight-to-checkout link: a Buy button on a card or a hero goes to
 * its page, where the buyer can give it.
 */
function withPersonalization(cards: ProductCard[], asks: Map<string, PersonalizationField[]>): ProductCard[] {
  return cards.map((c) => {
    const fields = asks.get(c.id)
    if (!fields?.length) return c
    const required = fields.some((f) => f.required)
    const settings: Record<string, unknown> = { ...c.settings, personalization: fields }
    if (required && settings.checkout_url) settings.checkout_url = settings.url || ""
    if (required && Array.isArray(settings.variants)) settings.variants = (settings.variants as Record<string, unknown>[]).map((v) => (v.checkout_url ? { ...v, checkout_url: settings.url || "" } : v))
    return { ...c, settings: settings as ProductCard["settings"] }
  })
}

/**
 * LIMIT SALES ON A CARD (lib/products/sales-limit.ts): a download whose
 * limited run has gone says Sold out and has no checkout, as a sold out
 * product that ships does. Counted on the server (product_sales_status, the
 * server's own client); any other client, or a database before part 150,
 * leaves the cards as they were. Never throws.
 */
/** The standings of the rows' downloads, or null when none is limited. Read for cardsFromRows above. */
async function salesStandingsOf(db: unknown, rows: ProductRow[]): Promise<Map<string, SalesStanding> | null> {
  const ids = rows.filter((r) => r.type !== "physical").map((r) => r.id)
  if (ids.length === 0) return null
  const standings = await salesStandings(db as Parameters<typeof salesStandings>[0], ids)
  return standings.size === 0 ? null : standings
}

function withStandings(cards: ProductCard[], standings: Map<string, SalesStanding>): ProductCard[] {
  return cards.map((card) => {
    if (!salesSoldOut(standings.get(card.id))) return card
    const variants = (card.settings.variants ?? []).map((v) => ({ ...v, available: false, checkout_url: "" }))
    return { ...card, settings: { ...card.settings, available: false, tag: "Sold out", checkout_url: "", variants } }
  })
}

/**
 * STORELIB REVIEWS' STARS ON A CARD. With the app on and "Stars on product
 * cards" on (lib/reviews/app-settings.ts), each card that has reviews shown
 * on the website carries its rating, counted from the reviews the website's
 * review sections show: published, and not hidden or waiting on the website
 * (site_status). Before run-now part 134 (no site_status, and the app cannot
 * be on) it is products.reviews_average and reviews_count. A product
 * card section draws stars from it; an imported Shopify theme reads it as
 * product.metafields.reviews.rating (lib/storelib-theme/compat/objects.ts).
 * The app off, or no reviews: nothing is added. Never throws.
 */
export async function withRatings(db: Db, creatorId: string, cards: ProductCard[]): Promise<ProductCard[]> {
  if (cards.length === 0) return cards
  const ratings = await ratingsOf(db, creatorId, cards.map((c) => c.id))
  return ratings ? withRatingsRead(cards, ratings) : cards
}

type RatingsRead = { byId: Map<string, { count: number; average: number }>; color: string }

/** The stars of these products, or null when the cards keep none (the app off, a read that failed). */
async function ratingsOf(db: Db, creatorId: string, productIds: string[]): Promise<RatingsRead | null> {
  if (productIds.length === 0) return null
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  /* The Reviews app's settings, once per request and store (lib/supabase/per-client.ts): the catalogue and the shop's list each asked. */
  const { data: app, error: appError } = await oncePerClient(any, `store-reviews-app:${creatorId}`, async () => (await any.from("store_settings").select("reviews").eq("creator_id", creatorId).maybeSingle()) as { data: unknown; error: unknown })
  if (appError) return null
  const settings = readReviewsApp((app as { reviews?: unknown } | null)?.reviews)
  if (!settings.enabled || !settings.display.showCardRating) return null
  const byId = new Map<string, { count: number; average: number }>()
  for (let i = 0; i < productIds.length; i += 80) {
    const ids = productIds.slice(i, i + 80)
    /* This store's reviews only: a product id from another store reads nothing. */
    const shown = await any.from("reviews").select("product_id, rating").eq("creator_id", creatorId).in("product_id", ids).eq("status", "published").eq("site_status", "shown").limit(5000)
    if (!shown.error) {
      const sums = new Map<string, { n: number; total: number }>()
      for (const r of (shown.data ?? []) as { product_id: string; rating: number | string }[]) {
        /* Each rating read as the product page's summary reads it (lib/reviews/rules.ts summarize), so a card and its page say the same average. */
        const rating = Math.round(Number(r.rating))
        if (!(rating >= 1 && rating <= 5)) continue
        const t = sums.get(r.product_id) ?? { n: 0, total: 0 }
        sums.set(r.product_id, { n: t.n + 1, total: t.total + rating })
      }
      for (const [id, t] of sums) byId.set(id, { count: t.n, average: Math.round((t.total / t.n) * 10) / 10 })
      continue
    }
    const code = String((shown.error as { code?: string } | null)?.code ?? "")
    if (code !== "42703" && code !== "PGRST204") return null
    const { data, error } = await any.from("products").select("id, reviews_count, reviews_average").eq("creator_id", creatorId).eq("status", "published").in("id", ids)
    if (error) return null
    for (const r of (data ?? []) as { id: string; reviews_count?: number | null; reviews_average?: number | string | null }[]) {
      const count = Math.max(0, Math.floor(Number(r.reviews_count) || 0))
      const average = Math.round((Number(r.reviews_average) || 0) * 10) / 10
      if (count > 0 && average > 0) byId.set(r.id, { count, average })
    }
  }
  return { byId, color: settings.display.starColor }
}

function withRatingsRead(cards: ProductCard[], { byId, color }: RatingsRead): ProductCard[] {
  return cards.map((c) => {
    const r = byId.get(c.id)
    return r ? { ...c, rating: { value: r.average, count: r.count, percent: Math.round((r.average / 5) * 100), color } } : c
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

type StockFacts = { live: StockRow[]; held: Map<string, number>; keepSelling: Set<string> }

/**
 * What the shipped products' cards need to say what is in stock, or null
 * when they keep what they already say. The live variants, the locations that
 * fulfil orders and which products keep selling are asked together; what the
 * locations hold, once the first two are in.
 */
async function physicalStockFacts(db: Db, creatorId: string, rows: ProductRow[]): Promise<StockFacts | null> {
  const physical = rows.filter((r) => r.type === "physical").map((r) => r.id)
  if (physical.length === 0) return null
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const readLive = async (): Promise<StockRow[] | null> => {
    const live: StockRow[] = []
    for (let i = 0; i < physical.length; i += 80) {
      const { data, error } = await any.from("product_variants").select("id, product_id, name, active, track_inventory, inventory_policy").in("product_id", physical.slice(i, i + 80))
      if (error) return null
      for (const v of (data ?? []) as StockRow[]) if (v.active !== false && !/^Archived /.test(v.name ?? "")) live.push(v)
    }
    return live
  }
  const [live, { data: locations, error: locError }, { data: keep }] = await Promise.all([
    readLive(),
    any.from("inventory_locations").select("id").eq("creator_id", creatorId).eq("active", true).eq("fulfills_orders", true),
    any.from("products").select("id, continue_selling").eq("status", "published").in("id", physical),
  ])
  if (!live || live.length === 0) return null
  if (locError) return null
  const locIds = ((locations ?? []) as { id: string }[]).map((l) => l.id)
  const held = new Map<string, number>()
  if (locIds.length) {
    for (let i = 0; i < live.length; i += 80) {
      const { data, error } = await any.from("inventory_levels").select("variant_id, available").in("variant_id", live.slice(i, i + 80).map((v) => v.id)).in("location_id", locIds)
      if (error) return null
      for (const l of (data ?? []) as { variant_id: string; available: number }[]) held.set(l.variant_id, (held.get(l.variant_id) ?? 0) + Math.max(0, l.available))
    }
  }
  const keepSelling = new Set(((keep ?? []) as { id: string; continue_selling?: boolean | null }[]).filter((p) => p.continue_selling === true).map((p) => p.id))
  return { live, held, keepSelling }
}

function withStockFacts(rows: ProductRow[], cards: ProductCard[], { live, held, keepSelling }: StockFacts): ProductCard[] {
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
    const buyable=variants.filter(v=>v.available)
    const facts=withKnownVariantPrices({price_cents:card.price_cents},variants.map(v=>({id:v.id,price_cents:v.price_cents,available:v.available})))
    const currency=card.settings.currency||SHOP_CURRENCY
    const priced=buyable.length?listPrice(facts,c=>formatPrice(c,currency)):null
    return { ...card, ...(buyable.length?{price_cents:facts.price_cents??card.price_cents}:{}), settings: { ...card.settings, ...(priced?{price:priced.main,compare_price:buyable.length>1?"":card.settings.compare_price,free:buyable.every(v=>v.free)}:{}), variants, available, tag: available ? card.settings.tag === "Sold out" ? "" : card.settings.tag : "Sold out", checkout_url: available ? checkoutUrl(card.id,buyable.length===1?buyable[0].id:undefined) : "" } }
  })
}

/**
 * Each card's custom fields (products.custom_fields, SQL part 107), read in a
 * request of their own so a database without the column still lists its
 * products; then every card has `fields`, empty when it has none.
 */
export async function withCustomFields(db: Db, cards: ProductCard[]): Promise<ProductCard[]> {
  if (cards.length === 0) return cards
  return withFieldsRead(cards, await customFieldsOf(db, cards.map((c) => c.id)))
}

/** Each product's custom fields by id; null when the column cannot be read. */
async function customFieldsOf(db: Db, productIds: string[]): Promise<Map<string, Record<string, string>> | null> {
  const any = db as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, Record<string, string>>()
  for (let i = 0; i < productIds.length; i += 80) {
    /* Before part 107: no fields, remembered ten minutes rather than refused on every list (lib/supabase/missing-memory.ts). */
    const { data, error } = await readLadder("products:custom_fields", [() => any.from("products").select("id, custom_fields").eq("status", "published").in("id", productIds.slice(i, i + 80)), NO_ROWS])
    if (error) return null
    for (const r of (data ?? []) as { id: string; custom_fields?: unknown }[]) byId.set(r.id, cleanCustomFields(r.custom_fields))
  }
  return byId
}

/** No column to read (null): every card still has `fields`, its own or empty. */
function withFieldsRead(cards: ProductCard[], byId: Map<string, Record<string, string>> | null): ProductCard[] {
  if (!byId) return cards.map((c) => ({ ...c, settings: { ...c.settings, fields: c.settings.fields ?? {} } }))
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

/*
  A FAILED READ IS NOT AN EMPTY SHOP, FOR A CACHE. shopProducts and
  shopCatalogue answer [] when the products cannot be read, which is right
  for a section drawn once, and wrong under unstable_cache: the [] was held
  as the shop for SHOP_TTL (a minute), so one slow moment of the database
  showed "no products" on a live site to every visitor for a minute after
  it had recovered. The held readers below say so instead (ShopReadFailed),
  and a cache keeps nothing that threw: the caller serves its last good
  copy (published-site resolveSite) or the products it already has.
*/
export class ShopReadFailed extends Error {
  constructor(reason: string) {
    super(`shop products could not be read: ${reason}`)
    this.name = "ShopReadFailed"
  }
}

/** shopProducts for a cache: throws ShopReadFailed instead of answering [] when the read failed. */
export async function heldShopProducts(db: Db, creatorId: string): Promise<ProductCard[]> {
  return readCards(db, creatorId, MAX_SHOP_PRODUCTS, true, true)
}

/** shopCatalogue for a cache: throws ShopReadFailed instead of answering [] when the read failed. */
export async function heldShopCatalogue(db: Db, creatorId: string): Promise<ProductCard[]> {
  return readCards(db, creatorId, MAX_CATALOGUE_PRODUCTS, true, true)
}

async function readCards(db: Db, creatorId: string, n: number, listedOnly: boolean, strict = false): Promise<ProductCard[]> {
  if (!creatorId) return []
  let lastError = ""
  try {
    /* The rows, the products kept off the Online store and the store's currency do not wait on each other. Neither read throws. */
    const hidden = offChannel(db, creatorId, "storefront")
    const currency = readStoreCurrency(db, creatorId).then((c) => c.currency)
    let rows: ProductRow[] | null = null
    /* Each set fewer only when a column is missing, and the one that answered remembered ten minutes (lib/supabase/missing-memory.ts): a database without a part is not refused on every list. Any other error is the shop not read, as before. */
    const { data, error } = await readLadder(
      "products:cards",
      PRODUCT_COLUMN_SETS.map((cols) => () => db.from("products").select(cols).eq("creator_id", creatorId).eq("status", "published").order("created_at", { ascending: false }).limit(n)),
    )
    if (error) lastError = (error as { code?: string; message?: string }).code || (error as { message?: string }).message || "error"
    else rows = listedOnly ? withoutCommunityProducts((data ?? []) as ProductRow[]) : ((data ?? []) as ProductRow[])
    if (!rows) {
      if (strict) throw new ShopReadFailed(lastError || "no rows")
      return []
    }
    /* Settings › Sales channels: a product taken off the Online store is in none of its lists (lib/store/channels). */
    rows = listedOn(rows, await hidden)
    return await cardsFromRows(db, rows, creatorId, currency)
  } catch (e) {
    if (strict) throw e instanceof ShopReadFailed ? e : new ShopReadFailed(e instanceof Error ? e.message : String(e))
    return []
  }
}
