/**
 * WHAT A RENEWAL'S FEE IS WORKED OUT ON: the price, never the tax added to it.
 *
 * A digital sale's fee "stays on the price, never on the tax" (the single
 * product, the basket and the website checkouts all leave an added tax out of
 * the amount the fee is taken from). A membership renewal's exact fee
 * (./webhook.ts exactRenewalFee) was taken from the invoice's `amount_due`,
 * which includes a tax Stripe ADDS on top (the creator's rate or Stripe Tax,
 * lib/tax/membership.ts): $20 + $4 tax paid Grow's fee on $24, 97c rather
 * than the 85c a one time $20 sale pays.
 *
 * A tax INSIDE the price (inclusive) is part of the price, as on a one time
 * sale with prices including tax, and stays in. Read from either shape Stripe
 * sends: `total_taxes` (current API versions) or `total_tax_amounts`. Pure.
 */
type Loose = Record<string, unknown>

export function renewalFeeBaseCents(invoice: unknown): number {
  const inv = (invoice ?? {}) as Loose
  const due = Math.max(0, Math.round(Number(inv.amount_due) || 0))
  const current = Array.isArray(inv.total_taxes) ? (inv.total_taxes as Loose[]) : null
  const older = Array.isArray(inv.total_tax_amounts) ? (inv.total_tax_amounts as Loose[]) : null
  const added = (current ?? older ?? []).reduce((sum, t) => {
    const inclusive = current ? t.tax_behavior === "inclusive" : t.inclusive === true
    return inclusive ? sum : sum + Math.max(0, Math.round(Number(t.amount) || 0))
  }, 0)
  return Math.max(0, due - added)
}
