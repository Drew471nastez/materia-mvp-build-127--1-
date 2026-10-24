/**
 * A cart in a URL: ids and quantities only (and a pay what you want amount
 * a buyer named), for Buy now and for a website's cart handing over to the
 * physical checkout on storelib.com. The server prices it again; nothing
 * here is trusted beyond being well formed.
 */

/* Node's Buffer read through globalThis: a bare `Buffer` makes the bundler ship a 19 KB polyfill to every website's browser, which has atob/btoa anyway. */
type NodeBuffer = { from(input: string, encoding: string): { toString(encoding: string): string } }
const nodeBuffer = (): NodeBuffer => (globalThis as unknown as { Buffer: NodeBuffer }).Buffer

export interface LinkItem {
  productId: string
  variantId: string | null
  quantity: number
  /** A pay what you want amount the buyer named, held to the product's minimum by the server. */
  customPriceCents?: number
  /** Line item properties an imported theme's product form set (`properties[Engraving]`): the buyer's words for this line, kept on the order. */
  properties?: Record<string, string>
}

/** Line item properties as a link and the order may carry them: up to ten, a name up to 60 characters, a value up to 250, plain text. */
export function lineProperties(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= 10) break
    // eslint-disable-next-line no-control-regex
    const clean = (x: unknown, max: number) => (typeof x === "string" || typeof x === "number" ? String(x).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "")
    const name = clean(k, 60)
    const value = clean(v, 250)
    if (!name || !value || name === "__proto__" || name === "constructor" || name === "prototype") continue
    out[name] = value
  }
  return Object.keys(out).length ? out : undefined
}

/** The ceiling on a named amount, lib/checkout/pricing MAX_PWYW_CENTS. */
const MAX_CUSTOM_CENTS = 1_000_000

function customOf(value: unknown): number | null {
  const n = Number(value)
  return value !== null && value !== undefined && value !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_CUSTOM_CENTS ? n : null
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toBase64Url(text: string): string {
  const b64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(text))) : nodeBuffer().from(text, "utf8").toString("base64")
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/")
  return typeof atob === "function" ? decodeURIComponent(escape(atob(b64))) : nodeBuffer().from(b64, "base64").toString("utf8")
}

export function encodeItems(items: LinkItem[]): string {
  return toBase64Url(
    JSON.stringify(
      items.slice(0, 50).map((i) => {
        const row: unknown[] = [i.productId, i.variantId ?? "", Math.max(1, Math.min(999, Math.floor(i.quantity) || 1))]
        const custom = customOf(i.customPriceCents)
        const props = lineProperties(i.properties)
        if (custom !== null || props) row.push(custom ?? "")
        if (props) row.push(props)
        return row
      }),
    ),
  )
}

export function decodeItems(value: string | null | undefined): LinkItem[] {
  if (!value || value.length > 8000) return []
  try {
    const raw = JSON.parse(fromBase64Url(value))
    if (!Array.isArray(raw)) return []
    return raw
      .slice(0, 50)
      .filter((r): r is [string, string, number, (number | string)?, unknown?] => Array.isArray(r) && typeof r[0] === "string" && ID.test(r[0]))
      .map((r) => {
        const custom = customOf(r[3])
        const props = lineProperties(r[4])
        return {
          productId: r[0],
          variantId: typeof r[1] === "string" && ID.test(r[1]) ? r[1] : null,
          quantity: Math.max(1, Math.min(999, Math.floor(Number(r[2])) || 1)),
          ...(custom !== null ? { customPriceCents: custom } : {}),
          ...(props ? { properties: props } : {}),
        }
      })
  } catch {
    return []
  }
}

export function physicalCheckoutHref(shopId: string, items: LinkItem[], returnUrl?: string | null, base = ""): string {
  const params = new URLSearchParams({ shop: shopId, items: encodeItems(items) })
  if (returnUrl) params.set("return", returnUrl.slice(0, 500))
  return `${base}/checkout/physical?${params.toString()}`
}
