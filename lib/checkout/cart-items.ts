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
  /** Unit price in cents, as charged. */
  priceCents: number
}

/** Stripe's cap on one metadata value. */
export const METADATA_VALUE_LIMIT = 500
export const CART_METADATA_PREFIX = "cart_"

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
    const next = current === "" ? encoded : `${current}${LINE}${encoded}`
    if (next.length > METADATA_VALUE_LIMIT) {
      flush()
      current = encoded
    } else {
      current = next
    }
  }
  flush()
  return out
}

/**
 * Back out of whatever metadata came off the session. Anything that does not
 * decode is dropped: fulfilling three of four items and saying so beats
 * throwing away a payment that has already been taken.
 */
export function unpackItems(metadata: Record<string, string> | null | undefined): PackedItem[] {
  if (!metadata) return []
  const out: PackedItem[] = []
  for (let i = 0; i < 50; i++) {
    const chunk = metadata[`${CART_METADATA_PREFIX}${i}`]
    if (typeof chunk !== "string") continue
    for (const raw of chunk.split(LINE)) {
      const item = decodeItem(raw)
      if (item) out.push(item)
    }
  }
  return out
}

/** What the payment should have been, from the lines themselves. */
export function packedTotalCents(items: PackedItem[]): number {
  return items.reduce((n, i) => n + i.priceCents * i.quantity, 0)
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
 * Each line gets its share of the basket, and the LAST line carries whatever
 * rounding is left, so the parts add up to exactly what was taken rather
 * than to a cent more or less.
 */
export function apportionFee(feeTotalCents: number, lineTotals: number[]): number[] {
  if (lineTotals.length === 0) return []
  const basket = lineTotals.reduce((n, c) => n + c, 0)
  if (feeTotalCents <= 0 || basket <= 0) return lineTotals.map(() => 0)

  const out: number[] = []
  let assigned = 0
  for (let i = 0; i < lineTotals.length; i++) {
    if (i === lineTotals.length - 1) {
      out.push(Math.max(0, feeTotalCents - assigned))
      break
    }
    const share = Math.round((feeTotalCents * lineTotals[i]) / basket)
    assigned += share
    out.push(share)
  }
  return out
}
