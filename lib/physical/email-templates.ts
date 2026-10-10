/**
 * ===========================================================================
 *  THE EMAILS A PHYSICAL ORDER SENDS
 * ===========================================================================
 * Order confirmed, shipped (with tracking), delivered, return updates, and
 * the order a supplier is asked to fulfil. Pure: built from plain values so
 * a test can read them, sent by ./emails-server.ts. Tables and inline styles
 * only, as every inbox needs; the shop's name on top, Storelib nowhere loud.
 */

import { emailButton, finalizeEmailHtml } from "@/lib/mail-document"
import { addressLines } from "./address"
import type { Address } from "./types"

export interface EmailLine {
  title: string
  variantName: string | null
  quantity: number
  /** What the buyer paid for the line: unit times quantity, less its discount. */
  cents: number
  imageUrl: string | null
  sku?: string | null
}

export interface EmailTotals {
  subtotal: number
  discount: number
  shipping: number
  shippingDiscount: number
  tax: number
  taxIncluded: boolean
  total: number
  currency: string
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function formatMoney(cents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(2)}`
  }
}

const INK = "#1a1a2e"
const MUTED = "#6b7280"
const LINE = "#eceef1"

function shell(shopName: string, heading: string, intro: string, body: string, subject: string, opts: { aside?: string; footer?: string } = {}): string {
  const top = opts.aside
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr><td style="font-size:15px;font-weight:600;color:${INK};">${esc(shopName)}</td><td align="right" style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">${esc(opts.aside)}</td></tr></table>`
    : `<p style="margin:0 0 20px 0;font-size:15px;font-weight:600;color:${INK};">${esc(shopName)}</p>`
  const html = `<div style="background:#f8f9fa;padding:24px 12px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
<style>@media only screen and (max-width:480px){td.col{display:block !important;width:100% !important;}}</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
<tr><td style="padding:28px 28px 8px 28px;">
${top}
<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;font-weight:700;color:${INK};">${esc(heading)}</h1>
<p style="margin:0 0 20px 0;font-size:14px;line-height:22px;color:${MUTED};">${intro}</p>
</td></tr>
${body}
<tr><td style="padding:24px 28px 28px 28px;font-size:12px;line-height:18px;color:${MUTED};">${opts.footer ?? `Questions about this order? Reply to this email and it goes to ${esc(shopName)}.`}</td></tr>
</table></div>`
  return finalizeEmailHtml(html, subject)
}

function linesTable(lines: EmailLine[], currency: string, prices = true, ruled = true): string {
  const rows = lines
    .map(
      (l) => `<tr>
<td width="56" style="padding:10px 12px 10px 0;vertical-align:top;">${
        l.imageUrl && /^https:\/\//.test(l.imageUrl)
          ? `<img src="${esc(l.imageUrl)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border-radius:8px;object-fit:cover;border:1px solid ${LINE};">`
          : `<div style="width:48px;height:48px;border-radius:8px;background:#f1f2f4;"></div>`
      }</td>
<td style="padding:10px 0;vertical-align:top;font-size:14px;line-height:20px;color:${INK};">${esc(l.title)}${l.variantName ? `<br><span style="color:${MUTED};font-size:13px;">${esc(l.variantName)}</span>` : ""}<br><span style="color:${MUTED};font-size:13px;">Qty ${l.quantity}</span></td>
<td align="right" style="padding:10px 0;vertical-align:top;font-size:14px;color:${INK};white-space:nowrap;">${prices ? esc(formatMoney(l.cents, currency)) : ""}</td>
</tr>`,
    )
    .join("")
  return `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${ruled ? ` style="border-top:1px solid ${LINE};"` : ""}>${rows}</table></td></tr>`
}

