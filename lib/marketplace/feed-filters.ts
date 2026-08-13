import { COLOURS, CONDITIONS, categoryShortLabel, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"

/**
 * ===========================================================================
 *  NARROWING A FEED YOU ALREADY HAVE
 * ===========================================================================
 *
 * The phone's filter button had no `onClick`. It has been a painted control
 * next to the search field for as long as this screen has existed — which is
 * worse than no button, because a shopper who presses it and gets nothing
 * concludes the marketplace is broken rather than that the feature is missing.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS FETCHED, AND THAT DECIDES THE WHOLE DESIGN
 * ---------------------------------------------------------------------------
 * The feed already holds the page's listings on the client — a hundred of them,
 * with size, brand, colour, condition and price on every row. So filtering is
 * an array being cut, which means:
 *
 *   · the result count is EXACT and available before you apply anything, so the
 *     sheet can say "148 items" on the button rather than promising a number it
 *     will discover afterwards;
 *   · applying is instant and works offline;
 *   · and the facets can be DERIVED from the listings rather than listed from
 *     the taxonomy.
 *
 * That last one is the important one. A filter list written from the taxonomy
 * offers 245 sizes and 30 colours, most of which no listing on this page has —
 * and an option that returns nothing is the same empty room the old category
 * menu was full of. Every option below is a value some listing in the pool
 * actually carries, ordered by how many carry it, so a filter can never lead
 * anywhere empty and the common answers are at the top by construction.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE STORED VALUES ACTUALLY ARE
 * ---------------------------------------------------------------------------
 * `condition` and `colour` are taxonomy ids ("very-good", "black"); `size` is
 * whatever the size system for that group used ("M", "42"); `brand` is free
 * text a seller typed. So matching is on the RAW stored value and only the
 * LABEL is looked up — a colour id this taxonomy has never heard of still
 * filters correctly and simply shows its own value. Deriving the options from
 * the data is what makes that safe: an unknown value can only appear as an
 * option because a listing already has it.
 */

export type FeedSort = "new" | "price-asc" | "price-desc" | "popular"

export const SORTS: { id: FeedSort; label: string }[] = [
  { id: "new", label: "Cele mai noi" },
  { id: "popular", label: "Populare" },
  { id: "price-asc", label: "Preț crescător" },
  { id: "price-desc", label: "Preț descrescător" },
]

export type FeedFilters = {
  /** A group id — the second level of the taxonomy, e.g. `women-shoes`. */
  group: string | null
  brands: string[]
  sizes: string[]
  colours: string[]
  conditions: string[]
  /** In whole RON, which is what the input asks for. Cents are internal. */
  minPrice: number | null
  maxPrice: number | null
  onSale: boolean
}

export const EMPTY_FILTERS: FeedFilters = {
  group: null,
  brands: [],
  sizes: [],
  colours: [],
  conditions: [],
  minPrice: null,
  maxPrice: null,
  onSale: false,
}

/**
 * The number on the Filter button.
 *
 * A PRICE RANGE COUNTS ONCE however many of its two ends are set — it is one
 * decision a person made, and a badge reading 2 for "between 50 and 200" is a
 * badge counting inputs rather than filters. Every list counts its members,
 * because those genuinely are separate choices: three brands is three things
 * you have to remove to get back to everything.
 */
export function countActiveFilters(f: FeedFilters): number {
  return (
    (f.group ? 1 : 0) +
    f.brands.length +
    f.sizes.length +
    f.colours.length +
    f.conditions.length +
    (f.minPrice != null || f.maxPrice != null ? 1 : 0) +
    (f.onSale ? 1 : 0)
  )
}

export type Facet = { value: string; label: string; count: number }

const conditionLabels = new Map(CONDITIONS.map((c) => [c.id, c.label]))
const colourLabels = new Map(COLOURS.map((c) => [c.id, c.label]))
const colourHexes = new Map(COLOURS.map((c) => [c.id, c.hex]))

export function colourHex(id: string): string | null {
  return colourHexes.get(id) ?? null
}

function tally(products: any[], read: (p: any) => string | null | undefined, label: (v: string) => string): Facet[] {
  const counts = new Map<string, number>()
  for (const p of products) {
    const raw = read(p)
    const v = typeof raw === "string" ? raw.trim() : ""
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Every option any listing on this page actually has, commonest first.
 *
 * `groups` is the exception: it is offered from the TAXONOMY when a department
 * is in play, because those are the rows the menu just walked you through and a
 * department that is quiet today should still list its own groups. Everything
 * else is derived, for the reason in the note at the top of this file.
 */
export function facetsFrom(products: any[], departmentId?: string | null) {
  const groupCounts = new Map<string, number>()
  for (const p of products) {
    const g = typeof p?.category === "string" ? p.category.trim() : ""
    if (g) groupCounts.set(g, (groupCounts.get(g) ?? 0) + 1)
  }

  const groups: Facet[] = (departmentId ? groupsForDepartment(departmentId) : [])
    .map((g) => ({ value: g.id, label: categoryShortLabel(g), count: groupCounts.get(g.id) ?? 0 }))
    .filter((g) => g.count > 0)

  return {
    groups,
    brands: tally(products, (p) => p?.brand, (v) => v),
    sizes: tally(products, (p) => p?.size, (v) => v),
    colours: tally(products, (p) => p?.colour, (v) => colourLabels.get(v) ?? v),
    conditions: tally(products, (p) => p?.condition, (v) => conditionLabels.get(v) ?? v),
  }
}

/** Case-insensitive, because `brand` is free text somebody typed. */
function has(list: string[], value: unknown): boolean {
  if (list.length === 0) return true
  const v = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (!v) return false
  return list.some((x) => x.trim().toLowerCase() === v)
}

export function applyFeedFilters(products: any[], f: FeedFilters): any[] {
  const min = f.minPrice != null ? f.minPrice * 100 : null
  const max = f.maxPrice != null ? f.maxPrice * 100 : null
  return products.filter((p) => {
    if (f.group && (p?.category || "") !== f.group) return false
    if (!has(f.brands, p?.brand)) return false
    if (!has(f.sizes, p?.size)) return false
    if (!has(f.colours, p?.colour)) return false
    if (!has(f.conditions, p?.condition)) return false
    const cents = Number(p?.price_cents ?? 0)
    if (min != null && cents < min) return false
    if (max != null && cents > max) return false
    // A sale is a compare-at price ABOVE the price being asked. Equal is not a
    // sale, and a compare-at below the price is bad data rather than a discount.
    if (f.onSale && !(Number(p?.compare_at_cents ?? 0) > cents)) return false
    return true
  })
}

export function sortFeed(products: any[], sort: FeedSort): any[] {
  const list = [...products]
  switch (sort) {
    case "price-asc":
      return list.sort((a, b) => Number(a?.price_cents ?? 0) - Number(b?.price_cents ?? 0))
    case "price-desc":
      return list.sort((a, b) => Number(b?.price_cents ?? 0) - Number(a?.price_cents ?? 0))
    case "popular":
      // Sales first, then the weight of the reviews behind them. A five-star
      // average from one buyer is not evidence; the product of the two is.
      return list.sort(
        (a, b) =>
          Number(b?.sales_count ?? 0) - Number(a?.sales_count ?? 0) ||
          Number(b?.reviews_average ?? 0) * Number(b?.reviews_count ?? 0) -
            Number(a?.reviews_average ?? 0) * Number(a?.reviews_count ?? 0),
      )
    case "new":
    default:
      // The feed already arrives newest-first from the server, so this is the
      // identity — stated rather than skipped, because "Cele mai noi" has to
      // still be right after somebody has been through price and back.
      return list.sort(
        (a, b) => new Date(b?.created_at ?? 0).getTime() - new Date(a?.created_at ?? 0).getTime(),
      )
  }
}
