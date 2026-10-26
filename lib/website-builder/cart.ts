/**
 * ===========================================================================
 *  A CART FOR ONE SHOP
 * ===========================================================================
 * The header used to carry a shopping bag that nothing could fill: the count
 * came from an event no code dispatched, the drawer said "your cart is empty"
 * because it could say nothing else, and the link went to a route that did
 * not exist. It was removed rather than left looking broken. This is the
 * feature it was standing in for.
 *
 * ONE SHOP, ONE SELLER. A cart lives on a creator's own site and holds that
 * creator's products, which is not a limitation to work around: a Stripe
 * destination charge pays ONE connected account, so a basket spanning two
 * sellers cannot be one payment. Keeping the cart per site makes the single
 * seller a fact of where it is rather than a rule to enforce later, and the
 * checkout can then be one payment for the whole basket.
 *
 * WHAT A LINE IS. A product, optionally one of its variants. Two lines of
 * the same product with different variants are two lines; the same product
 * and the same variant is one line whose quantity grows. A digital product
 * is pinned to quantity 1 because owning it twice is not a thing the rest of
 * the product can express — an entitlement is one row per buyer per product.
 *
 * PRICES HERE ARE FOR DISPLAY. Every one of them is read again from the
 * database when the payment is created. Nothing a browser puts in local
 * storage can change what a visitor is charged.
 */
import { lineProperties, propertiesKey } from "@/lib/physical/cart-link"

export interface CartLine {
  productId: string
  /** Null when the product has no variants, or none was chosen. */
  variantId: string | null
  title: string
  /** The variant's name, when this line is a variant. */
  variantName: string | null
  /** For display only. The server prices the order again from the database. */
  priceCents: number
  thumbnailUrl: string | null
  /** Where the product's page is on this site, for the line's link. */
  slug: string
  /** Digital goods cannot be bought twice, so their quantity stays at 1. */
  digital: boolean
  /** Shipped goods: a cart holding one goes to the physical checkout (lib/physical). */
  physical?: boolean
  /**
   * Pay what you want: the amount the buyer named on the product page, in
   * cents. Checkout holds it to the product's own minimum and ceiling on the
   * server (lib/checkout/pricing.ts priceCart); a line without one is charged
   * the minimum.
   */
  customPriceCents?: number
  quantity: number
  /**
   * The store's currency `priceCents` was read in (upper case). A store that
   * changes its currency converts its prices, so a line kept from before
   * would show the old number with the new currency's mark: such a line,
   * and one saved before this field existed, is priced again from the
   * server when the cart is read (cartNeedsReprice, repricedLines).
   */
  currency?: string
  /**
   * What the buyer wrote or sent on the product page's Personalization block
   * (a name to engrave, a photo's value, lib/cart-uploads/rules): the line's
   * properties, as an imported theme's `properties[...]` are. The same
   * product with other words is another line. Never read for a price.
   */
  properties?: Record<string, string>
}

/** More than this in one basket is a script, not a shopper. */
export const MAX_LINES = 50
/** Per line. Above this a shop should be taking a wholesale order. */
export const MAX_QUANTITY = 99

export function cartStorageKey(shopId: string): string {
  return `storelib.cart.${shopId}`
}

/** The product and option alone, whatever the line's properties: what a price is asked by. */
function optionKey(line: Pick<CartLine, "productId" | "variantId">): string {
  return `${line.productId}::${line.variantId ?? ""}`
}

/** What makes two lines the same line: the product, the option and, when it has any, its properties (lib/physical/cart-link propertiesKey, short hashed). */
export function lineKey(line: Pick<CartLine, "productId" | "variantId"> & { properties?: Record<string, string> }): string {
  const props = propertiesKey(line.properties)
  if (!props) return optionKey(line)
  let h = 0x811c9dc5
  for (let i = 0; i < props.length; i++) h = Math.imul(h ^ props.charCodeAt(i), 0x01000193) >>> 0
  return `${optionKey(line)}::${h.toString(36)}`
}

function clampQuantity(line: CartLine, quantity: number): number {
  if (line.digital) return 1
  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity)))
}

/**
 * Adding a line already in the basket adds to its quantity rather than
 * repeating it. A basket at MAX_LINES refuses a NEW line and still accepts
 * more of one it already holds, because the limit is there to bound the
 * payload, and a quantity costs nothing.
 */
export function addLine(lines: CartLine[], incoming: CartLine): CartLine[] {
  const key = lineKey(incoming)
  const at = lines.findIndex((l) => lineKey(l) === key)

  if (at >= 0) {
    const next = lines.slice()
    const merged = { ...next[at], ...incoming, quantity: next[at].quantity + Math.max(1, incoming.quantity) }
    merged.quantity = clampQuantity(merged, merged.quantity)
    next[at] = merged
    return next
  }

  if (lines.length >= MAX_LINES) return lines
  return [...lines, { ...incoming, quantity: clampQuantity(incoming, incoming.quantity) }]
}

