/**
 * ===========================================================================
 *  ONE PRODUCT, AS THE PRODUCT SECTION DRAWS IT
 * ===========================================================================
 * The main product section on a creator's website (themes/default/sections/
 * product.json, drawn by components/website-builder/sections/renderers/
 * ProductSection.tsx) is handed the product it is about as `_product_data`:
 * by the live product page (components/website-builder/theme/
 * render-product.tsx) and by the builder's canvas, which asks
 * /api/website-builder/products for the product the creator is previewing.
 * Both build it with lib/products/product-section-data.ts.
 *
 * This file is everything about that product the section works out for
 * itself, as plain functions so the rules can be tested without a browser:
 *
 *   the pictures     every picture once, the main one first, a variant's own
 *                    picture after them (it used to show the main picture
 *                    twice: it is stored as the thumbnail AND as the first
 *                    entry of the gallery)
 *   the options      which variant a choice of values is, which values can
 *                    still be bought, and which picture a variant shows
 *   the swatches     a colour option's values as colours
 *   the price        a pay what you want amount, checked against the
 *                    product's own minimum before it goes anywhere
 *   the cart line    what Add to cart puts in the basket, and the address
 *                    Buy now goes to
 *
 * NOTHING HERE IS TRUSTED BY CHECKOUT. Every price is read again on the
 * server (lib/checkout/pricing.ts). The checks here are so a buyer is told
 * at once, not so a payment is right.
 */

import type { MarketPrice } from "@/lib/markets/pricing"
import type { FxRates } from "@/lib/markets/money"
import type { ProductDelivery } from "@/lib/physical/delivery-lines"
import type { CartLine } from "@/lib/website-builder/cart"
import type { ProductRating } from "@/lib/reviews/storefront"
import { imagesOnly, isPosterName } from "@/lib/media/video"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

/* ── The product, as the section receives it ─────────────────────────────── */

export interface ProductVariantData {
  id: string
  /** "Large / Blue", or a licence name for a digital product. */
  name: string
  /** One value per option, in the options' order. Null where it has none. */
  options: (string | null)[]
  price_cents: number
  compare_at_cents: number | null
  image_url: string | null
  /** False when it cannot be bought: sold out, or at its purchase limit. */
  available: boolean
  /** How many are left when stock is counted, else null. */
  left: number | null
  /** The most one order may take. */
  max_quantity: number
  pay_what_you_want: boolean
  pwyw_min_price_cents: number | null
  pwyw_suggested_price_cents: number | null
}

export interface ProductOptionData {
  name: string
  values: string[]
}

export interface ProductSectionData {
  /**
   * The visitor's market shows prices in its own currency (lib/markets/
   * pricing): the market, the store's currency and the day's two rates, so
   * the block converts every price it draws the way the server did. Absent:
   * the store's prices.
   */
  display?: { market: MarketPrice; base: string; fx: FxRates; locale: string }
  id: string
  title: string
  slug: string
  /** "digital", "physical", "course" and so on. */
  type: string
  /** The description as typed, which may be rich text. */
  description: string
  /** The description, cleaned against the rich text allow list. Safe to inject. */
  description_html?: string
  price_cents: number
  compare_at_cents: number | null
  thumbnail_url: string
  gallery_urls: string[]
  /** Every picture once, main first: uniqueImages() of the above. */
  images?: string[]
  whats_included?: string[]
  files?: { file_name: string; file_size: number; mime_type: string }[]
  pay_what_you_want?: boolean
  pwyw_min_price_cents?: number | null
  pwyw_suggested_price_cents?: number | null
  options?: ProductOptionData[]
  variants?: ProductVariantData[]
  /** Stock of a product without variants: null when it is not counted. */
  inventory_left?: number | null
  /** The product's low stock line (its own, else the shop's): "Only N left" shows at or under it. Physical products only. */
  low_stock_at?: number | null
  /** ISO date it was created, for the New badge. */
  created_at?: string | null
  /** The product's category, when it has one. */
  category?: string | null
  /** The product's own questions and answers (the editor's FAQ card), plain text. */
  faqs?: { question: string; answer: string }[]
  /** The custom fields the creator shows to buyers, in order (lib/products/custom-fields.ts shownCustomFields). */
  details?: { key: string; label: string; value: string; type: "text" | "multiline" | "number" | "url" }[]
  /** A product that ships: the cheapest delivery home and how long it takes, and the pickup points holding each option (lib/physical/storefront-facts.ts). Null: nothing to say. */
  delivery?: ProductDelivery | null
  /** Storelib Reviews: the product's published rating on this website, for the Star rating block (lib/reviews/storefront.ts productRating). Null or absent: no stars. */
  rating?: ProductRating | null
}