function totalsTable(t: EmailTotals): string {
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;color:${strong ? INK : MUTED};${strong ? "font-weight:600;" : ""}">${esc(label)}</td><td align="right" style="padding:4px 0;font-size:14px;color:${INK};${strong ? "font-weight:600;" : ""}">${esc(value)}</td></tr>`
  const shipping = t.shipping - t.shippingDiscount
  return `<tr><td style="padding:8px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};padding-top:8px;">
${row("Subtotal", formatMoney(t.subtotal, t.currency))}
${t.discount > 0 ? row("Discount", `-${formatMoney(t.discount, t.currency)}`) : ""}
${t.shipping > 0 || t.shippingDiscount > 0 ? row("Shipping", shipping === 0 ? "Free" : formatMoney(shipping, t.currency)) : ""}
${t.tax > 0 ? row(t.taxIncluded ? "Tax (included)" : "Tax", formatMoney(t.tax, t.currency)) : ""}
${row("Total", formatMoney(t.total, t.currency), true)}
</table></td></tr>`
}

function addressBlock(label: string, address: Partial<Address> | null, extra?: string): string {
  const lines = addressLines(address)
  if (lines.length === 0 && !extra) return ""
  return `<tr><td style="padding:16px 28px 0 28px;"><p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:${INK};">${esc(label)}</p><p style="margin:0;font-size:14px;line-height:21px;color:${MUTED};">${lines.map(esc).join("<br>")}${extra ? `${lines.length ? "<br>" : ""}${extra}` : ""}</p></td></tr>`
}

function button(href: string, label: string): string {
  return `<tr><td style="padding:20px 28px 0 28px;">${emailButton({ href, label: esc(label), fill: INK, padding: "12px 20px", radius: 10, text: "font-size:14px;font-weight:600;" })}</td></tr>`
}

export interface OrderEmailModel {
  shopName: string
  orderNumber: string
  buyerFirstName: string | null
  lines: EmailLine[]
  totals: EmailTotals
  address: Partial<Address> | null
  deliveryName: string | null
  deliveryEstimate: string | null
  statusUrl: string
  hasDownloads: boolean
  /** Picked up instead of shipped: where, when it is usually ready, and what to bring. */
  pickup?: { name: string; address: string[]; ready: string | null; instructions: string | null } | null
  /** The store, for "or visit our store": its creator page. */
  storeUrl?: string | null
  /** How it was paid, as the receipt says it ("Visa ending 4242"). */
  paymentLabel?: string | null
  /** Where a question goes, said in the footer as well as by replying. */
  supportEmail?: string | null
}

function pickupBlock(p: { name: string; address: string[]; ready: string | null; instructions: string | null }): string {
  const lines = [p.name, ...p.address].map(esc).join("<br>")
  const extra = [p.ready ? esc(p.ready) : "", p.instructions ? esc(p.instructions).replace(/\n/g, "<br>") : ""].filter(Boolean).join("<br><br>")
  return `<tr><td style="padding:16px 28px 0 28px;"><p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:${INK};">Pick up at</p><p style="margin:0;font-size:14px;line-height:21px;color:${MUTED};">${lines}${extra ? `<br><br>${extra}` : ""}</p></td></tr>`
}

/** A heading over a part of the email, with a rule above it, like Shopify's. */
function sectionHeading(label: string): string {
  return `<tr><td style="padding:24px 28px 4px 28px;"><p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};font-size:16px;font-weight:600;color:${INK};">${esc(label)}</p></td></tr>`
}

