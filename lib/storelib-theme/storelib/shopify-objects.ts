/**
 * ===========================================================================
 *  A STORELIB PRODUCT, READ BY SHOPIFY'S NAMES
 * ===========================================================================
 * A section reads a product the way Storelib hands it: block-shaped,
 * `product.settings.title`, or as a picker's value, `product.title`. A theme
 * written for Shopify reads the same product by Shopify's names:
 * `product.featured_media`, `product.variants`, `product.handle`,
 * `product.selected_or_first_available_variant.id`, `collection.products`.
 *
 * Both work. When a template asks a product or a collection for a name it
 * does not have, the engine asks this file (template.ts, lookup), which
 * answers from the same fields: nothing is fetched, nothing is made up that
 * the product does not hold. A field Storelib has no equivalent for reads
 * as what Shopify gives for an empty one: no tags, no vendor, no metafields.
 *
 * Pictures are `Linked` values: printed, a picture is its address (which is
 * what `| image_url` gave on Shopify, and the converter removes that filter);
 * read, it has `src`, `alt`, `width`, `height`, `aspect_ratio` and
 * `preview_image`.
 */
import { Linked } from "../values"

type Rec = Record<string, unknown>

const views = new WeakMap<object, Rec | null>()

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)
const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "")

/** A price as a number to compare by: "$48.00" is 48, 4800 stays 4800. */
export function priceNumber(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v !== "string") return Number.NaN
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : Number.NaN
}

/** What a value is, and its plain fields, however it was handed. */
function fieldsOf(v: object): { kind: "product" | "collection"; f: Rec } | null {
  if (v instanceof Linked) {
    const f = v.fields as Rec
    if (Array.isArray(f.products)) return { kind: "collection", f }
    if ("price" in f || "images" in f || "checkout_url" in f || "variants" in f) return { kind: "product", f }
    return null
  }
  const o = v as Rec
  if ((o.type === "product" || o.type === "collection") && o.settings && typeof o.settings === "object" && !Array.isArray(o.settings)) {
    const s = o.settings as Rec
    return { kind: o.type, f: { ...s, id: s.id ?? o.id } }
  }
  if (typeof o.title === "string" && Array.isArray(o.products) && "handle" in o) return { kind: "collection", f: o }
  if (typeof o.title === "string" && ("price" in o || "checkout_url" in o) && !("settings" in o)) return { kind: "product", f: o }
  return null
}

function picture(src: string, alt: string, i: number): Linked {
  const fields = { src, alt, width: 1200, height: 1200, aspect_ratio: 1, id: `media-${i + 1}`, media_type: "image", position: i + 1, presentation: { focal_point: "50.0% 50.0%" } }
  return new Linked(src, { ...fields, preview_image: new Linked(src, fields) })
}

