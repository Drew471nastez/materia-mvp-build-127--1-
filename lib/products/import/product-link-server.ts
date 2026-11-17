import "server-only"
import { fetchPublic } from "@/lib/api/public-fetch"
import { productLink, parseShopifyProduct, parseGumroadProduct, type LinkProduct } from "./product-link"

export async function fetchProductLink(raw: unknown): Promise<LinkProduct> {
  let url = productLink(raw)
  const response = await fetchPublic(url.href, { maxBytes: 4 * 1024 * 1024, timeoutMs: 12_000, maxRedirects: 2, httpsOnly: true })
  if (!response.ok) throw new Error("The store could not be read. Check that the product is public and the link opens without signing in.")
  url = productLink(response.url || url.href)
  const html = await response.text()
  if (url.hostname === "gumroad.com" || url.hostname.endsWith(".gumroad.com")) return parseGumroadProduct(html, url.href)
  const endpoint = new URL(url.href)
  endpoint.pathname = endpoint.pathname.replace(/\/$/, "") + ".js"
  const product = await fetchPublic(endpoint.href, { maxBytes: 2 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 0 })
  if (!product.ok) throw new Error("This Shopify store does not expose the product for import. Try its public product page.")
  return parseShopifyProduct(await product.json(), html, url.href)
}
