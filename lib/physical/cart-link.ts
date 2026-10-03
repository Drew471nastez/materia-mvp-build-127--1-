/**
 * A cart in a URL: ids and quantities only, for Buy now and for a website's
 * cart handing over to the physical checkout on storelib.com. The server
 * prices it again; nothing here is trusted beyond being well formed.
 */

export interface LinkItem {
  productId: string
  variantId: string | null
  quantity: number
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toBase64Url(text: string): string {
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : Buffer.from(text, "utf8").toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/")
  return typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, "base64").toString("utf8")
}

export function encodeItems(items: LinkItem[]): string {
  return toBase64Url(JSON.stringify(items.slice(0, 50).map((i) => [i.productId, i.variantId ?? "", Math.max(1, Math.min(999, Math.floor(i.quantity) || 1))])))
}

export function decodeItems(value: string | null | undefined): LinkItem[] {
  if (!value || value.length > 8000) return []
  try {
    const raw = JSON.parse(fromBase64Url(value))
    if (!Array.isArray(raw)) return []
    return raw
      .slice(0, 50)
      .filter((r): r is [string, string, number] => Array.isArray(r) && typeof r[0] === "string" && ID.test(r[0]))
      .map((r) => ({ productId: r[0], variantId: typeof r[1] === "string" && ID.test(r[1]) ? r[1] : null, quantity: Math.max(1, Math.min(999, Math.floor(Number(r[2])) || 1)) }))
  } catch {
    return []
  }
}

export function physicalCheckoutHref(shopId: string, items: LinkItem[], returnUrl?: string | null, base = ""): string {
  const params = new URLSearchParams({ shop: shopId, items: encodeItems(items) })
  if (returnUrl) params.set("return", returnUrl.slice(0, 500))
  return `${base}/checkout/physical?${params.toString()}`
}
