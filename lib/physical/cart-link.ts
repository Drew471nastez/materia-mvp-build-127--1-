/**
 * A cart in a URL: ids and quantities only (and a pay what you want amount
 * a buyer named), for Buy now and for a website's cart handing over to the
 * physical checkout on storelib.com. The server prices it again; nothing
 * here is trusted beyond being well formed.
 */
import { propertyText } from "@/lib/cart-uploads/rules"

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

/** How many properties one line keeps, and how long a name and a value may be. */
export const LINE_PROPERTIES_MAX = 20
export const LINE_PROPERTY_NAME_MAX = 64
export const LINE_PROPERTY_VALUE_MAX = 500

/**
 * Line item properties as a link and the order may carry them: up to 20, a
 * name up to 64 characters, a value up to 500, plain text (a number is
 * written as text; anything else is left out). They are the buyer's words
 * and a theme's notes (`_sl_offer_id`, `_sl_group`): kept and shown, never
 * read for a price. A value keeps its line breaks (a long text answer of a
 * personalization field, a two line gift message: lib/products/
 * personalization); every other control character is a space.
 */
export function lineProperties(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= LINE_PROPERTIES_MAX) break
    // eslint-disable-next-line no-control-regex
    const clean = (x: unknown, max: number) => (typeof x === "string" || typeof x === "number" ? String(x).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "")
    // eslint-disable-next-line no-control-regex
    const lines = (x: unknown, max: number) => (typeof x === "string" || typeof x === "number" ? String(x).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "")
    const name = clean(k, LINE_PROPERTY_NAME_MAX)
    const value = lines(v, LINE_PROPERTY_VALUE_MAX)
    if (!name || !value || name === "__proto__" || name === "constructor" || name === "prototype") continue
    out[name] = value
  }
  return Object.keys(out).length ? out : undefined
}

/** The same properties always read the same, whatever order they came in: "" for none. Two lines of one option with different keys are two lines. */
export function propertiesKey(props: Record<string, string> | null | undefined): string {
  const entries = Object.entries(props ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return entries.length ? JSON.stringify(entries) : ""
}

/**
 * The properties a buyer is shown: a name starting with "_" is the theme's
 * own (Shopify hides those), kept for the store only. An uploaded picture
 * (lib/cart-uploads/rules) is said by its file name, never its address.
 */
export function buyerProperties(props: Record<string, string> | null | undefined): [string, string][] {
  return Object.entries(props ?? {}).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, propertyText(v)])
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

/** The longest `items` a link may carry: past it the link is refused whole, never read in part. */
export const ITEMS_PARAM_MAX = 16_000

/**
 * The cart as a link's `items`: a JSON list, base64url, of
 *
 *   [productId, variantId, quantity]                    a plain line
 *   [productId, variantId, quantity, properties]        with its properties
 *   [productId, variantId, quantity, amount, props?]    a pay what you want amount
 *
 * The three element form is what every link written before carries, and is
 * read the same as ever; so is the old [.., "", properties] form.
 */
export function encodeItems(items: LinkItem[]): string {
  return toBase64Url(
    JSON.stringify(
      items.slice(0, 50).map((i) => {
        const row: unknown[] = [i.productId, i.variantId ?? "", Math.max(1, Math.min(999, Math.floor(i.quantity) || 1))]
        const custom = customOf(i.customPriceCents)
        const props = lineProperties(i.properties)
        if (custom !== null) row.push(custom)
        if (props) row.push(props)
        return row
      }),
    ),
  )
}

export function decodeItems(value: string | null | undefined): LinkItem[] {
  if (!value || value.length > ITEMS_PARAM_MAX) return []
  try {
    const raw = JSON.parse(fromBase64Url(value))
    if (!Array.isArray(raw)) return []
    return raw
      .slice(0, 50)
      .filter((r): r is [string, string, number, unknown?, unknown?] => Array.isArray(r) && typeof r[0] === "string" && ID.test(r[0]))
      .map((r) => {
        /* A fourth element that is an object is the line's properties; otherwise it is an amount (or "" for none) and the properties come fifth. */
        const fourthIsProps = !!r[3] && typeof r[3] === "object" && !Array.isArray(r[3])
        const custom = fourthIsProps ? null : customOf(r[3])
        const props = lineProperties(fourthIsProps ? r[3] : r[4])
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
