/**
 * ===========================================================================
 *  A DISCOUNT CODE ON THE RECEIPT
 * ===========================================================================
 * The order rows keep what was charged, not what a code took off: that was
 * recorded on the payment (the PaymentIntent's metadata, or a basket's
 * Checkout Session), and lib/checkout/invoice.ts already reads it back for
 * the PDF. The receipt page asks the same function and hands the answer to
 * this, so the page and the invoice can never tell two stories.
 *
 * It only ever adds the discount when the figures add up: each line's price
 * before the code, less the code, is what the lines were charged. If they do
 * not, the receipt shows what was charged and no discount line, which is
 * what it did before and is never wrong.
 */
import type { ReceiptView } from "./view"

export interface DiscountSource {
  discountCents: number
  discountCode: string | null
  lines: Array<{ amountCents: number }>
}

export function withDiscount(view: ReceiptView, source: DiscountSource | null | undefined): ReceiptView {
  if (!source) return view
  const discount = Math.max(0, Math.round(Number(source.discountCents) || 0))
  if (discount <= 0) return view
  if (!Array.isArray(source.lines) || source.lines.length !== view.items.length) return view
  const list = source.lines.map((l) => Math.max(0, Math.round(Number(l.amountCents) || 0)))
  const listTotal = list.reduce((n, c) => n + c, 0)
  if (listTotal - discount !== view.subtotalCents) return view
  const code = (source.discountCode ?? "").toString().trim().slice(0, 40) || null
  return {
    ...view,
    discountCents: discount,
    discountCode: code,
    items: view.items.map((item, i) => ({ ...item, listCents: list[i] })),
  }
}
