/**
 * ===========================================================================
 *  QUANTITY BREAKS AND BUY X GET Y FREE: ONE FORMULA, TO THE CENT
 * ===========================================================================
 * A `quantity_break` offer (store_offers, SQL part 304) is one product, or
 * every product of one collection, with up to six tiers. A tier is
 * { quantity (paid), freeQuantity, discountType, discountValue, label,
 * badge }: "Buy 2 get 1 free" is { 2, 1, none, 0 }, "3 for 15% off" is
 * { 3, 0, percent, 15 }, "2 for $5 off" is { 2, 0, amount, 500 }.
 *
 * What an imported theme shows and what the checkout charges come from the
 * functions below and nothing else, so they agree to the cent:
 *
 *   tierTotals    the numbers GET /api/offers/quantity-breaks answers for a
 *                 tier at one price (the theme recomputes them per variant
 *                 with the same formula):
 *                   paid     = quantity
 *                   free     = freeQuantity
 *                   total    = round(price * (100 - percent) / 100) * paid - amount
 *                              (never below 0)
 *                   compare  = price * (paid + free), or compare_at_price * paid
 *                              for a plain tier (no free units, no discount)
 *                              whose product has a compare at price above its price
 *                   saving   = compare - total
 *                   unit     = round(total / (paid + free))
 *   tierBlocks    how a number of units splits into tier blocks: the largest
 *                 tier that fits (paid + free <= units), again and again, then
 *                 the next one down for the rest, and so on. What no tier fits
 *                 is charged in full. 5 units on tiers 2+1 and 3+2 is one 3+2
 *                 block; 8 units is 3+2 and 2+1; 7 units is 3+2 and 2 at full
 *                 price.
 *   breakSavings  what each unit of one product saves in the cart, the
 *                 checkout's side (lib/offers/offers.ts applyOffers): every
 *                 unit of the product counts, whatever its variant or line;
 *                 the free units are the product's cheapest units; the rest,
 *                 dearest first, fill the paid places of the blocks in order,
 *                 and a percent or an amount comes off those paid places
 *                 (an amount per block, shared by price, the last unit taking
 *                 the rounding, never below 0); units past the blocks pay in
 *                 full. With one price throughout this is exactly tierTotals.
 *
 * Integer cents (minor units) only: yen and lei are the same arithmetic,
 * since every amount here is in the store's own minor units. Nothing a
 * browser sends is read: a line's `_sl_discount` property never decides a
 * price. Pure, so the read endpoint, the checkout, the admin and the tests
 * all import it.
 */

export const MAX_TIERS = 6
export const MAX_FREE_QUANTITY = 10
export const MAX_TIER_QUANTITY = 99
export const MAX_TIER_PERCENT = 90
/** The most an amount off one block may be, in minor units (lib/offers/offers MAX_FIXED_CENTS). */
export const MAX_TIER_AMOUNT = 10_000_000
export const MAX_TIER_LABEL = 60
export const MAX_TIER_BADGE = 30

export const TIER_DISCOUNT_TYPES = ["percent", "amount", "none"] as const
export type TierDiscountType = (typeof TIER_DISCOUNT_TYPES)[number]

export interface Tier {
  /** Units charged in one block. */
  quantity: number
  /** Units free in one block (Buy X get Y free). */
  freeQuantity: number
  discountType: TierDiscountType
  /** Percent (0 to 90), or minor units off the block, or 0 for none. */
  discountValue: number
  /** What the buyer reads: "Buy 2 get 1 free". */
  label: string
  /** A short flag on the tier: "Most popular". Empty for none. */
  badge: string
}

export interface TierTotals {
  unitPriceCents: number
  totalCents: number
  compareCents: number
  savingCents: number
}

const whole = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n) : Number.NaN)
const units = (t: Pick<Tier, "quantity" | "freeQuantity">) => t.quantity + t.freeQuantity

/** One unit at a percent off: round(price * (100 - percent) / 100). */
export function percentUnit(priceCents: number, percent: number): number {
  const p = Math.max(0, Math.min(MAX_TIER_PERCENT, Math.round(percent)))
  return Math.round((Math.max(0, Math.round(priceCents)) * (100 - p)) / 100)
}

