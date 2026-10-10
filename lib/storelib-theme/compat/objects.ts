/**
 * ===========================================================================
 *  SHOPIFY'S OBJECTS, MADE FROM STORELIB'S DATA
 * ===========================================================================
 * A theme imported from Shopify reads `product.price`, `collection.products`,
 * `cart.item_count`, `settings.type_header_font.family`,
 * `section.settings.color_scheme.settings.background` and a few hundred
 * more. Each is built here from what Storelib already holds: the creator's
 * products, collections, menus, the theme's settings, the visitor's cart.
 * Nothing here talks to Shopify; a value Storelib does not have (a vendor, a
 * metafield, a blog) is there and empty, so a theme's `{% if %}` around it
 * reads false instead of printing an error.
 *
 * Money is in cents, as Shopify themes expect (`{{ product.price | money }}`).
 */
import { OUTPUT, LFloat } from "./runtime"
import { handleize, parseColor, toHex } from "./filters"

type O = Record<string, unknown>

// ── Money ────────────────────────────────────────────────────────────────────

/** "$48.00" as 4800; "" and free as 0. */
export function priceCents(formatted: unknown): number {
  if (typeof formatted === "number") return Math.round(formatted)
  const s = String(formatted ?? "").replace(/[^0-9.,-]/g, "")
  if (!s) return 0
  const n = Number(s.replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

// ── Images and media ─────────────────────────────────────────────────────────

let imageSeq = 1
/** A picture, as Shopify's image object: prints as its address. */
export function imageObject(src: string, alt = "", extra: O = {}): O | null {
  if (!src) return null
  const width = typeof extra.width === "number" ? extra.width : 1600
  const height = typeof extra.height === "number" ? extra.height : 1600
  const img: O = {
    [OUTPUT]: src,
    id: extra.id ?? imageSeq++,
    src,
    url: src,
    alt,
    width,
    height,
    aspect_ratio: new LFloat(Math.round((width / height) * 1000) / 1000),
    media_type: "image",
    position: extra.position ?? 1,
    presentation: { focal_point: { x: 50, y: 50, [OUTPUT]: "50.0% 50.0%" } },
    attached_to_variant: false,
    variants: [],
  }
  img.preview_image = img
  return img
}

/** Every picture of a product, as `product.media`. */
function mediaList(images: string[], alt: string): O[] {
  return images.filter(Boolean).map((src, i) => imageObject(src, alt, { position: i + 1, id: 1000 + i }) as O)
}

// ── Products ─────────────────────────────────────────────────────────────────

/** A Storelib product card or product page, block-shaped (`{ id, settings }`). */
export interface CardLike {
  id: string
  settings: Record<string, unknown>
}

/** How the options of a variant read: "Small / Red" is Size Small, Colour Red. */
function variantOptions(name: string, optionCount: number): string[] {
  const parts = name.split(/\s*\/\s*/).map((p) => p.trim())
  return Array.from({ length: Math.max(1, optionCount) }, (_, i) => parts[i] ?? parts[0] ?? "Default Title")
}

export function productObject(card: CardLike, extra: { descriptionHtml?: string; selectedVariantId?: string | null } = {}): O {
  const s = card.settings
  const title = String(s.title ?? "")
  const handle = String(s.slug ?? "") || handleize(title)
  const images = Array.isArray(s.images) && s.images.length ? (s.images as string[]) : s.image ? [String(s.image)] : []
  const media = mediaList(images, title)
  const price = priceCents(s.price)
  const compare = priceCents(s.compare_price)
  const optionsIn = Array.isArray(s.options) ? (s.options as { name: string; values: string[] }[]) : []
  const rawVariants = Array.isArray(s.variants) ? (s.variants as O[]) : []
  const optionNames = optionsIn.length ? optionsIn.map((o) => o.name) : rawVariants.length ? ["Option"] : ["Title"]

  const variants: O[] = (rawVariants.length ? rawVariants : [{ id: card.id, name: "Default Title", price: s.price, compare_price: s.compare_price, available: s.available !== false, checkout_url: s.checkout_url }]).map((v, i) => {
    const vName = String(v.name ?? "Default Title")
    const opts = variantOptions(vName, optionNames.length)
    const vPrice = v.price !== undefined && v.price !== "" ? priceCents(v.price) : price
    const vCompare = priceCents(v.compare_price) || compare
    const variant: O = {
      [OUTPUT]: String(v.id ?? card.id),
      id: String(v.id ?? card.id),
      title: vName,
      name: `${title}${vName === "Default Title" ? "" : ` - ${vName}`}`,
      price: vPrice,
      compare_at_price: vCompare > vPrice ? vCompare : null,
      available: v.available !== false,
      inventory_management: null,
      inventory_policy: "deny",
      inventory_quantity: v.available === false ? 0 : 10,
      option1: opts[0] ?? null,
      option2: opts[1] ?? null,
      option3: opts[2] ?? null,
      options: opts,
      sku: "",
      barcode: "",
      weight: 0,
      requires_shipping: String(s.kind ?? "") === "physical",
      taxable: true,
      url: `${String(s.url ?? `/products/${handle}`)}?variant=${encodeURIComponent(String(v.id ?? card.id))}`,
      featured_image: media[0] ?? null,
      featured_media: media[0] ?? null,
      image: media[0] ?? null,
      selected: false,
      matched: true,
      quantity_rule: { min: 1, max: null, increment: 1 },
      quantity_price_breaks: [],
      unit_price_measurement: null,
      selling_plan_allocations: [],
      store_availabilities: [],
      metafields: {},
      position: i + 1,
      /* Storelib's own checkout for this option. */
      checkout_url: String(v.checkout_url ?? s.checkout_url ?? ""),
    }
    return variant
  })

  const selected = (extra.selectedVariantId ? variants.find((v) => v.id === extra.selectedVariantId) : undefined) ?? variants.find((v) => v.available) ?? variants[0]
  if (selected) selected.selected = true

  const options_with_values = optionNames.map((name, pos) => {
    const values = optionsIn[pos]?.values ?? [...new Set(variants.map((v) => (v.options as string[])[pos]))]
    const optionValues = values.map((value, vi) => {
      const match = variants.find((v) => (v.options as string[])[pos] === value)
      return {
        [OUTPUT]: value,
        id: `${pos}-${vi}`,
        name: value,
        position: vi + 1,
        selected: (selected?.options as string[] | undefined)?.[pos] === value,
        available: variants.some((v) => (v.options as string[])[pos] === value && v.available),
        variant: match ?? null,
        product_url: null,
        swatch: null,
      }
    })
    return { [OUTPUT]: name, name, position: pos + 1, values: optionValues, selected_value: optionValues.find((v) => v.selected)?.name ?? null }
  })

  const prices = variants.map((v) => v.price as number)
  const description = extra.descriptionHtml ?? (typeof s.description === "string" ? escapeParagraphs(s.description) : "")
  const product: O = {
    [OUTPUT]: title,
    id: card.id,
    title,
    handle,
    url: String(s.url ?? `/products/${handle}`),
    description,
    content: description,
    vendor: "",
    type: String(s.category ?? s.kind ?? ""),
    tags: [],
    available: variants.some((v) => v.available),
    price,
    price_min: prices.length ? Math.min(...prices) : price,
    price_max: prices.length ? Math.max(...prices) : price,
    price_varies: new Set(prices).size > 1,
    compare_at_price: compare > price ? compare : null,
    compare_at_price_min: compare > price ? compare : null,
    compare_at_price_max: compare > price ? compare : null,
    compare_at_price_varies: false,
    featured_image: media[0] ?? null,
    featured_media: media[0] ?? null,
    images: media,
    media,
    first_available_variant: variants.find((v) => v.available) ?? variants[0],
    selected_variant: extra.selectedVariantId ? selected ?? null : null,
    selected_or_first_available_variant: selected ?? null,
    variants,
    variants_count: variants.length,
    has_only_default_variant: !rawVariants.length,
    options: optionNames,
    options_with_values,
    options_by_name: Object.fromEntries(options_with_values.map((o) => [String(o.name).toLowerCase(), o])),
    collections: [],
    metafields: { custom: s.fields && typeof s.fields === "object" ? s.fields : {} },
    gift_card: false,
    gift_card_: false,
    requires_selling_plan: false,
    selling_plan_groups: [],
    quantity_price_breaks_configured: false,
    published_at: null,
    created_at: null,
    template_suffix: null,
    /* Storelib's own: what kind of product this is and its checkout. */
    kind: String(s.kind ?? ""),
    checkout_url: String(s.checkout_url ?? ""),
    pay_what_you_want: s.pay_what_you_want === true,
  }
  for (const v of variants) v.product = { id: product.id, title, handle, url: product.url }
  return product
}

function escapeParagraphs(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")
}

// ── Collections ──────────────────────────────────────────────────────────────

export interface CollectionLike {
  id: string
  title: string
  handle: string
  description?: string
  image?: string
  url?: string
  products_count?: number
  products?: CardLike[]
}

export function collectionObject(c: CollectionLike, productsFor?: (c: CollectionLike) => O[], extra: O = {}): O {
  const products = productsFor ? productsFor(c) : (c.products ?? []).map((p) => productObject(p))
  const image = c.image ? imageObject(c.image, c.title) : null
  return {
    [OUTPUT]: c.title,
    id: c.id,
    title: c.title,
    handle: c.handle,
    url: c.url ?? `/collections/${c.handle}`,
    description: c.description ? escapeParagraphs(c.description) : "",
    image,
    featured_image: image ?? (products[0]?.featured_image as O | null) ?? null,
    products,
    all_products_count: c.products_count ?? products.length,
    products_count: c.products_count ?? products.length,
    all_types: [],
    all_vendors: [],
    all_tags: [],
    tags: [],
    filters: [],
    sort_by: "",
    default_sort_by: "manual",
    sort_options: SORT_OPTIONS,
    current_type: null,
    current_vendor: null,
    template_suffix: null,
    metafields: {},
    next_product: null,
    previous_product: null,
    ...extra,
  }
}

export const SORT_OPTIONS = [
  { value: "manual", name: "Featured" },
  { value: "best-selling", name: "Best selling" },
  { value: "title-ascending", name: "Alphabetically, A-Z" },
  { value: "title-descending", name: "Alphabetically, Z-A" },
  { value: "price-ascending", name: "Price, low to high" },
  { value: "price-descending", name: "Price, high to low" },
  { value: "created-ascending", name: "Date, old to new" },
  { value: "created-descending", name: "Date, new to old" },
]

// ── Menus ────────────────────────────────────────────────────────────────────

export interface MenuLinkLike {
  title?: string
  label?: string
  url?: string
  links?: MenuLinkLike[]
}

export function linkObject(l: MenuLinkLike, currentPath: string, level = 1): O {
  const title = String(l.title ?? l.label ?? "")
  const url = String(l.url ?? "#")
  const links = (l.links ?? []).map((c) => linkObject(c, currentPath, level + 1))
  const active = url === currentPath
  const child_active = links.some((c) => c.active || c.child_active)
  return {
    [OUTPUT]: title,
    title,
    url,
    handle: handleize(title),
    active,
    current: active,
    child_active,
    child_current: child_active,
    links,
    levels: links.length ? 1 + Math.max(0, ...links.map((c) => Number(c.levels ?? 0))) : 0,
    type: url.startsWith("/collections/") ? "collection_link" : url.startsWith("/products/") ? "product_link" : url.startsWith("/pages/") ? "page_link" : url === "/" ? "frontpage_link" : "http_link",
    object: null,
  }
}

export function linklistObject(handle: string, title: string, links: MenuLinkLike[], currentPath: string): O {
  const items = links.map((l) => linkObject(l, currentPath))
  return { [OUTPUT]: handle, handle, title, links: items, levels: items.length ? 1 + Math.max(0, ...items.map((c) => Number(c.levels ?? 0))) : 0 }
}

// ── Colours, fonts, schemes ──────────────────────────────────────────────────

export function colorObject(value: unknown): O | null {
  const c = parseColor(value)
  if (!c) return null
  const hex = toHex(c)
  const R = c.r / 255, G = c.g / 255, B = c.b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = (max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4) * 60
  }
  return {
    [OUTPUT]: c.a < 1 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(2)})` : hex,
    red: c.r,
    green: c.g,
    blue: c.b,
    alpha: c.a,
    hue: Math.round(h),
    saturation: Math.round(s * 100),
    lightness: Math.round(l * 100),
    rgb: `${c.r} ${c.g} ${c.b}`,
    rgba: `${c.r} ${c.g} ${c.b} / ${+c.a.toFixed(2)}`,
    hex,
  }
}

/** Fonts Shopify's library has that are not on Google Fonts under the same name, by handle prefix. */
const SYSTEM_FONTS: Record<string, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  serif: "Iowan Old Style, Apple Garamond, Baskerville, Times New Roman, serif",
  mono: "Menlo, Consolas, Monaco, Liberation Mono, monospace",
}

/**
 * A font_picker value ("assistant_n4", "work_sans_i7") as Shopify's font
 * object: the family from the handle, the weight from the digit, italic from
 * the i. Served from Google Fonts, where the families of Shopify's library
 * are, by name.
 */
export function fontObject(handle: unknown): O | null {
  const h = String(handle ?? "").trim()
  if (!h) return null
  const m = h.match(/^(.*)_(n|i|o)(\d)$/)
  const base = m ? m[1] : h
  const style = m ? (m[2] === "n" ? "normal" : "italic") : "normal"
  const weight = m ? String(Number(m[3]) * 100) : "400"
  const system = base in SYSTEM_FONTS || /^(system|sans_serif|serif|monospace)$/.test(base)
  const family = system ? (base === "mono" || base === "monospace" ? "monospace" : base === "serif" ? "serif" : "system-ui") : base.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  const fallback = system ? SYSTEM_FONTS[base] ?? "sans-serif" : /serif|garamond|baskerville|playfair|lora|merriweather|crimson|libre_baskerville|cormorant|domine|bitter|arvo/i.test(base) ? "serif" : /mono|code|courier/i.test(base) ? "monospace" : "sans-serif"
  return {
    [OUTPUT]: family,
    family,
    fallback_families: fallback,
    weight,
    style,
    system,
    baseline_ratio: 0.8,
    variants: [],
    handle: h,
  }
}

/** The families and weights a theme's font settings name, as Google Fonts stylesheet addresses. */
export function fontLinks(fonts: O[]): string[] {
  const byFamily = new Map<string, Set<string>>()
  for (const f of fonts) {
    if (!f || f.system === true) continue
    const set = byFamily.get(String(f.family)) ?? new Set<string>()
    const ital = f.style === "italic" ? 1 : 0
    /* The regular, the bold and their italics, which every theme asks for with font_modify. */
    for (const w of new Set([String(f.weight || 400), "400", "700"])) { set.add(`${ital},${w}`); set.add(`${1 - ital},${w}`) }
    byFamily.set(String(f.family), set)
  }
  return [...byFamily].map(([family, set]) => {
    const axes = [...set].sort((a, b) => (a < b ? -1 : 1)).join(";")
    return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:ital,wght@${axes}&display=swap`
  })
}

