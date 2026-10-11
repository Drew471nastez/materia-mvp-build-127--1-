/**
 * ===========================================================================
 *  CARRYING A BASKET THROUGH STRIPE AND BACK
 * ===========================================================================
 * A single-product purchase puts its `product_id` in the payment's metadata
 * and reads it again when the payment succeeds. A basket cannot: Stripe
 * caps a metadata VALUE at 500 characters, and three product ids with their
 * variants and prices are already past it.
 *
 * So the basket is written as a compact line per item and split across as
 * many keys as it needs — `cart_0`, `cart_1` — each kept under the cap.
 * Stripe allows 50 keys, which at six items a key is far more than MAX_LINES
 * in the cart itself.
 *
 * WHY THE PRICE TRAVELS WITH IT. The price is read from the database when
 * the payment is created, and it is what the buyer was charged. If the
 * creator edits the price while somebody is at the card form, fulfilment
 * must record what was paid, not what the product costs by the time the
 * webhook lands. The id would be enough to re-read the product; it would not
 * be enough to be right.
 *
 * Nothing here trusts a browser. These lines are written by the server from
 * rows it has just read, and read back by the server.
 */

export interface PackedItem {
  productId: string
  variantId: string | null
  quantity: number
  /** Unit price in cents, before any code. */
  priceCents: number
  /**
   * What a discount code took off the whole line, in cents (not per unit).
   * Carried in its own metadata key, `cart_discounts`, so a basket written
   * before codes, or read by code from before them, is still read the same.
   */
  discountCents?: number
  /**
   * The tax on the line (Settings › Taxes), in cents, in its own key
   * `cart_tax` the same way. With prices including tax it is inside the
   * line's price; otherwise it was charged on top, as the basket's Tax line.
   */
  taxCents?: number
}

/** Stripe's cap on one metadata value. */
export const METADATA_VALUE_LIMIT = 500
export const CART_METADATA_PREFIX = "cart_"
/** Each written line's discount, in the order the lines were written: "0,120,0". */
export const CART_DISCOUNTS_KEY = "cart_discounts"
/** Each written line's tax, in the same order: "190,0,95". Only on a taxed basket. */
export const CART_TAX_KEY = "cart_tax"

const SEP = "|"
const LINE = ";"

function encodeItem(item: PackedItem): string {
  return [item.productId, item.variantId ?? "", item.quantity, item.priceCents].join(SEP)
}

function decodeItem(raw: string): PackedItem | null {
  const parts = raw.split(SEP)
  if (parts.length !== 4) return null
  const [productId, variantId, quantity, priceCents] = parts
  if (!productId) return null
  const q = Number.parseInt(quantity, 10)
  const p = Number.parseInt(priceCents, 10)
  if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p) || p < 0) return null
  return { productId, variantId: variantId || null, quantity: q, priceCents: p }
}

/**
 * The basket as metadata keys. Returns the keys to merge into a session's
 * metadata, plus a count so the reader knows when it has them all rather
 * than guessing from where the numbering stops.
 */
export function packItems(items: PackedItem[]): Record<string, string> {
  const out: Record<string, string> = { cart_items: String(items.length) }
  let index = 0
  let current = ""
  const discounts: number[] = []
  const taxes: number[] = []

  const flush = () => {
    if (current === "") return
    out[`${CART_METADATA_PREFIX}${index}`] = current
    index += 1
    current = ""
  }

  for (const item of items) {
    const encoded = encodeItem(item)
    // One item longer than a whole value would be unreadable however it is
    // split, and cannot happen: an id is 36 characters and the rest is
    // digits. Guarded anyway so a future id length is a dropped line rather
    // than a corrupted one.
    if (encoded.length > METADATA_VALUE_LIMIT) continue
    discounts.push(Math.max(0, Math.round(item.discountCents ?? 0)))
    taxes.push(Math.max(0, Math.round(item.taxCents ?? 0)))
    const next = current === "" ? encoded : `${current}${LINE}${encoded}`
    if (next.length > METADATA_VALUE_LIMIT) {
      flush()
      current = encoded
    } else {
      current = next
    }
  }
  flush()
  /* Only a basket a code touched has the key. 50 lines of up to seven
     digits and a comma stay well inside one value. */
  if (discounts.some((d) => d > 0)) out[CART_DISCOUNTS_KEY] = discounts.join(",")
  if (taxes.some((t) => t > 0)) out[CART_TAX_KEY] = taxes.join(",")
  return out
}

/**
 * Back out of whatever metadata came off the session. Anything that does not
 * decode is dropped: fulfilling three of four items and saying so beats
 * throwing away a payment that has already been taken.
 */
