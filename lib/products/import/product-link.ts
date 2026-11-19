/**
 * Public product metadata, read from a product's own page. All network access
 * is in product-link-server.ts; everything here is pure, so the route, the
 * screen and the tests read the same rules.
 *
 *   Shopify  /products/<handle>.js (prices in hundredths), or when a store
 *            hides it /products/<handle>.json and /products.json (prices in
 *            units, as strings), normalised to the .js shape first
 *            (shopifyJsonProduct). The currency is read from the page.
 *   Gumroad  the product page's embedded props (react_on_rails JSON script or
 *            an Inertia data-page), with its JSON-LD as the fallback.
 *   Payhip   payhip.com/b/<key>: its JSON-LD Product, then its og:/product:
 *            meta tags.
 */
import { GUMROAD_IMAGE_HOSTS, gumroadToHundredths } from "./gumroad"

export type LinkSource = "shopify" | "gumroad" | "payhip"

export interface LinkVariant {
  name: string; priceCents: number; payWhatYouWant: boolean
  options?: string[]; sku?: string; compareAtCents?: number | null; image?: string | null
}
export interface LinkProduct {
  source: LinkSource
  externalId: string
  url: string
  title: string
  descriptionHtml: string
  priceCents: number
  currency: string
  payWhatYouWant: boolean
  images: string[]
  variants: LinkVariant[]
  options: { name: string; values: string[] }[]
  category: string | null
  tags: string[]
  vendor: string | null
  type: "digital" | "physical" | "course"
  warnings: string[]
}

/** One product of a Shopify store's catalog, as the list to pick from shows it. */
export interface CatalogItem {
  url: string
  externalId: string
  title: string
  image: string | null
  priceCents: number
  variants: number
  type: "digital" | "physical"
}

type Raw = Record<string, unknown>
const record = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {}
const text = (v: unknown) => typeof v === "string" ? v : ""
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : []
/** A money amount as hundredths (factor 100) or one already in hundredths (factor 1). "1,299.00" reads as 1299. */
const amount = (v: unknown, factor = 100): number | null => {
  const s = typeof v === "string" ? v.trim().replace(/^(\d{1,3}(?:,\d{3})+)(\.\d+)?$/, (_m: string, whole: string, frac?: string) => whole.replace(/,/g, "") + (frac ?? "")) : v
  const n = typeof s === "number" || (typeof s === "string" && /^\d+(\.\d+)?$/.test(s)) ? Number(s) : NaN
  return Number.isFinite(n) && n >= 0 && n * factor <= 100_000_000 ? Math.round(n * factor) : null
}

const LOCAL_NAME = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home\.arpa)$/i
const isGumroadHost = (h: string) => h === "gumroad.com" || h.endsWith(".gumroad.com")
const isPayhipHost = (h: string) => h === "payhip.com" || h === "www.payhip.com"
export function linkSource(url: URL | string): LinkSource {
  const h = (typeof url === "string" ? new URL(url) : url).hostname.toLowerCase()
  return isGumroadHost(h) ? "gumroad" : isPayhipHost(h) ? "payhip" : "shopify"
}

