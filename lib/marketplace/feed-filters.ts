import {
  COLOURS,
  CONDITIONS,
  categoryShortLabel,
  conditionsFor,
  fieldsFor,
  groupsForDepartment,
  sizesFor,
} from "@/lib/marketplace/listing-taxonomy"

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

/**
 * THE ORDER THE TWO MARKETPLACES THIS IS MODELLED ON USE.
 *
 * Depop: Newest, Price low to high, Price high to low. Vinted: the same three
 * with Relevance in front on a search. Ours had Populare second, between Newest
 * and the two prices — which splits the pair that people actually compare and
 * puts the least-used option in the most prominent slot after the default.
 *
 * Populare stays, at the end. It is a real ordering on this catalogue
 * (sales_count, and there is an index for it) and dropping a working sort to
 * match a competitor's list exactly would be copying the menu rather than the
 * thinking.
 */
export const SORTS: { id: FeedSort; label: string }[] = [
  { id: "new", label: "Cele mai noi" },
  { id: "price-asc", label: "Preț crescător" },
  { id: "price-desc", label: "Preț descrescător" },
  { id: "popular", label: "Populare" },
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

/**
 * @param fold Group values that differ only by case, and keep the commonest
 *             spelling as the one shown.
 *
 * ONLY BRANDS NEED THIS, and they need it badly. `condition` and `colour` are
 * ids from a fixed list and `size` comes from a size system, so those are
 * already one spelling each. `brand` is free text somebody typed into the sell
 * form, so a catalogue reliably contains Nike, nike and NIKE — and without
 * folding, the Brand list offers all three, each with a third of the real
 * count, and picking one silently excludes the listings that spelled it
 * differently.
 *
 * The commonest spelling wins rather than the first seen or a title-cased
 * guess: "H&M" and "adidas" are how those brands write themselves, and a
 * marketplace that renames them is wrong in a way a shopper notices.
 */
function tally(
  products: any[],
  read: (p: any) => string | null | undefined,
  label: (v: string) => string,
  fold = false,
): Facet[] {
  const counts = new Map<string, number>()
  /** key → every exact spelling seen under it, and how many rows used each. */
  const spellings = new Map<string, Map<string, number>>()
  for (const p of products) {
    const raw = read(p)
    const v = typeof raw === "string" ? raw.trim() : ""
    if (!v) continue
    const key = fold ? v.toLowerCase() : v
    counts.set(key, (counts.get(key) ?? 0) + 1)
    let seen = spellings.get(key)
    if (!seen) spellings.set(key, (seen = new Map()))
    seen.set(v, (seen.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      // The winner is decided AFTER everything has been counted. Deciding as
      // you go keeps whichever spelling arrived first, which is the order the
      // database happened to return rows in.
      const seen = spellings.get(key)
      let value = key
      let best = -1
      for (const [spelling, n] of seen ?? []) {
        if (n > best || (n === best && spelling < value)) {
          best = n
          value = spelling
        }
      }
      return { value, label: label(value), count }
    })
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
    brands: tally(products, (p) => p?.brand, (v) => v, true),
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

/**
 * ===========================================================================
 *  THE FILTERS AS A QUERY STRING
 * ===========================================================================
 *
 * The results page is a PAGE, so its state has to survive a reload, a share and
 * the back button. Holding it in React state alone means a shopper who has
 * picked three brands, a size and a price band cannot send that to anybody and
 * loses all of it by tapping a listing and coming back.
 *
 * Lists are comma-joined rather than repeated keys: `?brand=Nike,Adidas` is
 * shorter than `?brand=Nike&brand=Adidas`, and `URLSearchParams` round-trips
 * either — but only one of them is readable in an address bar, and this is a URL
 * people are meant to send each other.
 *
 * A brand containing a comma would split wrongly. That is accepted rather than
 * escaped: brands are free text a seller typed, the option list is derived from
 * what they typed, and a comma in one costs that one filter rather than the
 * page. Escaping would make every URL in the product unreadable to fix a case
 * that has not happened.
 */
const LIST_KEYS = ["brand", "size", "colour", "condition"] as const

/**
 * A CEILING ON EVERY LIST, because the URL is not ours.
 *
 * `?brand=a,b,c,…` with two thousand entries becomes a two-thousand-condition
 * `or=()` — a query string past what proxies accept and a filter Postgres plans
 * badly, from one URL that costs nothing to request. Twenty is far past any
 * real use: the Brand list is sorted by frequency and nobody ticks twenty of
 * them.
 *
 * Truncated rather than rejected. A URL somebody edited by hand still returns
 * results for the first twenty, which is closer to what they meant than an
 * error page.
 */
const MAX_LIST = 20

/** Prices are in whole RON. A hundred million is past any listing that will
 *  ever exist here and short of anything that overflows when multiplied by 100
 *  into cents. */
const MAX_PRICE = 100_000_000

export function filtersFromParams(params: URLSearchParams, validGroups: string[]): FeedFilters {
  const list = (k: string) =>
    (params.get(k) || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, MAX_LIST)
  const num = (k: string) => {
    const n = Number(params.get(k))
    return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PRICE) : null
  }
  const group = params.get("group")
  /**
   * A BAND THE WRONG WAY ROUND IS A BAND, not an empty page.
   *
   * `?min=300&max=50` is somebody who typed the two boxes in the order they
   * read them, and answering it with "no results" is technically right and
   * useless. Swapping is what they meant and what every price filter that has
   * thought about it does.
   */
  const lo = num("min")
  const hi = num("max")
  const minPrice = lo != null && hi != null ? Math.min(lo, hi) : lo
  const maxPrice = lo != null && hi != null ? Math.max(lo, hi) : hi
  return {
    // Validated against the department in play, so a hand-typed group from
    // another department cannot silently empty the page.
    group: group && validGroups.includes(group) ? group : null,
    brands: list("brand"),
    sizes: list("size"),
    colours: list("colour"),
    conditions: list("condition"),
    minPrice,
    maxPrice,
    onSale: params.get("sale") === "1",
  }
}

/** Only what is set. An empty key in a shared URL is noise that survives copy
 *  and paste forever. */
export function paramsFromFilters(
  f: FeedFilters,
  /**
   * `sub` is the taxonomy's third level (Femei › Haine › Rochii). It is NOT a
   * FeedFilters key: it is part of the SCOPE, like the department and the group
   * — the page is about dresses, and the facets below describe the dresses. It
   * rides here so every URL this file builds carries it forward, rather than
   * being silently dropped the first time somebody presses a brand.
   */
  extra?: { sort?: FeedSort; page?: number; q?: string; sub?: string | null },
): URLSearchParams {
  const p = new URLSearchParams()
  if (extra?.q) p.set("q", extra.q)
  if (extra?.sub) p.set("sub", extra.sub)
  if (f.group) p.set("group", f.group)
  const lists: Record<(typeof LIST_KEYS)[number], string[]> = {
    brand: f.brands,
    size: f.sizes,
    colour: f.colours,
    condition: f.conditions,
  }
  for (const k of LIST_KEYS) if (lists[k].length > 0) p.set(k, lists[k].join(","))
  if (f.minPrice != null) p.set("min", String(f.minPrice))
  if (f.maxPrice != null) p.set("max", String(f.maxPrice))
  if (f.onSale) p.set("sale", "1")
  if (extra?.sort && extra.sort !== "new") p.set("sort", extra.sort)
  if (extra?.page && extra.page > 1) p.set("page", String(extra.page))
  return p
}

/**
 * ===========================================================================
 *  THE OPTIONS COME FROM THE TAXONOMY. THE NUMBERS COME FROM THE DATA.
 * ===========================================================================
 *
 * Every facet was derived from whatever happened to be listed, and that has one
 * consequence which looks like the feature working and is actually the feature
 * missing: a category with nothing in it has NO FILTERS AT ALL. Open Femei ›
 * Încălțăminte › Pantofi cu toc on a young catalogue and the page offers
 * Categorie, Preț and a checkbox — no Mărime, no Culoare, no Stare — because
 * there is nothing to derive them from. The filters vanish exactly when
 * somebody most needs to see what this category can even be narrowed by.
 *
 * Three of the five are CLOSED VOCABULARIES that the sell form already owns:
 *
 *   Mărime   `sizesFor(group)` — 36-46 for shoes, XS-XXL and waists for
 *            clothing, ages for children's. In the grid's own order, which is
 *            the other half of this: sorting sizes by how many listings have
 *            them puts 42 before 36 and makes the list unreadable.
 *   Culoare  the palette, in the palette's order.
 *   Stare    the five-rung ladder, in the ladder's order, worded for what is
 *            being sold — see `conditionsFor`.
 *
 * Brand stays derived, and that is not an oversight: it is free text somebody
 * typed into the sell form, so there is no list to offer. A brand facet with no
 * brands in it is genuinely empty and is not drawn.
 *
 * AND THE CATEGORY DECIDES WHICH FILTERS EXIST AT ALL. `fieldsFor` is the same
 * table the sell form asks — a bag has no size, a lipstick has neither size nor
 * era — so Divertisment does not offer a Mărime pill that no listing in it could
 * ever answer. That is what "adapted to the category" has to mean; the
 * alternative is every category offering every filter and most of them being
 * dead.
 *
 * ---------------------------------------------------------------------------
 * A ZERO IS SHOWN AND CANNOT BE PRESSED
 * ---------------------------------------------------------------------------
 * Hiding zero-count options is right while the list is derived, because then a
 * missing option means "nobody has one". Once the list is a vocabulary, hiding
 * is a lie of omission: it makes a category with three sizes look like a
 * category with three sizes rather than one with twelve, three of which are in
 * stock. So they are drawn, greyed, and inert — you can see the shape of the
 * catalogue without being able to walk into an empty room.
 */
export function facetsWithVocabulary(
  counted: { groups: Facet[]; brands: Facet[]; sizes: Facet[]; colours: Facet[]; conditions: Facet[] },
  groupId: string | null | undefined,
) {
  /** The vocabulary in ITS order, wearing the counts that were measured. */
  const merge = (vocab: { id: string; label: string }[], measured: Facet[]): Facet[] => {
    const by = new Map(measured.map((m) => [m.value.trim().toLowerCase(), m]))
    const out: Facet[] = vocab.map((o) => ({
      value: o.id,
      label: o.label,
      count: by.get(o.id.trim().toLowerCase())?.count ?? 0,
    }))
    // Anything the data has that the vocabulary does not — a size typed before
    // the grid existed, a colour from an older palette. Kept rather than
    // dropped: a listing that carries it can still be reached, and a filter
    // that cannot reach a published listing is worse than an untidy list.
    const known = new Set(vocab.map((o) => o.id.trim().toLowerCase()))
    for (const m of measured) if (!known.has(m.value.trim().toLowerCase())) out.push(m)
    return out
  }

  const fields = fieldsFor(groupId)
  // No group means no field table to consult — a search, or the whole
  // catalogue — and there the honest answer is "everything is possible here".
  const has = (f: "brand" | "size" | "colour") => !groupId || fields.includes(f)

  return {
    groups: counted.groups,
    brands: has("brand") ? counted.brands : [],
    // The " · încălțăminte" suffix off the shoe labels: it exists to
    // disambiguate inside the sell form's ONE mixed list, and a Mărime facet
    // that already says Mărime does not need every row repeating the word.
    sizes: has("size")
      ? merge(
          sizesFor(groupId).map((o) => ({ id: o.id, label: o.label.replace(/ · încălțăminte$/, "") })),
          counted.sizes,
        )
      : [],
    colours: has("colour") ? merge(COLOURS, counted.colours) : [],
    conditions: merge(conditionsFor(groupId), counted.conditions),
  }
}

/**
 * ===========================================================================
 *  A LIST YOU CAN FIND SOMETHING IN
 * ===========================================================================
 *
 * A brand facet on a real catalogue is forty to two hundred entries in a box
 * three hundred pixels tall, sorted by how many listings each has. Looking for
 * Carhartt in that is scrolling, and scrolling a list sorted by frequency is
 * scrolling with no idea how far you are from the answer — which is why Vinted
 * and Depop both put a field at the top of theirs and why this is not a nicety.
 *
 * TWO RULES, and the second one is the subtle one:
 *
 *   MATCHES, on the label AND the raw value. A brand's label is its commonest
 *   spelling — see `tally` — so somebody typing the spelling that lost still
 *   finds it.
 *
 *   AND WHAT YOU HAVE ALREADY TICKED COMES FIRST. Pick three brands out of two
 *   hundred, scroll, and the three you picked are somewhere behind you: the list
 *   stops telling you what you have chosen, which is the one thing it is for.
 *
 * `pinned` rather than `selected` is what decides the order, and the caller is
 * expected to capture it when the list OPENS rather than passing the live
 * selection. Pinning live means the row you just ticked leaps to the top from
 * under the cursor, and the second tick lands on whatever slid into its place.
 */
export function orderFacetOptions(options: Facet[], pinned: string[], term: string): Facet[] {
  const q = term.trim().toLowerCase()
  const on = new Set(pinned.map((s) => s.trim().toLowerCase()))
  const matched = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q))
    : options
  const first: Facet[] = []
  const rest: Facet[] = []
  for (const o of matched) (on.has(o.value.trim().toLowerCase()) ? first : rest).push(o)
  return [...first, ...rest]
}

