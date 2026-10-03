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
  quantity: number
}

/** More than this in one basket is a script, not a shopper. */
export const MAX_LINES = 50
/** Per line. Above this a shop should be taking a wholesale order. */
export const MAX_QUANTITY = 99

export function cartStorageKey(shopId: string): string {
  return `storelib.cart.${shopId}`
}

/** What makes two lines the same line. */
export function lineKey(line: Pick<CartLine, "productId" | "variantId">): string {
  return `${line.productId}::${line.variantId ?? ""}`
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
    const key = `${row.productId}::${variantId ?? ""}`
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
      quantity: digital ? 1 : Math.max(1, Math.min(MAX_QUANTITY, quantity)),
    })
    if (out.length >= MAX_LINES) break
  }
  return out
}

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify(lines)
}

/** What the checkout sends. Ids and quantities; the server prices it. */
export function checkoutItems(lines: CartLine[]): Array<{ productId: string; variantId: string | null; quantity: number }> {
  return lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity }))
}
