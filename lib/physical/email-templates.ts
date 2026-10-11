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
import type { ResolvedCopy } from "@/lib/emails/customer-custom"
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

/**
 * THE STORE, AS ITS BUYERS KNOW IT: the logo from Settings › Store details
 * (else the website's logo, else the profile photo; lib/store/identity-
 * server.ts), and the ways to reach a person there. Every buyer email takes
 * it; an email without it still reads, with the store's name on top.
 */
export interface EmailBrand {
  logoUrl?: string | null
  email?: string | null
  phone?: string | null
  websiteUrl?: string | null
  /** The buyer's order page, for "Get help with this order". */
  helpUrl?: string | null
}

function brandTop(shopName: string, brand: EmailBrand | undefined, aside: string | undefined): string {
  const logo = brand?.logoUrl && /^https:\/\//.test(brand.logoUrl) ? brand.logoUrl : null
  const name = logo
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:10px;vertical-align:middle;"><img src="${esc(logo)}" height="36" alt="${esc(shopName)}" style="display:block;height:36px;width:auto;max-width:160px;border-radius:8px;border:0;"></td><td style="vertical-align:middle;font-size:15px;font-weight:600;color:${INK};">${esc(shopName)}</td></tr></table>`
    : `<span style="font-size:15px;font-weight:600;color:${INK};">${esc(shopName)}</span>`
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td style="vertical-align:middle;">${name}</td>${
    aside ? `<td align="right" style="vertical-align:middle;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};white-space:nowrap;">${esc(aside)}</td>` : ""
  }</tr></table>`
}

/** Where a question goes: reply, or the store's own address, phone and website, and the order page's help. */
function brandFooter(shopName: string, brand: EmailBrand | undefined, footer: string | undefined): string {
  const reach: string[] = []
  if (brand?.email) reach.push(`<a href="mailto:${esc(brand.email)}" style="color:${INK};text-decoration:underline;white-space:nowrap;">${esc(brand.email)}</a>`)
  if (brand?.phone) reach.push(`<a href="tel:${esc(brand.phone.replace(/[^+\d]/g, ""))}" style="color:${INK};text-decoration:none;white-space:nowrap;">${esc(brand.phone)}</a>`)
  if (brand?.websiteUrl && /^https:\/\//.test(brand.websiteUrl)) reach.push(`<a href="${esc(brand.websiteUrl)}" style="color:${INK};text-decoration:underline;white-space:nowrap;">${esc(brand.websiteUrl.replace(/^https:\/\//, "").replace(/\/$/, ""))}</a>`)
  const first = footer ?? `Questions about this order? Reply to this email and it goes to ${esc(shopName)}.`
  const help = brand?.helpUrl ? `<br>Something wrong with your order? <a href="${esc(brand.helpUrl)}" style="color:${INK};text-decoration:underline;">Get help with this order</a>.` : ""
  return `${first}${reach.length ? `<br>${reach.join(`<span style="color:#c4c8cf;">&nbsp;&nbsp;·&nbsp;&nbsp;</span>`)}` : ""}${help}`
}

function shell(shopName: string, heading: string, intro: string, body: string, subject: string, opts: { aside?: string; footer?: string; brand?: EmailBrand } = {}): string {
  const html = `<div style="background:#f8f9fa;padding:24px 12px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${INK};">
<style>@media only screen and (max-width:480px){td.col{display:block !important;width:100% !important;}td.step{font-size:11px !important;}}</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;">
<tr><td style="padding:28px 28px 8px 28px;">
${brandTop(shopName, opts.brand, opts.aside)}
<h1 style="margin:0 0 8px 0;font-size:22px;line-height:28px;font-weight:700;color:${INK};">${esc(heading)}</h1>
<p style="margin:0 0 20px 0;font-size:14px;line-height:22px;color:${MUTED};">${intro}</p>
</td></tr>
${body}
<tr><td style="padding:24px 28px 28px 28px;"><p style="margin:0;padding-top:20px;border-top:1px solid ${LINE};font-size:12.5px;line-height:20px;color:${MUTED};">${brandFooter(shopName, opts.brand, opts.footer)}</p></td></tr>
</table></div>`
  return finalizeEmailHtml(html, subject)
}

/** Plain-text footer lines: the same ways to reach the store. */
function brandText(brand: EmailBrand | undefined): string[] {
  const out = [brand?.email, brand?.phone, brand?.websiteUrl].filter((x): x is string => !!x)
  return [...(out.length ? ["", ...out] : []), ...(brand?.helpUrl ? ["", `Get help with this order: ${brand.helpUrl}`] : [])]
}

/**
 * Where the parcel is, as four steps: confirmed, on its way, out for
 * delivery, delivered. Done steps in ink, the rest grey; a table, so every
 * inbox draws it.
 */
function progressBar(at: 0 | 1 | 2 | 3): string {
  const steps = ["Confirmed", "On its way", "Out for delivery", "Delivered"]
  const cells = steps
    .map((label, i) => {
      const done = i <= at
      return `<td class="step" width="25%" style="padding:0 ${i < 3 ? 4 : 0}px 0 0;vertical-align:top;font-size:12px;line-height:16px;color:${done ? INK : "#9ca3af"};${i === at ? "font-weight:600;" : ""}"><div style="height:4px;border-radius:2px;background:${done ? INK : "#e5e7eb"};margin:0 0 8px 0;line-height:4px;font-size:0;">&nbsp;</div>${label}</td>`
    })
    .join("")
  return `<tr><td style="padding:0 28px 8px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`
}

/** A grey box holding the carrier and the number, with the number large enough to read off. */
function trackingBox(carrier: string | null, number: string | null, url: string | null): string {
  if (!number && !url) return ""
  return `<tr><td style="padding:16px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa;border:1px solid ${LINE};border-radius:12px;"><tr><td style="padding:14px 16px;"><p style="margin:0 0 2px 0;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">${esc(carrier || "Tracking")}</p>${
    number ? `<p style="margin:0;font-size:15px;font-weight:600;color:${INK};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(number)}</p>` : ""
  }</td>${url ? `<td align="right" style="padding:14px 16px;"><a href="${esc(url)}" style="font-size:14px;font-weight:600;color:${INK};text-decoration:underline;white-space:nowrap;">Track</a></td>` : ""}</tr></table></td></tr>`
}

/** A second way on, as a link under the button. */
function textLink(href: string, label: string): string {
  return `<tr><td style="padding:12px 28px 0 28px;font-size:14px;color:${MUTED};">or <a href="${esc(href)}" style="color:${INK};text-decoration:underline;">${esc(label)}</a></td></tr>`
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
  brand?: EmailBrand
  /** The store's own words from Settings › Customer emails (lib/emails/customer-custom.ts). */
  copy?: ResolvedCopy
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
  const subject = m.copy?.subject ?? `Order ${m.orderNumber} confirmed`
  const hello = m.buyerFirstName ? `Hi ${esc(m.buyerFirstName)}, ` : ""
  const next = m.pickup ? "we're getting your order ready. We'll email you when it's ready to pick up." : m.address?.line1 ? "we're getting your order ready to be shipped. We'll let you know when it's on its way." : "your order is confirmed and everything is on your order page."
  const intro = m.copy?.introHtml ?? `${hello}${hello ? next : next.charAt(0).toUpperCase() + next.slice(1)}${m.hasDownloads ? " Your downloads are on your order page." : ""}`
  const saved = m.totals.discount + m.totals.shippingDiscount
  const delivery = m.deliveryName ? `${esc(m.deliveryName)}${m.deliveryEstimate ? `<br>${esc(m.deliveryEstimate)}` : ""}` : null
  const info: { label: string; html: string }[] = []
  if (m.pickup) info.push({ label: "Pick up at", html: [m.pickup.name, ...m.pickup.address].map(esc).join("<br>") + (m.pickup.ready ? `<br><br>${esc(m.pickup.ready)}` : "") + (m.pickup.instructions ? `<br><br>${esc(m.pickup.instructions).replace(/\n/g, "<br>")}` : "") })
  else if (m.address?.line1) info.push({ label: "Shipping address", html: addressLines(m.address).map(esc).join("<br>") })
  if (!m.pickup && delivery) info.push({ label: "Shipping method", html: delivery })
  if (m.paymentLabel) info.push({ label: "Payment method", html: `${esc(m.paymentLabel)}<br>${esc(formatMoney(m.totals.total, m.totals.currency))}` })

  const actions = `<tr><td style="padding:4px 28px 0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td>${emailButton({ href: m.statusUrl, label: esc(m.copy?.button ?? "View your order"), fill: INK, padding: "12px 20px", radius: 10, text: "font-size:14px;font-weight:600;" })}</td>${
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
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, ""),
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
    `${m.copy?.button ?? "View your order"}: ${m.statusUrl}`,
    ...(m.storeUrl ? [`Visit our store: ${m.storeUrl}`] : []),
    ...brandText(m.brand),
  ].join("\n")
  const brand: EmailBrand = { ...m.brand, email: m.brand?.email ?? m.supportEmail ?? null }
  const footer = brand.email ? "If you have any questions, reply to this email or write to the store:" : undefined
  return { subject, html: shell(m.shopName, m.copy?.heading ?? "Thank you for your purchase!", intro, body, subject, { aside: `Order ${m.orderNumber}`, footer, brand }), text }
}

