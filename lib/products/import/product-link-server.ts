import "server-only"
/**
 * The network half of the link import (./product-link.ts reads what comes
 * back). Every request goes through fetchPublic: https only, public addresses
 * checked at connect time, a size and a time limit, and redirects counted.
 * A failure is said in words the seller can act on; transport details
 * (addresses, socket errors) are never passed on.
 */
import { fetchPublic } from "@/lib/api/public-fetch"
import {
  botWall, botWallMessage, productLink, parseShopifyProduct, parseGumroadProduct, parsePayhipProduct, parseShopifyCatalog,
  shopifyCurrency, shopifyJsonProduct, linkSource, type CatalogItem, type LinkProduct,
} from "./product-link"

const PAGE = { maxBytes: 4 * 1024 * 1024, timeoutMs: 12_000, maxRedirects: 3, httpsOnly: true } as const
/** Pages of /products.json read at most: 1,000 products. */
export const CATALOG_PAGES = 4
const CATALOG_PAGE_SIZE = 250

/** The network: fetchPublic, or a test's stand-in. */
export type Fetcher = typeof fetchPublic

/**
 * A message for the seller. The route passes these on as they are. `retryLater` is the store being busy or down rather
 * than this link being wrong: a store's list stops there instead of failing every product after it the same way.
 */
export class LinkImportError extends Error {
  constructor(message: string, readonly retryLater = false) { super(message) }
}

function statusError(status: number, what: "product" | "store"): LinkImportError {
  if (status === 404 || status === 410) return new LinkImportError(what === "product" ? "This product page was not found. Check the link and that the product is published." : "This store was not found. Check the address.")
  if (status === 401 || status === 403) return new LinkImportError("The store refused to share this page. Check that it opens without signing in, then try again.")
  if (status === 429) return new LinkImportError("The store is limiting requests right now. Wait a minute and try again.", true)
  if (status >= 500) return new LinkImportError("The store did not answer. Try again in a minute.", true)
  return new LinkImportError("The store could not be read. Check that the product is public and the link opens without signing in.")
}

/** Shopify sends a store with a password to /password: said plainly rather than as a wrong link. */
function passwordPage(url: URL): boolean {
  return /^(?:\/[a-z]{2}(?:-[a-z]{2})?)?\/password\/?$/i.test(url.pathname)
}

async function readPage(get: Fetcher, href: string, what: "product" | "store"): Promise<{ url: URL; html: string }> {
  const response = await get(href, PAGE)
  const url = new URL(response.url || href)
  if (passwordPage(url)) throw new LinkImportError("This store has a password. Open it to visitors, then try again.")
  const html = await response.text()
  /* Read before the status: Cloudflare's block answers 403, which alone would read as a page that needs signing in. */
  if (botWall(response.status, response.headers, html)) throw new LinkImportError(botWallMessage(linkSource(url)), true)
  if (!response.ok) throw statusError(response.status, what)
  return { url, html }
}

/**
 * JSON from the same store, or null: a missing, refused, moved or unreadable answer all mean "not here". A store
 * that is limiting requests or down is said as that, not as a store that does not share its products.
 */
async function storeJson(get: Fetcher, href: string, host: string, maxBytes: number): Promise<unknown | null> {
  let response: Response
  try {
    response = await get(href, { maxBytes, timeoutMs: 12_000, maxRedirects: 1, httpsOnly: true })
  } catch {
    return null
  }
  if (response.headers.get("cf-mitigated") === "challenge") throw new LinkImportError(botWallMessage(linkSource(href)), true)
  if (response.status === 429 || response.status >= 500) throw statusError(response.status, "product")
  try {
    if (!response.ok || new URL(response.url || href).hostname !== host) return null
    return JSON.parse(await response.text())
  } catch {
    return null
  }
}

export async function fetchProductLink(raw: unknown, get: Fetcher = fetchPublic): Promise<LinkProduct> {
  const asked = productLink(raw)
  const page = await readPage(get, asked.href, "product")
  /* Where the store sent us (a myshopify.com address to its own domain, a locale prefix) must still be a product page. */
  let url: URL
  try { url = productLink(page.url.href) } catch { throw new LinkImportError("The link opened a page that is not a product. Paste the product's own page link.") }
  const source = linkSource(url)
  /* Gumroad's public JSON first: the seller's own price and every version, also for a product whose page is a custom landing page with no props in it. */
  if (source === "gumroad") return parseGumroadProduct(page.html, url.href, await storeJson(get, `${url.href.replace(/\/$/, "")}.json`, url.hostname, 2 * 1024 * 1024) ?? undefined)
  if (source === "payhip") return parsePayhipProduct(page.html, url.href)
  const base = url.href.replace(/\/$/, "")
  /* /products/<handle>.js first (hundredths); a store that turned it off usually still answers .json (units). */
  const ajax = await storeJson(get, `${base}.js`, url.hostname, 2 * 1024 * 1024)
  if (ajax && Array.isArray((ajax as { variants?: unknown }).variants)) return parseShopifyProduct(ajax, page.html, url.href)
  const full = shopifyJsonProduct(await storeJson(get, `${base}.json`, url.hostname, 2 * 1024 * 1024))
  if (full) return parseShopifyProduct(full, page.html, url.href)
  throw new LinkImportError("This store does not share its product details for import. Shopify stores do; check the link is a Shopify product page.")
}

/** Every product a Shopify store lists publicly, up to CATALOG_PAGES pages, with the store's currency. */
export async function fetchShopifyCatalog(origin: string, get: Fetcher = fetchPublic): Promise<{ origin: string; currency: string; items: CatalogItem[]; truncated: boolean }> {
  const home = await readPage(get, `${origin}/`, "store")
  const at = home.url.origin
  const currency = shopifyCurrency(home.html)
  const pages: unknown[] = []
  let truncated = false
  for (let n = 1; n <= CATALOG_PAGES; n++) {
    const json = await storeJson(get, `${at}/products.json?limit=${CATALOG_PAGE_SIZE}&page=${n}`, home.url.hostname, 8 * 1024 * 1024)
    const rows = (json as { products?: unknown } | null)?.products
    if (!Array.isArray(rows)) {
      if (n === 1) throw new LinkImportError("This store does not list its products publicly. Paste one product's link instead.")
      break
    }
    pages.push(json)
    if (rows.length < CATALOG_PAGE_SIZE) break
    if (n === CATALOG_PAGES) truncated = true
  }
  const items = parseShopifyCatalog(pages, at)
  if (!currency && items.length) throw new LinkImportError("The store did not show its currency. Paste one product's link instead.")
  return { origin: at, currency, items, truncated }
}
