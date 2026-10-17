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
}

/** Orders whose tax was really collected: paid and kept. A refunded or failed order's tax is not counted. */
export const COUNTED_STATUSES = new Set(["completed", "paid", "succeeded", "fulfilled", "partially_refunded", "shipped", "delivered", "processing"])

export function summarizeTax(rows: readonly TaxOrderRow[]): TaxSummary {
  const by = new Map<string, TaxCountryLine>()
  let total = 0
  let orders = 0
  for (const r of rows) {
    const cents = Math.max(0, Math.round(Number(r.tax_cents ?? 0)))
    if (!cents || !COUNTED_STATUSES.has(String(r.status ?? "").toLowerCase())) continue
    const country = r.tax_country ? r.tax_country.toUpperCase() : null
    const key = country ?? "?"
    const line = by.get(key) ?? { country, label: (r.tax_label || "Tax").replace(/\s+\d+(\.\d+)?%$/, ""), taxCents: 0, orders: 0 }
    line.taxCents += cents
    line.orders++
    by.set(key, line)
    total += cents
    orders++
  }
  return { totalCents: total, orders, byCountry: [...by.values()].sort((a, b) => b.taxCents - a.taxCents) }
}

/** One quoted CSV cell; a value starting like a formula is made plain text for a spreadsheet. */
function cell(v: string | number | null): string {
  let s = v === null ? "" : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

/** The orders behind the figures, a line each, for an accountant. */
export function taxCsv(rows: readonly TaxOrderRow[], currency: string): string {
  const head = ["Order", "Date", "Country", "Tax", `Tax (${currency.toUpperCase()})`, "Status"].map(cell).join(",")
  const lines = rows
    .filter((r) => Number(r.tax_cents ?? 0) > 0)
    .map((r) => [r.id, r.created_at.slice(0, 10), r.tax_country ?? "", r.tax_label ?? "Tax", (Math.max(0, Number(r.tax_cents ?? 0)) / 100).toFixed(2), r.status ?? ""].map(cell).join(","))
  return [head, ...lines].join("\n") + "\n"
}

/** The periods the overview offers, in days. */
export const TAX_PERIODS = [30, 90, 365] as const
export type TaxPeriod = (typeof TAX_PERIODS)[number]
export function taxPeriod(raw: unknown): TaxPeriod {
  const n = Number(raw)
  return (TAX_PERIODS as readonly number[]).includes(n) ? (n as TaxPeriod) : 30
}
