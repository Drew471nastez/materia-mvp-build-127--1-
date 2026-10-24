/**
 * ===========================================================================
 *  A COLLECTION'S AND A SEARCH'S FILTERS, FROM THE CREATOR'S OWN PRODUCTS
 * ===========================================================================
 * What Shopify calls storefront filtering: the theme draws `collection.
 * filters` (and `search.filters`) as checkboxes and a price range, and asks
 * for the page again with `filter.v.availability=1`, `filter.v.price.gte=10`,
 * `filter.v.option.size=Large`, `filter.p.product_type=Shirts`. Here they
 * are made from the products themselves, each value with how many products
 * it would leave, and applied to the list the page draws.
 *
 *   Availability     in stock, out of stock
 *   Price            from the cheapest to the dearest, in cents
 *   one per option   Size, Colour… as the products' options name them
 *   Product type     the category the creator filed each product under
 *   Vendor, Tags     the brand and the tags from Products (round 12)
 *
 * Values of one filter are OR'd; filters are AND'd, as Shopify does.
 */
import { handleize } from "./filters"
import type { CardLike } from "./objects"
import { cardPrices } from "@/lib/products/catalog-filters"

type O = Record<string, unknown>

/*
  Prices are each option's own in the store's minor units, as the card
  carries them (round 12, lib/products/catalog-filters.ts cardPrices). Read
  back from the printed price, "1.234,56 €" was 1.23 with every non-digit but
  the point thrown away: a price range in euros kept and dropped the wrong
  products.
*/
const vendorOf = (p: CardLike) => String(p.settings.vendor ?? "").trim()
const tagsOf = (p: CardLike) => (Array.isArray(p.settings.tags) ? (p.settings.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : [])
const optionsOf = (p: CardLike) => (Array.isArray(p.settings.options) ? (p.settings.options as { name: string; values: string[] }[]) : [])
const typeOf = (p: CardLike) => String(p.settings.category ?? "").trim()

interface Facet {
  label: string
  param: string
  values: { label: string; value: string; test: (p: CardLike) => boolean }[]
}

function facetsFor(products: CardLike[]): Facet[] {
  const out: Facet[] = [
    {
      label: "Availability",
      param: "filter.v.availability",
      values: [
        { label: "In stock", value: "1", test: (p) => p.settings.available !== false },
        { label: "Out of stock", value: "0", test: (p) => p.settings.available === false },
      ],
    },
  ]
  const options = new Map<string, Set<string>>()
  for (const p of products) for (const o of optionsOf(p)) {
    const set = options.get(o.name) ?? new Set<string>()
    for (const v of o.values ?? []) set.add(v)
    options.set(o.name, set)
  }
  for (const [name, values] of options) {
    out.push({
      label: name,
      param: `filter.v.option.${handleize(name)}`,
      values: [...values].map((v) => ({ label: v, value: v, test: (p) => optionsOf(p).some((o) => o.name === name && (o.values ?? []).includes(v)) })),
    })
  }
  const types = [...new Set(products.map(typeOf).filter(Boolean))].sort()
  if (types.length) out.push({ label: "Product type", param: "filter.p.product_type", values: types.map((t) => ({ label: t, value: t, test: (p) => typeOf(p) === t })) })
  const vendors = [...new Set(products.map(vendorOf).filter(Boolean))].sort()
  if (vendors.length) out.push({ label: "Vendor", param: "filter.p.vendor", values: vendors.map((v) => ({ label: v, value: v, test: (p) => vendorOf(p) === v })) })
  const tags = [...new Set(products.flatMap(tagsOf))].sort()
  if (tags.length) out.push({ label: "Tags", param: "filter.p.tag", values: tags.map((t) => ({ label: t, value: t, test: (p) => tagsOf(p).includes(t) })) })
  return out
}

/** The address with a parameter's value added or taken away, the page left out so the list starts again. */
function urlWith(base: string, query: URLSearchParams, change: (q: URLSearchParams) => void): string {
  const q = new URLSearchParams(query)
  q.delete("page")
  q.delete("section_id")
  q.delete("sections")
  change(q)
  const s = q.toString()
  return s ? `${base}?${s}` : base
}

export interface Faceted {
  /** `collection.filters`, in Shopify's shape. */
  filters: O[]
  /** The products the filters leave. */
  products: CardLike[]
}

export function facet(products: CardLike[], query: URLSearchParams, base: string): Faceted {
  const facets = facetsFor(products)
  const chosen = (param: string) => query.getAll(param).filter(Boolean)
  const gte = Number(query.get("filter.v.price.gte"))
  const lte = Number(query.get("filter.v.price.lte"))
  /* By the price of each option it sells, as Shopify's variant price filter: a shirt from 49 whose L is 54 is in 50 to 80 (round 12). */
  const priceTest = (p: CardLike) => cardPrices(p as never).some((c) => (!Number.isFinite(gte) || !query.get("filter.v.price.gte") || c >= gte * 100) && (!Number.isFinite(lte) || !query.get("filter.v.price.lte") || c <= lte * 100))
  /* A product passes a filter when it matches any value chosen in it, or none is chosen. */
  const passes = (p: CardLike, except?: string) =>
    facets.every((f) => f.param === except || !chosen(f.param).length || f.values.some((v) => chosen(f.param).includes(v.value) && v.test(p))) && (except === "price" || priceTest(p))
  const kept = products.filter((p) => passes(p))

  const filters: O[] = facets.map((f) => {
    const active = chosen(f.param)
    /* The count beside a value is what choosing it would leave, the other filters as they are. */
    const pool = products.filter((p) => passes(p, f.param))
    const values = f.values.map((v) => {
      const on = active.includes(v.value)
      return {
        label: v.label,
        value: v.value,
        param_name: f.param,
        count: pool.filter(v.test).length,
        active: on,
        url_to_add: urlWith(base, query, (q) => q.append(f.param, v.value)),
        url_to_remove: urlWith(base, query, (q) => { const rest = q.getAll(f.param).filter((x) => x !== v.value); q.delete(f.param); rest.forEach((x) => q.append(f.param, x)) }),
        swatch: null,
        image: null,
      }
    })
    return {
      label: f.label,
      param_name: f.param,
      type: "list",
      presentation: "text",
      operator: "OR",
      values,
      active_values: values.filter((v) => v.active),
      inactive_values: values.filter((v) => !v.active),
      false_value: null,
      true_value: null,
      url_to_remove: urlWith(base, query, (q) => q.delete(f.param)),
    }
  })

  const prices = products.flatMap((p) => cardPrices(p as never))
  const max = prices.length ? Math.max(...prices) : 0
  filters.splice(1, 0, {
    label: "Price",
    param_name: "filter.v.price",
    type: "price_range",
    presentation: "text",
    range_max: max,
    min_value: { param_name: "filter.v.price.gte", value: query.get("filter.v.price.gte") ? Math.round(gte * 100) : null },
    max_value: { param_name: "filter.v.price.lte", value: query.get("filter.v.price.lte") ? Math.round(lte * 100) : null },
    active_values: [],
    inactive_values: [],
    values: [],
    url_to_remove: urlWith(base, query, (q) => { q.delete("filter.v.price.gte"); q.delete("filter.v.price.lte") }),
  })
  return { filters, products: kept }
}
