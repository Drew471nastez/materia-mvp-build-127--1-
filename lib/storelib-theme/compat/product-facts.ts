/**
 * ===========================================================================
 *  ONE PRODUCT PAGE, ONE TRUTH ABOUT ITS VARIANTS
 * ===========================================================================
 * The card an imported theme's product page is drawn from starts as the
 * shop's list copy (lib/website-builder/shop-products.ts), held for a while
 * and read for every page. What a buyer must be told right, as they look,
 * is read again for the page: which variants are on sale, each one's
 * option values as the product editor set them, whether it sells, how many
 * are left when that is few, the most one order may take, whether it keeps
 * selling at none, its SKU and where it can be picked up.
 *
 * Read by Storelib's own product section too (lib/products/product-section-
 * data.ts: stock, sold out, Limit sales, a download's sales limit), so a
 * Storelib theme and an imported one never disagree. Merged into the card
 * here, once, for both places that draw an imported theme's product page:
 *
 *   the live site       lib/website-builder/compat-site.ts
 *   the builder canvas  components/website-builder/compat/compat-canvas.tsx
 *
 * Every picker on that page reads the product object made from this card
 * (./objects.ts productObject): the theme's buttons, swatches and
 * dropdowns, its sticky bar, the section drawn again on each choice, the
 * product's JSON. One card, so they cannot disagree.
 *
 * Pure, and safe in the browser.
 */

type O = Record<string, unknown>

export interface VariantFacts {
  id: string
  /** Its value for each option (option1 to option3), null where it has none. */
  options?: (string | null)[]
  soldOut: boolean
  /** How many are left when that is few (lib/physical/storefront-stock.ts), else null. */
  left: number | null
  /** How many there are, when stock is counted and Show stock left is on; absent otherwise. */
  count?: number | null
  /** Its stock is counted (Track quantity): a Shopify theme reads inventory_management "shopify". */
  tracked?: boolean
  /** The most one order may take: stock held to Limit sales; 999 for no stop. */
  maxQuantity: number
  /** Sells on at none (Continue selling when out of stock). */
  keepsSelling?: boolean
  sku?: string | null
  /** The pickup points that hold it (lib/physical/storefront-facts.ts). */
  pickup?: unknown[]
}

export interface PageFacts {
  variants: VariantFacts[]
  /** Limit sales: the most of this product one order may take, or null. */
  perOrder: number | null
  /** The store's low stock line for this product (its own, else Settings'), or null for the default. */
  lowAt: number | null
  /** Website settings › Commerce › Show stock left. Off: no count is ever said. */
  showLeft: boolean
  /** A product without variants: how many are left when that is few (its stock, or a download's sales limit), 0 when none; else null. */
  productLeft?: number | null
  /** A product that ships: the business days of the cheapest rate home (Settings › Shipping and delivery), for Estimated delivery. Null: no rate says. */
  deliveryDays?: { minDays: number | null; maxDays: number | null } | null
}

/**
 * The most one order may take, as a theme's quantity picker shows it: a
 * real stop only. Limit sales, or the last few when the count may be said;
 * never the whole stock (a theme prints "Maximum of 40"), never 0.
 */
export function quantityStop(f: Pick<VariantFacts, "soldOut" | "left" | "maxQuantity">, perOrder: number | null, showLeft: boolean): number | null {
  if (f.soldOut) return null
  const stops = [perOrder, showLeft && typeof f.left === "number" && f.left > 0 ? Math.min(f.left, f.maxQuantity) : null].filter((n): n is number => typeof n === "number" && n > 0)
  return stops.length ? Math.min(...stops) : null
}

/** The card with what is true now about each variant. A card with no facts is returned as it was. */
export function withPageFacts<T extends { id: string; settings: O }>(card: T, facts: PageFacts | null): T {
  if (!facts) return card
  const own = Array.isArray(card.settings.variants) ? (card.settings.variants as O[]) : []
  const merge = (v: O, f: VariantFacts): O => {
    const out: O = {
      ...v,
      available: !f.soldOut,
      max: quantityStop(f, facts.perOrder, facts.showLeft),
      policy: f.keepsSelling ? "continue" : "deny",
    }
    if (f.options && f.options.some((x) => typeof x === "string" && x.trim() !== "")) out.options = f.options
    if (facts.showLeft) out.left = f.left
    else delete out.left
    /* Round BC: the real count of a counted option, so the theme's inventory block says In stock or Low stock at its own line and follows the option picked; only while Show stock left is on. */
    if (facts.showLeft && typeof f.count === "number") out.stock = Math.max(0, Math.floor(f.count))
    else delete out.stock
    if (f.tracked) out.tracked = true
    if (typeof f.sku === "string" && f.sku) out.sku = f.sku
    if (f.pickup) out.pickup = f.pickup
    if (f.soldOut) out.checkout_url = ""
    return out
  }
  /* The variants on sale, in the editor's order: one archived or switched off since the list was read is not offered. */
  const variants = facts.variants.length ? facts.variants.flatMap((f) => {
    const v = own.find((x) => x.id === f.id)
    return v ? [merge(v, f)] : []
  }) : own
  /* A product without options sells as its one variant ("Default"): the product says what it says. */
  const only = facts.variants.length === 1 ? facts.variants[0] : null
  const settings: O = {
    ...card.settings,
    variants,
    low_stock_at: facts.lowAt,
  }
  if (variants.length) settings.available = variants.some((v) => v.available !== false)
  if (only) {
    settings.available = !only.soldOut
    settings.max = quantityStop(only, facts.perOrder, facts.showLeft)
    settings.policy = only.keepsSelling ? "continue" : "deny"
    if (facts.showLeft) settings.left = only.left
    if (facts.showLeft && typeof only.count === "number") settings.stock = Math.max(0, Math.floor(only.count))
    if (only.tracked) settings.tracked = true
    if (typeof only.sku === "string" && only.sku) settings.sku = only.sku
  }
  if (!facts.variants.length && typeof facts.productLeft === "number") {
    settings.available = facts.productLeft > 0
    if (facts.showLeft && facts.productLeft > 0) settings.left = facts.productLeft
  }
  if (facts.deliveryDays) settings.delivery_days = facts.deliveryDays
  if (settings.available === false) settings.checkout_url = ""
  /* Facts for a variant the list did not have yet are left out: its price is not known here. */
  return { ...card, settings }
}
