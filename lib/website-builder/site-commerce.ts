/**
 * ===========================================================================
 *  WHAT A WEBSITE SAYS ABOUT STOCK, DELIVERY AND RETURNS
 * ===========================================================================
 * The few physical commerce choices that belong to a website rather than to
 * the store (Website settings › Commerce › On this website). Stored with the
 * website's other settings, so they are drafted, undone and published like
 * them. Read here only, with their defaults, by ThemePage, which hands them
 * to every section through the storefront context, and by the imported
 * theme route.
 *
 *   show_stock_left           "Only 3 left" on product pages        on
 *   low_stock_text            the words, {count} for the number     "Only {count} left"
 *   free_shipping_bar         the banner over the header            off
 *   free_shipping_threshold   its amount in dollars; empty or 0:
 *                             the amount from the shipping rates
 *   cart_returns_note         the return window and a link to the
 *                             refund policy, beside Check out       off
 */

export const DEFAULT_LOW_STOCK_TEXT = "Only {count} left"

export interface SiteCommerce {
  showStockLeft: boolean
  lowStockText: string
  freeShippingBar: boolean
  /** Dollars the seller typed; null: take it from the shipping rates. */
  freeShippingAmount: number | null
  cartReturnsNote: boolean
}

export function siteCommerce(theme: Record<string, unknown> | null | undefined): SiteCommerce {
  const t = theme ?? {}
  const text = typeof t.low_stock_text === "string" ? t.low_stock_text.replace(/[<>]/g, "").trim().slice(0, 80) : ""
  const amount = typeof t.free_shipping_threshold === "number" ? t.free_shipping_threshold : Number(t.free_shipping_threshold)
  return {
    showStockLeft: t.show_stock_left !== false,
    lowStockText: text || DEFAULT_LOW_STOCK_TEXT,
    freeShippingBar: t.free_shipping_bar === true,
    freeShippingAmount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    cartReturnsNote: t.cart_returns_note === true,
  }
}

/** The banner's line, from what is in the cart and where free shipping starts (cents). Null: nothing to say. */
export function freeShippingLine(subtotalCents: number, fromCents: number | null): { text: string; progress: number } | null {
  if (fromCents === null || !Number.isFinite(fromCents) || fromCents < 0) return null
  if (fromCents === 0) return { text: "Free shipping on every order", progress: 1 }
  const left = Math.max(0, fromCents - Math.max(0, subtotalCents))
  if (left === 0) return { text: "You have earned free shipping", progress: 1 }
  return { text: `Spend $${(left / 100).toFixed(2)} more for free shipping`, progress: Math.max(0, Math.min(1, subtotalCents / fromCents)) }
}

/** The cart's returns line. Null when returns are off or the shop never set them. */
export function returnsLine(returns: { enabled: boolean; windowDays: number } | null | undefined): string | null {
  if (!returns || !returns.enabled) return null
  const days = Math.max(0, Math.floor(returns.windowDays))
  return days > 0 ? `Returns accepted within ${days} ${days === 1 ? "day" : "days"} of delivery.` : "Returns accepted."
}

/** The same facts as a paragraph for the refund policy page: what the shop's settings say today. */
export function returnFactsHtml(returns: { enabled: boolean; windowDays: number } | null | undefined): string {
  if (!returns) return ""
  if (!returns.enabled) return "<p><strong>Returns:</strong> we don't accept returns on items that are shipped. Contact us if something arrives damaged or wrong.</p>"
  const days = Math.max(0, Math.floor(returns.windowDays))
  return `<p><strong>Returns:</strong> you can ask to return an item${days > 0 ? ` within ${days} ${days === 1 ? "day" : "days"} of delivery` : ""}. Start a return from the link in your order confirmation email.</p>`
}
