/**
 * ===========================================================================
 *  A WEBSITE'S CHECKOUT, ON THE WEBSITE'S OWN ADDRESS
 * ===========================================================================
 * A buyer on andrews.storelib.com, or on a domain its creator connected,
 * pays on that same address: https://<site host>/checkout. Storelib's own
 * checkout page (app/checkout/site), drawn the way the Explore checkout is,
 * with the website's logo at the top and Back to the site. The cookies, the
 * site's customer account (lib/site-accounts) and the address bar are the
 * creator's, never storelib.com's.
 *
 *   /checkout?items=…        a cart, or one product's Buy it now
 *   /checkout?productId=…    a Buy button (lib/orders/checkout-origin)
 *   /checkout                the whole cart: an imported theme's cookie, or
 *                            a built site's cart in this browser
 *   /checkout/thanks/<token> after paying, on the site too
 *
 * The link carries ids and quantities and nothing else that is believed:
 * every line is priced again on the server (lib/checkout/pricing priceCart,
 * lib/physical/checkout-pricing-server), Back is held to this same site, and
 * the shop is the one the HOST belongs to (lib/site-accounts/hosts
 * siteOwnerOfHost), never one the link names.
 *
 * Pure: the proxy, the site's cart code, the page, the route and the tests
 * all read and write the same addresses with it.
 */
import { decodeItems, encodeItems, type LinkItem } from "@/lib/physical/cart-link"
import type { CheckoutConfig, FieldRule } from "@/lib/store/checkout-config"
import type { ShippingProfile } from "@/lib/physical/types"
import { phoneForStorage } from "@/lib/account/phone"

export const SITE_CHECKOUT_PATH = "/checkout"
export const SITE_THANKS_PATH = "/checkout/thanks"
/** Track your order without an account: the order number and email, the link emailed (app/checkout/site/track). */
export const SITE_TRACK_PATH = "/checkout/track"
/** Where the proxy sends a site host's /checkout inside the app (app/checkout/site). */
export const SITE_CHECKOUT_ROUTE = "/checkout/site"

/** `cart=1`: the whole cart was sent, so it is emptied once paid. A Buy it now is not. */
export const WHOLE_CART_PARAM = "cart"

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SiteCheckoutLink {
  /** The site's origin (https://andrews.storelib.com), or "" for an address on the page's own host. */
  origin?: string
  items: LinkItem[]
  /** A path on the same site to go Back to (the cart). */
  back?: string | null
  couponCode?: string | null
  wholeCart?: boolean
  /** The cart's note (a theme's "Order special instructions"): the checkout's note for the shop starts with it. */
  note?: string | null
  /** The cart's attributes (a theme's gift message, delivery date): kept on the order as Shopify keeps cart.attributes. */
  attributes?: Record<string, string> | null
  /** What the website knows about the visit, for the order's Source (lib/orders/checkout-origin). */
  visit?: { from?: string | null; utm_source?: string | null; utm_campaign?: string | null; touches?: string | null } | null
}

/** A path on the site, or null: never another host, never the API. */
export function sitePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.length > 500) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return null
  if (raw === "/api" || raw.startsWith("/api/") || raw.startsWith("/api?")) return null
  return raw
}

export function siteCheckoutHref(link: SiteCheckoutLink): string {
  const params = new URLSearchParams()
  if (link.items.length) params.set("items", encodeItems(link.items))
  const back = sitePath(link.back)
  if (back) params.set("return", back)
  const code = typeof link.couponCode === "string" ? link.couponCode.trim().slice(0, 64) : ""
  if (code) params.set("code", code)
  if (link.wholeCart) params.set(WHOLE_CART_PARAM, "1")
  const note = cartNote(link.note)
  if (note) params.set("note", note)
  const attrs = cartAttributes(link.attributes)
  if (attrs) params.set("attributes", JSON.stringify(attrs))
  const v = link.visit ?? {}
  const add: Array<[string, unknown, number]> = [
    ["ref", v.from, 64],
    ["utm_source", v.utm_source, 120],
    ["utm_campaign", v.utm_campaign, 120],
    ["sl_at", v.touches, 2000],
  ]
  for (const [key, value, max] of add) {
    if (typeof value === "string" && value.trim() && value.length <= max) params.set(key, value.trim())
  }
  const q = params.toString()
  return `${link.origin ?? ""}${SITE_CHECKOUT_PATH}${q ? `?${q}` : ""}`
}