function productView(f: Rec): Rec {
  const title = text(f.title)
  const url = text(f.url)
  const sources = (Array.isArray(f.images) && f.images.length ? f.images : f.image ? [f.image] : []).filter((x): x is string => typeof x === "string" && x !== "")
  const media = sources.map((src, i) => picture(src, title, i))
  const featured = media[0] ?? null
  const available = f.available !== false
  const raw = Array.isArray(f.variants) ? (f.variants as Rec[]).filter((x) => x && typeof x === "object") : []
  const variant = (v: Rec, i: number): Rec => {
    const name = text(v.name ?? v.title) || "Default Title"
    return {
      id: text(v.id) || `${text(f.id)}-${i}`,
      title: name,
      name,
      price: v.price ?? f.price ?? "",
      compare_at_price: v.compare_price || v.compare_at_price || null,
      available: v.available !== false && available,
      url: url ? `${url}?variant=${encodeURIComponent(text(v.id))}` : "",
      featured_image: featured,
      featured_media: featured,
      image: featured,
      option1: name,
      option2: null,
      option3: null,
      options: [name],
      sku: "",
      barcode: "",
      requires_shipping: f.kind === "physical",
      taxable: true,
      inventory_management: null,
      inventory_quantity: null,
      quantity_rule: { min: 1, max: null, increment: 1 },
      selling_plan_allocations: [],
      checkout_url: v.checkout_url ?? "",
      metafields: {},
    }
  }
  const variants = raw.length ? raw.map(variant) : [variant({ id: f.id, name: "Default Title", price: f.price, compare_price: f.compare_price, available, checkout_url: f.checkout_url }, 0)]
  const first = variants.find((v) => v.available) ?? variants[0]
  const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(priceNumber(p)))
  const byPrice = [...prices].sort((a, b) => priceNumber(a) - priceNumber(b))
  const optionList = Array.isArray(f.options) ? (f.options as { name?: unknown; values?: unknown }[]).filter((o) => o && typeof o.name === "string") : []
  const optionsWithValues = optionList.length
    ? optionList.map((o, i) => ({ name: o.name, position: i + 1, values: Array.isArray(o.values) ? o.values : [], selected_value: Array.isArray(o.values) ? o.values[0] ?? null : null }))
    : raw.length
      ? [{ name: "Option", position: 1, values: variants.map((v) => v.title), selected_value: first.title }]
      : []
  return {
    id: f.id ?? "",
    title,
    handle: text(f.slug) || url.split("/").pop() || "",
    url,
    description: f.description_html ?? f.description ?? "",
    content: f.description_html ?? f.description ?? "",
    price: f.price ?? "",
    price_min: byPrice[0] ?? f.price ?? "",
    price_max: byPrice[byPrice.length - 1] ?? f.price ?? "",
    price_varies: new Set(prices.map(String)).size > 1,
    compare_at_price: f.compare_price || null,
    compare_at_price_min: f.compare_price || null,
    compare_at_price_max: f.compare_price || null,
    compare_at_price_varies: false,
    available,
    featured_image: featured,
    featured_media: featured,
    images: media,
    media,
    vendor: "",
    type: text(f.category),
    tags: [],
    options: optionsWithValues.map((o) => o.name),
    options_with_values: optionsWithValues,
    options_by_name: Object.fromEntries(optionsWithValues.map((o) => [String(o.name).toLowerCase(), o])),
    variants,
    variants_count: variants.length,
    selected_variant: null,
    selected_or_first_available_variant: first,
    first_available_variant: first,
    has_only_default_variant: raw.length === 0,
    requires_selling_plan: false,
    selling_plan_groups: [],
    "quantity_price_breaks_configured?": false,
    "gift_card?": false,
    template_suffix: "",
    collections: [],
    metafields: {},
    checkout_url: f.checkout_url ?? "",
  }
}

function collectionView(f: Rec): Rec {
  const image = typeof f.image === "string" && f.image ? picture(f.image, text(f.title), 0) : null
  const products = Array.isArray(f.products) ? f.products : []
  return {
    id: f.id ?? "",
    title: text(f.title),
    handle: text(f.handle),
    url: text(f.url),
    description: text(f.description),
    image,
    featured_image: image,
    products,
    products_count: typeof f.products_count === "number" ? f.products_count : products.length,
    all_products_count: typeof f.products_count === "number" ? f.products_count : products.length,
    filters: [],
    sort_options: [],
    sort_by: "",
    default_sort_by: "manual",
    template_suffix: "",
    metafields: {},
  }
}

/**
 * A Shopify name on a Storelib product or collection, or undefined when the
 * value is neither or the name means nothing on it. Built once per value.
 */
export function shopifyField(v: unknown, key: string): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined
  let view = views.get(v)
  if (view === undefined) {
    const found = fieldsOf(v)
    view = found ? (found.kind === "product" ? productView(found.f) : collectionView(found.f)) : null
    views.set(v, view)
  }
  return view && own(view, key) ? view[key] : undefined
}
