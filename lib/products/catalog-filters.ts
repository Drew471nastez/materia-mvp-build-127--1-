/**
 * ===========================================================================
 *  FILTERING A SHOP: PRICE, AVAILABILITY, TYPE, OPTIONS, SORT
 * ===========================================================================
 * The shop page (/products) and the search page (/search) on a creator's
 * website list the creator's products. A visitor narrows the list the way a
 * Shopify collection page lets them: a price range, in stock only, the kind
 * of product, the values of its options (Size, Colour), and an order.
 *
 * THE ADDRESS IS THE STATE. Every filter is a query parameter, so a filtered
 * list can be linked, reloaded and gone back to, and the filter form is a
 * plain GET form that works before any script has run:
 *
 *   ?q=preset&price_min=10&price_max=50&available=1&type=digital
 *     &opt.size=M&opt.size=L&sort=price-asc
 *
 * The page reads it with parseCatalogQuery, lists the products that pass
 * applyCatalogQuery, and hands the section `page.filters` from
 * catalogFilters: every group with its values, how many products each
 * value has, which are ticked, and the address that clears them. A group
 * that would not narrow anything (one value, or every product has it) is
 * left out, so a shop of three downloads is not shown a wall of checkboxes.
 *
 * Products arrive as the cards every section reads (lib/website-builder/
 * shop-products.ts). Their price is already formatted; it is read back here
 * as cents for the range and the sort, never printed from here.
 */

import { isColorOption, swatchColor } from "./product-page-model"

/** The fields of a product card this reads. */
export interface FilterableCard {
  id: string
  settings: {
    title?: unknown
    price?: unknown
    kind?: unknown
    available?: unknown
    category?: unknown
    options?: unknown
    variants?: unknown
    pay_what_you_want?: unknown
    free?: unknown
  }
}

export type CatalogSort = "featured" | "newest" | "price-asc" | "price-desc" | "title-asc" | "title-desc"

export const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
  { value: "title-asc", label: "Name, A to Z" },
  { value: "title-desc", label: "Name, Z to A" },
]

export interface CatalogQuery {
  q: string
  /** Whole dollars, as a person types them. Null when not set. */
  priceMin: number | null
  priceMax: number | null
  available: boolean
  types: string[]
  /** Option name (lower case) to the values ticked. */
  options: Record<string, string[]>
  sort: CatalogSort
}

export const EMPTY_QUERY: CatalogQuery = { q: "", priceMin: null, priceMax: null, available: false, types: [], options: {}, sort: "featured" }

/** At most this many values in one group, and this many ticked, so an address cannot be made to do unbounded work. */
const MAX_VALUES = 40

type Params = URLSearchParams | Record<string, string | string[] | undefined>

function all(params: Params, key: string): string[] {
  if (params instanceof URLSearchParams) return params.getAll(key)
  const v = params[key]
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

function keys(params: Params): string[] {
  return params instanceof URLSearchParams ? [...new Set(params.keys())] : Object.keys(params)
}

function dollars(value: string | undefined): number | null {
  if (value === undefined) return null
  const clean = value.replace(/[$,\s]/g, "")
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(clean)) return null
  return Number(clean)
}

function word(value: string, max = 80): string {
  return value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, max)
}

