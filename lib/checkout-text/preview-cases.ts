/**
 * The pages after paying, for the order the preview's checkout prices: the
 * thank you page (app/checkout/site/thanks/[token]/thanks-view.tsx) and the
 * order page (app/checkout/physical/order/[token]/order-status-view.tsx),
 * as their server pages would hand them a real order, and the line that
 * stands in where a store has nothing of a kind on sale. Pure, so the
 * server (./preview-server.ts) and the probe (scripts/check-checkout-
 * editor.mjs) build them the same way.
 */
import { addressWordsFor } from "@/lib/checkout/business"
import type { LinkItem } from "@/lib/physical/cart-link"
import type { SiteQuote } from "@/lib/checkout/site-quote-server"
import type { Summary } from "@/app/(storelib)/checkout/site/thanks/[token]/thanks-view"
import type { PreviewOrderPage } from "./preview"

/** The buyer the pages after paying are drawn for. */
export const PREVIEW_BUYER = { first: "Alex", last: "Morgan", email: "alex@example.com" }

/** A line that stands in where the store has nothing of a kind on sale: priced, never bought. */
export function standInQuote(creatorId: string, physical: boolean): { items: LinkItem[]; quote: SiteQuote } {
  const productId = physical ? "00000000-0000-4000-8000-0000000000b2" : "00000000-0000-4000-8000-0000000000a1"
  const unit = physical ? 3500 : 2900
  const shipping = physical ? 500 : 0
  return {
    items: [{ productId, variantId: null, quantity: 1 }],
    quote: {
      kind: physical ? "ships" : "digital",
      creatorId,
      lines: [{ productId, variantId: null, title: physical ? "Your product" : "Your download", variantName: null, imageUrl: null, type: physical ? "physical" : "digital", quantity: 1, unitCents: unit, discountCents: 0, requiresShipping: physical, maxQuantity: physical ? 10 : 1 }],
      dropped: [],
      stockIssues: [],
      requiresShipping: physical,
      coupon: null,
      couponError: null,
      delivery: physical ? { ok: true, options: [{ id: "preview-standard", name: "Standard", priceCents: shipping, estimate: "3 to 5 business days" }], selectedId: "preview-standard", needsCountry: false } : { ok: true, options: [], selectedId: null, needsCountry: false },
      pickups: [],
      totals: { itemsSubtotalCents: unit, discountCents: 0, shippingCents: shipping, shippingDiscountCents: 0, taxCents: 0, taxIncluded: true, totalCents: unit + shipping },
      physical,
      shipsTo: null,
    },
  }
}

/** The thank you page for the order the quote prices (app/checkout/site/thanks/[token]/thanks-view.tsx). */
export function thanksFor(quote: SiteQuote, currency: string, country: string | null, physical: boolean): Summary {
  const t = quote.totals
  const option = quote.delivery.options.find((o) => o.id === quote.delivery.selectedId) ?? quote.delivery.options[0] ?? null
  const ex = addressWordsFor(country ?? "").example
  return {
    email: PREVIEW_BUYER.email,
    firstName: PREVIEW_BUYER.first,
    lines: quote.lines.map((l) => ({ productId: l.productId, title: l.title, variantName: l.variantName, imageUrl: l.imageUrl, quantity: l.quantity, cents: l.unitCents * l.quantity - l.discountCents, unitCents: l.unitCents })),
    totalCents: t.totalCents,
    shippingCents: physical ? t.shippingCents - t.shippingDiscountCents : null,
    taxCents: t.taxIncluded ? 0 : t.taxCents,
    shipTo: null,
    receipt: "#receipt",
    ga: { id: "preview", items: [], currency },
    shipped: physical
      ? {
          number: "#1042",
          placedAt: new Date().toISOString(),
          subtotalCents: t.itemsSubtotalCents,
          discountCents: t.discountCents,
          coupon: null,
          address: { name: `${PREVIEW_BUYER.first} ${PREVIEW_BUYER.last}`, line1: ex.line1, city: ex.city, postalCode: ex.postal, region: "", country: country ?? "" },
          method: option ? { name: option.name, minDays: null, maxDays: null, local: false, note: null } : null,
        }
      : undefined,
  }
}

/** The order page right after the shipped order (order-status-view.tsx). */
export function orderPageFor(quote: SiteQuote, currency: string, country: string | null, shop: PreviewOrderPage["shop"]): PreviewOrderPage {
  const t = quote.totals
  const option = quote.delivery.options.find((o) => o.id === quote.delivery.selectedId) ?? quote.delivery.options[0] ?? null
  const ex = addressWordsFor(country ?? "").example
  return {
    shop,
    order: {
      id: "a0000000-0000-4000-8000-000000001042",
      status: "paid",
      fulfillmentStatus: "unfulfilled",
      cancelled: false,
      createdAt: new Date().toISOString(),
      email: PREVIEW_BUYER.email,
      name: `${PREVIEW_BUYER.first} ${PREVIEW_BUYER.last}`,
      address: { name: `${PREVIEW_BUYER.first} ${PREVIEW_BUYER.last}`, line1: ex.line1, city: ex.city, postalCode: ex.postal, country: country ?? "" },
      delivery: option ? { name: option.name, priceCents: option.priceCents, minDays: null, maxDays: null } : null,
      pickup: null,
      processing: false,
      totals: { subtotal: t.itemsSubtotalCents, discount: t.discountCents, shipping: t.shippingCents - t.shippingDiscountCents, tax: t.taxCents, taxIncluded: t.taxIncluded, taxLabel: t.taxLabel, total: t.totalCents, refunded: 0, currency },
      cash: null,
      lines: quote.lines.map((l, i) => ({ orderId: `preview-${i}`, title: l.title, variantName: l.variantName, imageUrl: l.imageUrl, quantity: l.quantity, cents: l.unitCents * l.quantity - l.discountCents, type: l.type, receiptToken: null, returnable: 0 })),
      shipments: [],
      returns: [],
    },
  }
}

