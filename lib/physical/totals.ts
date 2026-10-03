/**
 * ===========================================================================
 *  TOTALS: ITEMS, DISCOUNT, DELIVERY, TAX, WHAT THE BUYER PAYS
 * ===========================================================================
 * Pure, and the server's word: the checkout page shows these numbers and the
 * payment is created for exactly `totalCents` computed again on the server.
 *
 * Tax is the shop's own manual rates (commerce_tax_rates) by country, and by
 * region where one is set. With prices including tax, the tax is the part of
 * each taxable amount that was tax and the total does not move; otherwise it
 * is added. No rate for the country means no tax: Storelib does not invent
 * one. A provider (automatic tax) is architecture only and computes nothing
 * here until it is connected.
 */

import { regionCode } from "./regions"

export interface TotalsLine {
  unitCents: number
  quantity: number
  discountCents: number
  taxable: boolean
}

export interface TaxRate {
  country: string
  region: string | null
  rateBps: number
}

export interface TaxSettings {
  mode: "none" | "manual" | "provider"
  pricesIncludeTax: boolean
  taxOnShipping: boolean
  rates: TaxRate[]
}

export interface PhysicalTotals {
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxRateBps: number
  taxIncluded: boolean
  totalCents: number
}

export const NO_TAX: TaxSettings = { mode: "none", pricesIncludeTax: false, taxOnShipping: false, rates: [] }

export function taxRateFor(settings: TaxSettings, country: string | null, region: string | null): number {
  if (settings.mode !== "manual" || !country) return 0
  const c = country.toUpperCase()
  const r = region?.trim().toLowerCase() || null
  /* "CA" and "California" are the same state where Storelib knows the list. */
  const code = regionCode(c, region)
  const regional = r
    ? settings.rates.find((t) => t.country.toUpperCase() === c && !!t.region && (t.region.trim().toLowerCase() === r || (code !== null && regionCode(c, t.region) === code)))
    : null
  const national = settings.rates.find((t) => t.country.toUpperCase() === c && !t.region)
  const bps = (regional ?? national)?.rateBps ?? 0
  return Number.isFinite(bps) ? Math.min(10_000, Math.max(0, Math.round(bps))) : 0
}

/** The tax inside (included) or on top of (added) an amount. */
function taxOf(cents: number, bps: number, included: boolean): number {
  if (cents <= 0 || bps <= 0) return 0
  return included ? Math.round(cents - (cents * 10_000) / (10_000 + bps)) : Math.round((cents * bps) / 10_000)
}

export function physicalTotals(
  lines: TotalsLine[],
  opts: { shippingCents: number; freeShipping?: boolean; tax?: TaxSettings; country?: string | null; region?: string | null },
): PhysicalTotals {
  const tax = opts.tax ?? NO_TAX
  let itemsSubtotalCents = 0
  let discountCents = 0
  let taxableCents = 0
  for (const line of lines) {
    const gross = Math.max(0, Math.round(line.unitCents)) * Math.max(0, Math.floor(line.quantity))
    const off = Math.min(gross, Math.max(0, Math.round(line.discountCents)))
    itemsSubtotalCents += gross
    discountCents += off
    if (line.taxable) taxableCents += gross - off
  }
  const shippingCents = Math.max(0, Math.round(opts.shippingCents))
  const shippingDiscountCents = opts.freeShipping ? shippingCents : 0
  const shippingPaid = shippingCents - shippingDiscountCents
  const taxRateBps = taxRateFor(tax, opts.country ?? null, opts.region ?? null)
  const taxIncluded = tax.pricesIncludeTax
  const taxCents = taxOf(taxableCents, taxRateBps, taxIncluded) + (tax.taxOnShipping ? taxOf(shippingPaid, taxRateBps, taxIncluded) : 0)
  const totalCents = itemsSubtotalCents - discountCents + shippingPaid + (taxIncluded ? 0 : taxCents)
  return { itemsSubtotalCents, discountCents, shippingCents, shippingDiscountCents, taxCents, taxRateBps, taxIncluded, totalCents }
}

/** Margin of a sale at a cost: null when the cost is unknown or the price is nothing. */
export function marginPercent(priceCents: number, costCents: number | null | undefined): number | null {
  if (costCents === null || costCents === undefined || priceCents <= 0) return null
  return Math.round(((priceCents - costCents) / priceCents) * 1000) / 10
}

/** A refund never above what is left to give back. */
export function refundable(totalCents: number, refundedCents: number): number {
  return Math.max(0, Math.round(totalCents) - Math.max(0, Math.round(refundedCents)))
}