/** The query string (or Next's searchParams object) as filters. Anything malformed is ignored. */
export function parseCatalogQuery(params: Params): CatalogQuery {
  const q = word(all(params, "q")[0] ?? "", 120)
  let priceMin = dollars(all(params, "price_min")[0])
  let priceMax = dollars(all(params, "price_max")[0])
  if (priceMin !== null && priceMax !== null && priceMin > priceMax) [priceMin, priceMax] = [priceMax, priceMin]
  const available = ["1", "true", "on"].includes((all(params, "available")[0] ?? "").toLowerCase())
  const types = [...new Set(all(params, "type").map((t) => word(t, 40).toLowerCase()).filter(Boolean))].slice(0, MAX_VALUES)
  const options: Record<string, string[]> = {}
  for (const key of keys(params)) {
    if (!key.startsWith("opt.")) continue
    const name = word(key.slice(4), 40).toLowerCase()
    if (!name) continue
    /* `opt.Colour` and `opt.colour` are one option. */
    const values = [...new Set([...(options[name] ?? []), ...all(params, key).map((v) => word(v, 80)).filter(Boolean)])].slice(0, MAX_VALUES)
    if (values.length) options[name] = values
    if (Object.keys(options).length >= 6) break
  }
  const sortRaw = all(params, "sort")[0] ?? ""
  const sort = (SORT_OPTIONS.some((o) => o.value === sortRaw) ? sortRaw : "featured") as CatalogSort
  return { q, priceMin, priceMax, available, types, options, sort }
}

/** Filters back to a query string, in a fixed order, without empty parts. No leading "?". */
export function serializeCatalogQuery(query: CatalogQuery): string {
  const out = new URLSearchParams()
  if (query.q) out.set("q", query.q)
  if (query.priceMin !== null) out.set("price_min", String(query.priceMin))
  if (query.priceMax !== null) out.set("price_max", String(query.priceMax))
  if (query.available) out.set("available", "1")
  for (const t of query.types) out.append("type", t)
  for (const name of Object.keys(query.options).sort()) for (const v of query.options[name]) out.append(`opt.${name}`, v)
  if (query.sort !== "featured") out.set("sort", query.sort)
  return out.toString()
}

/** Whether anything narrows the list. The sort and the words searched for do not count. */
export function hasFilters(query: CatalogQuery): boolean {
  return query.priceMin !== null || query.priceMax !== null || query.available || query.types.length > 0 || Object.keys(query.options).length > 0
}

/* ── Reading a card ───────────────────────────────────────────────────────── */

/** A card's price in cents, read back from the formatted price ("$48.00", "$9.00/month"). Free is 0. */
export function cardPriceCents(card: FilterableCard): number {
  const price = typeof card.settings.price === "string" ? card.settings.price : ""
  const m = price.match(/\$\s?([\d,]+(?:\.\d{1,2})?)/)
  if (!m) return 0
  return Math.round(Number(m[1].replace(/,/g, "")) * 100)
}

function cardKind(card: FilterableCard): string {
  return typeof card.settings.kind === "string" ? card.settings.kind.toLowerCase() : ""
}

/** A card's options as name to values: its declared options, or its variants' names under "Option". */
export function cardOptions(card: FilterableCard): { name: string; values: string[] }[] {
  const declared = Array.isArray(card.settings.options) ? (card.settings.options as unknown[]) : []
  const out: { name: string; values: string[] }[] = []
  for (const o of declared) {
    const r = o as { name?: unknown; values?: unknown }
    if (typeof r?.name !== "string" || !Array.isArray(r.values)) continue
    const values = r.values.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    if (values.length) out.push({ name: r.name.trim(), values })
  }
  return out
}

function available(card: FilterableCard): boolean {
  return card.settings.available !== false
}

/** What a product kind is called in the filter. */
export function kindLabel(kind: string): string {
  const named: Record<string, string> = {
    digital: "Digital download",
    physical: "Physical product",
    course: "Course",
    membership: "Membership",
    community: "Community",
    coaching: "Coaching",
    bundle: "Bundle",
    service: "Service",
    event: "Event",
    ebook: "Ebook",
  }
  if (named[kind]) return named[kind]
  const spaced = kind.replace(/[_-]+/g, " ").trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : "Other"
}

/** Does this product answer the words searched for? Its title, category and option values. */
function matchesWords(card: FilterableCard, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = [
    card.settings.title,
    card.settings.category,
    ...cardOptions(card).flatMap((o) => o.values),
  ]
    .filter((x): x is string => typeof x === "string")
    .join(" ")
    .toLowerCase()
  return words.every((w) => hay.includes(w))
}

