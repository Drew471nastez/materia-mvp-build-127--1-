/**
 * Social preview for /checkout, on storelib.com or a creator's own domain.
 * The product's cover, title and description. Storelib's name and logo only
 * when there is no product to describe. The address is the host that served
 * the page, never rewritten to storelib.com.
 */
import { plainSummary } from "@/lib/html-entities"
import { storelibLogoUrl } from "@/lib/brand/logo"

export function checkoutOrigin(input: { host?: string | null; forwardedHost?: string | null; proto?: string | null }): string {
  const raw = (input.forwardedHost || input.host || "storelib.com").split(",")[0].trim().toLowerCase()
  const local = raw.startsWith("localhost") || raw.startsWith("127.0.0.1")
  const proto = local ? "http" : (input.proto || "https").split(",")[0].trim() === "http" ? "http" : "https"
  return `${proto}://${raw}`
}

export function checkoutCanonical(origin: string, query: { productId?: string | null; variantId?: string | null }): string {
  const url = new URL("/checkout", origin)
  if (query.productId) url.searchParams.set("productId", query.productId)
  if (query.variantId) url.searchParams.set("variantId", query.variantId)
  return url.toString()
}

export function checkoutShareTitle(productTitle: string | null | undefined): string {
  const title = (productTitle || "").replace(/\s+/g, " ").trim()
  return title || "Checkout"
}

/** Product words, then the creator or store, cut short enough for a preview. */
export function checkoutShareDescription(description: string | null | undefined, creatorName: string | null | undefined): string {
  const body = plainSummary(description, 140)
  const name = (creatorName || "").replace(/\s+/g, " ").trim()
  if (body && name) {
    const line = `${body} — ${name}`
    return line.length <= 180 ? line : plainSummary(line, 180)
  }
  if (body) return body
  if (name) return name
  return "Checkout"
}

export function checkoutCoverUrl(input: { thumbnailUrl?: string | null; galleryUrls?: unknown }): string | null {
  const gallery = Array.isArray(input.galleryUrls) ? input.galleryUrls : []
  const candidates = [input.thumbnailUrl, ...gallery]
  for (const item of candidates) {
    if (typeof item !== "string") continue
    const url = item.trim()
    if (url.startsWith("https://") || url.startsWith("http://")) return url
  }
  return null
}

export function checkoutSiteName(host: string, creatorName: string | null | undefined): string {
  const name = (creatorName || "").replace(/\s+/g, " ").trim()
  if (name) return name
  const bare = host.split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "")
  if (bare === "storelib.com" || bare.endsWith(".storelib.com")) return "Storelib"
  return bare || "Checkout"
}

/** The product cover, or the Storelib logo when there is no product picture. */
export function checkoutShareImage(cover: string | null): string {
  return cover || storelibLogoUrl()
}
