/**
 * ===========================================================================
 *  EVERY EMAIL A BUYER GETS FROM A STORE
 * ===========================================================================
 * Settings › Customer emails lists them, the way Shopify's Customer
 * notifications does: what each is for, when it goes, and a preview drawn by
 * the very template that sends it (lib/receipts/email.ts for a digital
 * order, lib/physical/email-templates.ts for anything shipped or picked up),
 * with the store's own name and sample items. Nothing here sends anything.
 *
 *   group       Orders, Shipping, Pickup, Returns
 *   physical    only listed while physical commerce is on
 *   sentWhen    the moment it goes, in the store's words
 */
import { buyerReceiptEmailHtml, type ReceiptEmailModel } from "@/lib/receipts/email"
import { checkoutReminderEmail, orderCancelledEmail, orderConfirmationEmail, pickupEmail, refundEmail, returnEmail, shipmentEmail, type EmailBrand, type EmailLine } from "@/lib/physical/email-templates"
import { itemsText, resolveCopy, type EmailCopy } from "./customer-custom"

export type CustomerEmailGroup = "orders" | "shipping" | "pickup" | "returns" | "marketing"

export interface CustomerEmail {
  id: string
  name: string
  group: CustomerEmailGroup
  sentWhen: string
  physical: boolean
}

export const GROUP_NAMES: Record<CustomerEmailGroup, string> = { orders: "Orders", shipping: "Shipping", pickup: "Local pickup", returns: "Returns", marketing: "Checkout" }

export const CUSTOMER_EMAILS: CustomerEmail[] = [
  { id: "receipt", name: "Receipt", group: "orders", sentWhen: "Right after a buyer pays for a download, course or membership, with the link to it.", physical: false },
  { id: "order_confirmation", name: "Order confirmation", group: "orders", sentWhen: "Right after a buyer pays for something you ship or they pick up.", physical: true },
  { id: "shipping_confirmation", name: "Shipping confirmation", group: "shipping", sentWhen: "When you mark items shipped, with the tracking.", physical: true },
  { id: "tracking_changed", name: "Tracking number changed", group: "shipping", sentWhen: "When you change the tracking number on a shipment that already went out.", physical: true },
  { id: "out_for_delivery", name: "Out for delivery", group: "shipping", sentWhen: "When the carrier says it's out for delivery.", physical: true },
  { id: "delivered", name: "Delivered", group: "shipping", sentWhen: "When it's marked delivered.", physical: true },
  { id: "ready_for_pickup", name: "Ready for pickup", group: "pickup", sentWhen: "When you mark a pickup order ready.", physical: true },
  { id: "picked_up", name: "Picked up", group: "pickup", sentWhen: "When you mark it collected.", physical: true },
  { id: "order_cancelled", name: "Order cancelled", group: "orders", sentWhen: "When you cancel an order before it ships.", physical: true },
  { id: "refund", name: "Refund", group: "orders", sentWhen: "When you refund all or part of an order, here or in Stripe.", physical: true },
  { id: "return_approved", name: "Return approved", group: "returns", sentWhen: "When you approve a return, with your instructions.", physical: true },
  { id: "return_received", name: "Return received", group: "returns", sentWhen: "When the items reach you.", physical: true },
  { id: "return_completed", name: "Return complete", group: "returns", sentWhen: "When the return is closed, with any refund.", physical: true },
  { id: "checkout_reminder", name: "Checkout reminder", group: "marketing", sentWhen: "An hour after a buyer leaves checkout without paying, if they asked for news. Turn it on in Checkout.", physical: false },
]

export function visibleCustomerEmails(physical: boolean): CustomerEmail[] {
  return CUSTOMER_EMAILS.filter((e) => physical || !e.physical)
}

const SAMPLE_LINES: EmailLine[] = [
  { title: "Wildflower honey", variantName: "500 g", quantity: 2, cents: 3200, imageUrl: null },
  { title: "Linen apron", variantName: "Sage", quantity: 1, cents: 6400, imageUrl: null },
]
const SAMPLE_ADDRESS = { name: "Maria Popescu", line1: "Strada Lipscani 12", line2: "Ap. 4", city: "Bucharest", postalCode: "030031", country: "RO" }
const STATUS = "https://storelib.com/checkout/physical/order/preview"
export const SAMPLE_DATE = "10 October 2026"

/**
 * One email as its template draws it, with the store's name and sample
 * items and buyer. Null for an id that isn't one.
 */