/** Whether a card passes every filter, leaving out the one named by `skip` (for that group's own counts). */
function passes(card: FilterableCard, query: CatalogQuery, skip?: string): boolean {
  if (skip !== "price") {
    const cents = cardPriceCents(card)
    if (query.priceMin !== null && cents < Math.round(query.priceMin * 100)) return false
    if (query.priceMax !== null && cents > Math.round(query.priceMax * 100)) return false
  }
  if (skip !== "available" && query.available && !available(card)) return false
  if (skip !== "type" && query.types.length && !query.types.includes(cardKind(card))) return false
  for (const [name, wanted] of Object.entries(query.options)) {
    if (skip === `opt.${name}`) continue
    const option = cardOptions(card).find((o) => o.name.toLowerCase() === name)
    const have = new Set((option?.values ?? []).map((v) => v.toLowerCase()))
    if (!wanted.some((v) => have.has(v.toLowerCase()))) return false
  }
  return true
}

/**
 * The products that pass, in the order asked for. `matchWords` is false when
 * the page has already matched the words itself (the search page does, with
 * the description included), so they are not matched twice.
 */
export function applyCatalogQuery<T extends FilterableCard>(cards: readonly T[], query: CatalogQuery, opts: { matchWords?: boolean } = {}): T[] {
  const kept = cards.filter((c) => (opts.matchWords === false || matchesWords(c, query.q)) && passes(c, query))
  const title = (c: T) => (typeof c.settings.title === "string" ? c.settings.title : "")
  const indexed = kept.map((c, i) => ({ c, i }))
  const by: Record<CatalogSort, (a: { c: T; i: number }, b: { c: T; i: number }) => number> = {
    featured: (a, b) => a.i - b.i,
    /* Cards arrive newest first, so newest is the order they came in. */
    newest: (a, b) => a.i - b.i,
    "price-asc": (a, b) => cardPriceCents(a.c) - cardPriceCents(b.c) || a.i - b.i,
    "price-desc": (a, b) => cardPriceCents(b.c) - cardPriceCents(a.c) || a.i - b.i,
    "title-asc": (a, b) => title(a.c).localeCompare(title(b.c)) || a.i - b.i,
    "title-desc": (a, b) => title(b.c).localeCompare(title(a.c)) || a.i - b.i,
  }
  return indexed.sort(by[query.sort]).map((x) => x.c)
}

/* ── What the filter form draws ───────────────────────────────────────────── */

export interface FilterValue {
  label: string
  value: string
  count: number
  checked: boolean
  /** A colour for a colour option's value, or "". */
  swatch: string
  /** Nothing would be left with it ticked, and it is not ticked: shown, and not offered. */
  disabled?: boolean
}

export interface FilterGroup {
  /** "Availability", "Product type", "Size". */
  label: string
  /** The query parameter its checkboxes use: "available", "type", "opt.size". */
  param: string
  values: FilterValue[]
  /** How many of its values are ticked. */
  active: number
}

export interface CatalogFilters {
  /** Whether any filter is set. */
  active: boolean
  /** How many filters are set, for the phone's "Filter (2)". */
  active_count: number
  /** Products that pass. */
  count: number
  /** Products before filtering. */
  total: number
  /** "1 product", "12 products". */
  count_label: string
  q: string
  sort: CatalogSort
  sort_options: { value: string; label: string; selected: boolean }[]
  price: { min: string; max: string; from: string; to: string; show: boolean }
  groups: FilterGroup[]
  /** The page's own address, where the form goes. */
  path: string
  /** The same page with every filter cleared, the words and the sort kept. */
  clear_url: string
  /** The values ticked, each with the address that unticks it, for the chips above the grid. */
  chips: { label: string; url: string }[]
}

/**
 * Everything the filter form needs, for the products before filtering and
 * the query the visitor sent. `path` is the page's own address, "/products"
 * or "/search", for the clear links.
 */
