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

/**
 * THE TAX LINE'S NAME, as Settings › Taxes names the region: "VAT 19%",
 * "GST 10%", "Sales tax 8.25%". One rule for every checkout total, the
 * Stripe line, the order, the receipt, the PDF and the order emails, so a
 * buyer reads the same words everywhere. With no name it is "Tax"; with no
 * rate (a basket whose lines had different rates) the name alone.
 */
export function taxLabel(name: string | null | undefined, rateBps: number | null | undefined): string {
  const n = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) : ""
  const bps = Number.isFinite(rateBps as number) ? Math.round(rateBps as number) : 0
  return `${n || "Tax"}${bps > 0 ? ` ${percentText(bps)}` : ""}`.slice(0, 80)
}

/** The row under the total for a price that already had the tax in it: "Including VAT 19%". */
export function includedTaxLabel(label: string | null | undefined): string {
  const l = (label ?? "").trim() || "Tax"
  return `Including ${/^tax\b/i.test(l) ? "tax" + l.slice(3) : l}`
}

/** "19.5" typed, as basis points; null when it is not a rate. */
export function bpsFromPercent(typed: unknown): number | null {
  const n = typeof typed === "number" ? typed : typeof typed === "string" && typed.trim() !== "" ? Number(typed.replace(",", ".")) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100) return null
  return Math.round(n * 100)
}

/**
 * What the single product checkout page needs to show the same tax the
 * server will charge: the country rows (a digital sale has no address, so a
 * state's own row never applies), this product's own rates, and the
 * buyer's country as the request's address says. Null when nothing is taxed.
 */
export interface CheckoutTax {
  included: boolean
  regions: { id: string; country: string; rateBps: number; name?: string }[]
  overrides: { taxRateId: string; productId: string; rateBps: number }[]
  country: string | null
}

export function checkoutTaxFor(
  setup: { enabled: boolean; digital: boolean; included: boolean; regions: readonly TaxRegionRow[]; overrides: readonly TaxOverrideRow[] } | null,
  productId: string,
  country: string | null,
): CheckoutTax | null {
  if (!setup || !setup.enabled || !setup.digital) return null
  const regions = setup.regions.filter((r) => !r.region && r.id).map((r) => ({ id: r.id as string, country: r.country.toUpperCase(), rateBps: clampBps(r.rateBps), ...(r.name ? { name: r.name } : {}) }))
  if (regions.length === 0) return null
  const ids = new Set(regions.map((r) => r.id))
  const overrides = setup.overrides.filter((o) => o.productId === productId && ids.has(o.taxRateId)).map((o) => ({ taxRateId: o.taxRateId, productId: o.productId, rateBps: clampBps(o.rateBps) }))
  return { included: setup.included, regions, overrides, country: country ? country.toUpperCase() : null }
}

export interface DigitalTax {
  /** What is charged: the price, or the price and tax on top. */
  totalCents: number
  taxCents: number
  rateBps: number
  included: boolean
  country: string | null
  /** "VAT 19%": the region's name and the rate charged (taxLabel). */
  label: string
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
  if (!setup.enabled || !setup.digital || !sale.country) return { totalCents: base, taxCents: 0, rateBps: 0, included: setup.included, country: sale.country, label: taxLabel(null, 0) }
  const region = regionFor(setup.regions, sale.country, sale.region ?? null)
  const bps = rateForProduct(region, setup.overrides, sale.productId)
  const tax = taxOf(Math.max(0, sale.taxableCents), bps, setup.included)
  return { totalCents: setup.included ? base : base + tax, taxCents: tax, rateBps: bps, included: setup.included, country: sale.country.toUpperCase(), label: taxLabel(region?.name, bps) }
}

export interface BasketTax {
  /** Each line's tax, in the order the lines were given. */
  lineTaxCents: number[]
  taxCents: number
  /** The region's rate (a line with its own rate may differ). */
  rateBps: number
  included: boolean
  country: string | null
  /** What the receipt calls it: the region's own name ("VAT", "GST"). */
  name: string | null
  /** "VAT 19%"; the name alone when the lines were taxed at different rates (taxLabel). */
  label: string
}

/**
 * Tax on a website basket of digital products (app/api/checkout/cart and the
 * page at /checkout/cart), worked out the way the single product checkout
 * works it out (digitalTax): only when the store taxes digital products, by
 * the buyer's country (a basket has no address, so only whole-country
 * regions count), each line at its product's own rate there or the
 * region's, on what the line costs after its code. Nothing when the country
 * is in no region.
 */
export function basketTax(
  setup: { enabled: boolean; digital: boolean; included: boolean; regions: readonly TaxRegionRow[]; overrides: readonly TaxOverrideRow[] } | null,
  lines: readonly { productId: string; taxableCents: number }[],
  country: string | null,
): BasketTax {
  const none: BasketTax = { lineTaxCents: lines.map(() => 0), taxCents: 0, rateBps: 0, included: setup?.included === true, country: country ? country.toUpperCase() : null, name: null, label: taxLabel(null, 0) }
  if (!setup || !setup.enabled || !setup.digital || !country) return none
  const region = regionFor(
    setup.regions.filter((r) => !r.region),
    country,
    null,
  )
  if (!region) return none
  const lineRates = lines.map((l) => rateForProduct(region, setup.overrides, l.productId))
  const lineTaxCents = lines.map((l, i) => taxOf(Math.max(0, Math.round(l.taxableCents)), lineRates[i], setup.included))
  const taxCents = lineTaxCents.reduce((n, t) => n + t, 0)
  /* The rate the taxed lines were charged: one rate names it, several leave the name alone. */
  const charged = [...new Set(lineRates.filter((r, i) => lineTaxCents[i] > 0))]
  const rateBps = charged.length === 1 ? charged[0] : charged.length === 0 ? clampBps(region.rateBps) : 0
  return { lineTaxCents, taxCents, rateBps, included: setup.included, country: country.toUpperCase(), name: region.name ?? null, label: taxLabel(region.name, rateBps) }
}

/**
 * HOW TAX REGIONS WORK, as Settings › Taxes says it under the regions
 * (components/app/settings/taxes-panel.tsx). Each line is what the code
 * above does; tests/tax-settings-wiring.test.ts checks the two agree.
 */
export const TAX_REGION_RULES = {
  what: "A region is a country, or a state or province inside one, with the rate you charge there.",
  physical: "Orders you ship are taxed by the delivery address, and pickup orders by the pickup location. A state's own rate comes before its country's.",
  digital: "Downloads, courses and memberships are taxed only while Charge tax on digital products is on. Bought without anything shipped they have no address, so the buyer's country decides and only whole-country regions count.",
  elsewhere: "A buyer outside every region pays no tax. A product rate replaces the region's rate for that one product.",
}