/* ── Pictures ─────────────────────────────────────────────────────────────── */

/**
 * What makes two picture addresses the same picture: the address without its
 * query or fragment, lower-cased host. A CDN that adds `?width=800` to one
 * copy and not the other is still one picture.
 */
export function imageKey(url: string): string {
  const trimmed = url.trim()
  const cut = trimmed.split(/[?#]/)[0]
  const m = cut.match(/^(https?:\/\/)([^/]+)(.*)$/i)
  return m ? `${m[1].toLowerCase()}${m[2].toLowerCase()}${m[3]}` : cut
}

/** Addresses a page can load: http(s), or a path of ours. */
function loadable(url: unknown): url is string {
  return typeof url === "string" && /^(https?:\/\/|\/(?!\/))/i.test(url.trim())
}

/** Every picture once, in the order given, at most `max`. */
export function uniqueImages(urls: readonly unknown[], max = 24): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const u of urls) {
    if (!loadable(u)) continue
    const key = imageKey(u)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(u.trim())
    if (out.length >= max) break
  }
  return out
}

/**
 * The product's pictures: the main picture, the gallery, then any variant's
 * own picture that is not already there, so choosing that variant has a
 * picture to show.
 */
export function productImages(p: Pick<ProductSectionData, "thumbnail_url" | "gallery_urls" | "images" | "variants">): string[] {
  const base = p.images && p.images.length ? p.images : [p.thumbnail_url, ...(Array.isArray(p.gallery_urls) ? p.gallery_urls : [])]
  /* A video's stored first frame is its thumbnail, not a photo of its own: the video itself is in the list (lib/media/video.ts). */
  return uniqueImages([...base, ...(p.variants ?? []).map((v) => v.image_url)]).filter((u) => !isPosterName(u))
}

/** Where a variant's picture is in the list, or -1 when it has none of its own. */
export function imageIndexForVariant(images: readonly string[], variant: Pick<ProductVariantData, "image_url"> | null | undefined): number {
  if (!variant?.image_url) return -1
  const key = imageKey(variant.image_url)
  return images.findIndex((u) => imageKey(u) === key)
}

/* ── Options and variants ─────────────────────────────────────────────────── */

/**
 * The options the picker draws. A product whose variants carry option values
 * (a physical product: Size, Colour) has them; a product whose variants are
 * only names (a licence for a digital product) has one option, its variants'
 * names, under `fallbackName`.
 */
export function pickerOptions(p: Pick<ProductSectionData, "options" | "variants">, fallbackName = "Option"): ProductOptionData[] {
  const variants = p.variants ?? []
  if (variants.length === 0) return []
  const declared = (p.options ?? []).filter((o) => o && typeof o.name === "string" && Array.isArray(o.values) && o.values.length > 0)
  if (declared.length > 0) return declared.slice(0, 3)
  if (variants.some((v) => v.options.some((x) => typeof x === "string" && x !== ""))) {
    /* Values without names: name them by position and collect the values. */
    const count = Math.max(...variants.map((v) => v.options.filter((x) => x != null).length))
    return Array.from({ length: Math.min(3, count) }, (_, i) => ({
      name: count === 1 ? fallbackName : `${fallbackName} ${i + 1}`,
      values: [...new Set(variants.map((v) => v.options[i]).filter((x): x is string => typeof x === "string" && x !== ""))],
    }))
  }
  return [{ name: fallbackName, values: [...new Set(variants.map((v) => v.name))] }]
}

/** Whether the variants are named rather than valued, so a choice is a name. */
function byName(p: Pick<ProductSectionData, "options" | "variants">): boolean {
  const variants = p.variants ?? []
  return !(p.options ?? []).some((o) => o?.values?.length) && !variants.some((v) => v.options.some((x) => typeof x === "string" && x !== ""))
}

/** A variant's value for option `i`, under either kind of option. */
export function valueOf(p: Pick<ProductSectionData, "options" | "variants">, v: ProductVariantData, i: number): string | null {
  return byName(p) ? (i === 0 ? v.name : null) : v.options[i] ?? null
}

