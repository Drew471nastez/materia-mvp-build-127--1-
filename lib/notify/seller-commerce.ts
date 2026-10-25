/**
 * ===========================================================================
 *  THE SELLER'S EMAILS ABOUT THINGS THAT SHIP
 * ===========================================================================
 * A digital sale tells the seller "you made a sale". An order that ships
 * asks the seller to do something, so its emails say what, where and how,
 * in Storelib's own email look (lib/notify/templates/layout.ts), the same
 * card every notification uses:
 *
 *   new order to fulfil    NEW_SALE / FIRST_SALE with `fulfil` in its data
 *   pickup to prepare      (lib/email.tsx saleEmailData reads it from the
 *                          checkout with physicalSaleFacts below): the ship
 *                          to address, the method, who fulfils each item
 *                          (you, a supplier, print on demand, a 3PL, pickup),
 *                          what to do next, and Fulfil order
 *   return requested       a buyer asked to send items back: what and why,
 *                          and Review return to approve it
 *   cancelled by buyer     what was cancelled and the money
 *   delivery problem       the carrier could not deliver: what it said
 *   payment failed         a payment on an order did not go through
 *   low stock              what sold down to its low stock line
 *
 * Sent by lib/physical/jobs-server.ts (sendSellerEmail, sendLowStockEmail)
 * from a job keyed by the order event that caused it, so a retried webhook
 * is one email. The creator's own choice in Settings › Notifications (Sales
 * by email) is read before each order email; low stock follows Locations'
 * low stock switch. Every value is escaped by the layout.
 *
 * Pure: the tests draw exactly what is sent.
 */
import { ITEM_PX, renderHtml, renderText, type Fact, type LayoutInput, type SummaryRow } from "./templates/layout"
import { inboxPicture } from "./templates/index"
import { PATHS, formatMoney } from "./templates/catalog"
import { propertyText } from "@/lib/cart-uploads/rules"
import { actionUrl, canonicalOrigin, cleanText, mailtoUrl, sameSiteUrl } from "./templates/escape"
import type { TemplateFamily } from "./types"

/* ── A physical sale's facts, for NEW_SALE ──────────────────────────────── */

/** Who gets each item to the buyer, in the seller's words. */
export const FULFIL_LABEL: Record<string, string> = {
  self: "You ship it",
  warehouse: "Fulfilment center (3PL)",
  dropship: "Supplier ships it (dropshipping)",
  print_on_demand: "Print on demand",
  pickup: "Local pickup",
  local: "You deliver it (local delivery)",
}

/** What the seller does next, by who fulfils it. */
const NEXT_STEP: Record<string, string> = {
  self: "Pack it, then open the order and press Mark as shipped with the tracking number. The buyer is emailed the tracking.",
  warehouse: "It was sent to your fulfilment center. Add their tracking to the order when they ship it, and the buyer is emailed.",
  dropship: "It was emailed to your supplier with the address. Add their tracking to the order when they ship it, and the buyer is emailed.",
  print_on_demand: "It was sent to your print partner. Add their tracking to the order when they ship it, and the buyer is emailed.",
  pickup: "Get it ready, then open the order and press Mark ready for pickup. The buyer is emailed where and when to collect it.",
  local: "You deliver this order yourself. Press Fulfill items when it leaves, then Mark as delivered when it's handed over.",
}

export interface PhysicalSaleFacts {
  kind: "ship" | "pickup"
  /** The address lines, as the buyer gave them, for "Ship to". */
  shipTo: string[]
  phone: string
  /** "Standard, 3 to 5 business days". */
  method: string
  /** Who fulfils the order: one label, or each when the items differ. */
  fulfilment: string[]
  nextStep: string
  pickupName: string
  pickupAddress: string[]
  note: string
  /** What the shop's cart asked (an imported theme's cart attributes, then each line's properties), as "Name: value" rows. */
  details: string[]
  /** Shipping paid, after any free shipping. */
  shippingCents: number | null
  taxCents: number | null
  taxIncluded: boolean
  subtotalCents: number | null
  discountCents: number | null
  totalCents: number | null
  /** imageUrl: the line's picture as checkout kept it (the variant's photo, else the product's), unsized. */
  lines: { title: string; variantName: string | null; quantity: number; amountCents: number; fulfilment: string; imageUrl: string | null }[]
  /** Paid in cash on delivery (lib/physical/cash-on-delivery.ts): the money is the seller's to collect, never on its way to their balance. */
  cashDue?: boolean
}

