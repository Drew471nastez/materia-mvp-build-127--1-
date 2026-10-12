/**
 * ===========================================================================
 *  CHECK OUT FROM THE CART DRAWER
 * ===========================================================================
 * The drawer's Check out sent the shopper to /cart, which asked them to
 * press Check out a second time. Shopify's goes straight to the checkout,
 * with View cart beside it for the shopper who wants the page, and so does
 * this.
 *
 * Exactly what the cart page's own button does with no discount code
 * (cart-page-body.tsx, pay): something that ships goes to the physical
 * checkout, everything else to /api/checkout/cart. Anything that needs more
 * than one press (a free basket asking who it is for, a refusal with a
 * reason to read) lands on the cart page, which can say it and ask.
 */
import { checkoutItems, type CartLine } from "./cart"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { onWebsiteHost, siteCheckoutHref } from "@/lib/checkout/site-checkout"
import { getMainDomain } from "@/lib/url-helpers"
import { localePrefix } from "@/lib/markets/locales"

export type DrawerCheckout = { go: string; free: boolean } | { go: null; free?: undefined }

/** The cart's address in the page's language (/fr/cart), where checkout's Back returns to. */
export function cartPathFor(language: { code: string; defaultLanguage: string } | null | undefined): string {
  return language && language.code.toLowerCase() !== language.defaultLanguage.toLowerCase() ? `/${localePrefix(language.code)}/cart` : "/cart"
}

export async function drawerCheckout(lines: CartLine[], shopId: string | null, cartPath = "/cart"): Promise<DrawerCheckout> {
  if (lines.length === 0) return { go: null }
  if (shopId && lines.some((l) => l.physical)) {
    /* On the website: its own checkout at this same address (app/checkout/site). A preview on storelib.com keeps the platform's. */
    const go = onWebsiteHost(window.location.hostname, getMainDomain(), window.location.pathname)
      ? siteCheckoutHref({ items: checkoutItems(lines), back: cartPath, wholeCart: true })
      : physicalCheckoutHref(shopId, checkoutItems(lines), window.location.href)
    return { go, free: false }
  }
  try {
    const res = await fetch("/api/checkout/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: checkoutItems(lines), returnPath: cartPath, origin: pageOrigin() }),
    })
    const data = (await res.json().catch(() => ({}))) as { url?: unknown; free?: unknown; dropped?: unknown }
    /* Something was left out of the order: the cart page says what. */
    if (Array.isArray(data.dropped) && data.dropped.length > 0) return { go: null }
    if (!res.ok || typeof data.url !== "string") return { go: null }
    return { go: data.url, free: data.free === true }
  } catch {
    return { go: null }
  }
}