export function previewCustomerEmail(
  id: string,
  shop: { name: string; supportEmail?: string | null; storeUrl?: string | null; currency?: string; logoUrl?: string | null; phone?: string | null },
  /** The store's own words (saved, or still being typed in the editor): drawn exactly as the sender draws them. */
  words?: EmailCopy | null,
): { subject: string; html: string } | null {
  const shopName = shop.name || "Your store"
  const brand: EmailBrand = { logoUrl: shop.logoUrl ?? null, email: shop.supportEmail ?? null, phone: shop.phone ?? null, websiteUrl: shop.storeUrl ?? null, helpUrl: `${STATUS}#get-help` }
  const currency = (shop.currency || "USD").toUpperCase()
  const pickup = { name: "Studio", address: ["Strada Lipscani 12", "Bucharest"], ready: "Usually ready in 24 hours", instructions: "Ring the bell at the side door.", hours: "Mon to Fri, 10:00 to 18:00" }
  const orderDate = SAMPLE_DATE
  const sampleLines = id === "receipt" ? [{ title: "The bread baking course" }] : id.startsWith("return_") ? [SAMPLE_LINES[0]] : SAMPLE_LINES
  const copy = resolveCopy(words, { customer_name: "Maria", order_number: "#1042", shop_name: shopName, items: itemsText(sampleLines.map((l) => l.title)) })
  switch (id) {
    case "receipt": {
      const model: ReceiptEmailModel = {
        firstName: "Maria",
        sellerName: shopName,
        orderNumber: "#1042",
        dateText: SAMPLE_DATE,
        items: [{ title: "The bread baking course", variantName: null, amountText: "$49.00", note: null, thumbnailUrl: null }],
        subtotalText: null,
        tipText: null,
        totalText: "$49.00",
        refundedText: null,
        link: "https://storelib.com/account/library",
        buttonLabel: copy?.button ?? "View your receipt",
        supportEmail: shop.supportEmail || "hello@example.com",
        heading: copy?.heading ?? null,
        introHtml: copy?.introHtml || null,
      }
      return { subject: copy?.subject ?? "Your receipt for The bread baking course", html: buyerReceiptEmailHtml(model) }
    }
    case "checkout_reminder": {
      const m = checkoutReminderEmail({ shopName, buyerFirstName: "Maria", lines: SAMPLE_LINES, checkoutUrl: STATUS, unsubscribeUrl: "https://storelib.com/unsubscribe/preview", brand, copy })
      return { subject: m.subject, html: m.html }
    }
    case "order_confirmation": {
      const m = orderConfirmationEmail({
        shopName,
        orderNumber: "#1042",
        buyerFirstName: "Maria",
        lines: SAMPLE_LINES,
        totals: { subtotal: 9600, discount: 1000, shipping: 700, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 9300, currency },
        address: SAMPLE_ADDRESS,
        deliveryName: "Standard",
        deliveryEstimate: "3 to 5 business days",
        statusUrl: STATUS,
        hasDownloads: false,
        storeUrl: shop.storeUrl ?? null,
        paymentLabel: "Visa ending 4242",
        supportEmail: shop.supportEmail ?? null,
        brand: { ...brand, websiteUrl: null },
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html }
    }
    case "shipping_confirmation":
    case "tracking_changed":
    case "out_for_delivery":
    case "delivered": {
      const kind = id === "shipping_confirmation" ? "shipped" : id === "tracking_changed" ? "tracking" : id
      const m = shipmentEmail({ shopName, orderNumber: "#1042", buyerFirstName: "Maria", lines: SAMPLE_LINES, carrier: "DHL", trackingNumber: "JD014600006281234567", trackingUrl: "https://www.dhl.com/track?id=JD014600006281234567", address: SAMPLE_ADDRESS, deliveryName: "Standard, 3 to 5 business days", statusUrl: STATUS, kind, brand, copy, orderDate })
      return { subject: m.subject, html: m.html }
    }
    case "ready_for_pickup":
    case "picked_up": {
      const m = pickupEmail({ shopName, orderNumber: "#1042", buyerFirstName: "Maria", lines: SAMPLE_LINES, kind: id === "ready_for_pickup" ? "ready" : "picked_up", pickup, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html }
    }
    case "return_approved":
    case "return_received":
    case "return_completed": {
      const status = id === "return_approved" ? "approved" : id === "return_received" ? "received" : "completed"
      const m = returnEmail({
        shopName,
        orderNumber: "#1042",
        status,
        note: status === "approved" ? "Put a note with your order number in the box." : null,
        refundedCents: status === "completed" ? 3200 : 0,
        currency,
        statusUrl: STATUS,
        lines: [{ ...SAMPLE_LINES[0], quantity: 1 }],
        returnAddress: status === "approved" ? [shopName, "Strada Lipscani 12", "030031 Bucharest", "RO"] : null,
        brand,
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html }
    }
    case "order_cancelled": {
      const m = orderCancelledEmail({ shopName, orderNumber: "#1042", buyerFirstName: "Maria", reason: "The apron in Sage sold out.", refundedCents: 9300, totalCents: 9300, currency, lines: SAMPLE_LINES, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html }
    }
    case "refund": {
      const m = refundEmail({ shopName, orderNumber: "#1042", buyerFirstName: "Maria", amountCents: 3200, refundedCents: 3200, totalCents: 9300, currency, paymentLabel: "Visa ending 4242", statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html }
    }
    default:
      return null
  }
}
