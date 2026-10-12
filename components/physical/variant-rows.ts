/**
 * ===========================================================================
 *  THE VARIANT ROWS THE EDITOR KEEPS WHILE OPTIONS CHANGE
 * ===========================================================================
 * The rows are every combination of the options (lib/physical/variants.ts).
 * What a seller typed into a row (price, stock, SKU, photo) has to survive
 * the edits they make to the options above it:
 *
 *   a value added        new rows start from the row they grew out of
 *                        (M becomes M / Black and M / White, both at M's price)
 *   a value removed      its rows are put aside, and come back as they were
 *                        if it is typed again in the same visit
 *   a value renamed      its rows follow the new name
 *   an option moved      every row's values move with it (remapRows)
 *   an option removed    rows that become the same keep the first one
 *
 * Pure, so tests/product-editor-physical.test.ts holds it without a browser.
 */
import { combinationKey, type Combination } from "@/lib/physical/variants"
import type { FulfillmentMethod, ProductOption } from "@/lib/physical/types"
import { THUMB_QUALITY, thumbable } from "@/lib/files/thumb"

export interface VariantRow {
  id: string | null
  options: Combination
  price: string
  compareAt: string
  cost: string
  sku: string
  barcode: string
  weight: string
  imageUrl: string | null
  /** "" is "as the product". Kept as loaded: the editor no longer sets it per variant. */
  method: FulfillmentMethod | ""
  active: boolean
  /** location id → on hand typed */
  stock: Record<string, string>
  /** location id → on hand / committed when loaded */
  loadedOnHand: Record<string, number>
  committed: Record<string, number>
}

export function emptyRow(options: Combination): VariantRow {
  return { id: null, options, price: "", compareAt: "", cost: "", sku: "", barcode: "", weight: "", imageUrl: null, method: "", active: true, stock: {}, loadedOnHand: {}, committed: {} }
}

/** True when every value `row` has is the same in `combo`: M is a parent of M / Black, the default row of everything. */
function grewFrom(row: VariantRow, combo: Combination): boolean {
  return row.options.every((v, i) => v === null || (combo[i] ?? "").toLowerCase() === v.toLowerCase())
}

/**
 * The rows for these combinations: each one found by its values, else one
 * put aside earlier, else a new row starting from the row it grew out of
 * (its price, compare at, cost, weight and photo; never its id, SKU or
 * stock, which belong to one variant only).
 */
export function rowsForCombinations(combos: Combination[], prev: VariantRow[], stash: Map<string, VariantRow>): VariantRow[] {
  const byKey = new Map(prev.map((r) => [combinationKey(r.options), r]))
  const single = prev.length === 1 && !prev[0].options.some(Boolean) ? prev[0] : null
  const next = combos.map((c) => {
    const key = combinationKey(c)
    const hit = byKey.get(key) ?? stash.get(key)
    if (hit) return { ...hit, options: c }
    /* One option with one value: still the one variant there was. */
    if (combos.length === 1 && single) return { ...single, options: c }
    const parent = prev.filter((r) => grewFrom(r, c)).sort((a, b) => b.options.filter(Boolean).length - a.options.filter(Boolean).length)[0]
    return parent
      ? { ...emptyRow(c), price: parent.price, compareAt: parent.compareAt, cost: parent.cost, weight: parent.weight, imageUrl: parent.imageUrl, active: parent.active }
      : emptyRow(c)
  })
  /* What went is kept for the visit, so typing a value back brings its rows back. */
  const kept = new Set(next.map((r) => combinationKey(r.options)))
  for (const r of prev) {
    const key = combinationKey(r.options)
    if (!kept.has(key) && r.options.some(Boolean)) stash.set(key, r)
  }
  return next
}

/** An option value renamed: the rows that had it now have the new one. */
export function renameValueInRows(rows: VariantRow[], position: number, from: string, to: string): VariantRow[] {
  const was = from.toLowerCase()
  return rows.map((r) => {
    if ((r.options[position] ?? "").toLowerCase() !== was) return r
    const options = [...r.options] as Combination
    options[position] = to
    return { ...r, options }
  })
}

/**
 * The options were moved or one was removed: each row's values follow their
 * option by name (Size stays with Size), and rows that are now the same keep
 * the first. `before` and `after` are the option names in order.
 */
export function remapRows(rows: VariantRow[], before: string[], after: string[]): VariantRow[] {
  const from = after.map((name) => before.findIndex((b) => b.toLowerCase() === name.toLowerCase()))
  const seen = new Set<string>()
  const out: VariantRow[] = []
  for (const r of rows) {
    const options = [0, 1, 2].map((i) => (from[i] !== undefined && from[i] >= 0 ? r.options[from[i]] ?? null : null)) as Combination
    const key = combinationKey(options)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...r, options })
  }
  return out
}

/** Rows grouped by their first value, in order: "S" → its rows. Used when there are two options or more. */
export function groupByFirst(rows: VariantRow[]): { value: string; rows: VariantRow[] }[] {
  const groups: { value: string; rows: VariantRow[] }[] = []
  for (const r of rows) {
    const v = r.options[0] ?? ""
    const g = groups.find((x) => x.value.toLowerCase() === v.toLowerCase())
    if (g) g.rows.push(r)
    else groups.push({ value: v, rows: [r] })
  }
  return groups
}

/** "$12.00 to $18.00", or one price when they agree; empty when none is set. */
export function priceRange(rows: VariantRow[], base: string, format: (cents: number) => string): string {
  const cents = rows.map((r) => Math.round(Number.parseFloat(r.price || base || "") * 100)).filter((n) => Number.isFinite(n))
  if (!cents.length) return ""
  const lo = Math.min(...cents)
  const hi = Math.max(...cents)
  return lo === hi ? format(lo) : `${format(lo)} to ${format(hi)}`
}

/**
 * A resized copy for a variant's square, never the camera original: a 3000px
 * photo decoded on the main thread to fill 40px was a large part of the
 * stutter. 128px wide is the smallest size Next's optimizer serves that is
 * still sharp at 3x (lib/files/thumb.ts); the Files picker asks for the same
 * width, so a photo seen there is already in the cache here.
 */
export function variantThumbSrc(url: string): string {
  if (!thumbable(url)) return url
  return `/_next/image?url=${encodeURIComponent(url)}&w=128&q=${THUMB_QUALITY}`
}

/** The variants a photo can go on: just the one chosen, or every variant sharing one of its values ("Every Sand"). */
export function photoScopes(keys: string[], name: string, rows: VariantRow[], options: ProductOption[]): { label: string; keys: string[] }[] {
  const own = { label: keys.length === 1 ? `Only ${name}` : `Every ${name}`, keys }
  if (keys.length !== 1 || options.length < 2) return [own]
  const row = rows.find((r) => combinationKey(r.options) === keys[0])
  if (!row) return [own]
  const more = options
    .map((o, pos) => {
      const value = row.options[pos]
      if (!value) return null
      const matching = rows.filter((r) => (r.options[pos] ?? "").toLowerCase() === value.toLowerCase()).map((r) => combinationKey(r.options))
      return matching.length > 1 ? { label: `Every ${value}`, keys: matching } : null
    })
    .filter((x): x is { label: string; keys: string[] } => !!x)
    /* The last option first: a colour is usually the last, and a colour is what a photo shows. */
    .reverse()
  return [own, ...more]
}