export function unpackItems(metadata: Record<string, string> | null | undefined): PackedItem[] {
  if (!metadata) return []
  const discounts = (metadata[CART_DISCOUNTS_KEY] ?? "").split(",").map((d) => Number.parseInt(d, 10))
  const taxes = (metadata[CART_TAX_KEY] ?? "").split(",").map((t) => Number.parseInt(t, 10))
  const out: PackedItem[] = []
  /* A line's discount is found by the place it was written in, counted over
     every line written, so a line that does not decode cannot shift the
     discounts of the ones after it. */
  let written = 0
  for (let i = 0; i < 50; i++) {
    const chunk = metadata[`${CART_METADATA_PREFIX}${i}`]
    if (typeof chunk !== "string") continue
    for (const raw of chunk.split(LINE)) {
      const at = written++
      const item = decodeItem(raw)
      if (!item) continue
      const d = discounts[at]
      /* Never more than the line: a discount cannot make a line negative. */
      if (Number.isFinite(d) && d > 0) item.discountCents = Math.min(d, item.priceCents * item.quantity)
      const t = taxes[at]
      if (Number.isFinite(t) && t > 0) item.taxCents = t
      out.push(item)
    }
  }
  return out
}

/** What a line was charged: its price times its quantity, less its discount. */
export function lineTotalCents(item: PackedItem): number {
  return Math.max(0, item.priceCents * item.quantity - (item.discountCents ?? 0))
}

/**
 * A line as Stripe's page is asked to charge it. Stripe takes a whole number
 * of cents per unit, and a code's share of a line of three does not always
 * divide by three: $10.00 less $1.00 over three units is 300, 300 and 300
 * plus one cent left over. So the units are split into those at the lower
 * price and those at a cent more, which add up to the line's total exactly.
 * A part at $0 is left out (Stripe will not take it); the line is still in
 * the basket's metadata and is fulfilled.
 */
export function chargeUnits(item: PackedItem): { quantity: number; unitCents: number }[] {
  const total = lineTotalCents(item)
  const quantity = Math.max(1, item.quantity)
  const unit = Math.floor(total / quantity)
  const over = total - unit * quantity
  const parts: { quantity: number; unitCents: number }[] = []
  if (quantity - over > 0 && unit > 0) parts.push({ quantity: quantity - over, unitCents: unit })
  if (over > 0) parts.push({ quantity: over, unitCents: unit + 1 })
  return parts
}

/** What the payment should have been, from the lines themselves. */
export function packedTotalCents(items: PackedItem[]): number {
  return items.reduce((n, i) => n + lineTotalCents(i), 0)
}

/**
 * ===========================================================================
 *  THE PLATFORM'S CUT, SPLIT ACROSS THE LINES IT WAS TAKEN ON
 * ===========================================================================
 * The fee is calculated once on the whole basket and taken once by Stripe.
 * Every line still records a fee, because an order row carries one and the
 * seller's earnings are read from those rows — so recording the whole fee
 * against each line would say the platform took it three times over.
 *
 * Each line gets its share of the basket, and the parts add up to exactly
 * what was taken rather than to a cent more or less.
 *
 * IT USED TO ROUND EACH LINE AND GIVE THE REMAINDER TO THE LAST ONE, with a
 * `Math.max(0, …)` so the last share could not go negative. That clamp is
 * where it broke. Rounding every line to nearest can assign MORE than the
 * fee before the last line is reached — five lines each rounding up is five
 * halves of a cent — and then the remainder is negative, the clamp turns it
 * into zero, and the shares add up to a cent more than the platform actually
 * took. Found by the hundred random baskets in tests/cart-checkout, which
 * caught it about once every few thousand:
 *
 *     fee 5 over [6448,12322,12230,7209,1263] came to 6
 *
 * A cent, on a fee split across sellers, but the sum of what the sellers are
 * recorded as having been charged has to equal the one number Stripe took.
 *
 * LARGEST REMAINDER, which is the standard way to hand out whole units of a
 * thing that does not divide. Every line takes the floor of its exact share,
 * which can never overshoot because the exact shares add to the fee; that
 * leaves fewer whole cents than there are lines, and they go one each to the
 * lines that were cut by the most. The result is exact by construction
 * rather than by a correction at the end, and no line can be negative
 * because nothing is ever taken back.
 */
export function apportionFee(feeTotalCents: number, lineTotals: number[]): number[] {
  if (lineTotals.length === 0) return []
  const basket = lineTotals.reduce((n, c) => n + c, 0)
  if (feeTotalCents <= 0 || basket <= 0) return lineTotals.map(() => 0)

  const out: number[] = []
  const remainders: { at: number; frac: number; line: number }[] = []
  let assigned = 0
  for (let i = 0; i < lineTotals.length; i++) {
    const exact = (feeTotalCents * lineTotals[i]) / basket
    const whole = Math.floor(exact)
    out.push(whole)
    assigned += whole
    remainders.push({ at: i, frac: exact - whole, line: lineTotals[i] })
  }

  /* Ties go to the bigger line, and then to the earlier one, so the same
     basket always splits the same way. */
  remainders.sort((a, b) => b.frac - a.frac || b.line - a.line || a.at - b.at)
  let left = feeTotalCents - assigned
  for (let i = 0; i < remainders.length && left > 0; i++, left--) {
    out[remainders[i].at] += 1
  }
  return out
}