export interface SiteCheckoutParams {
  items: LinkItem[]
  /** A Buy button's product, turned into a one line cart by the page. */
  productId: string | null
  variantId: string | null
  customPriceCents: number | null
  back: string | null
  couponCode: string | null
  wholeCart: boolean
  /** The cart's note, for the checkout's note to the shop. */
  note: string | null
  /** The cart's attributes, for the order. */
  attributes: Record<string, string> | null
}

/** The checkout's own limit on a note to the shop (app/checkout/site/site-checkout.tsx). */
export const CART_NOTE_MAX = 1000

/** A cart note as the checkout may take it: plain text, trimmed, at most CART_NOTE_MAX characters, or null. */
export function cartNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  // eslint-disable-next-line no-control-regex
  const v = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, CART_NOTE_MAX)
  return v || null
}

/**
 * The buyer's note as the order keeps it: a cart note's rules with its line
 * breaks kept (a gift message is often two lines, and the order page, the
 * packing slip and the seller's email show them), spaces run together, and
 * no angle brackets, as every other text a buyer types onto an order.
 */
export function orderNote(raw: unknown): string | null {
  const v = cartNote(raw)
  if (!v) return null
  const out = v.replace(/[<>]/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  return out || null
}

/*
 * A BASKET OF DOWNLOADS CARRIES ITS NOTE ON THE PAYMENT. Its order rows are
 * written from the PaymentIntent's metadata (lib/checkout/fulfil-cart-session),
 * by the page or by the webhook, so the note rides there. Stripe keeps a
 * value to 500 characters: a note up to CART_NOTE_MAX goes in two parts, cut
 * where no character is split in half.
 */
export const NOTE_METADATA_KEYS = ["buyer_note", "buyer_note_2"] as const
const STRIPE_VALUE_MAX = 500

function cutAt(s: string, max: number): number {
  if (s.length <= max) return s.length
  const code = s.charCodeAt(max - 1)
  return code >= 0xd800 && code <= 0xdbff ? max - 1 : max
}

export function noteToMetadata(raw: unknown): Record<string, string> {
  const note = orderNote(raw)
  if (!note) return {}
  const first = cutAt(note, STRIPE_VALUE_MAX)
  const rest = note.slice(first)
  return rest ? { buyer_note: note.slice(0, first), buyer_note_2: rest.slice(0, cutAt(rest, STRIPE_VALUE_MAX)) } : { buyer_note: note }
}

export function noteFromMetadata(metadata: Record<string, string | undefined> | null | undefined): string | null {
  if (!metadata) return null
  return orderNote(`${metadata.buyer_note ?? ""}${metadata.buyer_note_2 ?? ""}`)
}

/*
 * CART ATTRIBUTES AND LINE ITEM PROPERTIES, as an imported Shopify theme
 * sets them (/cart/update.js `attributes[Gift message]`, a product form's
 * `properties[Engraving]`). They are the buyer's words for the seller, so
 * they are kept plain and small: at most CART_ATTRIBUTES_MAX names, a name
 * up to 100 characters, a value up to 500, no control characters. A name
 * starting with "_" is the theme's own (Shopify hides those from the buyer);
 * it is kept for the seller and left out of what the buyer is shown.
 */
export const CART_ATTRIBUTES_MAX = 20
export const LINE_PROPERTIES_MAX = 10

function plainText(v: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : ""
}

/** Name and value pairs as the checkout and the order may keep them, or null when there are none. A JSON string is read too. */
export function cartAttributes(raw: unknown, most = CART_ATTRIBUTES_MAX): Record<string, string> | null {
  let v = raw
  if (typeof v === "string") {
    if (v.length > 20_000) return null
    try {
      v = JSON.parse(v)
    } catch {
      return null
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null
  const out: Record<string, string> = {}
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(out).length >= most) break
    const name = plainText(k, 100)
    const text = plainText(value, 500)
    if (!name || !text || name === "__proto__" || name === "constructor" || name === "prototype") continue
    out[name] = text
  }
  return Object.keys(out).length ? out : null
}

/** What the buyer is shown of them: the theme's own (a name starting with "_") left out. */
export function visibleAttributes(a: Record<string, string> | null | undefined): [string, string][] {
  return Object.entries(a ?? {}).filter(([k]) => !k.startsWith("_"))
}

/** The page's reading of its own address: well formed or left out, nothing more. */
export function readSiteCheckoutParams(q: { get(key: string): string | null }): SiteCheckoutParams {
  const productId = q.get("productId")
  const variantId = q.get("variantId")
  const custom = q.get("customPrice")
  const n = custom === null || custom === "" ? NaN : Number(custom)
  const code = (q.get("code") ?? q.get("discountCode") ?? "").trim().slice(0, 64)
  /* A Buy button names where it came from in `cancel` (and `return` for after paying); a cart in `return`. */
  const back = sitePath(q.get("return")) ?? sitePath(q.get("cancel")) ?? sitePath(q.get("from"))
  return {
    items: decodeItems(q.get("items")),
    productId: productId && ID.test(productId) ? productId : null,
    variantId: variantId && ID.test(variantId) ? variantId : null,
    customPriceCents: Number.isInteger(n) && n >= 0 && n <= 1_000_000 ? n : null,
    back,
    couponCode: code || null,
    wholeCart: q.get(WHOLE_CART_PARAM) === "1",
    note: cartNote(q.get("note")),
    attributes: cartAttributes(q.get("attributes")),
  }
}

/** A full address on another host, narrowed to its path when it is this site's own. */
export function sameSitePath(raw: unknown, siteHost: string): string | null {
  if (typeof raw !== "string" || !raw) return null
  if (raw.startsWith("/")) return sitePath(raw)
  try {
    const u = new URL(raw)
    if (u.host.toLowerCase() !== siteHost.toLowerCase()) return null
    return sitePath(`${u.pathname}${u.search}`)
  } catch {
    return null
  }
}

/** The checkout's own pages, the sign in and the password page: never a place Back goes to, whatever the browser came from. */
const NOT_A_PAGE_TO_GO_BACK_TO = /^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,4})?\/)?(?:checkout|account|password|receipt|cart\/(?:add|change|update|clear))(?:[/?#.]|$)/i

/**
 * WHERE BACK GOES (the owner: exactly where the buyer came from). The page
 * the link names first: a Buy button's own page (`cancel`, the full address
 * with its language and its options), then the path a cart or a theme names
 * (`return`, `from`); with none, the page of this site the browser came
 * from (a theme's plain /checkout link, a cart drawer's form). Null: the
 * checkout's own default (the cart for a whole cart, else the home page).
 */
export function siteCheckoutBack(q: { get(key: string): string | null }, siteHost: string, referer: string | null | undefined): string | null {
  const named = sameSitePath(q.get("cancel"), siteHost) ?? sitePath(q.get("return")) ?? sitePath(q.get("from")) ?? sameSitePath(q.get("return"), siteHost)
  if (named) return named
  const came = sameSitePath(referer, siteHost)
  return came && !NOT_A_PAGE_TO_GO_BACK_TO.test(came) ? came : null
}

export function siteThanksHref(receiptToken: string, opts: { whole?: boolean } = {}): string {
  return `${SITE_THANKS_PATH}/${encodeURIComponent(receiptToken)}${opts.whole ? `?${WHOLE_CART_PARAM}=1` : ""}`
}

/* ===========================================================================
 *  WHO MAY PAY: SETTINGS › CHECKOUT, ON A WEBSITE
 * ===========================================================================
 * "Require customers to sign in" means the website's own customer account
 * there (lib/site-accounts), not a Storelib login: the buyer signs in on the
 * site, with the code emailed to them, before Pay. That code is the
 * confirmation: an account on a website is only ever made by typing back a
 * code sent to its address, so "Require a confirmed email address" is met by
 * signing in, and the order goes to that address and no other.
 */
export interface SiteBuyer {
  email: string
  name: string | null
}

export type SiteGate = { kind: "open"; lockedEmail: string | null } | { kind: "sign-in" }

export function siteGate(config: Pick<CheckoutConfig, "requireAccount" | "requireConfirmedEmail">, buyer: SiteBuyer | null): SiteGate {
  const needsAccount = config.requireAccount || config.requireConfirmedEmail
  if (needsAccount && !buyer) return { kind: "sign-in" }
  return { kind: "open", lockedEmail: needsAccount && buyer ? buyer.email : null }
}

/** The site's own sign in page, coming back to this checkout (lib/site-accounts/hosts returnPathOf holds it to 512 characters). */
export function siteSignInHref(checkoutPath: string): string {
  const back = checkoutPath.length <= 500 && sitePath(checkoutPath) ? checkoutPath : SITE_CHECKOUT_PATH
  return `/account/login?return=${encodeURIComponent(back)}`
}

/* ===========================================================================
 *  WHICH FIELDS: SETTINGS › CHECKOUT › CUSTOMER INFORMATION
 * ===========================================================================
 * One plan for every checkout, so a field turned off is gone everywhere and
 * a field made required is required everywhere, the page and the server:
 *
 *   email      always
 *   name       one Full name, or First and Last apart
 *   company    physical orders only: off, optional or required
 *   phone      physical orders only (a pickup, and a thing handed over in
 *              person too): off, optional or required
 *   address 2  physical orders only: off, optional or required
 *   news box   when the store shows it, under the email, never ticked
 */
export interface FieldPlan {
  splitName: boolean
  company: FieldRule
  phone: FieldRule
  address2: FieldRule
  address: boolean
  newsBox: boolean
}

export function fieldPlan(config: CheckoutConfig, order: { ships: boolean; pickup?: boolean; physical?: boolean }): FieldPlan {
  const ships = order.ships
  const pickup = ships && !!order.pickup
  return {
    splitName: config.nameFields === "first_and_last",
    company: ships && !pickup ? config.company : "off",
    /* "Physical orders": a thing handed over in person (nothing to ship) is still one, and the shop may need to call. */
    phone: ships || order.physical ? config.phone : "off",
    address2: ships && !pickup ? config.address2 : "off",
    address: ships && !pickup,
    newsBox: config.marketingOptIn,
  }
}

/** What a buyer typed, against the plan: the first field that is missing, or null. */
export function missingField(
  plan: FieldPlan,
  v: { email: string; first: string; last: string; company?: string; phone?: string; line2?: string },
): "email" | "name" | "last" | "company" | "phone" | "line2" | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) return "email"
  if (!v.first.trim()) return "name"
  if (plan.splitName && !v.last.trim()) return "last"
  if (plan.company === "required" && !(v.company ?? "").trim()) return "company"
  if (plan.phone === "required" && !(v.phone ?? "").trim()) return "phone"
  /* Written, but not a phone number (lib/account/phone): the same rule the order is kept by. */
  if (plan.phone !== "off" && (v.phone ?? "").trim() && !phoneForStorage(v.phone)) return "phone"
  if (plan.address2 === "required" && !(v.line2 ?? "").trim()) return "line2"
  return null
}