/** "Get directions": the pickup address in a maps search, which opens the phone's maps app. */
function directionsUrl(p: { name: string; address: string[] }): string | null {
  const q = p.address.filter(Boolean).join(", ")
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
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
  brand?: EmailBrand
  copy?: ResolvedCopy
}): { subject: string; html: string; text: string } {
  const heading = m.copy?.heading ?? (m.kind === "ready" ? "Your order is ready to pick up" : "Your order was picked up")
  const subject = m.copy?.subject ?? (m.kind === "ready" ? "Your order is ready to pick up" : "Your order was picked up").replace("Your order", `Order ${m.orderNumber}`)
  const intro = m.copy?.introHtml ?? (
    m.kind === "ready"
      ? `${m.buyerFirstName ? `Good news, ${esc(m.buyerFirstName)}. ` : ""}Your order is waiting for you. Bring your order number, ${esc(m.orderNumber)}, and we'll hand it over.`
      : `${m.buyerFirstName ? `Thanks, ${esc(m.buyerFirstName)}. ` : ""}Your order was collected. We hope you love it.`)
  const directions = m.kind === "ready" ? directionsUrl(m.pickup) : null
  const body = [
    m.kind === "ready" ? pickupBlock({ ...m.pickup, ready: null }) : "",
    m.kind === "ready" && directions ? button(directions, m.copy?.button ?? "Get directions") : button(m.statusUrl, m.copy?.button ?? "View your order"),
    m.kind === "ready" && directions ? textLink(m.statusUrl, "View your order") : "",
    sectionHeading(m.kind === "ready" ? "Ready for you" : "Picked up"),
    linesTable(m.lines, "USD", false, false),
  ].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(m.kind === "ready" ? ["", "Pick up at:", m.pickup.name, ...m.pickup.address, ...(m.pickup.instructions ? ["", m.pickup.instructions] : []), ...(directions ? ["", `Directions: ${directions}`] : [])] : []),
    "",
    `View your order: ${m.statusUrl}`,
    ...brandText(m.brand),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { aside: `Order ${m.orderNumber}`, brand: m.brand }), text }
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
  /** tracking: the parcel already left and its tracking number changed. */
  kind: "shipped" | "delivered" | "out_for_delivery" | "tracking"
  /** How it is coming, as the buyer chose it at checkout ("Standard, 3 to 5 business days"). */
  deliveryName?: string | null
  /** Some items of the order, not all: say so, so the buyer isn't left waiting on the rest by surprise. */
  partial?: boolean
  brand?: EmailBrand
  copy?: ResolvedCopy
}