// ── Settings, typed by their schema ──────────────────────────────────────────

export interface Resources {
  products: CardLike[]
  /**
   * Every published product a picker may name, the shop's list included: a
   * product sold as a membership or a community tier is left out of the
   * shop's own list but can be picked for a featured product. Lookups by id
   * read this; listings read `products`.
   */
  catalog?: CardLike[]
  collections: CollectionLike[]
  menus: Record<string, { title?: string; links: MenuLinkLike[] }>
  /** Colour schemes by id, already made objects (schemesObject). */
  schemes: Record<string, O>
  /** A picture setting's value as an address: an asset of the theme, a library file, a URL. */
  imageUrl: (value: string) => string
  currentPath: string
  /** Product objects by id, made once per draw. */
  productCache?: Map<string, O>
}

function productById(r: Resources, idOrHandle: string): O | null {
  if (!idOrHandle) return null
  r.productCache ??= new Map()
  const hit = r.productCache.get(idOrHandle)
  if (hit) return hit
  const matches = (p: CardLike) => p.id === idOrHandle || String(p.settings.slug ?? "") === idOrHandle || handleize(String(p.settings.title ?? "")) === idOrHandle
  const card = r.products.find(matches) ?? r.catalog?.find(matches)
  if (!card) return null
  const obj = productObject(card)
  r.productCache.set(idOrHandle, obj)
  return obj
}