/** Two columns of label and lines, folding into one on a narrow screen. */
function infoGrid(cells: { label: string; html: string }[]): string {
  const cell = (c: { label: string; html: string }) =>
    `<td class="col" width="50%" style="padding:12px 12px 0 0;vertical-align:top;"><p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:${INK};">${esc(c.label)}</p><p style="margin:0;font-size:14px;line-height:21px;color:${MUTED};">${c.html}</p></td>`
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cell(cells[i])}${cells[i + 1] ? cell(cells[i + 1]) : '<td class="col" width="50%"></td>'}</tr>`)
  return `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.join("")}</table></td></tr>`
}

/**
 * ORDER CONFIRMED, THE WAY SHOPIFY'S READS. The shop's name with the order
 * number across from it; a thank you and what happens next; the order page
 * and the store as two ways on; the order summary with what was saved; and
 * the customer information (where it goes, how, and how it was paid). The
 * footer says where questions go. Only what the order has is drawn: no
 * empty headings, no "Billing address" Storelib never asked for.
 */
export function orderConfirmationEmail(m: OrderEmailModel): { subject: string; html: string; text: string } {
  const subject = `Order ${m.orderNumber} confirmed`
  const hello = m.buyerFirstName ? `Hi ${esc(m.buyerFirstName)}, ` : ""
  const next = m.pickup ? "we're getting your order ready. We'll email you when it's ready to pick up." : m.address?.line1 ? "we're getting your order ready to be shipped. We'll let you know when it's on its way." : "your order is confirmed and everything is on your order page."
  const intro = `${hello}${hello ? next : next.charAt(0).toUpperCase() + next.slice(1)}${m.hasDownloads ? " Your downloads are on your order page." : ""}`
  const saved = m.totals.discount + m.totals.shippingDiscount
  const delivery = m.deliveryName ? `${esc(m.deliveryName)}${m.deliveryEstimate ? `<br>${esc(m.deliveryEstimate)}` : ""}` : null
  const info: { label: string; html: string }[] = []
  if (m.pickup) info.push({ label: "Pick up at", html: [m.pickup.name, ...m.pickup.address].map(esc).join("<br>") + (m.pickup.ready ? `<br><br>${esc(m.pickup.ready)}` : "") + (m.pickup.instructions ? `<br><br>${esc(m.pickup.instructions).replace(/\n/g, "<br>")}` : "") })
  else if (m.address?.line1) info.push({ label: "Shipping address", html: addressLines(m.address).map(esc).join("<br>") })
  if (!m.pickup && delivery) info.push({ label: "Shipping method", html: delivery })
  if (m.paymentLabel) info.push({ label: "Payment method", html: `${esc(m.paymentLabel)}<br>${esc(formatMoney(m.totals.total, m.totals.currency))}` })

  const actions = `<tr><td style="padding:4px 28px 0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>${emailButton({ href: m.statusUrl, label: "View your order", fill: INK, padding: "12px 20px", radius: 10, text: "font-size:14px;font-weight:600;" })}</td>${
    m.storeUrl && /^https:\/\//.test(m.storeUrl) ? `<td style="padding-left:16px;font-size:14px;color:${MUTED};">or <a href="${esc(m.storeUrl)}" style="color:${INK};text-decoration:underline;">Visit our store</a></td>` : ""
  }</tr></table></td></tr>`

  const body = [
    actions,
    sectionHeading("Order summary"),
    linesTable(m.lines, m.totals.currency, true, false),
    totalsTable(m.totals),
    saved > 0 ? `<tr><td style="padding:6px 28px 0 28px;font-size:13px;color:#067647;">You saved ${esc(formatMoney(saved, m.totals.currency))}</td></tr>` : "",
    info.length ? sectionHeading("Customer information") + infoGrid(info) : "",
  ].join("")
  const text = [
    `${m.shopName}: order ${m.orderNumber} confirmed`,
    "",
    intro.replace(/<[^>]+>/g, ""),
    "",
    "Order summary",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}: ${formatMoney(l.cents, m.totals.currency)}`),
    `Total: ${formatMoney(m.totals.total, m.totals.currency)}`,
    ...(saved > 0 ? [`You saved ${formatMoney(saved, m.totals.currency)}`] : []),
    ...(m.pickup
      ? ["", "Pick up at:", m.pickup.name, ...m.pickup.address, ...(m.pickup.ready ? [m.pickup.ready] : []), ...(m.pickup.instructions ? ["", m.pickup.instructions] : [])]
      : m.address?.line1
        ? ["", "Shipping address:", ...addressLines(m.address), ...(m.deliveryName ? ["", `Shipping method: ${m.deliveryName}`] : [])]
        : []),
    ...(m.paymentLabel ? ["", `Payment method: ${m.paymentLabel}`] : []),
    "",
    `View your order: ${m.statusUrl}`,
    ...(m.storeUrl ? [`Visit our store: ${m.storeUrl}`] : []),
  ].join("\n")
  const footer = m.supportEmail ? `If you have any questions, reply to this email or write to ${esc(m.supportEmail)}.` : undefined
  return { subject, html: shell(m.shopName, "Thank you for your purchase!", intro, body, subject, { aside: `Order ${m.orderNumber}`, footer }), text }
}