/**
 * SHIPPED, OUT FOR DELIVERY, DELIVERED, OR A NEW TRACKING NUMBER. Where the
 * parcel is (the four steps), the carrier and the number with a Track link
 * that opens the carrier's own live tracking, where it's going, and what is
 * in it. A part-shipment says the rest follows.
 */
export function shipmentEmail(m: ShipmentEmailModel): { subject: string; html: string; text: string } {
  const own =
    m.kind === "delivered"
      ? "Your order was delivered"
      : m.kind === "out_for_delivery"
        ? "Your order is out for delivery"
        : m.kind === "tracking"
          ? "Your tracking number changed"
          : m.partial
            ? "Part of your order is on the way"
            : "Your order is on the way"
  const heading = m.copy?.heading ?? own
  const subject = m.copy?.subject ?? (m.kind === "tracking" ? `New tracking number for order ${m.orderNumber}` : own.replace("your order", `order ${m.orderNumber}`).replace("Your order", `Order ${m.orderNumber}`))
  const hi = m.buyerFirstName ? `${esc(m.buyerFirstName)}, ` : ""
  const intro = m.copy?.introHtml ?? (
    m.kind === "delivered"
      ? `${hi ? `${hi}your` : "Your"} package was delivered. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.`
      : m.kind === "out_for_delivery"
        ? `${hi ? `${hi}your` : "Your"} package is with the driver and should arrive today.`
        : m.kind === "tracking"
          ? "The carrier gave your package a new tracking number. Use this one to follow it from now on."
          : `${m.buyerFirstName ? `Good news, ${esc(m.buyerFirstName)}. ` : ""}${m.partial ? "Some of your items have shipped. The rest follow in another package, and we'll email you when they do." : "Your order has shipped."}${m.trackingUrl ? " Track it any time with the link below." : ""}`)
  const at: 0 | 1 | 2 | 3 = m.kind === "delivered" ? 3 : m.kind === "out_for_delivery" ? 2 : 1
  const primary = m.trackingUrl && m.kind !== "delivered" ? button(m.trackingUrl, m.copy?.button ?? "Track your package") + textLink(m.statusUrl, "View your order") : button(m.statusUrl, m.copy?.button && m.kind === "delivered" ? m.copy.button : "View your order")
  const info: { label: string; html: string }[] = []
  if (m.address?.line1) info.push({ label: m.kind === "delivered" ? "Delivered to" : "Shipping to", html: addressLines(m.address).map(esc).join("<br>") })
  if (m.deliveryName) info.push({ label: "Shipping method", html: esc(m.deliveryName) })
  const body = [
    progressBar(at),
    m.kind === "delivered" ? "" : trackingBox(m.carrier, m.trackingNumber, m.trackingUrl),
    primary,
    sectionHeading(m.kind === "delivered" ? "In your package" : m.partial ? "Items in this package" : "Items in this shipment"),
    linesTable(m.lines, "USD", false, false),
    info.length ? sectionHeading("Delivery") + infoGrid(info) : "",
  ].join("")
  const tracking = m.trackingNumber ? `${m.carrier ? `${m.carrier} ` : ""}tracking number ${m.trackingNumber}` : null
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(tracking ? ["", tracking] : []),
    ...(m.trackingUrl ? [`Track: ${m.trackingUrl}`] : []),
    "",
    `View your order: ${m.statusUrl}`,
    ...brandText(m.brand),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { aside: `Order ${m.orderNumber}`, brand: m.brand }), text }
}