/** A tier's own default words when the store typed none: "Buy 2 get 1 free", "Buy 3, save 15%", "Buy 2, save $5.00". */
export function tierLabel(t: Pick<Tier, "quantity" | "freeQuantity" | "discountType" | "discountValue">, money: (minor: number) => string = (c) => `$${(c / 100).toFixed(2)}`): string {
  if (t.freeQuantity > 0) return `Buy ${t.quantity} get ${t.freeQuantity} free`
  if (t.discountType === "percent" && t.discountValue > 0) return `Buy ${t.quantity}, save ${t.discountValue}%`
  if (t.discountType === "amount" && t.discountValue > 0) return `Buy ${t.quantity}, save ${money(t.discountValue)}`
  return t.quantity === 1 ? "Buy 1" : `Buy ${t.quantity}`
}

/** Whether a tier takes anything off. A plain tier (none, no free units) only shows a quantity. */
export const tierDiscounts = (t: Pick<Tier, "freeQuantity" | "discountType" | "discountValue">) => t.freeQuantity > 0 || ((t.discountType === "percent" || t.discountType === "amount") && t.discountValue > 0)

/** What one block of a tier costs at one price, as the theme shows it. `compareAtCents`: the product's compare at price, for a plain tier only. */
export function tierTotals(priceCents: number, t: Tier, compareAtCents: number | null = null): TierTotals {
  const price = Math.max(0, Math.round(priceCents))
  const paid = Math.max(0, t.quantity)
  const free = Math.max(0, t.freeQuantity)
  const unit = t.discountType === "percent" ? percentUnit(price, t.discountValue) : price
  const amount = t.discountType === "amount" ? Math.max(0, Math.round(t.discountValue)) : 0
  const totalCents = Math.max(0, unit * paid - amount)
  const plain = free === 0 && !tierDiscounts(t)
  const compareAt = typeof compareAtCents === "number" && Number.isFinite(compareAtCents) ? Math.round(compareAtCents) : 0
  const compareCents = plain && compareAt > price ? compareAt * paid : price * (paid + free)
  const count = paid + free
  return { unitPriceCents: count > 0 ? Math.round(totalCents / count) : 0, totalCents, compareCents, savingCents: Math.max(0, compareCents - totalCents) }
}

/** The tiers, largest block first (and the earlier tier first among equals). */
function bySize(tiers: Tier[]): { tier: Tier; index: number }[] {
  return tiers.map((tier, index) => ({ tier, index })).filter((x) => units(x.tier) > 0).sort((a, b) => units(b.tier) - units(a.tier) || a.index - b.index)
}

/**
 * How `count` units split into tier blocks: the largest tier that fits,
 * repeated while it fits, then the next one down for the rest. Each entry is
 * the index of its tier in `tiers`. Units no tier fits pay in full.
 */
export function tierBlocks(count: number, tiers: Tier[]): number[] {
  const out: number[] = []
  let left = Math.max(0, Math.floor(count))
  for (const { tier, index } of bySize(tiers)) {
    const size = units(tier)
    while (left >= size) {
      out.push(index)
      left -= size
    }
  }
  return out
}

/** One unit of one product in the cart: which line it is on and what it costs. */
export interface BreakUnit {
  line: number
  cents: number
}

/** What one unit saves under the quantity break, and the tier that gives it (-1: none, the unit pays in full). */
export interface UnitSaving {
  saving: number
  tier: number
}

/**
 * What each of a product's units saves (`out[k]` is for `unitsOf[k]`). The
 * free units are the cheapest; the rest, dearest first, fill the blocks'
 * paid places in order (largest block first). Ties go to the earlier line.
 */
export function breakSavings(unitsOf: BreakUnit[], tiers: Tier[]): UnitSaving[] {
  const out: UnitSaving[] = unitsOf.map(() => ({ saving: 0, tier: -1 }))
  const blocks = tierBlocks(unitsOf.length, tiers)
  if (blocks.length === 0) return out
  const order = unitsOf.map((u, k) => ({ ...u, k }))
  const cheapest = [...order].sort((a, b) => a.cents - b.cents || a.line - b.line || a.k - b.k)
  const freeCount = blocks.reduce((n, b) => n + tiers[b].freeQuantity, 0)
  const freeUnits = cheapest.slice(0, freeCount)
  const freeSet = new Set(freeUnits.map((u) => u.k))
  /* The free places, block by block, from the cheapest unit up: each free unit is named by the tier whose block it is in. */
  let f = 0
  for (const b of blocks) {
    for (let n = 0; n < tiers[b].freeQuantity; n++) {
      const u = freeUnits[f++]
      if (u) out[u.k] = { saving: u.cents, tier: b }
    }
  }
  const rest = order.filter((u) => !freeSet.has(u.k)).sort((a, b) => b.cents - a.cents || a.line - b.line || a.k - b.k)
  let r = 0
  for (const b of blocks) {
    const t = tiers[b]
    const paid = rest.slice(r, r + t.quantity)
    r += t.quantity
    if (t.discountType === "percent" && t.discountValue > 0) {
      for (const u of paid) out[u.k] = { saving: u.cents - percentUnit(u.cents, t.discountValue), tier: b }
    } else if (t.discountType === "amount" && t.discountValue > 0) {
      const blockCents = paid.reduce((n, u) => n + u.cents, 0)
      const off = Math.min(blockCents, Math.max(0, Math.round(t.discountValue)))
      let left = off
      paid.forEach((u, i) => {
        const share = i === paid.length - 1 ? left : Math.floor((off * u.cents) / Math.max(1, blockCents))
        const d = Math.min(share, u.cents)
        out[u.k] = { saving: d, tier: b }
        left -= d
      })
    } else {
      /* A paid place of a block that only gives units free: in the offer, saving nothing itself. */
      for (const u of paid) out[u.k] = { saving: 0, tier: b }
    }
  }
  return out
}