/**
 * A collection by its handle. `all` is every product, as on every Shopify
 * store. A handle the shop does not have (a theme's demo collection, a
 * collection of the store the theme came from) is the shop's own products
 * too, so a section set to "Featured" shows real products rather than grey
 * placeholders; the import report names every such handle.
 */
export function collectionByHandle(r: Resources, handle: string): O | null {
  const c = r.collections.find((x) => x.handle === handle || x.id === handle)
  const products = (col: CollectionLike) => (col.products ?? []).map((p) => productById(r, p.id) ?? productObject(p))
  if (c) return collectionObject(c, products)
  if (!handle || r.products.length === 0) return null
  const all: CollectionLike = { id: handle === "all" ? "all" : `all-${handle}`, title: handle === "all" ? "Products" : handle.replace(/[-_]+/g, " ").replace(/^./, (x) => x.toUpperCase()), handle, url: handle === "all" ? "/collections/all" : `/collections/${handle}`, products: r.products, products_count: r.products.length }
  return collectionObject(all, products)
}

/** One setting's stored value, as the object a theme reads for its type. */
export function typedValue(type: string, value: unknown, r: Resources): unknown {
  switch (type) {
    case "color":
    case "color_background":
      return type === "color_background" ? (value ?? "") : colorObject(value) ?? (value === "" || value === undefined ? null : value)
    case "font_picker":
      return fontObject(value)
    case "image_picker": {
      const src = typeof value === "string" ? r.imageUrl(value) : ""
      return src ? imageObject(src) : null
    }
    case "product":
      return typeof value === "string" ? productById(r, value) : null
    case "product_list":
      return Array.isArray(value) ? value.map((v) => productById(r, String(v))).filter(Boolean) : []
    case "collection":
      return typeof value === "string" ? collectionByHandle(r, value) : null
    case "collection_list":
      return Array.isArray(value) ? value.map((v) => collectionByHandle(r, String(v))).filter(Boolean) : []
    case "link_list": {
      const handle = String(value ?? "")
      const menu = r.menus[handle]
      return menu ? linklistObject(handle, menu.title ?? handle, menu.links, r.currentPath) : handle ? linklistObject(handle, handle, [], r.currentPath) : null
    }
    case "color_scheme":
      return r.schemes[String(value ?? "")] ?? Object.values(r.schemes)[0] ?? null
    case "color_scheme_group":
      return r.schemes
    case "video":
      return typeof value === "string" && value ? { [OUTPUT]: value, media_type: "video", sources: [{ url: value, mime_type: "video/mp4" }], preview_image: null, alt: "" } : null
    case "video_url": {
      const url = String(value ?? "")
      const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/)
      const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
      return url ? { [OUTPUT]: url, id: yt?.[1] ?? vm?.[1] ?? "", type: yt ? "youtube" : vm ? "vimeo" : "", url } : null
    }
    case "range":
    case "number":
      return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value ?? null
    case "checkbox":
      return value === true || value === "true"
    case "page":
    case "blog":
    case "article":
    case "metaobject":
      return null
    case "url":
      return typeof value === "string" ? shopifyAddress(value) : value ?? ""
    default:
      return value ?? (["text", "textarea", "richtext", "inline_richtext", "html", "url", "liquid", "select", "radio", "text_alignment"].includes(type) ? "" : null)
  }
}

