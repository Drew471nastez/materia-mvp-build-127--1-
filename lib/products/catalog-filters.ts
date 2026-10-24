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
 *     &category=Shirts&vendor=Acme&tag=linen   (round 12)
 *
 * The page reads it with parseCatalogQuery, lists the products that pass
 * applyCatalogQuery, and hands the section `page.filters` from
 * catalogFilters: every group with its values, how many products each
 * value has, which are ticked, and the address that clears them. A group
 * that would not narrow anything (one value, or every product has it) is
 * left out, so a shop of three downloads is not shown a wall of checkboxes.
 *
 * Products arrive as the cards every section reads (lib/website-builder/
 * shop-products.ts). Their price is formatted for people; the range and the
 * sort read `price_cents`, the asking price in the store's currency (round
 * 12: "$" was the only price this could read back, so a shop in euros had
 * every product at 0 and a price range that kept or dropped everything).
 *
 * ROUND 12, "make sure filters pull data from Storelib very accurately":
 * a product with options is filtered BY ITS OPTIONS, as Shopify filters
 * variants. "In stock" with "Size M" keeps a shirt only when its M is in
 * stock, not when any size is; a price range keeps it when one of its
 * options it would sell costs that much. Category, brand (vendor) and tags
 * are filters too, from Products, each value counted the way the others are:
 * what ticking it would leave, every other filter as it is.
 */

import { isColorOption, swatchColor } from "./product-page-model"
import { shopAmountIn, SHOP_CURRENCY } from "@/lib/store/shop-money"
import { uiWord, type UiWord } from "@/lib/markets/ui-words"

/** The shop's own words in the page's language (lib/markets/ui-words.ts, the localizer's `words`); absent, English. */
type Words = Partial<Record<string, string>> | undefined

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
    price_cents?: unknown
    tags?: unknown
    vendor?: unknown
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
  /** Round 12: categories, brands (vendor) and tags ticked, as written in Products. */
  categories: string[]
  vendors: string[]
  tags: string[]
}

export const EMPTY_QUERY: CatalogQuery = { q: "", priceMin: null, priceMax: null, available: false, types: [], options: {}, sort: "featured", categories: [], vendors: [], tags: [] }

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
  const listOf = (key: string) => [...new Set(all(params, key).map((v) => word(v, 80)).filter(Boolean))].slice(0, MAX_VALUES)
  return { q, priceMin, priceMax, available, types, options, sort, categories: listOf("category"), vendors: listOf("vendor"), tags: listOf("tag") }
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
  for (const v of query.categories ?? []) out.append("category", v)
  for (const v of query.vendors ?? []) out.append("vendor", v)
  for (const v of query.tags ?? []) out.append("tag", v)
  if (query.sort !== "featured") out.set("sort", query.sort)
  return out.toString()
}

/** Whether anything narrows the list. The sort and the words searched for do not count. */
export function hasFilters(query: CatalogQuery): boolean {
  return query.priceMin !== null || query.priceMax !== null || query.available || query.types.length > 0 || Object.keys(query.options).length > 0 || (query.categories ?? []).length > 0 || (query.vendors ?? []).length > 0 || (query.tags ?? []).length > 0
}

/* ── Reading a card ───────────────────────────────────────────────────────── */

/**
 * An amount read back from a price as people read it, in minor units: "$48.00",
 * "€0.89", "48,00 €", "1.234,56 kr", "¥1,200", "$9.00/month". The last "."
 * or "," with one or two digits after it is the decimal point; every other
 * one groups thousands. Nothing to read is 0.
 */