export function returnEmail(m: {
  shopName: string
  orderNumber: string
  status: "approved" | "rejected" | "received" | "completed"
  note: string | null
  refundedCents: number
  currency: string
  statusUrl: string
  /** What is coming back, when the return named it. */
  lines?: EmailLine[]
  /** Where to send it, for an approved return: the store's return address. */
  returnAddress?: string[] | null
  brand?: EmailBrand
  copy?: ResolvedCopy
}): {
  subject: string
  html: string
  text: string
} {
  const own =
    m.status === "approved" ? "Your return was approved" : m.status === "rejected" ? "About your return" : m.status === "received" ? "We received your return" : "Your return is complete"
  const heading = m.copy?.heading ?? own
  /* A refund is said whatever the store wrote above it. */
  const refundLine = m.status === "completed" && m.refundedCents > 0 ? `A refund of ${esc(formatMoney(m.refundedCents, m.currency))} is on its way to your original payment method. Banks usually take 5 to 10 business days to show it.` : ""
  const stock =
    m.status === "approved"
      ? m.returnAddress?.length
        ? "Pack the items securely and send them back to the address below. Keep the shipping receipt until your refund arrives."
        : "Pack the items securely and follow the store's note below. Keep the shipping receipt until your refund arrives."
      : m.status === "rejected"
        ? "The store couldn't accept this return. Their note says why. If you think it's a mistake, reply to this email."
        : m.status === "received"
          ? "Your items arrived back at the store. They'll check them and send your refund."
          : m.refundedCents > 0
            ? refundLine
            : "Your return is closed."
  const intro = m.copy?.introHtml !== undefined ? [m.copy.introHtml, refundLine].filter(Boolean).join("<br><br>") : stock
  const subject = m.copy?.subject ?? `${own} (order ${m.orderNumber})`
  const body = [
    m.note ? addressBlock("From the store", null, esc(m.note).replace(/\n/g, "<br>")) : "",
    m.status === "approved" && m.returnAddress?.length ? addressBlock("Send it to", null, m.returnAddress.map(esc).join("<br>")) : "",
    button(m.statusUrl, m.copy?.button ?? "View your order"),
    m.lines?.length ? sectionHeading("Items in this return") + linesTable(m.lines, m.currency, false, false) : "",
  ].join("")
  return {
    subject,
    html: shell(m.shopName, heading, intro, body, subject, { aside: `Order ${m.orderNumber}`, brand: m.brand }),
    text: [
      `${m.shopName}: ${heading}`,
      "",
      m.copy?.introText !== undefined ? [m.copy.introText, refundLine.replace(/&amp;/g, "&")].filter(Boolean).join("\n\n") : intro.replace(/&amp;/g, "&"),
      ...(m.note ? ["", m.note] : []),
      ...(m.status === "approved" && m.returnAddress?.length ? ["", "Send it to:", ...m.returnAddress] : []),
      "",
      `View your order: ${m.statusUrl}`,
      ...brandText(m.brand),
    ].join("\n"),
  }
}