export type ShopifySetting = { type: string; id?: string; default?: unknown }

/**
 * `shopify://collections/all` and the rest: an address in the theme's own
 * scheme, as the address it is on this website.
 */
export function shopifyAddress(value: string): string {
  const m = value.match(/^shopify:\/\/([a-z_]+)(?:\/(.*))?$/)
  if (!m) return value
  const [, kind, rest = ""] = m
  switch (kind) {
    case "collections": return rest ? `/collections/${rest}` : "/collections"
    case "products": return rest ? `/products/${rest}` : "/collections/all"
    case "pages": return rest ? `/pages/${rest}` : "/"
    case "blogs": return rest ? `/blogs/${rest}` : "/blogs"
    case "search": return "/search"
    case "cart": return "/cart"
    case "account": return "/account"
    default: return ""
  }
}

/**
 * A value that names another value: `"{{ settings.color_palette.color3 }}"`
 * in a colour setting, `"{{ closest.collection.title }}"` in a heading.
 * Shopify calls these dynamic sources and reads them where they are drawn,
 * so a block inside a product card reads its own product.
 */
const WHOLE = /^\s*\{\{\s*([\s\S]+?)\s*\}\}\s*$/

/** How a dynamic source is read: an expression to a value, or text with `{{ }}` in it to text. */
export interface DynamicResolver {
  value(expr: string): unknown
  text(src: string): string
}

