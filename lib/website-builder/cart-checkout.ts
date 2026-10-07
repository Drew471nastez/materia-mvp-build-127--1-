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

export type DrawerCheckout = { go: string; free: boolean } | { go: null; free?: undefined }

export async function drawerCheckout(lines: CartLine[], shopId: string | null): Promise<DrawerCheckout> {
  if (lines.length === 0) return { go: null }
  if (shopId && lines.some((l) => l.physical)) {
    return { go: physicalCheckoutHref(shopId, checkoutItems(lines), window.location.href), free: false }
  }
  try {
    const res = await fetch("/api/checkout/cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: checkoutItems(lines), returnPath: "/cart", origin: pageOrigin() }),
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