export function catalogFilters(
  cards: readonly FilterableCard[],
  query: CatalogQuery,
  path: string,
  swatchOf: (value: string) => string | null = () => null,
  isColor: (name: string) => boolean = () => false,
  opts: { matchWords?: boolean } = {},
): CatalogFilters {
  const pool = opts.matchWords === false ? [...cards] : cards.filter((c) => matchesWords(c, query.q))
  const count = applyCatalogQuery(pool, query, { matchWords: false }).length
  const groups: FilterGroup[] = []

  /* Availability, only when something is out of stock: otherwise ticking it changes nothing. */
  if (pool.some((c) => !available(c)) && pool.some(available)) {
    const n = pool.filter((c) => available(c) && passes(c, query, "available")).length
    groups.push({ label: "Availability", param: "available", active: query.available ? 1 : 0, values: [{ label: "In stock", value: "1", count: n, checked: query.available, swatch: "" }] })
  }

  /* Product type, when the shop sells more than one kind. */
  const kinds = [...new Set(pool.map(cardKind).filter(Boolean))]
  if (kinds.length > 1) {
    groups.push({
      label: "Product type",
      param: "type",
      active: query.types.length,
      values: kinds.slice(0, MAX_VALUES).map((k) => ({
        label: kindLabel(k),
        value: k,
        count: pool.filter((c) => cardKind(c) === k && passes(c, query, "type")).length,
        checked: query.types.includes(k),
        swatch: "",
      })),
    })
  }

  /* Each named option (Size, Colour), with every value some product has. */
  const names = new Map<string, string>()
  for (const c of pool) for (const o of cardOptions(c)) if (!names.has(o.name.toLowerCase())) names.set(o.name.toLowerCase(), o.name)
  for (const [key, label] of names) {
    const param = `opt.${key}`
    const values = new Map<string, string>()
    for (const c of pool) for (const v of cardOptions(c).find((o) => o.name.toLowerCase() === key)?.values ?? []) if (!values.has(v.toLowerCase())) values.set(v.toLowerCase(), v)
    if (values.size < 2) continue
    const ticked = (query.options[key] ?? []).map((v) => v.toLowerCase())
    groups.push({
      label,
      param,
      active: ticked.length,
      values: [...values.values()].slice(0, MAX_VALUES).map((v) => ({
        label: v,
        value: v,
        count: pool.filter((c) => (cardOptions(c).find((o) => o.name.toLowerCase() === key)?.values ?? []).some((x) => x.toLowerCase() === v.toLowerCase()) && passes(c, query, param)).length,
        checked: ticked.includes(v.toLowerCase()),
        swatch: isColor(label) ? swatchOf(v) ?? "" : "",
      })),
    })
  }

  for (const g of groups) for (const v of g.values) v.disabled = v.count === 0 && !v.checked

  const prices = pool.map(cardPriceCents)
  const lo = prices.length ? Math.floor(Math.min(...prices) / 100) : 0
  const hi = prices.length ? Math.ceil(Math.max(...prices) / 100) : 0
  const base = { ...EMPTY_QUERY, q: query.q, sort: query.sort }
  const href = (q: CatalogQuery) => {
    const s = serializeCatalogQuery(q)
    return s ? `${path}?${s}` : path
  }

  const chips: { label: string; url: string }[] = []
  if (query.priceMin !== null || query.priceMax !== null) {
    const label = query.priceMin !== null && query.priceMax !== null ? `$${query.priceMin} to $${query.priceMax}` : query.priceMin !== null ? `From $${query.priceMin}` : `Up to $${query.priceMax}`
    chips.push({ label, url: href({ ...query, priceMin: null, priceMax: null }) })
  }
  if (query.available) chips.push({ label: "In stock", url: href({ ...query, available: false }) })
  for (const t of query.types) chips.push({ label: kindLabel(t), url: href({ ...query, types: query.types.filter((x) => x !== t) }) })
  for (const [name, vals] of Object.entries(query.options)) {
    for (const v of vals) {
      const rest = vals.filter((x) => x !== v)
      const options = { ...query.options }
      if (rest.length) options[name] = rest
      else delete options[name]
      chips.push({ label: v, url: href({ ...query, options }) })
    }
  }

  const activeCount = (query.priceMin !== null || query.priceMax !== null ? 1 : 0) + (query.available ? 1 : 0) + query.types.length + Object.values(query.options).reduce((n, v) => n + v.length, 0)
  return {
    active: hasFilters(query),
    active_count: activeCount,
    count,
    total: cards.length,
    count_label: `${count} ${count === 1 ? "product" : "products"}`,
    q: query.q,
    sort: query.sort,
    sort_options: SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label, selected: o.value === query.sort })),
    price: {
      min: String(lo),
      max: String(hi),
      from: query.priceMin !== null ? String(query.priceMin) : "",
      to: query.priceMax !== null ? String(query.priceMax) : "",
      /* A range only means something when prices differ. */
      show: hi > lo,
    },
    groups,
    path,
    clear_url: href(base),
    chips,
  }
}

