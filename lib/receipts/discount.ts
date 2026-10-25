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
  /** The store's offers inside the discount, by name (lib/checkout/invoice.ts InvoiceData.savings). */
  savings?: { label: string; cents: number }[]
}

/**
 * A discount as rows: each offer by its own name, then what is left as the
 * code's ("Discount (CODE)"). The offers never come to more than the whole:
 * the last takes any rounding. The same split the order emails make
 * (lib/physical/email-templates savingRows).
 */
export function splitSavings(discountCents: number, savings: { label: string; cents: number }[] | null | undefined): { rows: { label: string; cents: number }[]; rest: number } {
  let left = Math.max(0, Math.round(Number(discountCents) || 0))
  const rows: { label: string; cents: number }[] = []
  for (const s of savings ?? []) {
    const cents = Math.min(left, Math.max(0, Math.round(Number(s.cents) || 0)))
    // eslint-disable-next-line no-control-regex
    const label = String(s.label ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80)
    if (cents <= 0 || !label) continue
    const same = rows.find((r) => r.label === label)
    if (same) same.cents += cents
    else rows.push({ label, cents })
    left -= cents
  }
  return { rows, rest: left }
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
    ...(source.savings?.length ? { savings: splitSavings(discount, source.savings).rows } : {}),
    items: view.items.map((item, i) => ({ ...item, listCents: list[i] })),
  }
}

/**
 * The receipt's wait for the payment's figures: the answer if it comes within
 * `ms`, otherwise null, and null as well when the lookup fails or throws. A
 * slow or broken Stripe then costs the page its discount line and nothing
 * else. The timer is cleared either way, so a fast answer leaves nothing
 * running behind the response.
 */
export function withinTime<T>(work: () => Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    const settle = (value: T | null) => {
      clearTimeout(timer)
      resolve(value)
    }
    try {
      work().then(settle, () => settle(null))
    } catch {
      settle(null)
    }
  })
}
