/**
 * ===========================================================================
 *  WHAT TAX A STORE COLLECTED, AND WHERE (round AG): THE PURE PART
 * ===========================================================================
 * Settings › Taxes opens on an overview: the store's tax status, the tax its
 * orders carried in a period, and that tax by the buyer's country, with a
 * CSV to hand an accountant. Counted only from what each order recorded at
 * checkout (orders.tax_cents, tax_country, tax_label), never worked out
 * again here, and never a figure the store did not charge.
 *
 * Browser safe and pure, so the route, the panel and the tests read the same.
 */

export interface TaxOrderRow {
  id: string
  tax_cents: number | null
  tax_country: string | null
  tax_label: string | null
  status: string | null
  created_at: string
  /** What the order charged, and what of it went back (lib/stripe/refund-sync.ts): a part refund keeps part of the tax. */
  amount_cents?: number | null
  refund_amount_cents?: number | null
  /** The order's own currency ("eur"); a store that changed currency has orders in both. */
  currency?: string | null
}

export interface TaxCountryLine {
  country: string | null
  label: string
  taxCents: number
  orders: number
}

export interface TaxSummary {
  totalCents: number
  orders: number
  byCountry: TaxCountryLine[]
  /** Tax kept in another currency than the store's now (it changed currency): said apart, never added in. */
  otherCurrencies?: { currency: string; taxCents: number; orders: number }[]
}

/** Orders whose tax was really collected: paid and kept. A failed order's tax is not counted. */
export const COUNTED_STATUSES = new Set(["completed", "paid", "succeeded", "fulfilled", "partially_refunded", "shipped", "delivered", "processing"])

/**
 * The tax an order still holds after its refunds. Paid and kept: all of it.
 * Refunded: none, unless the refund was a part of the order
 * (refund_amount_cents under amount_cents, which is how a part refund is
 * recorded on the row, lib/stripe/refund-sync.ts), when the tax kept is the
 * same share of the tax as the money kept is of the order. Anything else
 * (failed, pending, disputed): none.
 */
export function keptTax(r: TaxOrderRow): number {
  const cents = Math.max(0, Math.round(Number(r.tax_cents ?? 0)))
  if (!cents) return 0
  const status = String(r.status ?? "").toLowerCase()
  const amount = Math.max(0, Math.round(Number(r.amount_cents ?? 0)))
  const refunded = Math.max(0, Math.round(Number(r.refund_amount_cents ?? 0)))
  const share = () => Math.min(cents, Math.round((cents * (amount - refunded)) / amount))
  if (COUNTED_STATUSES.has(status)) return status === "partially_refunded" && amount && refunded && refunded < amount ? share() : cents
  if (status !== "refunded") return 0
  if (!amount || !refunded || refunded >= amount) return 0
  return share()
}

export function summarizeTax(rows: readonly TaxOrderRow[], storeCurrency?: string | null): TaxSummary {
  const by = new Map<string, TaxCountryLine>()
  const other = new Map<string, { currency: string; taxCents: number; orders: number }>()
  const own = (storeCurrency ?? "").trim().toLowerCase()
  let total = 0
  let orders = 0
  for (const r of rows) {
    const cents = keptTax(r)
    if (!cents) continue
    const cur = (r.currency ?? "").trim().toLowerCase()
    if (own && cur && cur !== own) {
      const o = other.get(cur) ?? { currency: cur.toUpperCase(), taxCents: 0, orders: 0 }
      o.taxCents += cents
      o.orders++
      other.set(cur, o)
      continue
    }
    const country = r.tax_country ? r.tax_country.toUpperCase() : null
    const key = country ?? "?"
    const line = by.get(key) ?? { country, label: (r.tax_label || "Tax").replace(/\s+\d+(\.\d+)?%$/, ""), taxCents: 0, orders: 0 }
    line.taxCents += cents
    line.orders++
    by.set(key, line)
    total += cents
    orders++
  }
  return { totalCents: total, orders, byCountry: [...by.values()].sort((a, b) => b.taxCents - a.taxCents), ...(other.size ? { otherCurrencies: [...other.values()].sort((a, b) => b.taxCents - a.taxCents) } : {}) }
}

/** One quoted CSV cell; a value starting like a formula is made plain text for a spreadsheet. */
function cell(v: string | number | null): string {
  let s = v === null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/**
 * The orders behind the figures, a line each, for an accountant: the tax
 * charged, the part of it a refund gave back, and the order's own currency
 * (the store's, unless it was sold before a change of currency).
 */
export function taxCsv(rows: readonly TaxOrderRow[], currency: string): string {
  const head = ["Order", "Date", "Country", "Tax", `Tax (${currency.toUpperCase()})`, "Tax refunded", "Currency", "Status"].map(cell).join(",")
  const lines = rows
    .filter((r) => Number(r.tax_cents ?? 0) > 0)
    .map((r) => {
      const charged = Math.max(0, Math.round(Number(r.tax_cents ?? 0)))
      const failed = !COUNTED_STATUSES.has(String(r.status ?? "").toLowerCase()) && String(r.status ?? "").toLowerCase() !== "refunded"
      const refunded = failed ? 0 : charged - keptTax(r)
      return [r.id, r.created_at.slice(0, 10), r.tax_country ?? "", r.tax_label ?? "Tax", (charged / 100).toFixed(2), (refunded / 100).toFixed(2), (r.currency || currency).toUpperCase(), r.status ?? ""].map(cell).join(",")
    })
  return [head, ...lines].join("\n") + "\n"
}

/** The periods the overview offers, in days. */
export const TAX_PERIODS = [30, 90, 365] as const
export type TaxPeriod = (typeof TAX_PERIODS)[number]
export function taxPeriod(raw: unknown): TaxPeriod {
  const n = Number(raw)
  return (TAX_PERIODS as readonly number[]).includes(n) ? (n as TaxPeriod) : 30
}
