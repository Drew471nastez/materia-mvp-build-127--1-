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
 *   group       Digital products; Orders, Payments, Shipping, Local pickup,
 *               Returns and Checkout for an order that ships (GROUP_ORDER)
 *   physical    only listed while physical commerce is on
 *   sentWhen    the moment it goes, in the store's words
 */
import { buyerReceiptEmailHtml, buyerReceiptEmailText, type ReceiptEmailModel } from "@/lib/receipts/email"
import { checkoutReminderEmail, orderCancelledEmail, orderConfirmationEmail, orderUpdatedEmail, paymentFailedEmail, pickupEmail, refundEmail, returnEmail, shipmentEmail, type EmailBrand, type EmailLine } from "@/lib/physical/email-templates"
import { itemsText, resolveCopy, type EmailCopy } from "./customer-custom"
import { tt } from "@/lib/i18n/text"
import { formatCurrency } from "@/lib/markets/money"

export type CustomerEmailGroup = "digital" | "orders" | "payments" | "shipping" | "pickup" | "returns" | "checkout"

export interface CustomerEmail {
  id: string
  name: string
  group: CustomerEmailGroup
  sentWhen: string
  physical: boolean
}

export const GROUP_NAMES: Record<CustomerEmailGroup, string> = {
  get digital() { return tt("Digital products") },
  get orders() { return tt("Orders") },
  get payments() { return tt("Payments") },
  get shipping() { return tt("Shipping") },
  get pickup() { return tt("Local pickup") },
  get returns() { return tt("Returns") },
  get checkout() { return tt("Checkout") },
}

/**
 * THE ORDER THEY ARE LISTED IN, and the two kinds kept apart: a download's
 * receipt is Digital products; everything about an order that ships or is
 * picked up is the online store's, in Shopify's six groups. Courses and
 * communities send their own emails from their own settings, not from here.
 *
 * ONE EMAIL PER THING THAT HAPPENED. A paid order that ships gets its order
 * confirmation and nothing else for the same payment (no separate "payment
 * received"); a declined payment gets Payment failed, and then no checkout
 * reminder for the same cart. There is no Order invoice email: every order
 * is paid at checkout, and its invoice is a download on the order page.
 */
export const GROUP_ORDER: CustomerEmailGroup[] = ["digital", "orders", "payments", "shipping", "pickup", "returns", "checkout"]

export const CUSTOMER_EMAILS: CustomerEmail[] = [
  { id: "receipt", name: "Receipt", group: "digital", get sentWhen() { return tt("Right after a buyer pays for a download, course or membership, with the link to it.") }, physical: false },
  { id: "order_confirmation", name: "Order confirmation", group: "orders", get sentWhen() { return tt("Right after a buyer pays for something you ship or they pick up.") }, physical: true },
  { id: "order_updated", name: "Order updated", group: "orders", get sentWhen() { return tt("When you change the shipping address on an order before it ships.") }, physical: true },
  { id: "order_cancelled", name: "Order cancelled", group: "orders", get sentWhen() { return tt("When you cancel an order before it ships.") }, physical: true },
  { id: "refund", name: "Refund", group: "orders", get sentWhen() { return tt("When you refund all or part of an order, here or in Stripe.") }, physical: true },
  { id: "payment_failed", name: "Payment failed", group: "payments", get sentWhen() { return tt("Half an hour after a buyer's bank declines their payment, if they still haven't paid. Nothing was charged; it links back to their cart.") }, physical: true },
  { id: "shipping_confirmation", name: "Shipping confirmation", group: "shipping", get sentWhen() { return tt("When you mark items shipped, with the tracking.") }, physical: true },
  { id: "tracking_changed", name: "Tracking number changed", group: "shipping", get sentWhen() { return tt("When you change the tracking number on a shipment that already went out.") }, physical: true },
  { id: "out_for_delivery", name: "Out for delivery", group: "shipping", get sentWhen() { return tt("When the carrier says it's out for delivery.") }, physical: true },
  { id: "delivered", name: "Delivered", group: "shipping", get sentWhen() { return tt("When it's marked delivered.") }, physical: true },
  { id: "delivery_issue", name: "Delivery issue", group: "shipping", get sentWhen() { return tt("When a shipment is marked as failed: the carrier, or your own delivery, couldn't deliver it.") }, physical: true },
  { id: "ready_for_pickup", name: "Ready for pickup", group: "pickup", get sentWhen() { return tt("When you mark a pickup order ready.") }, physical: true },
  { id: "picked_up", name: "Picked up", group: "pickup", get sentWhen() { return tt("When you mark it collected.") }, physical: true },
  { id: "return_requested", name: "Return requested", group: "returns", get sentWhen() { return tt("When a buyer asks to return items, so they know it arrived.") }, physical: true },
  { id: "return_approved", name: "Return approved", group: "returns", get sentWhen() { return tt("When you approve a return, with your instructions.") }, physical: true },
  { id: "return_declined", name: "Return declined", group: "returns", get sentWhen() { return tt("When you decline a return, with your note.") }, physical: true },
  { id: "return_received", name: "Return received", group: "returns", get sentWhen() { return tt("When the items reach you.") }, physical: true },
  { id: "return_completed", name: "Return complete", group: "returns", get sentWhen() { return tt("When the return is closed, with any refund.") }, physical: true },
  { id: "checkout_reminder", name: "Checkout reminder", group: "checkout", get sentWhen() { return tt("An hour after a buyer leaves checkout without paying, if they asked for news. Turn it on in Checkout.") }, physical: false },
]