/** The variant a choice of values names, or null when no variant has them all. */
export function variantFor(p: Pick<ProductSectionData, "options" | "variants">, chosen: readonly (string | null)[]): ProductVariantData | null {
  const variants = p.variants ?? []
  if (variants.length === 0) return null
  const opts = pickerOptions(p)
  return variants.find((v) => opts.every((_, i) => (valueOf(p, v, i) ?? null) === (chosen[i] ?? null))) ?? null
}

/** The first variant that can be bought, as values: what the page opens on. */
export function initialChoice(p: Pick<ProductSectionData, "options" | "variants">, variantId?: string | null): (string | null)[] {
  const variants = p.variants ?? []
  const opts = pickerOptions(p)
  const start = (variantId ? variants.find((v) => v.id === variantId) : null) ?? variants.find((v) => v.available) ?? variants[0]
  if (!start) return []
  return opts.map((_, i) => valueOf(p, start, i))
}

/** The choice with option `i` set to `value`, moved to a variant that exists if this one does not. */
export function choose(p: Pick<ProductSectionData, "options" | "variants">, chosen: readonly (string | null)[], i: number, value: string): (string | null)[] {
  const next = chosen.map((x, j) => (j === i ? value : x))
  if (variantFor(p, next)) return next
  /* No variant has exactly this: keep the value just picked and take the
     closest variant that has it, preferring one that can be bought. */
  const variants = (p.variants ?? []).filter((v) => valueOf(p, v, i) === value)
  const best = variants.find((v) => v.available) ?? variants[0]
  if (!best) return next
  return pickerOptions(p).map((_, j) => valueOf(p, best, j))
}

/** Whether a value can still be bought, given the other choices. Shown crossed out when not. */
export function valueAvailable(p: Pick<ProductSectionData, "options" | "variants">, chosen: readonly (string | null)[], i: number, value: string): boolean {
  const opts = pickerOptions(p)
  return (p.variants ?? []).some(
    (v) => v.available && valueOf(p, v, i) === value && opts.every((_, j) => j === i || chosen[j] == null || valueOf(p, v, j) === chosen[j]),
  )
}

/* ── Swatches ─────────────────────────────────────────────────────────────── */

/** Whether an option is a colour, by its name, the way a shop names one. */
export function isColorOption(name: string): boolean {
  return /\b(colou?rs?|shades?|finish|tint|farbe|couleur|kleur|colore)\b/i.test(name)
}

/** The colour names a shop is likely to use, and a few CSS spells differently. */
const COLOR_WORDS: Record<string, string> = {
  black: "#111111", white: "#ffffff", ivory: "#fffff0", cream: "#f5efe0", beige: "#e8dcc4", sand: "#d8c7a3", tan: "#d2b48c",
  brown: "#7b4b2a", chocolate: "#5b3a29", camel: "#c19a6b", khaki: "#bdb38b", olive: "#6b7039", green: "#2f7d4a", sage: "#9caf88",
  mint: "#a8e6cf", forest: "#228b22", teal: "#0f7c7c", turquoise: "#40e0d0", aqua: "#38c6d9", blue: "#2563eb", navy: "#1f2a44",
  sky: "#87ceeb", royal: "#4169e1", indigo: "#4b0082", purple: "#7c3aed", violet: "#8b5cf6", lilac: "#c8a2c8", lavender: "#b9a7e0",
  pink: "#ec4899", blush: "#f4c2c2", rose: "#e11d48", red: "#dc2626", burgundy: "#7f1d1d", wine: "#722f37", maroon: "#800000",
  orange: "#f97316", coral: "#ff7f50", peach: "#ffcba4", rust: "#b7410e", yellow: "#facc15", mustard: "#d4a017", gold: "#c9a227",
  silver: "#c0c0c0", grey: "#9ca3af", gray: "#9ca3af", charcoal: "#36454f", slate: "#64748b", stone: "#a8a29e", natural: "#e8dcc4",
  denim: "#3b5b8c", lime: "#84cc16", emerald: "#10b981", cyan: "#06b6d4", magenta: "#d946ef", fuchsia: "#d946ef",
}

/**
 * A value as a colour, or null when it does not name one. A hex code is
 * itself; a name is matched on its words, so "Dark green" is green and
 * "Navy blue" is navy. Never a guess dressed as a colour: an unknown name
 * stays a word on a pill.
 */