/** A one line summary of a cart for a reminder and the order list: "Hoodie", "Hoodie and 2 more". */
export function basketTitle(titles: string[]): string {
  const clean = titles.map((t) => t.trim()).filter(Boolean)
  if (clean.length === 0) return "Your order"
  if (clean.length === 1) return clean[0].slice(0, 200)
  return `${clean[0].slice(0, 160)} and ${clean.length - 1} more`
}

/* ===========================================================================
 *  WHAT A WEBSITE'S HOST DOES WITH A CHECKOUT ADDRESS (proxy.ts)
 * ===========================================================================
 * On a creator's published website (its subdomain, or a domain connected
 * for it) these addresses are served on that host instead of being sent to
 * storelib.com:
 *
 *   /checkout                 the checkout (app/checkout/site); a form that
 *                             posts here is sent on to it as a GET
 *   /checkout/thanks/<token>  the thank you page
 *   /checkout/track           Track your order: number and email, the link
 *                             to the order emailed to that email
 *   /checkout/cart, /checkout/physical
 *                             the old links (bookmarks, emails, a cached
 *                             cart script), sent to /checkout with their cart
 *   /checkout/physical/order/<token>, /receipt/<token>
 *                             the order page and the receipt, on the site
 *
 * Anything else under /checkout is left to the platform as before. Pure, so
 * tests/site-checkout.test.ts runs every branch.
 */