/** Past this many rows a list stops being scannable and needs a field. Eight is
 *  about what fits in a dropdown without scrolling. */
export const FACET_SEARCH_MIN = 8

export function sortFromParam(v: string | null): FeedSort {
  return SORTS.some((s) => s.id === v) ? (v as FeedSort) : "new"
}

/**
 * FIVE ACROSS AND EIGHTEEN DEEP.
 *
 * Ninety is a deliberate number rather than a round one: the grid is five wide
 * at its widest, so a page size that is not a multiple of five ends on a ragged
 * row, and a ragged last row on every page reads as the data running out rather
 * than as the page ending. Eighteen rows is about six screens on a laptop —
 * enough that paginating is rare, few enough that the last row is reachable.
 */
export const PAGE_SIZE = 90

/**
 * ===========================================================================
 *  FACET COUNTS THAT SURVIVE THE OTHER FILTERS
 * ===========================================================================
 *
 * `facetsFrom` counts every option across the whole scope, which is right while
 * nothing is applied and wrong the moment something is. Pick Nike, and the Size
 * list still offers every size in the department — including the eleven sizes
 * no Nike listing has. Each of those is a tap that empties the page, and the
 * count printed beside it was the reason somebody trusted it.
 *
 * The platform-standard answer is that every facet is counted with all the
 * OTHER filters applied but not its own. Its own is excluded deliberately: a
 * Brand list counted with the brand filter applied offers exactly the brand you
 * already picked, which is a dead end you have to undo to escape — and it makes
 * multi-select impossible, because the second brand is never offered.
 *
 * Five facets could be five queries. It is one: the caller fetches the
 * attribute rows once with the NON-facet filters already applied in SQL (the
 * scope, the search, the price band, on-sale), and the cross-filtering between
 * facets is done here, over an array. Five passes over a thousand rows is
 * nothing; five round trips is a page that takes five times as long to draw.
 */