export function swatchColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v
  const words = v.split(/[\s/_-]+/).filter(Boolean)
  for (const w of words) if (COLOR_WORDS[w]) return COLOR_WORDS[w]
  return null
}

/* ── Price ────────────────────────────────────────────────────────────────── */

/** The platform's currency: a store's own (lib/store/selling-currency) is handed in where the page knows it (the storefront's `currency`). */
export const PRODUCT_CURRENCY_CODE = SHOP_CURRENCY

/**
 * `price_cents` as the shop prints a price. One place, so every block agrees,
 * and agreeing with the product cards around it: "$48.00", "$1,250.00".
 * This printed "$48" while a card for the same product on the same page
 * said "$48.00". `code` is Theme settings › Currency format › Show currency
 * codes, which the cards already followed: "$48.00 USD".
 */
export function money(cents: number, opts: { code?: boolean; currency?: string } = {}): string {
  const currency = (opts.currency ?? PRODUCT_CURRENCY_CODE).toUpperCase()
  const text = shopMoneyIn(Math.max(0, Math.round(Number(cents) || 0)), currency, { grouping: true })
  /* "RON 48.00" already names its currency: the code is added once, to "$48.00". */
  return opts.code && !text.includes(currency) ? `${text} ${currency}` : text
}

/** The highest amount a buyer may name: the same ceiling checkout holds (MAX_PWYW_CENTS). */
export const PWYW_MAX_CENTS = 1_000_000

/** What the buyer is offered: the product's own price, or the variant's. */
export interface PriceFacts {
  priceCents: number
  compareAtCents: number | null
  payWhatYouWant: boolean
  minCents: number
  suggestedCents: number | null
}

export function priceFacts(p: ProductSectionData, variant: ProductVariantData | null): PriceFacts {
  const owner = variant ?? null
  const pwyw = owner ? owner.pay_what_you_want : p.pay_what_you_want === true
  const min = Math.max(0, Math.round(Number(owner ? owner.pwyw_min_price_cents : p.pwyw_min_price_cents) || 0))
  const suggested = Number(owner ? owner.pwyw_suggested_price_cents : p.pwyw_suggested_price_cents) || 0
  const price = owner ? owner.price_cents : p.price_cents
  const compare = owner ? owner.compare_at_cents : p.compare_at_cents
  const priceCents = pwyw ? min : Math.max(0, Math.round(Number(price) || 0))
  return {
    priceCents,
    compareAtCents: typeof compare === "number" && compare > priceCents ? compare : null,
    payWhatYouWant: pwyw,
    minCents: min,
    suggestedCents: pwyw && suggested >= min && suggested > 0 ? Math.round(suggested) : null,
  }
}

/** "12", "12.5", "$12.50", "1,200" to cents, or null when it is not an amount. */
export function amountToCents(input: string): number | null {
  const clean = input.replace(/[$\s,]/g, "")
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(clean)) return null
  return Math.round(parseFloat(clean) * 100)
}

/**
 * Whether a named amount may be paid, and why not. The same rules checkout
 * holds on the server (lib/checkout/pricing.ts baseFor): at least the
 * minimum, at most the ceiling, whole cents.
 */
export function checkPwyw(cents: number | null, minCents: number, maxCents = PWYW_MAX_CENTS, currency?: string): { ok: true; cents: number } | { ok: false; error: string } {
  if (cents === null || !Number.isFinite(cents) || !Number.isInteger(cents) || cents < 0) return { ok: false, error: "Enter an amount, like 12 or 12.50." }
  if (cents < minCents) return { ok: false, error: `The lowest price is ${money(minCents, { currency })}.` }
  if (cents > maxCents) return { ok: false, error: `The highest price is ${money(maxCents, { currency })}.` }
  return { ok: true, cents }
}

/**
 * The amounts offered as one tap: the block's own list ("5, 10, 20", in
 * dollars), or the product's suggested price and two steps above it. Never
 * below the minimum, never twice the same, at most four.
 */