export type SiteCheckoutRoute =
  | { kind: "rewrite"; path: string }
  | { kind: "redirect"; to: string; status: 302 | 303 }
  | { kind: "pass" }

export function siteCheckoutRouteFor(pathname: string, search: string, method: string, host: string): SiteCheckoutRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === SITE_CHECKOUT_PATH) {
    if (method.toUpperCase() === "POST") return { kind: "redirect", to: `${SITE_CHECKOUT_PATH}${search}`, status: 303 }
    return { kind: "rewrite", path: `${SITE_CHECKOUT_ROUTE}${search}` }
  }
  if (path.startsWith(`${SITE_THANKS_PATH}/`)) {
    const token = path.slice(SITE_THANKS_PATH.length + 1)
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(token)) return null
    return { kind: "rewrite", path: `${SITE_CHECKOUT_ROUTE}/thanks/${token}${search}` }
  }
  if (path === SITE_TRACK_PATH) {
    if (method.toUpperCase() === "POST") return { kind: "redirect", to: SITE_TRACK_PATH, status: 303 }
    return { kind: "rewrite", path: `${SITE_CHECKOUT_ROUTE}/track${search}` }
  }
  if (path === `${SITE_CHECKOUT_ROUTE}/track`) return { kind: "redirect", to: `${SITE_TRACK_PATH}${search}`, status: 302 }
  /* The page's own inside address, asked for directly: sent to its public one, so the site's password is asked as for /checkout. */
  if (path === SITE_CHECKOUT_ROUTE) return { kind: "redirect", to: `${SITE_CHECKOUT_PATH}${search}`, status: 302 }
  if (path.startsWith(`${SITE_CHECKOUT_ROUTE}/thanks/`)) return { kind: "redirect", to: `${SITE_THANKS_PATH}/${path.slice(SITE_CHECKOUT_ROUTE.length + "/thanks/".length)}${search}`, status: 302 }
  if (path.startsWith(`${SITE_CHECKOUT_ROUTE}/`)) return { kind: "redirect", to: `${SITE_CHECKOUT_PATH}${search}`, status: 302 }
  if (path === "/checkout/cart" || path === "/checkout/physical") {
    const q = new URLSearchParams(search)
    const back = sameSitePath(q.get("return"), host)
    return {
      kind: "redirect",
      status: 302,
      to: siteCheckoutHref({
        items: decodeItems(q.get("items")),
        back,
        couponCode: q.get("code"),
        wholeCart: q.get(WHOLE_CART_PARAM) === "1" || (path === "/checkout/physical" && /^\/(?:[a-z]{2,3}(?:-[a-z0-9]{2,4})?\/)?cart$/i.test((back ?? "").split("?")[0])),
        visit: { from: q.get("ref"), utm_source: q.get("utm_source"), utm_campaign: q.get("utm_campaign"), touches: q.get("sl_at") },
      }),
    }
  }
  if (path.startsWith("/checkout/physical/order/")) return { kind: "pass" }
  if (path === "/receipt" || path.startsWith("/receipt/")) return { kind: "pass" }
  return null
}