export function facetsWithCounts(rows: any[], departmentId: string | null | undefined, f: FeedFilters) {
  /** Everything except `except`, so a facet never filters itself out. */
  const others = (except: keyof FeedFilters): any[] => {
    const applied: FeedFilters = { ...f, group: except === "group" ? null : f.group }
    for (const k of ["brands", "sizes", "colours", "conditions"] as const) {
      if (k === except) applied[k] = []
    }
    // Price and on-sale are already applied in SQL by the caller, and applying
    // them twice is harmless but pointless — they are cleared here so this pass
    // is only ever doing the work the query could not.
    return applyFeedFilters(rows, { ...applied, minPrice: null, maxPrice: null, onSale: false })
  }

  return {
    groups: facetsFrom(others("group"), departmentId).groups,
    brands: facetsFrom(others("brands"), departmentId).brands,
    sizes: facetsFrom(others("sizes"), departmentId).sizes,
    colours: facetsFrom(others("colours"), departmentId).colours,
    conditions: facetsFrom(others("conditions"), departmentId).conditions,
  }
}

/**
 * ===========================================================================
 *  WHAT TO DROP WHEN NOTHING MATCHES
 * ===========================================================================
 *
 * "Niciun rezultat" with a "Șterge filtrele" button is the honest answer and
 * the least useful one: it offers to undo everything, when the person has
 * usually got four things right and one thing wrong. Every marketplace that has
 * thought about this — Vinted, eBay, Zalando — answers the empty page with
 * arithmetic instead: WHICH filter is the one costing you the results, and how
 * many you get back by dropping it.
 *
 * That arithmetic is free here. The facet query already fetched the attribute
 * rows for this scope, so "how many if I drop the size" is the same array
 * filtered with the size cleared — no extra request, and the answer is exact
 * wherever the row cap has not bitten.
 *
 * ONLY SUGGESTIONS THAT ACTUALLY HELP. A filter whose removal still leaves zero
 * is not the problem and offering it is a second dead end; those are dropped
 * rather than listed with a 0 beside them. Sorted by what they give back, so
 * the first one is the best single undo.
 *
 * The price band counts as ONE suggestion even though it is two numbers, for
 * the same reason it counts once on the filter badge: it is one decision
 * somebody made.
 */