/** A settings object: every declared setting, its stored value or its default, typed. */
export function typedSettings(schema: ShopifySetting[], stored: Record<string, unknown> | undefined, r: Resources, dyn?: DynamicResolver): O {
  const out: O = {}
  const put = (id: string, type: string, raw: unknown) => {
    if (dyn && typeof raw === "string" && raw.includes("{{")) {
      const whole = raw.match(WHOLE)
      let done = false
      let cached: unknown
      Object.defineProperty(out, id, {
        enumerable: true,
        configurable: true,
        get: () => {
          if (done) return cached
          done = true
          const v = whole ? dyn.value(whole[1]) : dyn.text(raw)
          /* A colour named by a palette is a colour; the words of a heading stay words. */
          cached = (type === "color" || type === "color_background") && v && typeof v === "object" ? v : typeof v === "string" ? typedValue(type, v, r) : v ?? typedValue(type, "", r)
          return cached
        },
      })
      return
    }
    out[id] = typedValue(type, raw, r)
  }
  const has = (k: string) => !!stored && Object.prototype.hasOwnProperty.call(stored, k)
  const used = new Set<string>()
  for (const s of schema) {
    if (!s.id) continue
    /* The builder stores `padding-block-start` as `padding_block_start`; the theme reads it by its own name. */
    const alt = s.id.replace(/-/g, "_")
    const key = has(s.id) ? s.id : has(alt) ? alt : null
    if (key) used.add(key)
    put(s.id, s.type, key ? stored![key] : s.default)
  }
  /* A stored value with no setting declared for it (a theme setting a section reads by name) passes through. */
  for (const [k, v] of Object.entries(stored ?? {})) if (!(k in out) && !used.has(k)) put(k, "text", v)
  return out
}

