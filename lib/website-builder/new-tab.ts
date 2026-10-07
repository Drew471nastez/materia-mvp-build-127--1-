/**
 * ===========================================================================
 *  A LINK THAT OPENS IN A NEW TAB
 * ===========================================================================
 * Every link on a website is one string, in a React section, a coded section
 * or a menu, so "open in a new tab" travels with the address itself: a mark
 * at its end, `#_blank`. The link picker sets and clears it
 * (components/website-builder/link-picker.tsx), and the published site turns
 * a marked link into a real one, the mark taken off and
 * `target="_blank" rel="noopener noreferrer"` put on
 * (components/website-builder/new-tab-links.tsx). Before that script runs a
 * marked link still works: it opens in the same tab, at a place on the page
 * that is not there, which a browser ignores.
 *
 * Pure, so tests can ask it everything.
 */
export const NEW_TAB_MARK = "#_blank"

/** Whether this address asks for a new tab. */
export function opensNewTab(href: string | null | undefined): boolean {
  return typeof href === "string" && href.endsWith(NEW_TAB_MARK)
}

/** The address without the mark, as the browser should follow it. */
export function withoutNewTab(href: string): string {
  return opensNewTab(href) ? href.slice(0, -NEW_TAB_MARK.length) : href
}

/** The address with the mark on or off. An empty address stays empty. */
export function withNewTab(href: string, on: boolean): string {
  const bare = withoutNewTab(href ?? "")
  if (!bare) return ""
  return on ? `${bare}${NEW_TAB_MARK}` : bare
}

/* ── Checkout of one product ─────────────────────────────────────────── */

/**
 * A link straight to one product's checkout, not its page and not the cart:
 * `/checkout?productId=<id>&src=website`, the address the developer docs
 * give sections (lib/developers "Selling"). On the website's own address
 * (its subdomain or its custom domain) /checkout is served there, and
 * CheckoutLinkOrigin adds the page and the visit's source as it is followed.
 */
export function productCheckoutHref(productId: string): string {
  return `/checkout?productId=${encodeURIComponent(productId)}&src=website`
}

/** The product a checkout link is for, or null for any other address. */
export function checkoutProductOf(href: string | null | undefined): string | null {
  const v = withoutNewTab((href ?? "").trim())
  const m = /^(?:https?:\/\/[^/]+)?\/checkout\?(.*)$/i.exec(v)
  if (!m) return null
  const id = new URLSearchParams(m[1].split("#")[0]).get("productId")
  return id || null
}
