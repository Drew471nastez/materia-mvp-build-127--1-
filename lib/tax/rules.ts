/**
 * ===========================================================================
 *  TAX: WHICH RATE, AND HOW MUCH
 * ===========================================================================
 * Settings › Taxes (components/app/settings/taxes-panel.tsx) keeps a store's
 * own tax, the way Shopify's manual tax works:
 *
 *   regions     a country, or a state or province inside one, with its rate
 *               (commerce_tax_rates, SQL part 78). A buyer whose address is
 *               in no region pays no tax: Storelib never invents a rate.
 *   overrides   a different rate for one product in one region ("books are
 *               5% in Romania") (commerce_tax_overrides, SQL part 110).
 *   included    prices already include tax (most of Europe): the tax is the
 *               part of the price that was tax and the total does not move.
 *               Off, tax is added on top.
 *   shipping    whether delivery is taxed too (physical orders).
 *   digital     whether downloads, courses and memberships are taxed too;
 *               off by default, so a digital store that never opens Taxes
 *               charges what it always did.
 *
 * Pure, so both checkouts, the server and the tests share one answer.
 */

export interface TaxRegionRow {
  id?: string
  country: string
  region: string | null
  name?: string
  rateBps: number
}

export interface TaxOverrideRow {
  id?: string
  taxRateId: string
  productId: string
  name?: string
  rateBps: number
}

const clampBps = (bps: number): number => (Number.isFinite(bps) ? Math.min(10_000, Math.max(0, Math.round(bps))) : 0)

/**
 * The region an address falls in: a state's own row before its country's.
 * `sameRegion` decides whether a stored region and a typed one are the same
 * place ("CA" and "California"); without it they must match as written.
 */
export function regionFor(
  regions: readonly TaxRegionRow[],
  country: string | null | undefined,
  region: string | null | undefined,
  sameRegion: (country: string, a: string, b: string) => boolean = (_c, a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
): TaxRegionRow | null {
  if (!country) return null
  const c = country.toUpperCase()
  const r = region?.trim() || null
  const regional = r ? regions.find((t) => t.country.toUpperCase() === c && !!t.region && sameRegion(c, t.region, r)) : null
  return regional ?? regions.find((t) => t.country.toUpperCase() === c && !t.region) ?? null
}

/** A product's rate in a region: its own override there, else the region's. */
export function rateForProduct(region: TaxRegionRow | null, overrides: readonly TaxOverrideRow[], productId: string | null | undefined): number {
  if (!region) return 0
  const own = region.id && productId ? overrides.find((o) => o.taxRateId === region.id && o.productId === productId) : null
  return clampBps(own ? own.rateBps : region.rateBps)
}

/** The tax inside (included) or on top of (added) an amount. */
export function taxOf(cents: number, bps: number, included: boolean): number {
  if (cents <= 0 || bps <= 0) return 0
  return included ? Math.round(cents - (cents * 10_000) / (10_000 + bps)) : Math.round((cents * bps) / 10_000)
}

/** "19%", "9.5%" */
export function percentText(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 ? (bps % 10 ? 2 : 1) : 0)}%`
}

/** "19.5" typed, as basis points; null when it is not a rate. */
export function bpsFromPercent(typed: unknown): number | null {
  const n = typeof typed === "number" ? typed : typeof typed === "string" && typed.trim() !== "" ? Number(typed.replace(",", ".")) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100)
}

export interface DigitalTax {
  /** What is charged: the price, or the price and tax on top. */
  totalCents: number
  taxCents: number
  rateBps: number
  included: boolean
  country: string | null
}

/**
 * Tax on a digital sale, for the single product checkout. Nothing unless the
 * store taxes digital products and the buyer's country is one of its
 * regions. A code's discount is taken before tax; a tip is never taxed.
 */
export function digitalTax(
  setup: { enabled: boolean; digital: boolean; included: boolean; regions: readonly TaxRegionRow[]; overrides: readonly TaxOverrideRow[] },
  sale: { taxableCents: number; tipCents: number; productId: string; country: string | null; region?: string | null },
): DigitalTax {
  const base = Math.max(0, sale.taxableCents) + Math.max(0, sale.tipCents)
  if (!setup.enabled || !setup.digital || !sale.country) return { totalCents: base, taxCents: 0, rateBps: 0, included: setup.included, country: sale.country }
  const region = regionFor(setup.regions, sale.country, sale.region ?? null)
  const bps = rateForProduct(region, setup.overrides, sale.productId)
  const tax = taxOf(Math.max(0, sale.taxableCents), bps, setup.included)
  return { totalCents: setup.included ? base : base + tax, taxCents: tax, rateBps: bps, included: setup.included, country: sale.country.toUpperCase() }
}