/** The order was cancelled before it shipped: what was cancelled, and the money. */
export function orderCancelledEmail(m: { shopName: string; orderNumber: string; buyerFirstName: string | null; reason: string | null; refundedCents: number; totalCents: number; currency: string; lines: EmailLine[]; statusUrl: string; brand?: EmailBrand; copy?: ResolvedCopy }): {
  subject: string
  html: string
  text: string
} {
  const subject = m.copy?.subject ?? `Order ${m.orderNumber} was cancelled`
  const money =
    m.refundedCents >= m.totalCents && m.totalCents > 0
      ? `Your payment of ${esc(formatMoney(m.refundedCents, m.currency))} was refunded to your original payment method. Banks usually take 5 to 10 business days to show it.`
      : m.refundedCents > 0
        ? `${esc(formatMoney(m.refundedCents, m.currency))} was refunded to your original payment method.`
        : "If you were charged, the store will refund you and we'll email you when it's sent."
  /* The money is said whatever the store wrote above it. */
  const intro = m.copy?.introHtml !== undefined ? [m.copy.introHtml, money].filter(Boolean).join("<br><br>") : `${m.buyerFirstName ? `${esc(m.buyerFirstName)}, your` : "Your"} order was cancelled and won't be shipped. ${money}`
  const body = [
    m.reason ? addressBlock("Reason", null, esc(m.reason)) : "",
    button(m.statusUrl, m.copy?.button ?? "View your order"),
    sectionHeading("Cancelled items"),
    linesTable(m.lines, m.currency, true, false),
  ].join("")
  const text = [`${m.shopName}: ${subject}`, "", m.copy?.introText !== undefined ? [m.copy.introText, money.replace(/&amp;/g, "&")].filter(Boolean).join("\n\n") : intro.replace(/&amp;/g, "&"), ...(m.reason ? ["", `Reason: ${m.reason}`] : []), "", ...m.lines.map((l) => `${l.quantity} x ${l.title}`), "", `View your order: ${m.statusUrl}`, ...brandText(m.brand)].join("\n")
  return { subject, html: shell(m.shopName, m.copy?.heading ?? "Your order was cancelled", intro, body, subject, { aside: `Order ${m.orderNumber}`, brand: m.brand }), text }
}