/** The theme's colour schemes (`settings.color_schemes`), each with its colours as colour objects. */
export function schemesObject(schemeSchema: { definition?: ShopifySetting[] } | undefined, stored: unknown): Record<string, O> {
  const out: Record<string, O> = {}
  const defs = schemeSchema?.definition ?? []
  const list = stored && typeof stored === "object" ? (stored as Record<string, { settings?: Record<string, unknown> }>) : {}
  for (const [id, scheme] of Object.entries(list)) {
    const settings: O = {}
    for (const d of defs) if (d.id) settings[d.id] = d.type === "color" || d.type === "color_background" ? (d.type === "color" ? colorObject(scheme.settings?.[d.id] ?? d.default) : scheme.settings?.[d.id] ?? d.default ?? "") : scheme.settings?.[d.id] ?? d.default
    for (const [k, v] of Object.entries(scheme.settings ?? {})) if (!(k in settings)) settings[k] = typeof v === "string" && /^#|^rgb/.test(v) ? colorObject(v) ?? v : v
    out[id] = { [OUTPUT]: id, id, settings }
  }
  return out
}

// ── Sections and blocks ──────────────────────────────────────────────────────

/** What `{{ block.shopify_attributes }}` prints: the marker Storelib's builder selects a block by. */
export function blockAttributes(id: string): string {
  return `data-block-id="${id.replace(/"/g, "")}"`
}

// ── The visitor's page ───────────────────────────────────────────────────────

export function requestObject(pageType: string, path: string, designMode: boolean, host = ""): O {
  return {
    page_type: pageType,
    path,
    host,
    origin: host ? `https://${host}` : "",
    design_mode: designMode,
    visual_preview_mode: false,
    locale: { [OUTPUT]: "en", iso_code: "en", name: "English", endonym_name: "English", primary: true, root_url: "/", direction: "ltr" },
  }
}