/**
 * SEVERAL LINES, ALL OR NONE (round 23: a bundle or an upsell is never half added). Each goes in as addLine puts it,
 * and if any is refused (a new line in a basket at MAX_LINES) or loses units to MAX_QUANTITY, none of them goes in and
 * null says so: a set the buyer chose together is in the basket together or not at all.
 */
export function addAllLines(lines: CartLine[], incoming: CartLine[]): CartLine[] | null {
  let next = lines
  for (const line of incoming) {
    const after = addLine(next, line)
    if (cartCount(after) - cartCount(next) < Math.max(1, line.quantity)) return null
    next = after
  }
  return next
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => lineKey(l) !== key)
}

/** Setting a quantity to zero or below removes the line, as a stepper should. */
export function setQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return removeLine(lines, key)
  return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: clampQuantity(l, quantity) } : l))
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0)
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.priceCents * l.quantity, 0)
}

/**
 * Local storage is a string somebody else's code can also write, and a
 * browser extension, a half-finished write or an older version of this file
 * can all leave something here that is not a cart. Every field is checked;
 * anything that does not survive is dropped rather than rendered.
 */
export function parseCart(raw: string | null | undefined): CartLine[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const out: CartLine[] = []
  const seen = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    if (typeof row.productId !== "string" || row.productId === "") continue
    const variantId = typeof row.variantId === "string" && row.variantId !== "" ? row.variantId : null
    /* Properties held to the order's own rule (lib/physical/cart-link lineProperties): storage is anybody's to write. */
    const properties = lineProperties(row.properties)
    const key = lineKey({ productId: row.productId, variantId, properties })
    if (seen.has(key)) continue
    const price = typeof row.priceCents === "number" && Number.isFinite(row.priceCents) ? Math.max(0, Math.round(row.priceCents)) : 0
    const digital = row.digital === true
    const quantity = typeof row.quantity === "number" && Number.isFinite(row.quantity) ? Math.floor(row.quantity) : 1
    seen.add(key)
    out.push({
      productId: row.productId,
      variantId,
      title: typeof row.title === "string" ? row.title : "Product",
      variantName: typeof row.variantName === "string" && row.variantName !== "" ? row.variantName : null,
      priceCents: price,
      thumbnailUrl: typeof row.thumbnailUrl === "string" && row.thumbnailUrl !== "" ? row.thumbnailUrl : null,
      slug: typeof row.slug === "string" ? row.slug : "",
      digital,
      ...(row.physical === true ? { physical: true } : {}),
      ...(typeof row.customPriceCents === "number" && Number.isInteger(row.customPriceCents) && row.customPriceCents >= 0
        ? { customPriceCents: row.customPriceCents }
        : {}),
      quantity: digital ? 1 : Math.max(1, Math.min(MAX_QUANTITY, quantity)),
      ...(typeof row.currency === "string" && /^[A-Za-z]{3}$/.test(row.currency) ? { currency: row.currency.toUpperCase() } : {}),
      ...(properties ? { properties } : {}),
    })
    if (out.length >= MAX_LINES) break
  }
  return out
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify(lines)
}

/**
 * What the checkout sends. Ids and quantities, and a pay what you want
 * line's named amount; the server prices it and holds that amount to the
 * product's own limits.
 */
export function checkoutItems(lines: CartLine[]): Array<{ productId: string; variantId: string | null; quantity: number; customPriceCents?: number; properties?: Record<string, string> }> {
  return lines.map((l) => {
    const properties = lineProperties(l.properties)
    return {
      productId: l.productId,
      variantId: l.variantId,
      quantity: l.quantity,
      ...(typeof l.customPriceCents === "number" ? { customPriceCents: l.customPriceCents } : {}),
      ...(properties ? { properties } : {}),
    }
  })
}

/* ─── After the store's currency changed ───────────────────────────────── */

/** Whether a line was priced in another currency than the store's now, or before lines said one. */
export function cartNeedsReprice(lines: CartLine[], storeCurrency: string | null | undefined): boolean {
  const now = (storeCurrency || "").toUpperCase()
  if (!/^[A-Z]{3}$/.test(now)) return false
  return lines.some((l) => l.currency !== now)
}

/** What the server answers for one line (app/api/cart/prices): its price now, or null when it can no longer be bought. */
export interface LinePrice {
  productId: string
  variantId: string | null
  priceCents: number | null
}

/**
 * The lines priced again in `currency`. A line whose product is gone is
 * dropped, as checkout would drop it. A pay what you want amount was named
 * in the old currency, so it is not kept: the line is its minimum until the
 * buyer names another. A line the answer does not mention is left as it is.
 */
export function repricedLines(lines: CartLine[], prices: LinePrice[], currency: string): CartLine[] {
  const now = currency.toUpperCase()
  const byKey = new Map(prices.map((p) => [optionKey(p), p]))
  const out: CartLine[] = []
  for (const l of lines) {
    const p = byKey.get(optionKey(l))
    if (!p) {
      out.push(l)
      continue
    }
    if (p.priceCents === null) continue
    const { customPriceCents: _named, ...rest } = l
    out.push({ ...rest, priceCents: Math.max(0, Math.round(p.priceCents)), currency: now })
  }
  return out
}