/** Ready to collect, or collected. */
export function pickupEmail(m: {
  shopName: string
  orderNumber: string
  buyerFirstName: string | null
  lines: EmailLine[]
  kind: "ready" | "picked_up"
  pickup: { name: string; address: string[]; ready: string | null; instructions: string | null }
  statusUrl: string
}): { subject: string; html: string; text: string } {
  const heading = m.kind === "ready" ? "Your order is ready to pick up" : "Your order was picked up"
  const subject = heading.replace("Your order", `Order ${m.orderNumber}`)
  const intro =
    m.kind === "ready"
      ? `${m.buyerFirstName ? `Good news, ${esc(m.buyerFirstName)}. ` : ""}Your order is ready. Bring your order number, ${esc(m.orderNumber)}.`
      : "Thanks for picking up your order. We hope you love it."
  const body = [linesTable(m.lines, "USD", false), m.kind === "ready" ? pickupBlock({ ...m.pickup, ready: null }) : "", button(m.statusUrl, "View your order")].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(m.kind === "ready" ? ["", "Pick up at:", m.pickup.name, ...m.pickup.address, ...(m.pickup.instructions ? ["", m.pickup.instructions] : [])] : []),
    "",
    `View your order: ${m.statusUrl}`,
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject), text }
}

/** To the seller: these sold down to their low stock line. */
export function lowStockEmail(m: { shopName: string; items: { title: string; variantName: string | null; available: number; threshold: number }[]; inventoryUrl: string }): {
  subject: string
  html: string
  text: string
} {
  const out = m.items.filter((i) => i.available <= 0).length
  const subject = m.items.length === 1 ? `Low stock: ${m.items[0].title}${m.items[0].variantName ? ` (${m.items[0].variantName})` : ""}` : `${m.items.length} products are running low`
  const intro = out > 0 ? "Some of your products are sold out or nearly sold out. Restock them so buyers can keep ordering." : "Some of your products are running low. Restock them before they sell out."
  const rows = m.items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f2f4;font-size:14px;color:${INK};">${esc(i.title)}${i.variantName ? `<br><span style="color:${MUTED};font-size:13px;">${esc(i.variantName)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #f1f2f4;font-size:14px;color:${i.available <= 0 ? "#b42318" : INK};text-align:right;white-space:nowrap;">${i.available <= 0 ? "Sold out" : `${i.available} left`}</td></tr>`,
    )
    .join("")
  const body = `<tr><td style="padding:8px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>${button(m.inventoryUrl, "Open Inventory")}`
  const text = [subject, "", ...m.items.map((i) => `${i.title}${i.variantName ? ` (${i.variantName})` : ""}: ${i.available <= 0 ? "sold out" : `${i.available} left`}`), "", `Inventory: ${m.inventoryUrl}`].join("\n")
  return { subject, html: shell(m.shopName, out > 0 ? "Stock is running out" : "Stock is running low", intro, body, subject), text }
}

export interface ShipmentEmailModel {
  shopName: string
  orderNumber: string
  buyerFirstName: string | null
  lines: EmailLine[]
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  address: Partial<Address> | null
  statusUrl: string
  kind: "shipped" | "delivered" | "out_for_delivery"
}