const str = (v: unknown, max = 200) => cleanText(v, max)
const cents = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null)

/** "Maria Popescu", "Strada Lipscani 12, Ap. 4", "030031 Bucharest", "RO": the address as lines. */
function addressText(a: Record<string, unknown> | null | undefined): string[] {
  if (!a || typeof a !== "object") return []
  const city = [str(a.postalCode ?? a.postal_code, 20), str(a.city, 80)].filter(Boolean).join(" ")
  return [str(a.name, 80), [str(a.line1, 120), str(a.line2, 120)].filter(Boolean).join(", "), [city, str(a.region, 60)].filter(Boolean).join(", "), str(a.country, 60)].filter(Boolean)
}

/** The cart's attributes and each line's properties as "Name: value" (or "Item: Name: value"), at most twelve. */
function detailsOf(attributes: unknown, lines: Record<string, unknown>[]): string[] {
  const out: string[] = []
  if (attributes && typeof attributes === "object" && !Array.isArray(attributes)) {
    for (const [k, v] of Object.entries(attributes as Record<string, unknown>)) if (str(k, 100) && str(v, 300)) out.push(`${str(k, 100)}: ${str(v, 300)}`)
  }
  for (const l of lines) {
    const props = l.properties && typeof l.properties === "object" && !Array.isArray(l.properties) ? Object.entries(l.properties as Record<string, unknown>) : []
    /* A picture the buyer sent by its file name (lib/cart-uploads), never its address. */
    const said = props.map(([k, v]) => (str(k, 60) && str(v, 250) ? `${str(k, 60)}: ${propertyText(str(v, 250))}` : "")).filter(Boolean)
    if (said.length) out.push(`${str(l.title, 80) || "Item"}: ${said.join(", ")}`)
  }
  return out.slice(0, 12)
}

/**
 * The checkout row behind a physical sale (commerce_checkouts), read into
 * what the seller's email shows. Null for a checkout with nothing to ship
 * or pick up. Unknown values are left out, never guessed.
 */