export function moneyCents(price: unknown): number {
  const text = typeof price === "string" ? price : ""
  const m = text.match(/\d[\d.,\s\u00a0\u202f']*/)
  if (!m) return 0
  const raw = m[0].replace(/[\s\u00a0\u202f']/g, "").replace(/[.,]+$/, "")
  const last = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","))
  const decimals = last >= 0 && /^\d{1,2}$/.test(raw.slice(last + 1))
  const whole = (decimals ? raw.slice(0, last) : raw).replace(/[.,]/g, "")
  const frac = decimals ? raw.slice(last + 1).padEnd(2, "0") : "00"
  const n = Number(`${whole || "0"}.${frac}`)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** A card's asking price in minor units: what the card carries (round 12), else read back from its formatted price. Free is 0. */
export function cardPriceCents(card: FilterableCard): number {
  const cents = card.settings.price_cents
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.max(0, Math.round(cents))
  return moneyCents(card.settings.price)
}

interface VariantFacts {
  available: boolean
  cents: number
  options: (string | null)[] | null
}

/** A card's options it sells, each with its price, stock and option values; empty for a product with none. */
function cardVariants(card: FilterableCard): VariantFacts[] {
  const list = Array.isArray(card.settings.variants) ? (card.settings.variants as unknown[]) : []
  const out: VariantFacts[] = []
  for (const v of list) {
    const r = v as { available?: unknown; price_cents?: unknown; price?: unknown; options?: unknown }
    if (!r || typeof r !== "object") continue
    out.push({
      available: r.available !== false,
      cents: typeof r.price_cents === "number" && Number.isFinite(r.price_cents) ? Math.max(0, Math.round(r.price_cents)) : r.price !== undefined ? moneyCents(r.price) : cardPriceCents(card),
      options: Array.isArray(r.options) ? (r.options as unknown[]).map((x) => (typeof x === "string" && x.trim() ? x.trim() : null)) : null,
    })
  }
  return out
}

/** Every price a card could sell at: its options' own, or its own. */
export function cardPrices(card: FilterableCard): number[] {
  const vs = cardVariants(card)
  return vs.length ? vs.map((v) => v.cents) : [cardPriceCents(card)]
}

/** A card's category, brand and tags, as Products holds them. */
function cardCategory(card: FilterableCard): string {
  return typeof card.settings.category === "string" ? card.settings.category.trim() : ""
}
function cardVendor(card: FilterableCard): string {
  return typeof card.settings.vendor === "string" ? card.settings.vendor.trim() : ""
}
function cardTags(card: FilterableCard): string[] {
  return Array.isArray(card.settings.tags) ? (card.settings.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : []
}
const lower = (list: readonly string[]) => list.map((v) => v.toLowerCase())

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
export function kindLabel(kind: string, words?: Words): string {
  /* In the page's language when the shop translated it (Translate › Shop words, ui:kind_<kind>). */
  const word = `kind_${kind}` as UiWord
  if (words && words[word]) return uiWord(words, word)
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
  if (skip !== "type" && query.types.length && !query.types.includes(cardKind(card))) return false
  if (skip !== "category" && (query.categories ?? []).length && !lower(query.categories).includes(cardCategory(card).toLowerCase())) return false
  if (skip !== "vendor" && (query.vendors ?? []).length && !lower(query.vendors).includes(cardVendor(card).toLowerCase())) return false
  if (skip !== "tag" && (query.tags ?? []).length) {
    const have = lower(cardTags(card))
    if (!lower(query.tags).some((t) => have.includes(t))) return false
  }
  const minCents = skip !== "price" && query.priceMin !== null ? Math.round(query.priceMin * 100) : null
  const maxCents = skip !== "price" && query.priceMax !== null ? Math.round(query.priceMax * 100) : null
  const inStock = skip !== "available" && query.available
  const wanted = Object.entries(query.options).filter(([name]) => skip !== `opt.${name}`)
  const declared = cardOptions(card)
  const variants = cardVariants(card)
  const priceOk = (cents: number) => (minCents === null || cents >= minCents) && (maxCents === null || cents <= maxCents)
  /*
    BY ITS OPTIONS, when it has options that say their values: one of them
    must pass the price, the stock and every option ticked at once, so "In
    stock" and "M" keep a shirt only when its M is in stock.
  */
  if (variants.length && variants.some((v) => v.options !== null)) {
    if (inStock && !available(card)) return false
    return variants.some((v) => {
      if (!priceOk(v.cents)) return false
      if (inStock && !v.available) return false
      for (const [name, values] of wanted) {
        const at = declared.findIndex((o) => o.name.toLowerCase() === name)
        const value = at >= 0 ? v.options?.[at] ?? null : null
        if (!value || !lower(values).includes(value.toLowerCase())) return false
      }
      return true
    })
  }
  /* A product without options to read: by the product itself. Its price is any one it sells at. */
  if ((minCents !== null || maxCents !== null) && !cardPrices(card).some(priceOk)) return false
  if (inStock && !available(card)) return false
  for (const [name, values] of wanted) {
    const option = declared.find((o) => o.name.toLowerCase() === name)
    const have = new Set((option?.values ?? []).map((v) => v.toLowerCase()))
    if (!values.some((v) => have.has(v.toLowerCase()))) return false
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
  opts: { matchWords?: boolean; words?: Words } = {},
): CatalogFilters {
  const w = (word: UiWord) => uiWord(opts.words, word)
  const pool = opts.matchWords === false ? [...cards] : cards.filter((c) => matchesWords(c, query.q))
  const count = applyCatalogQuery(pool, query, { matchWords: false }).length
  const groups: FilterGroup[] = []

  /* Availability, only when something is out of stock: otherwise ticking it changes nothing. */
  if (pool.some((c) => !available(c)) && pool.some(available)) {
    /* What ticking it leaves: an option ticked too must be the one in stock (round 12). */
    const n = pool.filter((c) => passes(c, { ...query, available: true })).length
    groups.push({ label: w("availability"), param: "available", active: query.available ? 1 : 0, values: [{ label: w("in_stock"), value: "1", count: n, checked: query.available, swatch: "" }] })
  }

  /* Product type, when the shop sells more than one kind. */
  const kinds = [...new Set(pool.map(cardKind).filter(Boolean))]
  if (kinds.length > 1) {
    groups.push({
      label: w("product_type"),
      param: "type",
      active: query.types.length,
      values: kinds.slice(0, MAX_VALUES).map((k) => ({
        label: kindLabel(k, opts.words),
        value: k,
        count: pool.filter((c) => cardKind(c) === k && passes(c, query, "type")).length,
        checked: query.types.includes(k),
        swatch: "",
      })),
    })
  }

  /*
    Round 12: the category, the brand (vendor) and the tags, as Products
    holds them, when they would narrow the list (two values or more). Each
    value spelled as most products spell it, matched without regard to case.
  */
  const listGroup = (label: string, param: "category" | "vendor" | "tag", valuesOf: (c: FilterableCard) => string[], ticked: string[]) => {
    const values = new Map<string, string>()
    for (const c of pool) for (const v of valuesOf(c)) if (!values.has(v.toLowerCase())) values.set(v.toLowerCase(), v)
    if (values.size < 2) return
    const on = lower(ticked)
    groups.push({
      label,
      param,
      active: ticked.length,
      values: [...values.values()].sort((a, b) => a.localeCompare(b)).slice(0, MAX_VALUES).map((v) => ({
        label: v,
        value: v,
        count: pool.filter((c) => lower(valuesOf(c)).includes(v.toLowerCase()) && passes(c, query, param)).length,
        checked: on.includes(v.toLowerCase()),
        swatch: "",
      })),
    })
  }
  listGroup(w("category"), "category", (c) => (cardCategory(c) ? [cardCategory(c)] : []), query.categories ?? [])
  listGroup(w("brand"), "vendor", (c) => (cardVendor(c) ? [cardVendor(c)] : []), query.vendors ?? [])
  listGroup(w("tags"), "tag", cardTags, query.tags ?? [])

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
        /* What ticking this value alone in its group leaves, every other filter as it is: with "In stock", the products whose own v is in stock (round 12). */
        count: pool.filter((c) => passes(c, { ...query, options: { ...query.options, [key]: [v] } })).length,
        checked: ticked.includes(v.toLowerCase()),
        swatch: isColor(label) ? swatchOf(v) ?? "" : "",
      })),
    })
  }

  for (const g of groups) for (const v of g.values) v.disabled = v.count === 0 && !v.checked

  /* From the cheapest thing the shop sells to the dearest, its options' own prices included. */
  const prices = pool.flatMap(cardPrices)
  const lo = prices.length ? Math.floor(Math.min(...prices) / 100) : 0
  const hi = prices.length ? Math.ceil(Math.max(...prices) / 100) : 0
  const base = { ...EMPTY_QUERY, q: query.q, sort: query.sort }
  const href = (q: CatalogQuery) => {
    const s = serializeCatalogQuery(q)
    return s ? `${path}?${s}` : path
  }

  const chips: { label: string; url: string }[] = []
  if (query.priceMin !== null || query.priceMax !== null) {
    /* In the store's own currency, which every card carries (lib/website-builder/shop-products toCard). */
    const currency = (cards[0]?.settings as { currency?: string } | undefined)?.currency || SHOP_CURRENCY
    const shopAmount = (units: number) => shopAmountIn(units, currency)
    const label = query.priceMin !== null && query.priceMax !== null ? `${shopAmount(query.priceMin)} ${w("price_to")} ${shopAmount(query.priceMax)}` : query.priceMin !== null ? `${w("price_from")} ${shopAmount(query.priceMin)}` : `${w("price_up_to")} ${shopAmount(query.priceMax!)}`
    chips.push({ label, url: href({ ...query, priceMin: null, priceMax: null }) })
  }
  if (query.available) chips.push({ label: w("in_stock"), url: href({ ...query, available: false }) })
  for (const t of query.types) chips.push({ label: kindLabel(t, opts.words), url: href({ ...query, types: query.types.filter((x) => x !== t) }) })
  for (const v of query.categories ?? []) chips.push({ label: v, url: href({ ...query, categories: query.categories.filter((x) => x !== v) }) })
  for (const v of query.vendors ?? []) chips.push({ label: v, url: href({ ...query, vendors: query.vendors.filter((x) => x !== v) }) })
  for (const v of query.tags ?? []) chips.push({ label: v, url: href({ ...query, tags: query.tags.filter((x) => x !== v) }) })
  for (const [name, vals] of Object.entries(query.options)) {
    for (const v of vals) {
      const rest = vals.filter((x) => x !== v)
      const options = { ...query.options }
      if (rest.length) options[name] = rest
      else delete options[name]
      chips.push({ label: v, url: href({ ...query, options }) })
    }
  }

  const activeCount = (query.priceMin !== null || query.priceMax !== null ? 1 : 0) + (query.available ? 1 : 0) + query.types.length + Object.values(query.options).reduce((n, v) => n + v.length, 0) + (query.categories ?? []).length + (query.vendors ?? []).length + (query.tags ?? []).length
  return {
    active: hasFilters(query),
    active_count: activeCount,
    count,
    total: cards.length,
    count_label: `${count} ${count === 1 ? w("product") : w("products")}`,
    q: query.q,
    sort: query.sort,
    sort_options: SORT_OPTIONS.map((o) => ({ value: o.value, label: w(`sort_${o.value.replace("-", "_")}` as UiWord), selected: o.value === query.sort })),
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
  opts: { matchWords?: boolean; perPage?: number; words?: Words } = {},
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