/**
 * A shop or search page in one call: the filters from its address, the
 * products that pass them in the order asked for, and what the filter form
 * draws. `matchWords: false` when the page has matched the words itself.
 */
export function catalogPage<T extends FilterableCard>(
  cards: readonly T[],
  params: Params,
  path: string,
  opts: { matchWords?: boolean; perPage?: number } = {},
): { query: CatalogQuery; listed: T[]; filters: CatalogFilters; pagination: CatalogPagination } {
  const query = parseCatalogQuery(params)
  const all = applyCatalogQuery(cards, query, opts)
  const pagination = paginate(all.length, params, path, query, opts.perPage)
  return {
    query,
    listed: all.slice((pagination.page - 1) * pagination.per_page, pagination.page * pagination.per_page),
    filters: catalogFilters(cards, query, path, swatchColor, isColorOption, opts),
    pagination,
  }
}

/**
 * ===========================================================================
 *  PAGES OF A LONG SHOP
 * ===========================================================================
 * The shop and a collection used to stop at the first 24 products. Now the
 * products that pass the filters are cut into pages of `per_page`, from
 * `?page=` (a page past the end is the last one), and the template reads
 * `page.pagination`: `page`, `pages`, `total`, and `prev_url` / `next_url`,
 * which keep every filter and the sort, or "" at either end. `pages` is 1
 * for a shop that fits on one page, so `{% if page.pagination.pages > 1 %}`
 * draws nothing for it.
 */
export const CATALOG_PER_PAGE = 24

export interface CatalogPagination {
  page: number
  pages: number
  per_page: number
  total: number
  prev_url: string
  next_url: string
  /** Each page's number and address, for a numbered row; `current` on this one. */
  links: { number: number; url: string; current: boolean }[]
}

function paginate(total: number, params: Params, path: string, query: CatalogQuery, perPage = CATALOG_PER_PAGE): CatalogPagination {
  const per = Math.max(1, Math.min(96, Math.floor(perPage) || CATALOG_PER_PAGE))
  const pages = Math.max(1, Math.ceil(total / per))
  const asked = Number.parseInt(all(params, "page")[0] ?? "1", 10)
  const page = Math.min(pages, Math.max(1, Number.isFinite(asked) ? asked : 1))
  const base = serializeCatalogQuery(query)
  const at = (n: number) => {
    const qs = new URLSearchParams(base)
    if (n > 1) qs.set("page", String(n))
    const str = qs.toString()
    return str ? `${path}?${str}` : path
  }
  return {
    page,
    pages,
    per_page: per,
    total,
    prev_url: page > 1 ? at(page - 1) : "",
    next_url: page < pages ? at(page + 1) : "",
    links: Array.from({ length: Math.min(pages, 20) }, (_, i) => ({ number: i + 1, url: at(i + 1), current: i + 1 === page })),
  }
}
