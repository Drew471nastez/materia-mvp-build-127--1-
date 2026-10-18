/**
 * ===========================================================================
 *  THE TAX ON A PAID MEMBERSHIP INVOICE
 * ===========================================================================
 * A membership's renewals are Stripe invoices (lib/memberships/sync.ts
 * recordPaidInvoice writes each as an order). Whatever charged the tax,
 * the creator's rate put on the subscription as a Stripe tax rate or Stripe
 * Tax (lib/tax/membership.ts), Stripe says it on the invoice. The order
 * used to be written without it, so the order page, the receipt and
 * Settings › Taxes' Tax collected never showed a membership's tax.
 *
 * Read from the invoice as Stripe sent it, in either shape: `total_taxes`
 * (current API versions) or `total_tax_amounts` (older ones). Pure.
 */

export interface InvoiceTaxFacts {
  taxCents: number
  included: boolean
  /** The Stripe tax rate behind the first taxed line, for its name and country. */
  taxRateId: string | null
}

type Loose = Record<string, unknown>

export function invoiceTaxFacts(invoice: unknown): InvoiceTaxFacts | null {
  const inv = (invoice ?? {}) as Loose
  const current = Array.isArray(inv.total_taxes) ? (inv.total_taxes as Loose[]) : null
  const older = Array.isArray(inv.total_tax_amounts) ? (inv.total_tax_amounts as Loose[]) : null
  const lines = (current ?? older ?? [])
    .map((t) => {
      const amount = Math.max(0, Math.round(Number(t.amount) || 0))
      const included = current ? t.tax_behavior === "inclusive" : t.inclusive === true
      const details = (t.tax_rate_details ?? null) as Loose | null
      const rate = current ? details?.tax_rate : t.tax_rate
      const rateId = typeof rate === "string" ? rate : rate && typeof (rate as Loose).id === "string" ? ((rate as Loose).id as string) : null
      return { amount, included, rateId }
    })
    .filter((t) => t.amount > 0)
  const taxCents = lines.reduce((n, t) => n + t.amount, 0)
  if (taxCents <= 0) return null
  const paid = Math.max(0, Math.round(Number(inv.amount_paid) || 0))
  return { taxCents: paid ? Math.min(taxCents, paid) : taxCents, included: lines.every((t) => t.included), taxRateId: lines[0].rateId }
}