/** An address on storelib.com's old basket checkout, sent on to the website's own (app/checkout/cart): the cart, Back and the code kept. */
export function legacyBasketTarget(siteOrigin: string, q: { get(key: string): string | null }, siteHost: string): string {
  return siteCheckoutHref({
    origin: siteOrigin,
    items: decodeItems(q.get("items")),
    back: sameSitePath(q.get("return"), siteHost),
    couponCode: q.get("code"),
    wholeCart: q.get(WHOLE_CART_PARAM) === "1",
    visit: { from: q.get("ref"), utm_source: q.get("utm_source"), utm_campaign: q.get("utm_campaign"), touches: q.get("sl_at") },
  })
}

/**
 * The page is on a creator's website (its subdomain or a domain connected
 * for it), not on storelib.com, a preview deployment or a developer's
 * machine: the host where /checkout is the website's own. The server decides
 * for real (siteOfHost); this only picks which link a cart writes.
 */
export function onWebsiteHost(hostname: string, mainDomain: string, pathname = "/"): boolean {
  /* A preview link (/preview/<token>) is a site not published yet, or not as it is shown: its host has no checkout of its own. */
  if (pathname === "/preview" || pathname.startsWith("/preview/")) return false
  const h = hostname.toLowerCase().split(":")[0]
  const main = mainDomain.toLowerCase().split(":")[0]
  if (!h || h === main || h === `www.${main}` || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")) return false
  return true
}

/* ===========================================================================
 *  CHANGING THE ORDER ON THE CHECKOUT ITSELF
 * ===========================================================================
 * Each line of the summary has - / + and Remove, as a shop's checkout does.
 * The page only changes the ids and quantities it sends; the server prices
 * the result again (stock, the per order limit, shipping, tax, the code) and
 * its quote says how far each line may go (`maxQuantity`). Pure, so the
 * page, the route and the tests agree on what a change does.
 */

/** The most one line of a checkout may hold (lib/physical/checkout-pricing-server MAX_LINE_QUANTITY). */
export const LINE_QUANTITY_MAX = 999

/** Is this cart item the line the server priced? A line with no option sent is the product's only option, which the server names. */
export function sameLine(item: Pick<LinkItem, "productId" | "variantId">, line: { productId: string; variantId: string | null }): boolean {
  return item.productId === line.productId && ((item.variantId ?? null) === (line.variantId ?? null) || item.variantId === null)
}

/** The cart with one line set to `quantity`: 0 (or less) removes it, the rest held to 1..max. Items the line doesn't match are kept as they are. */
export function setLineQuantity(items: LinkItem[], line: { productId: string; variantId: string | null }, quantity: number, max = LINE_QUANTITY_MAX): LinkItem[] {
  const q = Math.floor(Number(quantity))
  const at = items.findIndex((i) => sameLine(i, line))
  if (at < 0) return items
  if (!Number.isFinite(q) || q <= 0) return items.filter((i) => !sameLine(i, line))
  const capped = Math.max(1, Math.min(q, Math.max(1, Math.min(LINE_QUANTITY_MAX, max))))
  /* The same line sent twice (a theme's cart keeps one per set of properties) becomes one, as the server counts it. */
  return items.flatMap((i, n) => (!sameLine(i, line) ? [i] : n === at ? [{ ...i, quantity: capped }] : []))
}

/**
 * The cart with one line changed to another option of its product (a size,
 * an edition), keeping its quantity and properties. Already in the cart as
 * that option: the two become one line, their quantities together (held to
 * the line maximum; the quote holds them to stock and the per order limit).
 * A line at its own price never reaches here (the quote offers it nothing).
 */
export function setLineVariant(items: LinkItem[], line: { productId: string; variantId: string | null }, variantId: string): LinkItem[] {
  if (!variantId || (line.variantId ?? null) === variantId) return items
  const at = items.findIndex((i) => sameLine(i, line))
  if (at < 0) return items
  const moving = items[at]
  const target = items.findIndex((i, n) => n !== at && i.productId === line.productId && i.variantId === variantId)
  if (target < 0) return items.map((i, n) => (n === at ? { ...i, variantId } : i))
  const quantity = Math.min(LINE_QUANTITY_MAX, items[target].quantity + moving.quantity)
  return items.flatMap((i, n) => (n === at ? [] : n === target ? [{ ...i, quantity }] : [i]))
}

/** The cart in the order the server returned quantities for: `adjusted` (a line over its per order limit) replaces what was asked. */
export function applyAdjusted(items: LinkItem[], adjusted: { productId: string; variantId: string | null; quantity: number }[] | undefined): LinkItem[] {
  if (!adjusted || adjusted.length === 0) return items
  let next = items
  for (const a of adjusted) next = setLineQuantity(next, a, a.quantity)
  return next
}

/** An imported theme's cart cookie lines, changed to match the checkout: removed lines leave it, a changed quantity is its first entry's. Nothing is ever added. */
export function themeCartAfter<E extends { p: string; v: string | null; q: number }>(entries: E[], items: Pick<LinkItem, "productId" | "variantId" | "quantity">[]): E[] {
  const seen = new Set<string>()
  const out: E[] = []
  for (const e of entries) {
    const item = items.find((i) => i.productId === e.p && ((i.variantId ?? null) === (e.v ?? null) || i.variantId === null || e.v === null))
    if (!item) continue
    const key = `${e.p}::${e.v ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...e, q: Math.max(1, Math.min(LINE_QUANTITY_MAX, Math.floor(item.quantity) || 1)) })
  }
  /* A line changed to another option at checkout: the theme's entry for that product takes the new option, with its properties, rather than going. */
  for (const i of items) {
    if (!i.variantId || out.some((o) => o.p === i.productId && (o.v ?? null) === i.variantId)) continue
    const was = entries.find((e) => e.p === i.productId && !out.some((o) => o.p === e.p && (o.v ?? null) === (e.v ?? null)))
    if (!was) continue
    out.push({ ...was, v: i.variantId, q: Math.max(1, Math.min(LINE_QUANTITY_MAX, Math.floor(i.quantity) || 1)) })
  }
  return out
}

/**
 * The countries a cart of these shipping profiles can go to, from Settings ›
 * Shipping: every zone with a rate turned on, a zone of states counting for
 * its country (the state is then asked), and the countries a location
 * delivers to locally. Each profile in the cart has to reach the country,
 * so it is what they share. Null: anywhere (a Rest of world zone with a
 * rate). The server still prices the address; this only lists the choices.
 */
export function shipsToCountries(profiles: ShippingProfile[], profileIds: (string | null)[], localCountries: string[] = []): string[] | null {
  const fallback = profiles.find((p) => p.isDefault) ?? profiles[0] ?? null
  const used = [...new Set(profileIds.map((id) => profiles.find((p) => p.id === id) ?? fallback).filter((p): p is ShippingProfile => !!p))]
  const local = [...new Set(localCountries.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))]
  let shared = null as Set<string> | null
  let anyProfile = false
  for (const p of used) {
    anyProfile = true
    const live = p.zones.filter((z) => z.rates.some((r) => r.active))
    if (live.some((z) => z.restOfWorld)) continue
    const mine = new Set<string>()
    for (const z of live) {
      for (const c of z.countries) mine.add(c.toUpperCase())
      for (const r of z.regions ?? []) mine.add(r.split("-")[0].toUpperCase())
    }
    const before: Set<string> | null = shared
    shared = before === null ? mine : new Set([...before].filter((c) => mine.has(c)))
  }
  if (anyProfile && shared === null) return null
  return [...new Set([...(shared ?? []), ...local])].sort()
}
