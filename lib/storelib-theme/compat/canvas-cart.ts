/**
 * ===========================================================================
 *  THE CART, AND EVERYTHING ELSE A THEME'S SCRIPTS ASK FOR, IN THE CANVAS
 * ===========================================================================
 * The canvas draws an imported theme's page in a frame with no origin of its
 * own (components/website-builder/compat/compat-canvas.tsx). A theme's
 * scripts there still ask the site for things: /cart/add.js when Add to cart
 * is pressed, ?sections= for the drawer drawn again, /products/<handle>.js,
 * /search/suggest, a quick view's ?view=. Sent to the network, each went to
 * the builder's own host, failed, and left the button spinning or disabled.
 *
 * So the frame's bridge (./canvas-bridge.ts) hands each one to the builder
 * by postMessage, and the builder answers it here, with the same function
 * the live site answers with (./site.ts, answer), from the page being
 * edited, the shop's products and a cart that lives in the builder's memory
 * for as long as it is open. Add to cart, the drawer, quantities and Remove
 * work as on the website.
 *
 * CHECKOUT DOES NOT. Nothing is bought from the builder: a request that
 * would go to checkout (Check out in the drawer or on the cart page, Buy it
 * now, a link to /checkout, a cart permalink) is answered with `checkout`
 * and the builder says, in a toast, that checkout opens on the live site.
 *
 * Pure apart from `answer`, so the tests drive it as the canvas does.
 */
import { answer, type CartEntry, type SiteData, type SiteResponse } from "./site"
import { groupSections, type CompatTheme } from "./theme"
import type { StoredSection } from "./page"

type O = Record<string, unknown>

export interface CanvasCart {
  cart: CartEntry[]
  note: string
}

export interface CanvasRequest {
  method: string
  /** Path and query on the website, as the bridge read it. */
  url: string
  /** The body as fields, read as the live route reads it. */
  body: O | null
  ajax: boolean
}

export interface CanvasAnswer {
  status: number
  type: string
  body: string
  /** The request was for checkout: nothing was done, and the builder says checkout is on the live site. */
  checkout?: true
  /** A form posted to the cart is sent on to this page, as on the website (the builder opens it). */
  redirectedTo?: string
}

const ORIGIN = "http://canvas.invalid"

function pathOf(url: string): { path: string; query: URLSearchParams } {
  try {
    const u = new URL(url, ORIGIN)
    return { path: u.pathname, query: u.searchParams }
  } catch {
    return { path: "/", query: new URLSearchParams() }
  }
}

/** Whether a request is one that goes to checkout on the website. */
export function isCheckoutRequest(method: string, url: string, body: O | null, ajax: boolean): boolean {
  const { path } = pathOf(url)
  const p = path.replace(/\/+$/, "") || "/"
  if (p === "/checkout" || p.startsWith("/checkout/") || p === "/cart/checkout") return true
  if (/^\/cart\/[^/]+:\d+(?:,[^/]+:\d+)*$/.test(p)) return true
  const posted = method.toUpperCase() === "POST"
  if (posted && !ajax && body && body.checkout !== undefined && /^\/cart(?:\/(?:add|update))?(?:\.js|\.json)?$/.test(p)) return true
  return false
}

const redirectOf = (r: SiteResponse): string | null => (r.status >= 300 && r.status < 400 ? r.headers?.Location ?? null : null)

/**
 * One request from the canvas, answered as the website would answer it, and
 * the cart after it. A redirect is followed (a form posted to /cart/add
 * lands on /cart), and where it went is said, for the builder to open.
 */
export async function answerInCanvas(site: SiteData, state: CanvasCart, req: CanvasRequest, referer: string): Promise<{ answer: CanvasAnswer; state: CanvasCart }> {
  const method = (req.method || "GET").toUpperCase()
  if (isCheckoutRequest(method, req.url, req.body, req.ajax)) return { answer: { status: 200, type: "text/html; charset=utf-8", body: "", checkout: true }, state }
  const first = pathOf(req.url)
  let r = await answer(site, { method, path: first.path, query: first.query, body: req.body, cart: state.cart, note: state.note, ajax: req.ajax, referer })
  let next: CanvasCart = r.cart ? { cart: r.cart, note: r.note ?? state.note } : state
  let redirectedTo: string | undefined
  for (let hops = 0; hops < 3; hops++) {
    const to = redirectOf(r)
    if (!to) break
    redirectedTo ??= to
    if (isCheckoutRequest("GET", to, null, false)) return { answer: { status: 200, type: "text/html; charset=utf-8", body: "", checkout: true }, state: next }
    const at = pathOf(to)
    r = await answer(site, { method: "GET", path: at.path, query: at.query, body: null, cart: next.cart, note: next.note, ajax: false, referer })
    if (r.cart) next = { cart: r.cart, note: r.note ?? next.note }
  }
  return { answer: { status: r.status, type: r.type, body: typeof r.body === "string" ? r.body : "", ...(redirectedTo ? { redirectedTo } : {}) }, state: next }
}

/** The page keys a theme's own templates stand for, when the builder has only the page being edited. */
const TEMPLATE_PAGES: [string, string][] = [["home", "index"], ["product", "product"], ["collection", "collection"], ["collections", "list-collections"], ["cart", "cart"], ["search", "search"], ["page", "page"], ["404", "404"]]

/**
 * THE SITE'S PAGES, AS FAR AS THE CANVAS KNOWS THEM. The page being edited
 * is itself; every other kind of page is the theme's own template for it,
 * worn with this page's header, footer and overlay, so a quick view of a
 * product or the cart page asked for from a collection is drawn as it is on
 * the website rather than not at all.
 */
export function canvasPages(theme: CompatTheme, pageKey: string, sections: StoredSection[]): Record<string, StoredSection[]> {
  const pages: Record<string, StoredSection[]> = { [pageKey]: sections }
  const chrome = (group: string) => sections.filter((s) => s.group === group)
  for (const [key, template] of TEMPLATE_PAGES) {
    if (pages[key]) continue
    const json = theme.files[`templates/${template}.json`]
    const middle = json === undefined ? [] : groupSections(json).map((s) => ({ ...s, type: theme.typeOf(s.type) }) as unknown as StoredSection)
    pages[key] = [...chrome("header"), ...middle, ...chrome("footer"), ...chrome("overlay")]
  }
  return pages
}