/** A pasted address, checked before anything is fetched: https, a public name, no credentials, no port. */
function publicLink(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Paste a Shopify, Gumroad or Payhip product link.")
  const value = raw.trim()
  let url: URL
  /* "shop.example/products/x" without its https:// is still the link the seller meant. */
  try { url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`) } catch { throw new Error("Enter a complete product link starting with https://.") }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/\.(?:[a-z]{2,})$/i.test(url.hostname) || LOCAL_NAME.test(url.hostname)) throw new Error("Use a public HTTPS product link.")
  url.hash = ""
  return url
}
const PRODUCT_PATH: Record<LinkSource, RegExp> = { gumroad: /^\/l\/[^/]+\/?$/, payhip: /^\/b\/[A-Za-z0-9]+\/?$/, shopify: /\/products\/[^/.]+\/?$/ }
/** A Shopify storefront's pages that mean "the whole store": its home, its catalog or a collection, with an optional /en or /en-us. */
const STORE_PATH = /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?(?:\/|\/products\/?|\/collections(?:\/[^/]+)?\/?)?$/i

export function productLink(raw: unknown): URL {
  const url = publicLink(raw)
  if (!PRODUCT_PATH[linkSource(url)].test(url.pathname)) throw new Error("Open the product on Shopify, Gumroad or Payhip and paste its product page link.")
  url.search = ""
  return url
}

export type ImportLink = { kind: "product"; url: URL; source: LinkSource } | { kind: "store"; url: URL }
/** A product page, or a Shopify store's address (its home, /products or a collection) to list its catalog. */
export function importLink(raw: unknown): ImportLink {
  const url = publicLink(raw)
  const source = linkSource(url)
  if (PRODUCT_PATH[source].test(url.pathname)) { url.search = ""; return { kind: "product", url, source } }
  if (source === "gumroad") throw new Error("Paste one Gumroad product link (it has /l/ in it), or use Import from Gumroad to bring every product.")
  if (source === "payhip") throw new Error("Paste one Payhip product link (it has /b/ in it).")
  if (STORE_PATH.test(url.pathname)) return { kind: "store", url: new URL(url.origin) }
  throw new Error("Open the product on Shopify, Gumroad or Payhip and paste its product page link.")
}

/**
 * A bot check answered instead of the page: Cloudflare's block page ("Attention Required! | Cloudflare", which is
 * what payhip.com answers a server with a 403) or its challenge ("Just a moment...", the cf-mitigated: challenge
 * header). Nothing is tried to get past it; the seller is told plainly what happened.
 */
export function botWall(status: number, headers: Headers, html: string): boolean {
  if (headers.get("cf-mitigated") === "challenge") return true
  if (status !== 403 && status !== 429 && status !== 503 && status !== 200) return false
  const head = html.slice(0, 20_000)
  return /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare)\s*<\/title>/i.test(head) || (status !== 200 && /\/cdn-cgi\/challenge-platform\/|cf-error-details|cf-chl-/i.test(head))
}

/** What the seller is told when a platform's bot check answered instead of the product. */
export function botWallMessage(source: LinkSource): string {
  if (source === "payhip") return "Payhip's bot protection blocked Storelib from reading this page, so it cannot be imported from its link. Create a new product and copy its title, price, description and pictures from Payhip."
  const name = source === "gumroad" ? "Gumroad" : "The store"
  return `${name} answered with a bot check instead of the product page. Try again later, or create a new product and copy its details across.`
}

/** Payhip's picture bucket. Pictures shown through payhip.com/cdn-cgi/image/... are read from the address inside. */
export const PAYHIP_IMAGE_HOSTS: ReadonlySet<string> = new Set(["pe56d.s3.amazonaws.com"])

export function importImageUrl(raw: string, storefrontUrl?: string): string | null {
  try {
    const value = raw.trim()
    const url = new URL(value.startsWith("//") ? `https:${value}` : value, storefrontUrl)
    const h = url.hostname.toLowerCase()
    /* Cloudflare's resizer on payhip.com: /cdn-cgi/image/<options>/<the picture's own address>. */
    const inner = isPayhipHost(h) ? url.pathname.match(/^\/cdn-cgi\/image\/[^/]+\/(https:\/\/.+)$/)?.[1] : undefined
    if (inner) return isPayhipHost(new URL(inner).hostname) ? null : importImageUrl(inner)
    const ownCdn = storefrontUrl && h === new URL(storefrontUrl).hostname && /^\/cdn\/shop\//.test(url.pathname)
    const allowed = ownCdn || GUMROAD_IMAGE_HOSTS.has(h) || PAYHIP_IMAGE_HOSTS.has(h) || h === "cdn.shopify.com" || h.endsWith(".shopify.com") || h.endsWith(".myshopify.com") || h.endsWith(".gumroad.com") || h.endsWith(".gumroad.io")
    return allowed && url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null
  } catch { return null }
}
function imageList(raw: unknown, storefrontUrl?: string): string[] {
  return [...new Set(array(raw).flatMap((v) => {
    const r = record(v)
    const url = importImageUrl(text(v) || ((r.type === "video" || r.type === "oembed") ? text(r.thumbnail) : text(r.original_url) || text(r.url) || text(r.src) || text(r.contentUrl)), storefrontUrl)
    return url ? [url] : []
  }))]
}
const entities = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d{1,6});/g, (_m: string, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff))).replace(/&amp;/g, "&")
/** Plain text as paragraphs, for a description a page gives only as text. HTML is left as it is (sanitised on import). */
function textToHtml(s: string): string {
  if (/<\/?(p|div|br|ul|ol|li|h[1-6]|strong|em|a)\b/i.test(s)) return s
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
}
/** The content of <meta property|name="key">, either attribute order, or "". */
export function metaContent(html: string, key: string): string {
  const k = key.replace(/[.:]/g, "\\$&")
  const m = html.match(new RegExp(`<meta\\b[^>]*(?:property|name|itemprop)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${k}["']`, "i"))
  return m ? entities(m[1]).trim() : ""
}
export function structuredProducts(html: string): Raw[] {
  const found: Raw[] = []
  const visit = (v: unknown, depth = 0) => {
    if (depth > 14) return
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return }
    const r = record(v)
    const types = Array.isArray(r["@type"]) ? r["@type"] : [r["@type"]]
    if (types.includes("Product") || types.includes("ProductGroup")) found.push(r)
    if (r["@graph"]) visit(r["@graph"], depth + 1)
    if (r.mainEntity) visit(r.mainEntity, depth + 1)
  }
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1].trim())) } catch { /* A malformed unrelated schema is not a product. */ }
  }
  return found
}
/** A JSON-LD product's offers, one level of AggregateOffer.offers flattened in. */
const offersOf = (schema: Raw): Raw[] => (Array.isArray(schema.offers) ? schema.offers : schema.offers ? [schema.offers] : []).map(record).flatMap((o) => array(o.offers).length ? [o, ...array(o.offers).map(record)] : [o])

