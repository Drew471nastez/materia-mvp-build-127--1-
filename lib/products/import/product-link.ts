/** Public product metadata. All network access is in product-link-server.ts. */
import { GUMROAD_IMAGE_HOSTS, gumroadToHundredths } from "./gumroad"
export interface LinkVariant {
  name: string; priceCents: number; payWhatYouWant: boolean
  options?: string[]; sku?: string; compareAtCents?: number | null; image?: string | null
}
export interface LinkProduct {
  source: "shopify" | "gumroad"
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

type Raw = Record<string, unknown>
const record = (v: unknown): Raw => v && typeof v === "object" && !Array.isArray(v) ? v as Raw : {}
const text = (v: unknown) => typeof v === "string" ? v : ""
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const amount = (v: unknown, factor = 100): number | null => {
  const n = typeof v === "number" || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v)) ? Number(v) : NaN
  return Number.isFinite(n) && n >= 0 && n * factor <= 100_000_000 ? Math.round(n * factor) : null
}
export function productLink(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Paste a Shopify or Gumroad product link.")
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new Error("Enter a complete product link starting with https://.") }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/\.(?:[a-z]{2,})$/i.test(url.hostname)) throw new Error("Use a public HTTPS product link.")
  const gumroad = url.hostname === "gumroad.com" || url.hostname.endsWith(".gumroad.com")
  if (!(gumroad ? /^\/l\/[^/]+\/?$/ : /\/products\/[^/]+\/?$/).test(url.pathname)) throw new Error("Open the product on Shopify or Gumroad and paste its product page link.")
  url.search = ""; url.hash = ""
  return url
}
export function importImageUrl(raw: string, storefrontUrl?: string): string | null {
  try {
    const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw, storefrontUrl)
    const h = url.hostname.toLowerCase()
    const ownCdn = storefrontUrl && h === new URL(storefrontUrl).hostname && /^\/cdn\/shop\//.test(url.pathname)
    const allowed = ownCdn || GUMROAD_IMAGE_HOSTS.has(h) || h === "cdn.shopify.com" || h.endsWith(".shopify.com") || h.endsWith(".myshopify.com") || h === "public-files.gumroad.com" || h === "assets.gumroad.com" || h.endsWith(".gumroad.com") || h === "img.gumroad.com" || h.endsWith(".gumroad.io")
    return allowed && url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null
  } catch { return null }
}
function imageList(raw: unknown, storefrontUrl?: string): string[] {
  return [...new Set(array(raw).flatMap((v) => {
    const r = record(v)
    const url = importImageUrl(text(v) || ((r.type === "video" || r.type === "oembed") ? text(r.thumbnail) : text(r.original_url) || text(r.url) || text(r.src)), storefrontUrl)
    return url ? [url] : []
  }))]
}
const entities = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
export function structuredProducts(html: string): Raw[] {
  const found: Raw[] = []
  const visit = (v: unknown, depth = 0) => {
    if (depth > 14) return
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return }
    const r = record(v)
    const types = Array.isArray(r["@type"]) ? r["@type"] : [r["@type"]]
    if (types.includes("Product")) found.push(r)
    if (r["@graph"]) visit(r["@graph"], depth + 1)
    if (r.mainEntity) visit(r.mainEntity, depth + 1)
  }
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])) } catch { /* A malformed unrelated schema is not a product. */ }
  }
  return found
}
export function parseShopifyProduct(raw: unknown, html: string, url: string): LinkProduct {
  const p = record(raw)
  if (!p.id || !text(p.title) || !Array.isArray(p.variants)) throw new Error("This link did not return a public Shopify product.")
  const schema = structuredProducts(html).find((v) => text(v.name) === text(p.title)) ?? structuredProducts(html)[0] ?? {}
  const offer = record(Array.isArray(schema.offers) ? schema.offers[0] : schema.offers)
  // Shopify's Ajax product prices are hundredths, including zero-decimal presentment currencies.
  const currency = text(offer.priceCurrency) || text(record(array(offer.offers)[0]).priceCurrency) || html.match(/Shopify\.currency\s*=\s*\{[^}]*["']?active["']?\s*:\s*["']([A-Z]{3})["']/)?.[1] || ""
  if (!/^[A-Z]{3}$/i.test(currency)) throw new Error("The store did not expose its currency. Import from a public product page that shows prices and currency.")
  const variants = p.variants as unknown[]
  if (variants.length > 100) throw new Error("This product has more than 100 variants. Reduce its variants before importing.")
  const mapped = variants.map((v): LinkVariant => {
    const r = record(v); const price = amount(r.price, 1)
    if (price === null) throw new Error("A variant's price is unavailable. Try another public product link.")
    return { name: text(r.title) || "Standard", priceCents: price, payWhatYouWant: false, options: array(r.options).map(text), sku: text(r.sku).slice(0, 100), compareAtCents: amount(r.compare_at_price, 1), image: importImageUrl(text(record(r.featured_image).src), url) }
  })
  const price = amount(p.price, 1)
  if (price === null || !mapped.length) throw new Error("The product has no available price or variants.")
  const images = imageList(p.images, url)
  const physical = variants.some((v) => record(v).requires_shipping === true)
  const options = array(p.options).map((v) => { const o = record(v); return { name: text(o.name), values: array(o.values).map(text).filter(Boolean) } }).filter((o) => o.name && o.values.length && !(o.name === "Title" && o.values[0] === "Default Title"))
  if (options.length > 3) throw new Error("Products can have at most three option groups.")
  return { source: "shopify", externalId: `${new URL(url).hostname}:${String(p.id)}`, url, title: text(p.title).slice(0, 200), descriptionHtml: text(p.description), priceCents: price, currency: currency.toUpperCase(), payWhatYouWant: false, images: images.slice(0, 20), variants: mapped, options, category: (text(schema.category) || text(p.type)).slice(0, 150) || null, vendor: text(p.vendor).slice(0, 150) || null, tags: array(p.tags).map(text).filter(Boolean).slice(0, 50), type: physical ? "physical" : "digital", warnings: [...(array(p.images).some((v) => !imageList([v], url).length) ? ["Some images use unsupported hosts. Add them in the editor before publishing."] : []), "Review stock, shipping and taxes before publishing. Public links do not expose private inventory or downloadable files.", ...(images.length > 20 ? ["Only the first 20 gallery images will be copied."] : [])] }
}

export function parseGumroadProduct(html: string, url: string): LinkProduct {
  const schemas = structuredProducts(html)
  const schema = schemas.find((p) => text(p.url).replace(/\/$/, "") === url.replace(/\/$/, "")) ?? schemas[0]
  // Gumroad embeds its public product props in JSON scripts. Never execute page scripts.
  let embedded: Raw = {}
  const visit = (v: unknown, depth = 0) => {
    if (depth > 12) return
    const r = record(v)
    const candidate = r.price_cents !== undefined && r.currency_code && r.name ? r : record(r.product)
    if (text(candidate.name) && (candidate.price_cents !== undefined || candidate.price !== undefined)) embedded = candidate
    for (const [k, x] of Object.entries(r)) if (["props", "pageProps", "data", "product", "product_information"].includes(k)) visit(x, depth + 1)
  }
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(m[1])) } catch { /* Unrelated script. */ }
  }
  const offer = record(Array.isArray(schema?.offers) ? schema.offers[0] : schema?.offers)
  const title = text(embedded.name) || text(schema?.name)
  const currency = (text(embedded.currency_code) || text(embedded.currency) || text(offer.priceCurrency)).toUpperCase()
  const embeddedPrice = amount(embedded.price_cents, 1)
  const price = (embeddedPrice === null ? null : gumroadToHundredths(embeddedPrice, currency)) ?? amount(offer.price) ?? amount(offer.lowPrice)
  if (!title || price === null || price > 100_000_000 || !/^[A-Z]{3}$/.test(currency)) throw new Error("Gumroad did not expose this product's price and details. Make sure the product is public and try again.")
  if (embedded.is_tiered_membership || embedded.subscription_duration || embedded.is_recurring_billing || embedded.is_legacy_subscription) throw new Error("Subscription products must be created as a paid community.")
  const versions = array(embedded.options).length ? array(embedded.options) : array(embedded.variants).length ? array(embedded.variants) : array(embedded.versions)
  let variantRows: unknown[] = versions
  if (versions.length === 1 && Array.isArray(record(versions[0]).options)) variantRows = array(record(versions[0]).options)
  if (variantRows.length > 100) throw new Error("This product has more than 100 variants.")
  const variants: LinkVariant[] = variantRows.map((v) => {
    const r = record(v)
    const difference = amount(r.price_difference_cents ?? r.price_difference, 1)
    const absolute = amount(r.price_cents, 1)
    const cents = absolute !== null ? gumroadToHundredths(absolute, currency) : difference !== null ? price + gumroadToHundredths(difference, currency) : null
    if (cents === null || cents > 100_000_000) throw new Error("Gumroad did not expose all version prices. Use the account importer for this product.")
    return { name: (text(r.name) || text(r.title) || "Standard").slice(0, 200), priceCents: cents, payWhatYouWant: r.is_pay_what_you_want === true }
  })
  const schemaImages = typeof schema?.image === "string" ? [schema.image] : schema?.image
  const images = imageList([...array(embedded.covers), ...array(embedded.preview_urls), ...array(schemaImages)])
  const description = text(embedded.description_html) || text(embedded.description) || text(schema?.description)
  return { source: "gumroad", externalId: text(embedded.id) || text(schema?.productID) || new URL(url).hostname + new URL(url).pathname, url, title: entities(title).slice(0, 200), descriptionHtml: description, priceCents: price, currency, payWhatYouWant: !!embedded.pwyw || embedded.customizable_price === true || embedded.is_pay_what_you_want === true, images: images.slice(0, 20), variants, options: [], category: (text(embedded.category) || text(schema?.category)).slice(0, 150) || null, vendor: null, tags: array(embedded.tags).map(text).filter(Boolean).slice(0, 50), type: embedded.is_physical || embedded.require_shipping ? "physical" : embedded.native_type === "course" ? "course" : "digital", warnings: ["Downloadable files and private course lessons cannot be fetched from a public link. Upload your files in the editor before publishing.", ...(!variants.length ? ["Only versions exposed by Gumroad's public page can be imported."] : []), ...(images.length > 20 ? ["Only the first 20 gallery images will be copied."] : [])] }
}
