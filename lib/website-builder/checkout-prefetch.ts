/**
 * ===========================================================================
 *  THE CHECKOUT, FETCHED WHILE THE FINGER IS ON ITS BUTTON
 * ===========================================================================
 * A website's Check out (the cart drawer, the cart page) and Buy now are a
 * full page load of /checkout, which the server prices before it answers
 * (app/checkout/site/page.tsx). The moment the buyer shows they mean it (the
 * pointer resting on the button, a finger touching it, the keyboard on it)
 * the browser is asked to fetch that exact address ahead (Speculation Rules
 * prefetch: Chrome and Edge; other browsers ignore it), so the press opens a
 * page that is already here, or on its way.
 *
 * Prefetch only, never prerender: no script, pixel or analytics of the
 * checkout runs for a press that never came. Only an address that names its
 * cart (`items=`): the whole cart kept in a cookie (an imported theme's bare
 * /checkout) could change under a fetched page, so it is never fetched
 * ahead; a cart that changes here is another address, and the one fetched
 * before is let go. The site's general rules leave /checkout out for the
 * same reason (./prefetch-rules.ts).
 */

const MARK = "data-checkout-prefetch"

/** Only this site's own checkout, with its cart in the address. */
export function prefetchableCheckout(href: string | null | undefined): boolean {
  if (typeof href !== "string" || !href.startsWith("/checkout?") || href.length > 4000) return false
  return /[?&]items=/.test(href)
}

function supported(): boolean {
  try {
    return typeof HTMLScriptElement !== "undefined" && typeof HTMLScriptElement.supports === "function" && HTMLScriptElement.supports("speculationrules")
  } catch {
    return false
  }
}

/** Fetch this checkout ahead. One at a time: a new address lets the last one go. */
export function prefetchCheckout(href: string | null | undefined): void {
  if (typeof document === "undefined" || !prefetchableCheckout(href) || !supported()) return
  const was = document.head.querySelector(`script[${MARK}]`)
  if (was?.getAttribute(MARK) === href) return
  was?.remove()
  const rules = document.createElement("script")
  rules.type = "speculationrules"
  rules.setAttribute(MARK, href as string)
  rules.textContent = JSON.stringify({ prefetch: [{ source: "list", urls: [href], eagerness: "immediate" }] })
  document.head.appendChild(rules)
}

/** The handlers a Check out or Buy now button spreads on itself: each asks for `href()` as the intent shows. */
export function checkoutIntent(href: () => string | null): { onPointerEnter: () => void; onTouchStart: () => void; onFocus: () => void } {
  const ask = () => prefetchCheckout(href())
  return { onPointerEnter: ask, onTouchStart: ask, onFocus: ask }
}