/** The currency a Shopify storefront prices in: the product's JSON-LD, then the theme's own globals and meta tags. */
export function shopifyCurrency(html: string, schema: Raw = {}): string {
  const offer = offersOf(schema).find((o) => text(o.priceCurrency))
  const found = text(offer?.priceCurrency)
    || html.match(/Shopify\.currency\s*=\s*\{[^}]*["']?active["']?\s*:\s*["']([A-Za-z]{3})["']/)?.[1]
    || html.match(/ShopifyAnalytics\.meta\.currency\s*=\s*["']([A-Za-z]{3})["']/)?.[1]
    || metaContent(html, "og:price:currency") || metaContent(html, "product:price:currency")
    || ""
  return /^[A-Z]{3}$/i.test(found) ? found.toUpperCase() : ""
}

/**
 * A product from Shopify's /products/<handle>.json ({ product }) or one row of
 * /products.json, in the shape of /products/<handle>.js. The .json prices are
 * units written as strings ("19.99"); the .js ones, and this, hundredths.
 */
export function shopifyJsonProduct(raw: unknown): Raw | null {
  const outer = record(raw)
  const p = outer.product ? record(outer.product) : outer
  if (!p.id || !text(p.title) || !Array.isArray(p.variants)) return null
  const images = array(p.images).map(record)
  const imageById = new Map(images.map((i) => [String(i.id), text(i.src)]))
  const variants = array(p.variants).map((v) => {
    const r = record(v)
    const image = r.featured_image ? text(record(r.featured_image).src) : imageById.get(String(r.image_id)) ?? ""
    return { id: r.id, title: text(r.title), price: amount(r.price), compare_at_price: amount(r.compare_at_price), sku: text(r.sku), requires_shipping: r.requires_shipping === true, available: r.available !== false, options: [r.option1, r.option2, r.option3].filter((o): o is string => typeof o === "string" && !!o), featured_image: image ? { src: image } : null }
  })
  const prices = variants.map((v) => v.price).filter((n): n is number => n !== null)
  return {
    id: p.id, title: text(p.title), handle: text(p.handle), description: text(p.body_html), vendor: text(p.vendor), type: text(p.product_type),
    tags: Array.isArray(p.tags) ? p.tags : text(p.tags).split(",").map((t) => t.trim()).filter(Boolean),
    images: images.map((i) => text(i.src)).filter(Boolean), options: array(p.options), variants,
    price: prices.length ? Math.min(...prices) : null,
  }
}

const isDefaultTitle = (o: { name: string; values: string[] }) => o.name === "Title" && o.values.length === 1 && o.values[0] === "Default Title"

export function parseShopifyProduct(raw: unknown, html: string, url: string): LinkProduct {
  const p = record(raw)
  if (!p.id || !text(p.title) || !Array.isArray(p.variants)) throw new Error("This link did not return a public Shopify product.")
  const schemas = structuredProducts(html)
  const schema = schemas.find((v) => text(v.name) === text(p.title)) ?? schemas[0] ?? {}
  // Shopify's Ajax product prices are hundredths, including zero-decimal presentment currencies.
  const currency = shopifyCurrency(html, schema)
  if (!currency) throw new Error("The store did not expose its currency. Import from a public product page that shows prices and currency.")
  const variants = p.variants as unknown[]
  if (variants.length > 100) throw new Error("This product has more than 100 variants. Reduce its variants before importing.")
  const mapped = variants.map((v): LinkVariant => {
    const r = record(v); const price = amount(r.price, 1)
    if (price === null) throw new Error("A variant's price is unavailable. Try another public product link.")
    return { name: (text(r.title) || "Standard").slice(0, 200), priceCents: price, payWhatYouWant: false, options: array(r.options).map(text), sku: text(r.sku).slice(0, 100), compareAtCents: amount(r.compare_at_price, 1), image: importImageUrl(text(record(r.featured_image).src), url) }
  })
  /* No product price at all (a .json read): the lowest variant's. A price that is there but wrong is an error. */
  const price = p.price === null || p.price === undefined ? (mapped.length ? Math.min(...mapped.map((v) => v.priceCents)) : null) : amount(p.price, 1)
  if (price === null || !mapped.length) throw new Error("The product has no available price or variants.")
  const images = imageList(p.images, url)
  const physical = variants.some((v) => record(v).requires_shipping === true)
  /* Older stores answer options as names only; their values are then the variants' own. */
  const options = array(p.options).map((v, i) => {
    const o = record(v)
    const name = typeof v === "string" ? v : text(o.name)
    const values = typeof v === "string" ? [...new Set(mapped.map((m) => m.options?.[i] ?? "").filter(Boolean))] : array(o.values).map(text).filter(Boolean)
    return { name, values }
  }).filter((o) => o.name && o.values.length && !isDefaultTitle(o))
  if (options.length > 3) throw new Error("Products can have at most three option groups.")
  /* A product with no options is one "Default Title" variant on Shopify. Here it is the product itself, not a variant. */
  const single = !options.length && mapped.length === 1
  return { source: "shopify", externalId: `${new URL(url).hostname}:${String(p.id)}`, url, title: entities(text(p.title)).slice(0, 200), descriptionHtml: text(p.description), priceCents: price, currency, payWhatYouWant: false, images: images.slice(0, 20), variants: single ? [] : mapped, options, category: (text(schema.category) || text(p.type)).slice(0, 150) || null, vendor: text(p.vendor).slice(0, 150) || null, tags: array(p.tags).map(text).filter(Boolean).slice(0, 50), type: physical ? "physical" : "digital", warnings: [...(array(p.images).some((v) => !imageList([v], url).length) ? ["Some images use unsupported hosts. Add them in the editor before publishing."] : []), "Review stock, shipping and taxes before publishing. Public links do not expose private inventory or downloadable files.", ...(images.length > 20 ? ["Only the first 20 gallery images will be copied."] : [])] }
}

/** A Shopify store's /products.json pages as the list to pick from. Products without a price are left out. */
export function parseShopifyCatalog(pages: unknown[], origin: string): CatalogItem[] {
  const host = new URL(origin).hostname
  const seen = new Set<string>()
  const out: CatalogItem[] = []
  for (const page of pages) for (const row of array(record(page).products)) {
    const p = shopifyJsonProduct(row)
    const handle = text(p?.handle)
    if (!p || !handle || typeof p.price !== "number" || seen.has(String(p.id))) continue
    seen.add(String(p.id))
    const variants = array(p.variants)
    const options = array(p.options).map(record).map((o) => ({ name: text(o.name), values: array(o.values).map(text) }))
    out.push({
      url: `${origin}/products/${encodeURIComponent(handle)}`,
      externalId: `${host}:${String(p.id)}`,
      title: entities(text(p.title)).slice(0, 200),
      image: imageList(p.images, origin)[0] ?? null,
      priceCents: p.price,
      variants: !options.length || (options.length === 1 && isDefaultTitle(options[0])) ? 0 : variants.length,
      type: variants.some((v) => record(v).requires_shipping === true) ? "physical" : "digital",
    })
  }
  return out
}

/** Gumroad's embedded props: react_on_rails JSON scripts, and Inertia's data-page (an attribute or a script). */
function embeddedJson(html: string): unknown[] {
  const out: unknown[] = []
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { out.push(JSON.parse(m[1])) } catch { /* Unrelated script. */ }
  }
  for (const m of html.matchAll(/\bdata-page=(?:"([^"]*)"|'([^']*)')/gi)) {
    try { out.push(JSON.parse(entities(m[1] ?? m[2] ?? ""))) } catch { /* Not a page object. */ }
  }
  return out
}

/**
 * A Gumroad product from its public JSON (GET /l/<permalink>.json, ProductPresenter::PublicApiProps, `json`) when
 * there is one, else from the page's embedded props. Its JSON-LD is not read for the price: Gumroad writes it in the
 * visitor's currency (a EUR 35.00 product read from the US says USD 38.38), and its picture is a small copy of the
 * first cover.
 */
export function parseGumroadProduct(html: string, url: string, json?: unknown): LinkProduct {
  const schemas = structuredProducts(html)
  const schema = schemas.find((p) => text(p.url).replace(/\/$/, "") === url.replace(/\/$/, "")) ?? schemas[0]
  // Gumroad embeds its public product props in JSON. Never execute page scripts. The first product found is the page's own.
  let embedded: Raw = {}
  let found = false
  const visit = (v: unknown, depth = 0) => {
    if (depth > 12 || found) return
    const r = record(v)
    const candidate = r.price_cents !== undefined && r.currency_code && r.name ? r : record(r.product)
    if (text(candidate.name) && (candidate.price_cents !== undefined || candidate.price !== undefined)) { embedded = candidate; found = true; return }
    for (const [k, x] of Object.entries(r)) if (["props", "pageProps", "data", "product", "product_information"].includes(k)) visit(x, depth + 1)
  }
  for (const doc of [...(json === undefined ? [] : [json]), ...embeddedJson(html)]) visit(doc)
  const title = text(embedded.name) || text(schema?.name)
  const currency = (text(embedded.currency_code) || text(embedded.currency)).toUpperCase()
  const embeddedPrice = amount(embedded.price_cents, 1)
  /* Changed on purpose: no price from the JSON-LD offer, which is the visitor's converted price, not the seller's. */
  const price = embeddedPrice === null ? null : gumroadToHundredths(embeddedPrice, currency)
  if (!found || !title || price === null || price > 100_000_000 || !/^[A-Z]{3}$/.test(currency)) throw new Error("Gumroad did not expose this product's price and details. Make sure the product is public and try again.")
  if (embedded.is_tiered_membership || embedded.subscription_duration || embedded.is_recurring_billing || embedded.is_legacy_subscription || embedded.native_type === "membership") throw new Error("Subscription products must be created as a paid community.")
  /* A bundle is other products sold together (antiwork/gumroad ProductPresenter::ProductProps bundle_products); its own draft would have nothing to deliver. The account importer refuses it the same way (./gumroad unsupportedOf). */
  if (embedded.native_type === "bundle" || array(embedded.bundle_products).length) throw new Error("Gumroad bundles cannot be imported. Import each product in the bundle on its own.")
  const versions = array(embedded.options).length ? array(embedded.options) : array(embedded.variants).length ? array(embedded.variants) : array(embedded.versions)
  let variantRows: unknown[] = versions
  if (versions.length === 1 && Array.isArray(record(versions[0]).options)) variantRows = array(record(versions[0]).options)
  if (variantRows.length > 100) throw new Error("This product has more than 100 variants.")
  const productPwyw = !!embedded.pwyw || embedded.customizable_price === true || embedded.is_pay_what_you_want === true
  const variants: LinkVariant[] = variantRows.map((v) => {
    const r = record(v)
    /* Variant#to_option always sends price_difference_cents; a null one is no difference, not an unknown price. */
    const difference = "price_difference_cents" in r && r.price_difference_cents === null ? 0 : amount(r.price_difference_cents ?? r.price_difference, 1)
    const absolute = amount(r.price_cents, 1)
    const cents = absolute !== null ? gumroadToHundredths(absolute, currency) : difference !== null ? price + gumroadToHundredths(difference, currency) : null
    if (cents === null || cents > 100_000_000) throw new Error("Gumroad did not expose all version prices. Use the account importer for this product.")
    /* A pay what you want product lets the buyer pay more for every version (Gumroad's checkout: product.customizable_price || option.is_pwyw), each version's price its minimum. */
    return { name: (text(r.name) || text(r.title) || "Standard").slice(0, 200), priceCents: cents, payWhatYouWant: r.is_pay_what_you_want === true || r.is_pwyw === true || productPwyw }
  })
  const covers = imageList([...array(embedded.covers), ...array(embedded.preview_urls)])
  /* No cover: the product's thumbnail, its square card picture, as the account importer does (./gumroad mapGumroadProduct). */
  const images = covers.length ? covers : imageList([text(embedded.thumbnail_url)].filter(Boolean))
  const description = text(embedded.description_html) || text(embedded.description) || text(schema?.description)
  return { source: "gumroad", externalId: text(embedded.id) || text(schema?.productID) || new URL(url).hostname + new URL(url).pathname, url, title: entities(title).slice(0, 200), descriptionHtml: description, priceCents: price, currency, payWhatYouWant: productPwyw, images: images.slice(0, 20), variants, options: [], category: (text(embedded.category) || text(schema?.category)).slice(0, 150) || null, vendor: null, tags: array(embedded.tags).map(text).filter(Boolean).slice(0, 50), type: embedded.is_physical || embedded.require_shipping ? "physical" : embedded.native_type === "course" ? "course" : "digital", warnings: ["Downloadable files and private course lessons cannot be fetched from a public link. Upload your files in the editor before publishing.", ...(!variants.length ? ["Only versions exposed by Gumroad's public page can be imported."] : []), ...(images.length > 20 ? ["Only the first 20 gallery images will be copied."] : [])] }
}

/**
 * A Payhip product page (payhip.com/b/<key>). Read from its JSON-LD Product,
 * then its Open Graph product tags. Several offers that each have a name come
 * in as one variant per offer.
 */
export function parsePayhipProduct(html: string, url: string): LinkProduct {
  const key = new URL(url).pathname.match(/^\/b\/([A-Za-z0-9]+)/)?.[1]
  if (!key) throw new Error("Paste one Payhip product link (it has /b/ in it).")
  const schema = structuredProducts(html)[0] ?? {}
  const offers = offersOf(schema)
  const offer = offers[0] ?? {}
  const title = entities(text(schema.name) || metaContent(html, "og:title")).replace(/\s+[-|]\s+Payhip$/i, "").trim()
  const currency = (text(offer.priceCurrency) || metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency")).toUpperCase()
  const prices = offers.map((o) => amount(o.price) ?? amount(o.lowPrice)).filter((n): n is number => n !== null)
  const price = (prices.length ? Math.min(...prices) : null) ?? amount(metaContent(html, "product:price:amount")) ?? amount(metaContent(html, "og:price:amount"))
  if (!title || price === null || !/^[A-Z]{3}$/.test(currency)) throw new Error("Payhip did not expose this product's price and details. Make sure the product is public and try again.")
  const named = offers.filter((o) => text(o.name) && amount(o.price) !== null)
  const variants: LinkVariant[] = named.length > 1 ? named.slice(0, 100).map((o) => ({ name: text(o.name).slice(0, 200), priceCents: amount(o.price) as number, payWhatYouWant: false })) : []
  const schemaImages = typeof schema.image === "string" ? [schema.image] : Array.isArray(schema.image) ? schema.image : schema.image ? [schema.image] : []
  const ogImages = [...html.matchAll(/<meta\b[^>]*property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/gi)].map((m) => entities(m[1]))
  const all = [...schemaImages, ...ogImages]
  const images = imageList(all)
  const offered = new Set(all.map((v) => text(v) || text(record(v).url) || text(record(v).contentUrl)).filter(Boolean).map((v) => importImageUrl(v) ?? v))
  const description = textToHtml(entities(text(schema.description) || metaContent(html, "og:description")))
  const category = text(schema.category).slice(0, 150) || null
  return {
    source: "payhip", externalId: `payhip:${key}`, url, title: title.slice(0, 200), descriptionHtml: description, priceCents: price, currency,
    payWhatYouWant: false, images: images.slice(0, 20), variants, options: [], category, vendor: text(record(schema.brand).name).slice(0, 150) || null, tags: [],
    type: /course/i.test(category ?? "") ? "course" : "digital",
    warnings: [
      "Downloadable files cannot be fetched from a public link. Upload your files in the editor before publishing.",
      "Payhip's public page may shorten the description. Check it before publishing.",
      ...(images.length < offered.size ? ["Some images use unsupported hosts. Add them in the editor before publishing."] : []),
    ],
  }
}