export function physicalSaleFacts(co: Record<string, unknown> | null | undefined): PhysicalSaleFacts | null {
  if (!co || typeof co !== "object") return null
  const rawLines = Array.isArray(co.lines) ? (co.lines as Record<string, unknown>[]).filter((l) => l && typeof l === "object") : []
  const pickup = co.delivery_method === "pickup"
  const rateRow = (co.shipping_rate && typeof co.shipping_rate === "object" ? co.shipping_rate : null) as Record<string, unknown> | null
  /* Local delivery (part 154): the store brings it; no carrier, the store's own note says when. */
  const local = !pickup && rateRow?.kind === "local"
  const shipped = rawLines.filter((l) => l.requires_shipping !== false && (l.type === "physical" || l.requires_shipping === true))
  if (!pickup && shipped.length === 0 && co.delivery_method !== "ship") return null
  const methodOf = (l: Record<string, unknown>) => (pickup ? "pickup" : local ? "local" : typeof l.fulfillment_method === "string" && FULFIL_LABEL[l.fulfillment_method] ? l.fulfillment_method : "self")
  const lines = rawLines.slice(0, 50).map((l) => {
    const quantity = Math.max(1, Math.round(Number(l.quantity) || 1))
    const unit = cents(l.unit_cents) ?? 0
    const physical = l.requires_shipping !== false && l.type !== "digital"
    return {
      title: str(l.title, 120) || "Item",
      variantName: str(l.variant_name, 80) && str(l.variant_name, 80) !== "Default" ? str(l.variant_name, 80) : null,
      quantity,
      amountCents: Math.max(0, unit * quantity - (cents(l.discount_cents) ?? 0)),
      fulfilment: physical ? FULFIL_LABEL[methodOf(l)] : "Download",
      imageUrl: typeof l.image_url === "string" && /^https:\/\//.test(l.image_url) ? l.image_url.slice(0, 1000) : null,
    }
  })
  const kinds = [...new Set((pickup ? ["pickup"] : shipped.map(methodOf)) as string[])]
  const rate = (co.shipping_rate && typeof co.shipping_rate === "object" ? co.shipping_rate : null) as Record<string, unknown> | null
  const minDays = cents(rate?.min_days)
  const maxDays = cents(rate?.max_days)
  const days = minDays !== null && maxDays !== null ? (minDays === maxDays ? `${minDays} business ${minDays === 1 ? "day" : "days"}` : `${minDays} to ${maxDays} business days`) : ""
  const method = pickup ? "Local pickup" : local ? [str(rate?.name, 80) || "Local delivery", str(rate?.local_note, 160)].filter(Boolean).join(", ") : [str(rate?.name, 80), days].filter(Boolean).join(", ")
  const place = (co.pickup && typeof co.pickup === "object" ? co.pickup : null) as Record<string, unknown> | null
  const address = (co.shipping_address && typeof co.shipping_address === "object" ? co.shipping_address : null) as Record<string, unknown> | null
  const shipping = cents(co.shipping_cents)
  const shippingOff = cents(co.shipping_discount_cents) ?? 0
  return {
    kind: pickup ? "pickup" : "ship",
    shipTo: pickup ? [] : addressText(address),
    phone: str(address?.phone, 40),
    method,
    fulfilment: kinds.map((k) => FULFIL_LABEL[k] ?? FULFIL_LABEL.self),
    nextStep: kinds.length === 1 ? NEXT_STEP[kinds[0]] ?? NEXT_STEP.self : "Some items go to your partners on their own; ship the rest yourself. Each item's line in the order says who fulfils it.",
    pickupName: pickup ? str(place?.name, 80) : "",
    pickupAddress: pickup && Array.isArray(place?.address) ? (place!.address as unknown[]).map((x) => str(x, 120)).filter(Boolean) : [],
    /* The whole note, as the checkout lets a buyer write it (lib/checkout/site-checkout CART_NOTE_MAX). */
    note: str(co.buyer_note, 1000),
    details: detailsOf(co.cart_attributes, rawLines),
    shippingCents: shipping === null ? null : Math.max(0, shipping - shippingOff),
    taxCents: cents(co.tax_cents),
    taxIncluded: rate?.tax_included === true,
    subtotalCents: cents(co.items_subtotal_cents),
    discountCents: cents(co.discount_cents),
    totalCents: cents(co.total_cents),
    lines,
    cashDue: co.provider === "cod",
  }
}

/**
 * NEW_SALE's data for a physical order: the checkout's own lines and totals
 * in place of the order rows' (which leave shipping out), when they add up,
 * and the `fulfil` block the template draws. Data that does not add up
 * keeps what the order rows said.
 */
export function withPhysicalSale(data: Record<string, unknown>, read: PhysicalSaleFacts | null, nextStep?: string | null): Record<string, unknown> {
  if (!read) return data
  /* The order's own next step when it was read (lib/physical/orders-server.ts sellerNextStepFor: who ships each part and how they hear of it). */
  const facts: PhysicalSaleFacts = nextStep && nextStep.trim() ? { ...read, nextStep: str(nextStep, 600) } : read
  const fulfil = {
    kind: facts.kind,
    shipTo: facts.shipTo,
    phone: facts.phone,
    method: facts.method,
    fulfilment: facts.fulfilment,
    nextStep: facts.nextStep,
    pickupName: facts.pickupName,
    pickupAddress: facts.pickupAddress,
    note: facts.note,
    details: facts.details ?? [],
  }
  const out: Record<string, unknown> = { ...data, fulfil, ...(facts.cashDue ? { cashDue: true } : {}) }
  const { subtotalCents: sub, discountCents: off, shippingCents: ship, taxCents: tax, totalCents: total } = facts
  if (sub !== null && total !== null) {
    const adds = sub - (off ?? 0) + (ship ?? 0) + (facts.taxIncluded ? 0 : tax ?? 0) === total
    if (adds) {
      /* Who fulfils each line when they differ, and a download always says so (nothing to pack); each line's picture: the checkout's (the variant's photo), else the product's from the order rows by name. */
      const before = (Array.isArray(data.lines) ? data.lines : []) as { title?: unknown; imageUrl?: unknown }[]
      const pictureOf = (title: string) => before.find((b) => b.title === title && typeof b.imageUrl === "string")?.imageUrl ?? null
      out.lines = facts.lines.map((l) => ({ title: l.title, variantName: l.variantName, quantity: l.quantity, amountCents: l.amountCents, fulfilment: facts.fulfilment.length > 1 || l.fulfilment === "Download" ? l.fulfilment : null, imageUrl: l.imageUrl ?? pictureOf(l.title) }))
      out.subtotalCents = sub
      out.discountCents = off && off > 0 ? off : null
      /* Collected in person: no shipping row unless the store charged for it. */
      out.shippingCents = facts.kind === "pickup" && !ship ? null : ship
      out.taxCents = tax && tax > 0 ? tax : null
      out.taxIncluded = facts.taxIncluded
      out.amountCents = total
      out.tipCents = null
    }
  }
  return out
}