/** A tier as the store's editor sent it, checked, or what is wrong with it. `n` is its place, from 1, for the message. */
function readTier(raw: unknown, n: number, money?: (minor: number) => string): { ok: true; tier: Tier } | { ok: false; error: string } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const quantity = whole(Number(r.quantity))
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TIER_QUANTITY) return { ok: false, error: `Tier ${n}: buy 1 to ${MAX_TIER_QUANTITY}.` }
  const freeRaw = r.freeQuantity === undefined || r.freeQuantity === null || r.freeQuantity === "" ? 0 : whole(Number(r.freeQuantity))
  if (!Number.isInteger(freeRaw) || freeRaw < 0 || freeRaw > MAX_FREE_QUANTITY) return { ok: false, error: `Tier ${n}: free is 0 to ${MAX_FREE_QUANTITY}.` }
  const discountType = TIER_DISCOUNT_TYPES.includes(r.discountType as TierDiscountType) ? (r.discountType as TierDiscountType) : "none"
  const valueRaw = discountType === "none" ? 0 : whole(Number(r.discountValue ?? 0))
  if (discountType === "percent" && (!Number.isInteger(valueRaw) || valueRaw < 0 || valueRaw > MAX_TIER_PERCENT)) return { ok: false, error: `Tier ${n}: a percent off is 0 to ${MAX_TIER_PERCENT}.` }
  if (discountType === "amount" && (!Number.isInteger(valueRaw) || valueRaw < 0 || valueRaw > MAX_TIER_AMOUNT)) return { ok: false, error: `Tier ${n}: enter the amount off as 0 or more.` }
  // eslint-disable-next-line no-control-regex
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "")
  const base = { quantity, freeQuantity: freeRaw, discountType, discountValue: valueRaw }
  return { ok: true, tier: { ...base, label: text(r.label, MAX_TIER_LABEL) || tierLabel(base, money), badge: text(r.badge, MAX_TIER_BADGE) } }
}

/**
 * A quantity break's tiers as the editor sent them, checked: one to six,
 * each buying 1 to 99 with 0 to 10 free, a percent of 0 to 90 or an amount
 * of 0 or more, and strictly increasing: each tier's block (paid plus free)
 * bigger than the one before, and never fewer paid units. At least one tier
 * has to take something off.
 */
export function readTiers(raw: unknown, money?: (minor: number) => string): { ok: true; tiers: Tier[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Add at least one tier." }
  if (raw.length > MAX_TIERS) return { ok: false, error: `A quantity break has up to ${MAX_TIERS} tiers.` }
  const tiers: Tier[] = []
  for (const [i, r] of raw.entries()) {
    const t = readTier(r, i + 1, money)
    if (t.ok === false) return { ok: false, error: (t as { error: string }).error }
    const tier = (t as { tier: Tier }).tier
    const before = tiers[tiers.length - 1]
    if (before && (units(tier) <= units(before) || tier.quantity < before.quantity)) return { ok: false, error: `Tier ${i + 1} has to be bigger than tier ${i}.` }
    tiers.push(tier)
  }
  if (!tiers.some(tierDiscounts)) return { ok: false, error: "Give at least one tier a discount or free units." }
  return { ok: true, tiers }
}

/** Tiers as stored (store_offers.tiers), read leniently: anything that does not read as a whole valid list is no tiers, so the offer applies nothing. */
export function storedTiers(raw: unknown): Tier[] {
  const r = readTiers(raw)
  return r.ok === true ? r.tiers : []
}
