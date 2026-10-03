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

function shell(shopName: string, heading: string, intro: string, body: string, subject: string): string {
  const html = `<div style="background:#f8f9fa;padding:24px 12px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
<tr><td style="padding:28px 28px 8px 28px;">
<p style="margin:0 0 20px 0;font-size:15px;font-weight:600;color:${INK};">${esc(shopName)}</p>
<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;font-weight:700;color:${INK};">${esc(heading)}</h1>
<p style="margin:0 0 20px 0;font-size:14px;line-height:22px;color:${MUTED};">${intro}</p>
</td></tr>
${body}
<tr><td style="padding:16px 28px 28px 28px;font-size:12px;line-height:18px;color:${MUTED};">Questions about this order? Reply to this email and it goes to ${esc(shopName)}.</td></tr>
</table></div>`
  return finalizeEmailHtml(html, subject)
}

function linesTable(lines: EmailLine[], currency: string, prices = true): string {
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
  return `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};">${rows}</table></td></tr>`
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
}

export function orderConfirmationEmail(m: OrderEmailModel): { subject: string; html: string; text: string } {
  const subject = `Order ${m.orderNumber} confirmed`
  const hi = m.buyerFirstName ? `Thanks, ${esc(m.buyerFirstName)}. ` : "Thanks for your order. "
  const intro = `${hi}${m.address?.line1 ? "We'll email you again when it ships." : "Everything is ready on your order page."}${m.hasDownloads ? " Your downloads are on your order page." : ""}`
  const delivery = m.deliveryName ? `${esc(m.deliveryName)}${m.deliveryEstimate ? `, ${esc(m.deliveryEstimate)}` : ""}` : undefined
  const body = [
    linesTable(m.lines, m.totals.currency),
    totalsTable(m.totals),
    m.address?.line1 ? addressBlock("Shipping to", m.address, delivery) : "",
    button(m.statusUrl, "View your order"),
  ].join("")
  const text = [
    `${m.shopName}: order ${m.orderNumber} confirmed`,
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}: ${formatMoney(l.cents, m.totals.currency)}`),
    "",
    `Total: ${formatMoney(m.totals.total, m.totals.currency)}`,
    ...(m.address?.line1 ? ["", "Shipping to:", ...addressLines(m.address)] : []),
    "",
    `View your order: ${m.statusUrl}`,
  ].join("\n")
  return { subject, html: shell(m.shopName, `Order ${m.orderNumber} confirmed`, intro, body, subject), text }
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
