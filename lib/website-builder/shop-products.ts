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
import type { SectionInstanceData } from "@/lib/storelib-theme/types"
import { withoutCommunityProducts } from "@/lib/communities/listing"
import { uniqueImages } from "@/lib/products/product-page-model"

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

interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  status: string | null
  inventory_count?: number | null
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
  return uniqueImages([row.thumbnail_url, ...(Array.isArray(row.gallery_urls) ? row.gallery_urls : [])], MAX_IMAGES)
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
export function soldOut(row: { inventory_count?: number | null }): boolean {
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
      image: row.thumbnail_url ?? images[0] ?? "",
      images,
      url: row.slug ? `/products/${row.slug}` : "",
      slug: row.slug ?? "",
      kind: row.type ?? "",
      available,
      tag: available ? "" : "Sold out",
      checkout_url: available ? checkoutUrl(row.id) : "",
      variants: options,
      category: typeof row.category === "string" ? row.category : "",
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
  if (!creatorId) return []
  const n = Math.max(1, Math.min(MAX_SHOP_PRODUCTS, Math.floor(limit) || MAX_SHOP_PRODUCTS))
  try {
    let rows: ProductRow[] | null = null
    for (const cols of [PRODUCT_COLUMNS_WITH_CATEGORY, PRODUCT_COLUMNS_WITH_COMMUNITY, PRODUCT_COLUMNS, PRODUCT_COLUMNS_MINIMAL]) {
      const { data, error } = await db
        .from("products")
        .select(cols)
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(n)
      if (error) continue
      rows = withoutCommunityProducts((data ?? []) as ProductRow[])
      break
    }
    if (!rows) return []
    const physical = rows.filter((r) => r.type === "physical").map((r) => r.id)
    const [variants, options] = await Promise.all([productVariants(db, rows.map((r) => r.id)), productOptions(db, physical)])
    return rows.map((r) => toCard(r, variants, options))
  } catch {
    return []
  }
}