/** Money went back: how much this time, how much in all, and when it shows. */
export function refundEmail(m: { shopName: string; orderNumber: string; buyerFirstName: string | null; amountCents: number; refundedCents: number; totalCents: number; currency: string; paymentLabel: string | null; statusUrl: string; brand?: EmailBrand; copy?: ResolvedCopy }): {
  subject: string
  html: string
  text: string
} {
  const full = m.refundedCents >= m.totalCents && m.totalCents > 0
  const subject = m.copy?.subject ?? `Refund for order ${m.orderNumber}`
  const intro = m.copy?.introHtml ?? `${m.buyerFirstName ? `${esc(m.buyerFirstName)}, we` : "We"} sent you a refund of ${esc(formatMoney(m.amountCents, m.currency))}${m.paymentLabel ? ` to your ${esc(m.paymentLabel)}` : " to your original payment method"}. Banks usually take 5 to 10 business days to show it.`
  const row = (label: string, value: string, strong = false) =>
    `<tr><td style="padding:4px 0;font-size:14px;color:${strong ? INK : MUTED};${strong ? "font-weight:600;" : ""}">${esc(label)}</td><td align="right" style="padding:4px 0;font-size:14px;color:${INK};${strong ? "font-weight:600;" : ""}">${esc(value)}</td></tr>`
  const table = `<tr><td style="padding:0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${LINE};padding-top:8px;">${row("This refund", formatMoney(m.amountCents, m.currency), true)}${m.refundedCents !== m.amountCents ? row("Refunded in all", formatMoney(m.refundedCents, m.currency)) : ""}${row("Order total", formatMoney(m.totalCents, m.currency))}</table></td></tr>`
  const body = [table, button(m.statusUrl, m.copy?.button ?? "View your order")].join("")
  const text = [`${m.shopName}: ${subject}`, "", m.copy?.introText ?? intro.replace(/&amp;/g, "&"), "", `This refund: ${formatMoney(m.amountCents, m.currency)}`, `Order total: ${formatMoney(m.totalCents, m.currency)}`, "", `View your order: ${m.statusUrl}`, ...brandText(m.brand)].join("\n")
  return { subject, html: shell(m.shopName, m.copy?.heading ?? (full ? "Your order was refunded" : "You were sent a refund"), intro, body, subject, { aside: `Order ${m.orderNumber}`, brand: m.brand }), text }
}

/**
 * THE CHECKOUT REMINDER (Settings › Checkout › Abandoned checkouts): one
 * email to a buyer who reached Pay and left, only when they asked for news
 * or are on the store's list, with the way back to the checkout and the way
 * off the list. lib/automations/abandoned-reminder.ts sends it when the
 * store has no checkout reminder automation of its own.
 */
export function checkoutReminderEmail(m: { shopName: string; buyerFirstName: string | null; lines: EmailLine[]; checkoutUrl: string; unsubscribeUrl: string; brand?: EmailBrand; copy?: ResolvedCopy }): {
  subject: string
  html: string
  text: string
} {
  const first = m.lines[0]?.title ?? "your order"
  const named = m.lines.length > 1 ? `${first} and ${m.lines.length - 1} more` : first
  const subject = m.copy?.subject ?? `You left ${named} at checkout`
  const heading = m.copy?.heading ?? "Still thinking it over?"
  const intro = m.copy?.introHtml ?? `Hi ${esc(m.buyerFirstName || "there")}, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.`
  const label = m.copy?.button ?? "Finish checkout"
  const body = [button(m.checkoutUrl, label), sectionHeading("In your checkout"), linesTable(m.lines, "USD", false, false)].join("")
  const footer = `You're getting this because you asked ${esc(m.shopName)} for news. <a href="${esc(m.unsubscribeUrl)}" style="color:${INK};text-decoration:underline;">Unsubscribe</a>.`
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    "",
    `${label}: ${m.checkoutUrl}`,
    "",
    `Unsubscribe: ${m.unsubscribeUrl}`,
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { footer, brand: m.brand ? { ...m.brand, helpUrl: null } : undefined }), text }
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