export function visibleCustomerEmails(physical: boolean): CustomerEmail[] {
  return CUSTOMER_EMAILS.filter((e) => physical || !e.physical)
}

const SAMPLE_LINES: EmailLine[] = [
  { get title() { return tt("Wildflower honey") }, variantName: "500 g", quantity: 2, cents: 3200, imageUrl: null },
  { get title() { return tt("Linen apron") }, get variantName() { return tt("Sage") }, quantity: 1, cents: 6400, imageUrl: null },
]
const SAMPLE_ADDRESS = { name: "Maria Popescu", get line1() { return tt("Strada Lipscani 12") }, get line2() { return tt("Ap. 4") }, get city() { return tt("Bucharest") }, postalCode: "030031", country: "RO" }
const STATUS = "https://storelib.com/checkout/physical/order/preview"
/* Inside the customer email, which writes in the store's language, not the dashboard's. i18n-ignore-next-line */
export const SAMPLE_DATE = "10 October 2026"

/**
 * One email as its template draws it, with the store's name and sample
 * items and buyer. Null for an id that isn't one.
 */
export function previewCustomerEmail(
  id: string,
  shop: { name: string; supportEmail?: string | null; storeUrl?: string | null; currency?: string; logoUrl?: string | null; phone?: string | null; accent?: string | null },
  /** The store's own words (saved, or still being typed in the editor): drawn exactly as the sender draws them. */
  words?: EmailCopy | null,
): { subject: string; html: string; text: string } | null {
  const shopName = shop.name || tt("Your store")
  const brand: EmailBrand = { logoUrl: shop.logoUrl ?? null, email: shop.supportEmail ?? null, phone: shop.phone ?? null, websiteUrl: shop.storeUrl ?? null, helpUrl: `${STATUS}#get-help`, accent: shop.accent ?? null }
  const currency = (shop.currency || "USD").toUpperCase()
  const pickup = { name: "Studio", address: [tt("Strada Lipscani 12"), tt("Bucharest")], ready: tt("Usually ready in 24 hours"), instructions: tt("Ring the bell at the side door."), hours: tt("Mon to Fri, 10:00 to 18:00") }
  const orderDate = SAMPLE_DATE
  const sampleLines = id === "receipt" ? [{ title: tt("The bread baking course") }] : id.startsWith("return_") ? [SAMPLE_LINES[0]] : SAMPLE_LINES
  const copy = resolveCopy(words, { customer_name: tt("Maria"), order_number: "#1042", shop_name: shopName, items: itemsText(sampleLines.map((l) => l.title)) })
  switch (id) {
    case "receipt": {
      const model: ReceiptEmailModel = {
        firstName: tt("Maria"),
        sellerName: shopName,
        orderNumber: "#1042",
        dateText: SAMPLE_DATE,
        items: [{ title: tt("The bread baking course"), variantName: null, amountText: formatCurrency(49, currency), note: null, thumbnailUrl: null }],
        subtotalText: null,
        tipText: null,
        totalText: formatCurrency(49, currency),
        refundedText: null,
        link: "https://storelib.com/account/library",
        buttonLabel: copy?.button ?? tt("View your receipt"),
        supportEmail: shop.supportEmail || "hello@example.com",
        heading: copy?.heading ?? null,
        introHtml: copy?.introHtml || null,
      }
      return { subject: copy?.subject ?? tt("Your receipt for The bread baking course"), html: buyerReceiptEmailHtml(model), text: buyerReceiptEmailText(model) }
    }
    case "checkout_reminder": {
      const m = checkoutReminderEmail({ shopName, buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, checkoutUrl: STATUS, unsubscribeUrl: "https://storelib.com/unsubscribe/preview", brand, copy })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_confirmation": {
      const m = orderConfirmationEmail({
        shopName,
        orderNumber: "#1042",
        buyerFirstName: tt("Maria"),
        lines: SAMPLE_LINES,
        totals: { subtotal: 9600, discount: 1000, shipping: 700, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 9300, currency },
        address: SAMPLE_ADDRESS,
        deliveryName: tt("Standard"),
        deliveryEstimate: tt("3 to 5 business days"),
        statusUrl: STATUS,
        hasDownloads: false,
        storeUrl: shop.storeUrl ?? null,
        paymentLabel: tt("Visa ending 4242"),
        supportEmail: shop.supportEmail ?? null,
        brand: { ...brand, websiteUrl: null },
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_updated": {
      const m = orderUpdatedEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), change: "address", address: SAMPLE_ADDRESS, lines: SAMPLE_LINES, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "payment_failed": {
      const m = paymentFailedEmail({ shopName, buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, checkoutUrl: STATUS, brand, copy })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "shipping_confirmation":
    case "tracking_changed":
    case "out_for_delivery":
    case "delivered":
    case "delivery_issue": {
      const kind = id === "shipping_confirmation" ? "shipped" : id === "tracking_changed" ? "tracking" : id === "delivery_issue" ? "issue" : id
      const m = shipmentEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, carrier: "DHL", trackingNumber: "JD014600006281234567", trackingUrl: "https://www.dhl.com/track?id=JD014600006281234567", address: SAMPLE_ADDRESS, deliveryName: tt("Standard, 3 to 5 business days"), statusUrl: STATUS, kind, brand, copy, orderDate, problem: kind === "issue" ? tt("Address not found") : null })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "ready_for_pickup":
    case "picked_up": {
      const m = pickupEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), lines: SAMPLE_LINES, kind: id === "ready_for_pickup" ? "ready" : "picked_up", pickup, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "return_requested":
    case "return_approved":
    case "return_declined":
    case "return_received":
    case "return_completed": {
      const status = id === "return_requested" ? "requested" : id === "return_approved" ? "approved" : id === "return_declined" ? "rejected" : id === "return_received" ? "received" : "completed"
      const m = returnEmail({
        shopName,
        orderNumber: "#1042",
        status,
        note: status === "approved" ? tt("Put a note with your order number in the box.") : status === "rejected" ? tt("The apron was worn, so we can't take it back.") : null,
        refundedCents: status === "completed" ? 3200 : 0,
        currency,
        statusUrl: STATUS,
        lines: [{ ...SAMPLE_LINES[0], quantity: 1 }],
        returnAddress: status === "approved" ? [shopName, tt("Strada Lipscani 12"), tt("030031 Bucharest"), "RO"] : null,
        brand,
        copy,
        orderDate,
      })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "order_cancelled": {
      const m = orderCancelledEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), reason: tt("The apron in Sage sold out."), refundedCents: 9300, totalCents: 9300, currency, lines: SAMPLE_LINES, statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    case "refund": {
      const m = refundEmail({ shopName, orderNumber: "#1042", buyerFirstName: tt("Maria"), amountCents: 3200, refundedCents: 3200, totalCents: 9300, currency, paymentLabel: tt("Visa ending 4242"), statusUrl: STATUS, brand, copy, orderDate })
      return { subject: m.subject, html: m.html, text: m.text }
    }
    default:
      return null
  }
}