export type DropSuggestion = { key: keyof FeedFilters | "price"; label: string; count: number }

export function dropSuggestions(rows: any[], f: FeedFilters, labels: {
  brands: Facet[]
  sizes: Facet[]
  colours: Facet[]
  conditions: Facet[]
}): DropSuggestion[] {
  if (rows.length === 0) return []
  const nameOf = (opts: Facet[], v: string) =>
    opts.find((o) => o.value.toLowerCase() === v.toLowerCase())?.label ?? v

  const out: DropSuggestion[] = []
  const consider = (key: DropSuggestion["key"], label: string, without: FeedFilters) => {
    const count = applyFeedFilters(rows, without).length
    if (count > 0) out.push({ key, label, count })
  }

  const lists: [("brands" | "sizes" | "colours" | "conditions"), Facet[], string][] = [
    ["brands", labels.brands, "brandul"],
    ["sizes", labels.sizes, "mărimea"],
    ["colours", labels.colours, "culoarea"],
    ["conditions", labels.conditions, "starea"],
  ]
  for (const [key, opts, word] of lists) {
    if (f[key].length === 0) continue
    const named = f[key].length === 1 ? `${word} ${nameOf(opts, f[key][0])}` : word
    consider(key, named, { ...f, [key]: [] })
  }
  if (f.minPrice != null || f.maxPrice != null) {
    consider("price", "filtrul de preț", { ...f, minPrice: null, maxPrice: null })
  }
  if (f.onSale) consider("onSale", "„La reducere”", { ...f, onSale: false })

  return out.sort((a, b) => b.count - a.count)
}
