/**
 * What a sale's push says, for lib/push/notifications.ts. Pure and browser
 * safe, for tests/sale-push.test.ts.
 */
import { formatMinor } from "@/lib/markets/money"

/** "$12.40" or "49.00 lei" in the amount's own currency, or "" when the currency is unknown: never a guessed one. */
export function moneyText(minor: number, currency: string | null | undefined): string {
  const code = typeof currency === "string" && /^[a-z]{3}$/i.test(currency.trim()) ? currency.trim().toUpperCase() : null
  if (!code || !Number.isFinite(minor)) return ""
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code })
  } catch {
    return ""
  }
  /* "25.00 lei", as Orders writes the same sale (lib/markets/money formatMinor). */
  return formatMinor(minor, code, "en-US")
}

/** The words of a sale's push. A free claim is an order, not a sale, and is never a sales milestone. Pure, for tests. */
export function saleText(opts: { productName: string; amountCents: number; currency?: string | null; more?: number }, milestone: string | null): { title: string; body: string } {
  const what = opts.more && opts.more > 0 ? `${opts.productName} and ${opts.more} more` : opts.productName
  if (!(opts.amountCents > 0)) return { title: "New free order", body: `Someone got ${what}` }
  const amount = moneyText(opts.amountCents, opts.currency)
  return { title: milestone ?? "🎉 You made a sale!", body: amount ? `You sold ${what} for ${amount}` : `You sold ${what}` }
}