export function shipmentEmail(m: ShipmentEmailModel): { subject: string; html: string; text: string } {
  const heading = m.kind === "delivered" ? "Your order was delivered" : m.kind === "out_for_delivery" ? "Your order is out for delivery" : "Your order is on the way"
  const subject = `${heading.replace("Your order", `Order ${m.orderNumber}`)}`
  const intro =
    m.kind === "delivered"
      ? "Your package was delivered. We hope you love it."
      : m.kind === "out_for_delivery"
        ? "Your package is out for delivery today."
        : `${m.buyerFirstName ? `Good news, ${esc(m.buyerFirstName)}. ` : ""}Your items have shipped.`
  const tracking = m.trackingNumber ? `${m.carrier ? `${esc(m.carrier)} ` : ""}tracking number ${esc(m.trackingNumber)}` : undefined
  const body = [
    linesTable(m.lines, "USD", false),
    tracking ? addressBlock("Tracking", null, tracking) : "",
    m.kind !== "delivered" && m.address?.line1 ? addressBlock("Shipping to", m.address) : "",
    m.trackingUrl ? button(m.trackingUrl, "Track your package") : button(m.statusUrl, "View your order"),
  ].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(tracking ? ["", tracking.replace(/&amp;/g, "&")] : []),
    "",
    m.trackingUrl ? `Track: ${m.trackingUrl}` : `View your order: ${m.statusUrl}`,
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject), text }
}

export function returnEmail(m: { shopName: string; orderNumber: string; status: "approved" | "rejected" | "received" | "completed"; note: string | null; refundedCents: number; currency: string; statusUrl: string }): {
  subject: string
  html: string
  text: string
} {
  const heading =
    m.status === "approved" ? "Your return was approved" : m.status === "rejected" ? "About your return" : m.status === "received" ? "We received your return" : "Your return is complete"
  const intro =
    m.status === "approved"
      ? "Send the items back using the details below."
      : m.status === "rejected"
        ? "The shop could not accept this return."
        : m.status === "received"
          ? "Your items arrived back at the shop."
          : m.refundedCents > 0
            ? `A refund of ${esc(formatMoney(m.refundedCents, m.currency))} is on its way to your payment method.`
            : "Your return is closed."
  const subject = `${heading} (order ${m.orderNumber})`
  const body = [m.note ? addressBlock("From the shop", null, esc(m.note)) : "", button(m.statusUrl, "View your order")].join("")
  return {
    subject,
    html: shell(m.shopName, heading, intro, body, subject),
    text: [`${m.shopName}: ${heading}`, "", intro.replace(/&amp;/g, "&"), ...(m.note ? ["", m.note] : []), "", `View your order: ${m.statusUrl}`].join("\n"),
  }
}

/** The order a supplier or dropshipper is asked to ship: what, how many, to whom. No prices. */
export function supplierOrderEmail(m: { shopName: string; orderNumber: string; locationName: string; lines: (EmailLine & { sku?: string | null })[]; address: Partial<Address> | null; buyerEmail: string | null; deliveryName: string | null; note: string | null }): {
  subject: string
  html: string
  text: string
} {
  const subject = `New order to fulfil: ${m.orderNumber} from ${m.shopName}`
  const rows = m.lines
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;font-size:14px;color:${INK};border-bottom:1px solid ${LINE};">${esc(l.title)}${l.variantName ? ` (${esc(l.variantName)})` : ""}${l.sku ? `<br><span style="color:${MUTED};font-size:12px;">SKU ${esc(l.sku)}</span>` : ""}</td><td align="right" style="padding:8px 0;font-size:14px;color:${INK};border-bottom:1px solid ${LINE};">x ${l.quantity}</td></tr>`,
    )
    .join("")
  const body = [
    `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`,
    addressBlock("Ship to", m.address, m.deliveryName ? `Delivery: ${esc(m.deliveryName)}` : undefined),
    m.note ? addressBlock("Buyer's note", null, esc(m.note)) : "",
  ].join("")
  const text = [
    subject,
    `For: ${m.locationName}`,
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}${l.sku ? ` [SKU ${l.sku}]` : ""}`),
    "",
    "Ship to:",
    ...addressLines(m.address),
    ...(m.deliveryName ? [`Delivery: ${m.deliveryName}`] : []),
    ...(m.note ? ["", `Buyer's note: ${m.note}`] : []),
  ].join("\n")
  return { subject, html: shell(m.shopName, `Order ${m.orderNumber} to fulfil`, `Please ship these items for ${esc(m.shopName)}, then reply with the tracking number.`, body, subject), text }
}
