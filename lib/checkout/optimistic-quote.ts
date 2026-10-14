/**
 * ===========================================================================
 *  THE ORDER AT ONCE, WHILE THE SERVER PRICES IT AGAIN
 * ===========================================================================
 * Changing a quantity at checkout (− / +, Remove) used to fade the total and
 * wait for the server's answer before showing the new one. The new amounts
 * are known well enough at once: each line is its unit price times its new
 * quantity, its discount the same share of it, and the tax the same share of
 * what it is on. The page shows that the moment the button is pressed, and
 * the server's quote, which is what is charged, replaces it when it comes
 * (a shipping rate by order value or a code's minimum can move it then).
 *
 * Only quantities: a line changed to another option, or one the quote has
 * never priced, waits for the server (null).
 *
 * Pure.
 */

interface QuoteLine {
  productId: string
  variantId: string | null
  quantity: number
  unitCents: number
  discountCents: number
}

interface QuoteTotals {
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxIncluded: boolean
  totalCents: number
  codFeeCents?: number
}

interface Item {
  productId: string
  variantId: string | null
  quantity: number
}

const same = (a: { productId: string; variantId: string | null }, b: { productId: string; variantId: string | null }) => a.productId === b.productId && (a.variantId ?? null) === (b.variantId ?? null)

export function optimisticQuote<Q extends { lines: L[]; totals: T }, L extends QuoteLine, T extends QuoteTotals>(quote: Q, items: Item[]): Q | null {
  /* Every item must be a line the quote priced: anything new waits for the server. */
  if (!items.every((i) => quote.lines.some((l) => same(l, i)))) return null
  const lines: L[] = []
  for (const l of quote.lines) {
    const item = items.find((i) => same(l, i))
    if (!item || item.quantity <= 0) continue
    if (item.quantity === l.quantity) {
      lines.push(l)
      continue
    }
    const discountCents = l.quantity > 0 ? Math.round((l.discountCents * item.quantity) / l.quantity) : 0
    lines.push({ ...l, quantity: item.quantity, discountCents })
  }
  const t = quote.totals
  const itemsSubtotalCents = lines.reduce((n, l) => n + l.unitCents * l.quantity, 0)
  const discountCents = lines.reduce((n, l) => n + Math.min(l.unitCents * l.quantity, l.discountCents), 0)
  const extras = t.shippingCents - t.shippingDiscountCents + (t.codFeeCents ?? 0)
  const before = t.itemsSubtotalCents - t.discountCents + extras
  const after = itemsSubtotalCents - discountCents + extras
  const taxCents = t.taxCents > 0 && before > 0 ? Math.round((t.taxCents * after) / before) : t.taxCents
  const totalCents = Math.max(0, after + (t.taxIncluded ? 0 : taxCents))
  return { ...quote, lines, totals: { ...t, itemsSubtotalCents, discountCents, taxCents, totalCents } }
}