/* ── The seller's other order emails ────────────────────────────────────── */

export type SellerCommerceKind = "return_requested" | "cancel_requested" | "order_cancelled" | "delivery_exception" | "delivery_unconfirmed" | "payment_failed" | "low_stock"

/** The order event that sends each (lib/physical/events-server.ts sellerEmailFor). */
export function sellerKindForEvent(kind: string): SellerCommerceKind | null {
  if (kind === "return.requested") return "return_requested"
  if (kind === "order.cancel_requested") return "cancel_requested"
  if (kind === "order.cancelled") return "order_cancelled"
  if (kind === "delivery.exception" || kind === "fulfillment.exception") return "delivery_exception"
  /* A tracked parcel never marked delivered 60 days after it shipped (lib/physical/unconfirmed-delivery-server.ts). */
  if (kind === "delivery.unconfirmed") return "delivery_unconfirmed"
  if (kind === "payment.failed") return "payment_failed"
  return null
}

export interface SellerCommerceInput {
  /** The order's first row, for its page in the app (/app/orders?order=). */
  orderId?: string | null
  orderNumber?: string | null
  /** The buyer's reference for the same order (#85737C57, what their emails and order page say), when the number above is the Orders page's (lib/orders/order-number-server.ts). */
  buyerReference?: string | null
  buyerName?: string | null
  buyerEmail?: string | null
  /** imageUrl: the item's picture (https, any size: it is sized for the inbox here). */
  lines?: { title: string; variantName?: string | null; quantity?: number | null; imageUrl?: string | null }[]
  /** What the buyer or the carrier said: a return's reason, a cancellation's, the carrier's message. */
  reason?: string | null
  /** The buyer's own words with a return. */
  note?: string | null
  /** The order's total and any refund, already in the order's currency. */
  totalCents?: number | null
  refundedCents?: number | null
  currency?: string | null
  carrier?: string | null
  trackingNumber?: string | null
  /** Low stock only. */
  items?: { title: string; variantName?: string | null; available: number }[]
}