export function suggestedAmounts(setting: string, minCents: number, suggestedCents: number | null): number[] {
  const typed = (setting || "")
    .split(/[,;\s]+/)
    .map((x) => amountToCents(x))
    .filter((c): c is number => c !== null && c > 0)
  const base = typed.length > 0 ? typed : suggestedCents ? [suggestedCents, suggestedCents * 2, suggestedCents * 3] : []
  return [...new Set(base.filter((c) => c >= minCents && c <= PWYW_MAX_CENTS))].slice(0, 4)
}

/* ── Stock ────────────────────────────────────────────────────────────────── */

/** How many are left when stock is counted: the variant's, else the product's. Null when not counted. */
export function stockLeft(p: ProductSectionData, variant: ProductVariantData | null): number | null {
  if (variant) return typeof variant.left === "number" ? variant.left : null
  return typeof p.inventory_left === "number" ? Math.max(0, p.inventory_left) : null
}

/** What the low stock line says when nobody wrote their own. */
export { DEFAULT_LOW_STOCK_TEXT } from "@/lib/website-builder/site-commerce"

/**
 * The line a low stock block shows from: its own number when it was given
 * one (older blocks saved 5), else the product's low stock line (its own,
 * else the shop's, Settings › Locations), else 5.
 */
export function lowStockThreshold(blockValue: unknown, productLine: number | null | undefined): number {
  const own = typeof blockValue === "number" ? blockValue : typeof blockValue === "string" && blockValue.trim() !== "" ? Number(blockValue) : NaN
  if (Number.isFinite(own) && own > 0) return Math.floor(own)
  return typeof productLine === "number" && Number.isFinite(productLine) && productLine > 0 ? Math.floor(productLine) : 5
}

/** Whether the low stock line shows: counted, more than none, at or under the threshold. */
export function lowStock(left: number | null, threshold: number): boolean {
  return typeof left === "number" && left > 0 && left <= Math.max(1, Math.floor(threshold))
}

/** Whether the product, or the chosen variant, can be bought at all. */
export function purchasable(p: ProductSectionData, variant: ProductVariantData | null): boolean {
  if ((p.variants ?? []).length > 0) return !!variant && variant.available
  const left = p.inventory_left
  return !(typeof left === "number" && left <= 0)
}

/** Whether "New" applies: created within `days`. */
export function isNew(createdAt: string | null | undefined, days: number, now = Date.now()): boolean {
  if (!createdAt) return false
  const t = Date.parse(createdAt)
  if (!Number.isFinite(t)) return false
  return now - t <= Math.max(1, days) * 24 * 60 * 60 * 1000 && now >= t
}

/* ── Cart and checkout ────────────────────────────────────────────────────── */

/** What Add to cart puts in the basket. Prices are for display; checkout prices again. */
export function cartLineFor(
  p: ProductSectionData,
  variant: ProductVariantData | null,
  quantity: number,
  customPriceCents: number | null,
): CartLine {
  const facts = priceFacts(p, variant)
  const custom = facts.payWhatYouWant && typeof customPriceCents === "number" ? customPriceCents : null
  const digital = p.type === "digital"
  return {
    productId: p.id,
    variantId: variant?.id ?? null,
    title: p.title,
    variantName: variant ? variant.name : null,
    priceCents: custom ?? facts.priceCents,
    thumbnailUrl: variant?.image_url || p.thumbnail_url || imagesOnly(productImages(p))[0] || null,
    slug: p.slug,
    digital,
    ...(p.type === "physical" ? { physical: true } : {}),
    ...(custom !== null ? { customPriceCents: custom } : {}),
    /* Only something that ships is bought more than once in one go: a
       download, a course or a membership is one entitlement per buyer. */
    quantity: p.type === "physical" ? Math.max(1, Math.floor(quantity) || 1) : 1,
  }
}

/**
 * Buy now: Storelib checkout for this product, its variant and the buyer's
 * own amount. Checkout reads the price from the product and holds the
 * amount to the product's minimum (app/checkout/page.tsx, lib/checkout/
 * pricing.ts); nothing here sets what is charged.
 */
export function buyNowHref(p: ProductSectionData, variant: ProductVariantData | null, customPriceCents: number | null): string {
  const q = new URLSearchParams({ productId: p.id })
  if (variant) q.set("variantId", variant.id)
  if (priceFacts(p, variant).payWhatYouWant && typeof customPriceCents === "number") q.set("customPrice", String(customPriceCents))
  if (p.slug) q.set("from", `/products/${p.slug}`)
  q.set("src", "website")
  return `/checkout?${q.toString()}`
}