export const SHOPIFY_ROUTES: O = {
  root_url: "/",
  account_url: "/account",
  account_login_url: "/account/login",
  account_logout_url: "/account/logout",
  account_register_url: "/account/login",
  account_addresses_url: "/account",
  account_recover_url: "/account/login",
  cart_url: "/cart",
  cart_add_url: "/cart/add",
  cart_change_url: "/cart/change",
  cart_clear_url: "/cart/clear",
  cart_update_url: "/cart/update",
  collections_url: "/collections",
  all_products_collection_url: "/collections/all",
  products_url: "/products",
  search_url: "/search",
  predictive_search_url: "/search/suggest",
  product_recommendations_url: "/recommendations/products",
  contact_url: "/contact",
  storefront_login_url: "/account/login",
}

export function localizationObject(currency: string): O {
  const country = { [OUTPUT]: "US", iso_code: "US", name: "United States", currency: { iso_code: currency, symbol: "$", name: currency }, unit_system: "imperial", available_languages: [] as O[] }
  const language = { [OUTPUT]: "en", iso_code: "en", name: "English", endonym_name: "English", primary: true, root_url: "/" }
  country.available_languages = [language]
  return { country, language, available_countries: [country], available_languages: [language], market: { id: "storelib", handle: "default" } }
}

/** A cart line, as the cart object's `items`. */
export interface CartLineLike {
  key: string
  productId: string
  variantId: string | null
  quantity: number
  product: O | null
  properties?: Record<string, string>
}

export function cartObject(lines: CartLineLike[], currency: string, note = ""): O {
  const items = lines.flatMap((l, i) => {
    const product = l.product
    if (!product) return []
    const variants = (product.variants as O[]) ?? []
    const variant = (l.variantId ? variants.find((v) => v.id === l.variantId) : null) ?? (product.selected_or_first_available_variant as O) ?? variants[0]
    const price = Number(variant?.price ?? product.price ?? 0)
    const line = price * l.quantity
    return [{
      [OUTPUT]: String(product.title),
      id: String(variant?.id ?? product.id),
      key: l.key,
      /* From 0: Horizon writes `line_index | plus: 1` for the line's number. */
      index: i,
      quantity: l.quantity,
      title: `${String(product.title)}${variant && variant.title !== "Default Title" ? ` - ${String(variant.title)}` : ""}`,
      product,
      product_id: product.id,
      variant,
      variant_id: variant?.id ?? product.id,
      url: String(variant?.url ?? product.url),
      image: product.featured_image ?? null,
      featured_image: product.featured_image ?? null,
      price,
      original_price: price,
      final_price: price,
      line_price: line,
      original_line_price: line,
      final_line_price: line,
      discounted_price: price,
      line_level_discount_allocations: [],
      line_level_total_discount: 0,
      discount_allocations: [],
      properties: l.properties ?? {},
      options_with_values: ((product.options as string[]) ?? []).map((name, p) => ({ name, value: (variant?.options as string[] | undefined)?.[p] ?? "" })).filter((o) => variant && variant.title !== "Default Title" && o.value),
      selling_plan_allocation: null,
      requires_shipping: variant?.requires_shipping === true,
      unit_price: null,
      unit_price_measurement: null,
      sku: "",
      vendor: "",
      gift_card: false,
      has_components: false,
      quantity_rule: { min: 1, max: null, increment: 1 },
      error_message: null,
    }]
  })
  const total = items.reduce((s, i) => s + Number(i.final_line_price), 0)
  return {
    items,
    item_count: items.reduce((s, i) => s + Number(i.quantity), 0),
    items_subtotal_price: total,
    total_price: total,
    original_total_price: total,
    total_discount: 0,
    total_weight: 0,
    cart_level_discount_applications: [],
    discount_applications: [],
    currency: { iso_code: currency, [OUTPUT]: currency },
    note,
    attributes: {},
    empty: items.length === 0,
    requires_shipping: items.some((i) => i.requires_shipping),
    checkout_charge_amount: total,
    duties_included: false,
    taxes_included: false,
  }
}
