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
 *
 * A product can have its own rate in a region (Settings › Taxes, SQL part
 * 110): its lines are taxed at that rate, every other line and the delivery
 * at the region's. A store with no such rate gets exactly the sums it always
 * did, because the taxable amount is then still taxed in one piece.
 */

import { regionCode } from "./regions"
import { taxLabel } from "@/lib/tax/rules"

export interface TotalsLine {
  /** Only needed for a product's own rate in a region. */
  productId?: string | null
  unitCents: number
  quantity: number
  discountCents: number
  taxable: boolean
  /**
   * A download, course or membership sold beside shipped items. Taxed only
   * when the store taxes digital products too (Settings › Taxes, "Charge tax
   * on digital products", `TaxSettings.digital`), as the single product and
   * basket checkouts tax them.
   */
  digital?: boolean
}

export interface TaxRate {
  id?: string
  country: string
  region: string | null
  rateBps: number
  /** What the region's tax is called (Settings › Taxes): "VAT", "GST", "Sales tax". */
  name?: string | null
}

export interface TaxSettings {
  mode: "none" | "manual" | "provider"
  pricesIncludeTax: boolean
  taxOnShipping: boolean
  /** Digital lines are taxed too (commerce_settings.tax_digital, SQL part 110). Off or absent: they are not. */
  digital?: boolean
  rates: TaxRate[]
  /** A product's own rate in one region (commerce_tax_overrides). */
  overrides?: { taxRateId: string; productId: string; rateBps: number }[]
}

export interface PhysicalTotals {
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxRateBps: number
  taxIncluded: boolean
  /** The tax line's words, "VAT 19%", for the checkout, the order and the receipt (lib/tax/rules taxLabel). */
  taxLabel: string
  totalCents: number
}

export const NO_TAX: TaxSettings = { mode: "none", pricesIncludeTax: false, taxOnShipping: false, rates: [] }

const clampBps = (bps: number): number => (Number.isFinite(bps) ? Math.min(10_000, Math.max(0, Math.round(bps))) : 0)

/** The region row an address falls in: its state's before its country's. */
function rateRowFor(settings: TaxSettings, country: string | null, region: string | null): TaxRate | null {
  if (settings.mode !== "manual" || !country) return null
  const c = country.toUpperCase()
  const r = region?.trim().toLowerCase() || null
  /* "CA" and "California" are the same state where Storelib knows the list. */
  const code = regionCode(c, region)
  const regional = r
    ? settings.rates.find((t) => t.country.toUpperCase() === c && !!t.region && (t.region.trim().toLowerCase() === r || (code !== null && regionCode(c, t.region) === code)))
    : null
  const national = settings.rates.find((t) => t.country.toUpperCase() === c && !t.region)
  return regional ?? national ?? null
}

export function taxRateFor(settings: TaxSettings, country: string | null, region: string | null): number {
  return clampBps(rateRowFor(settings, country, region)?.rateBps ?? 0)
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
  const row = rateRowFor(tax, opts.country ?? null, opts.region ?? null)
  const taxRateBps = clampBps(row?.rateBps ?? 0)
  const own = new Map<string, number>()
  if (row?.id) for (const o of tax.overrides ?? []) if (o.taxRateId === row.id) own.set(o.productId, clampBps(o.rateBps))
  /* Taxable amounts by rate: one piece at the region's rate unless a line has its own. */
  const byRate = new Map<number, number>()
  for (const line of lines) {
    const gross = Math.max(0, Math.round(line.unitCents)) * Math.max(0, Math.floor(line.quantity))
    const off = Math.min(gross, Math.max(0, Math.round(line.discountCents)))
    itemsSubtotalCents += gross
    discountCents += off
    if (!line.taxable || (line.digital && tax.digital !== true)) continue
    taxableCents += gross - off
    const bps = line.productId && own.has(line.productId) ? (own.get(line.productId) as number) : taxRateBps
    byRate.set(bps, (byRate.get(bps) ?? 0) + gross - off)
  }
  const shippingCents = Math.max(0, Math.round(opts.shippingCents))
  const shippingDiscountCents = opts.freeShipping ? shippingCents : 0
  const shippingPaid = shippingCents - shippingDiscountCents
  const taxIncluded = tax.pricesIncludeTax
  let itemsTax = 0
  if (own.size === 0) itemsTax = taxOf(taxableCents, taxRateBps, taxIncluded)
  else for (const [bps, cents] of byRate) itemsTax += taxOf(cents, bps, taxIncluded)
  const taxCents = itemsTax + (tax.taxOnShipping ? taxOf(shippingPaid, taxRateBps, taxIncluded) : 0)
  const totalCents = itemsSubtotalCents - discountCents + shippingPaid + (taxIncluded ? 0 : taxCents)
  /* One rate charged names it ("VAT 19%"); lines at a product's own rate beside it leave the name alone. */
  const charged = new Set([...byRate.entries()].filter(([bps, cents]) => cents > 0 && bps > 0).map(([bps]) => bps))
  if (tax.taxOnShipping && shippingPaid > 0 && taxRateBps > 0) charged.add(taxRateBps)
  const labelBps = charged.size === 1 ? [...charged][0] : charged.size === 0 ? taxRateBps : 0
  return { itemsSubtotalCents, discountCents, shippingCents, shippingDiscountCents, taxCents, taxRateBps, taxIncluded, taxLabel: taxLabel(row?.name, labelBps), totalCents }
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