export interface SellerCommerceContext {
  baseUrl: string
  /** Notification settings, in the footer. Every email here is about one order or the stock: transactional, never an Unsubscribe link. */
  preferencesUrl?: string | null
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** The order's items as the email lists them: each with its picture (a letter tile without one), its option and quantity. */
function itemsBlock(title: string, lines: SellerCommerceInput["lines"]): LayoutInput["order"] {
  const list = (lines ?? []).slice(0, 20)
  if (!list.length) return null
  return {
    title,
    lines: list.map((l) => ({
      title: str(l.title, 120) || "Item",
      detail: [str(l.variantName, 60), `Qty ${Math.max(1, Math.round(Number(l.quantity) || 1))}`].filter(Boolean).join(" \u00b7 "),
      amount: "",
      imageUrl: inboxPicture(l.imageUrl, ITEM_PX),
    })),
    totals: [] as SummaryRow[],
  }
}

/** The whole email: subject, HTML and text, in Storelib's notification layout. */
export function sellerCommerceEmail(kind: SellerCommerceKind, m: SellerCommerceInput, ctx: SellerCommerceContext): { subject: string; html: string; text: string } {
  const number = str(m.orderNumber, 24).replace(/^#?/, "#")
  const order = number.length > 1 ? `order ${number}` : "an order"
  const buyer = str(m.buyerName, 80) || "A customer"
  const money = (c: number | null | undefined) => (typeof c === "number" && Number.isFinite(c) ? formatMoney(c, m.currency ?? "usd") : "")
  const orderPath = PATHS.order(str(m.orderId, 64))
  const link = (label: string, path: string) => {
    const url = actionUrl(ctx.baseUrl, path)
    return url ? { label, url } : null
  }
  /* The buyer is written to with the number they know: their reference. */
  const theirs = str(m.buyerReference, 24).replace(/^#?/, "#")
  const reply = m.buyerEmail ? mailtoUrl(m.buyerEmail, theirs.length > 1 ? `Your order ${theirs}` : number.length > 1 ? `Your order ${number}` : "Your order") : null
  const count = (m.lines ?? []).reduce((n, l) => n + Math.max(1, Math.round(Number(l.quantity) || 1)), 0)
  let family: TemplateFamily = "action_required"
  let subject = ""
  let heading = ""
  let paragraphs: string[] = []
  let facts: Fact[] = []
  let action: { label: string; url: string } | null = null
  let note: string | null = "You get these because order emails are on in your notification settings. You can turn them off there and still see every order in the app."
  let order_: LayoutInput["order"] = null
  switch (kind) {
    case "return_requested":
      subject = `Return requested for ${order}`
      heading = "A buyer asked to return items"
      paragraphs = [`${buyer} asked to return ${count ? plural(count, "item") : "items"} from ${order}. Review it, then approve it with your return instructions or decline it with a reason. The buyer is emailed either way.`]
      facts = [{ label: "Reason", value: str(m.reason, 160) }, { label: "Buyer's note", value: str(m.note, 400) }].filter((f) => f.value)
      order_ = itemsBlock("Items to return", m.lines)
      action = link("Review and approve", orderPath)
      break
    case "cancel_requested":
      subject = `Cancel request for ${order}`
      heading = "A buyer asked to cancel an order"
      paragraphs = [`${buyer} asked to cancel ${order} before it shipped. Don't send it yet. Open the order to cancel and refund it, or keep it and let them know. Nothing is cancelled until you do.`]
      facts = [{ label: "Reason", value: str(m.reason, 160) }, { label: "Order total", value: money(m.totalCents) }].filter((f) => f.value)
      order_ = itemsBlock("Items", m.lines)
      action = link("Review request", orderPath)
      break
    case "order_cancelled":
      family = "transaction"
      subject = `${number.length > 1 ? `Order ${number}` : "An order"} was cancelled`
      heading = "An order was cancelled"
      paragraphs = [`${buyer} cancelled ${order} before it shipped. Don't send it. ${typeof m.refundedCents === "number" && m.refundedCents > 0 ? `${money(m.refundedCents)} was refunded to them.` : "If they were charged, refund them from the order."}`]
      facts = [{ label: "Reason", value: str(m.reason, 160) }, { label: "Order total", value: money(m.totalCents) }].filter((f) => f.value)
      order_ = itemsBlock("Cancelled items", m.lines)
      action = link("View order", orderPath)
      break
    case "delivery_exception":
      subject = `Delivery problem with ${order}`
      heading = "A parcel couldn't be delivered"
      paragraphs = [`The carrier reported a problem delivering ${order}. Check the tracking, then contact the buyer or the carrier so it reaches them.`]
      facts = [{ label: "Carrier", value: str(m.carrier, 60) }, { label: "Tracking number", value: str(m.trackingNumber, 60) }, { label: "What the carrier said", value: str(m.reason, 200) }].filter((f) => f.value)
      order_ = itemsBlock("Items", m.lines)
      action = link("View order", orderPath)
      break
    case "delivery_unconfirmed":
      subject = `Delivery not confirmed for ${order}`
      heading = "A parcel was never marked delivered"
      paragraphs = [`${order} shipped 60 days ago and its tracking never said it arrived. Check with the carrier or ask the buyer, then mark it delivered or report a delivery problem on the order.`]
      facts = [{ label: "Carrier", value: str(m.carrier, 60) }, { label: "Tracking number", value: str(m.trackingNumber, 60) }].filter((f) => f.value)
      order_ = itemsBlock("Items", m.lines)
      action = link("View order", orderPath)
      break
    case "payment_failed":
      subject = `Payment failed for ${order}`
      heading = "A payment didn't go through"
      paragraphs = [`The payment for ${order} failed${m.reason ? `: ${str(m.reason, 160)}` : ""}. Don't ship it until it is paid. The stock it held was released.`]
      facts = [{ label: "Amount", value: money(m.totalCents) }].filter((f) => f.value)
      order_ = itemsBlock("Items", m.lines)
      action = link("View order", orderPath)
      break
    case "low_stock": {
      family = "base"
      const items = (m.items ?? []).slice(0, 50)
      const out = items.filter((i) => i.available <= 0).length
      subject = items.length === 1 ? `Low stock: ${str(items[0].title, 80)}${items[0].variantName ? ` (${str(items[0].variantName, 40)})` : ""}` : `${items.length} products are running low`
      heading = out > 0 ? "Stock is running out" : "Stock is running low"
      paragraphs = [out > 0 ? "Some of your products are sold out or nearly sold out. Restock them so buyers can keep ordering." : "Some of your products are running low. Restock them before they sell out."]
      order_ = {
        title: "Running low",
        lines: items.map((i) => ({ title: str(i.title, 120) || "Product", detail: str(i.variantName, 60) || null, amount: i.available <= 0 ? "Sold out" : `${i.available} left` })),
        totals: [] as SummaryRow[],
      }
      action = link("Open Inventory", "/app/inventory?filter=low")
      note = "You get these because low stock emails are on in Settings › Locations. Turn them off there."
      break
    }
  }
  /* What the buyer quotes when they write: their reference, beside the seller's number. */
  if (theirs.length > 1 && theirs !== number && kind !== "low_stock") facts = [...facts, { label: "Buyer's reference", value: theirs.slice(1) }]
  const input: LayoutInput = {
    family,
    subject: cleanText(subject, 90),
    preview: cleanText(paragraphs[0] ?? "", 140),
    heading,
    greeting: null,
    paragraphs,
    facts,
    order: order_,
    action,
    secondary: reply && kind !== "low_stock" && kind !== "delivery_exception" ? { label: "Reply to the buyer", url: reply } : reply && kind === "delivery_exception" ? { label: "Email the buyer", url: reply } : null,
    note,
    reason: "You get this because you sell on Storelib.",
    homeUrl: `${canonicalOrigin(ctx.baseUrl)}/`,
    unsubscribeUrl: null,
    /* Low stock is turned off in Locations, not in Notifications: no settings link there. */
    preferencesUrl: kind === "low_stock" ? null : sameSiteUrl(ctx.baseUrl, ctx.preferencesUrl),
  }
  return { subject: input.subject, html: renderHtml(input), text: renderText(input) }
}

/**
 * To the seller: these sold down to their low stock line. In Storelib's own
 * email look, as every seller email is (lib/notify/seller-commerce.ts).
 */
export function lowStockEmail(m: { shopName: string; items: { title: string; variantName: string | null; available: number; threshold: number }[]; inventoryUrl: string }): {
  subject: string
  html: string
  text: string
} {
  let base = "https://storelib.com"
  try {
    base = new URL(m.inventoryUrl).origin
  } catch {
    /* Storelib's own address stands in. */
  }
  const mail = sellerCommerceEmail("low_stock", { items: m.items }, { baseUrl: base })
  const out = m.items.some((i) => i.available <= 0)
  const text = [
    out ? "Stock is running out" : "Stock is running low",
    "",
    ...m.items.map((i) => `${i.title}${i.variantName ? ` (${i.variantName})` : ""}: ${i.available <= 0 ? "sold out" : `${i.available} left`}`),
    "",
    `Open Inventory: ${m.inventoryUrl}`,
    "",
    "You get these because low stock emails are on in Settings › Locations. Turn them off there.",
  ].join("\n")
  return { subject: mail.subject, html: mail.html, text }
}
