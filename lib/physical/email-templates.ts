/**
 * ===========================================================================
 *  THE EMAILS A PHYSICAL ORDER SENDS
 * ===========================================================================
 * Order confirmed, shipped (with tracking), delivered, return updates, and
 * the order a supplier is asked to fulfil. Pure: built from plain values so
 * a test can read them, sent by ./emails-server.ts. Drawn in the one layout
 * every Storelib email shares (lib/emails/layout.ts), as the store: its logo
 * and name on top, its accent on the button, Storelib nowhere loud.
 */

import { finalizeEmailHtml } from "@/lib/mail-document"
import { emailDocument, emailKit, plainOf, ITEM_PX, type EmailKit, type EmailSender } from "@/lib/emails/layout"
import { emailImageSrc } from "@/lib/email-campaigns/sender"
import { mediaUrl } from "@/lib/storage/media-url"
import { itemsText, type ResolvedCopy } from "@/lib/emails/customer-custom"
import { addressLines } from "./address"
import { emailLanguage, et } from "@/lib/emails/words"
import type { Address } from "./types"
import { formatCurrency } from "@/lib/markets/money"

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
  /**
   * The tax by region or kind when the order has more than one ("VAT 19%",
   * "Shipping tax"), in the order the checkout added them. Without it the
   * one Tax row stands for all of it.
   */
  taxLines?: { label: string; cents: number }[] | null
  /** The tax's name as the checkout set it ("VAT 19%", shipping_rate.tax_label, SQL part 153); "Tax" without one. */
  taxLabel?: string | null
  /** Cash on delivery's fee, inside `shipping` as the order keeps it (shipping_rate.cod_fee_cents): its own row here. */
  codFee?: number | null
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function formatMoney(cents: number, currency = "USD"): string {
  return formatCurrency(cents / 100, currency || "USD", "en-US")
}

const INK = "#111827"

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
  /** The store's accent (#rrggbb, its website's button colour): the button's fill when it reads on white. */
  accent?: string | null
  /**
   * THE LEGAL LINE at the very bottom: who is selling (the business name
   * when it differs from the store's), the business address and tax number
   * when the store gave them. Left out, the line is the store's name alone.
   * A ship-from address is never used here: for many stores it is a home.
   */
  legal?: { name?: string | null; address?: string[] | null; taxId?: string | null; taxIdLabel?: string | null } | null
}

/** "10 October 2026", in the store's time zone when known. "" for a date that can't be read. */
export function orderDateText(value: string | number | Date | null | undefined, timeZone?: string | null): string {
  if (value === null || value === undefined || value === "") return ""
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  try {
    /* In the email's language when it is built in one (lib/emails/words.ts); "10 October 2026" in English. */
    const lang = emailLanguage()
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { day: "numeric", month: "long", year: "numeric", ...(timeZone ? { timeZone } : {}) }).format(d)
  } catch {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d)
  }
}

/** The store as the sender of an email: its logo beside its name, its accent, its website. */
function storeSender(shopName: string, brand: EmailBrand | undefined): EmailSender {
  return { kind: "store", name: shopName, pictureUrl: brand?.logoUrl ?? null, picture: "mark", accent: brand?.accent ?? null, url: brand?.websiteUrl ?? null }
}

function kitFor(shopName: string, brand: EmailBrand | undefined): EmailKit {
  return emailKit(storeSender(shopName, brand))
}

/** The business behind the store, one small line: "Sold by" its legal name, its address, its tax number. Only what the store gave; the store's name alone without them. */
function legalLine(shopName: string, brand: EmailBrand | undefined): string {
  const l = brand?.legal
  if (!l?.name?.trim()) return shopName
  const parts = [et("Sold by {name}", { name: l.name.trim() }), ...(l.address ?? []).map((a) => a.trim()).filter(Boolean)]
  const tax = l.taxId?.trim() ? `${l.taxIdLabel?.trim() || et("Tax ID")} ${l.taxId.trim()}` : ""
  return [parts.join(", "), tax].filter(Boolean).join(" · ")
}

/** Where a question goes: reply, or the store's own address, phone and website, and the order page's help. */
function brandFooter(shopName: string, brand: EmailBrand | undefined, footer: string | undefined): string {
  const reach: string[] = []
  const a = (href: string, label: string) => `<a class="e-link" href="${esc(href)}" style="color:${INK};text-decoration:underline;white-space:nowrap;">${label}</a>`
  if (brand?.email) reach.push(a(`mailto:${brand.email}`, esc(brand.email)))
  if (brand?.phone) reach.push(a(`tel:${brand.phone.replace(/[^+\d]/g, "")}`, esc(brand.phone)))
  if (brand?.websiteUrl && /^https:\/\//.test(brand.websiteUrl)) reach.push(a(brand.websiteUrl, esc(brand.websiteUrl.replace(/^https:\/\//, "").replace(/\/$/, ""))))
  const first = footer ?? et("Questions about this order? Reply to this email and it goes to {shop}.", { shop: esc(shopName) })
  const help = brand?.helpUrl ? `<br>${et("Something wrong with your order? {link}.", { link: a(brand.helpUrl, et("Get help with this order")) })}` : ""
  return `${first}${reach.length ? `<br>${reach.join(" &nbsp;&middot;&nbsp; ")}` : ""}${help}`
}

/**
 * EVERY BUYER EMAIL'S FRAME: the shared document (lib/emails/layout.ts)
 * with the store on top, the order number and date at the right, the
 * heading and the opening words, the body, and a footer that says where
 * questions go, then the legal line: who sells, and why this email came (an
 * order email has no unsubscribe; only the checkout reminder, which is
 * marketing, has one). The opening words are the inbox's preview line.
 */
function shell(shopName: string, heading: string, intro: string, body: string, subject: string, opts: { aside?: string; footer?: string; brand?: EmailBrand; date?: string | null; reason?: string | null } = {}): string {
  const k = kitFor(shopName, opts.brand)
  const reason = opts.reason === null ? null : opts.reason ?? et("You're getting this email because of your order with {shop}.", { shop: shopName })
  const html = emailDocument({
    sender: storeSender(shopName, opts.brand),
    subject,
    preview: plainOf(intro).replace(/\s+/g, " ").trim().slice(0, 140),
    aside: opts.aside ? { title: opts.aside, sub: opts.date ?? null } : null,
    rows: [k.heading(heading), intro ? k.html(intro, { below: 24 }) : "", body],
    footer: { lines: [brandFooter(shopName, opts.brand, opts.footer)], legal: legalLine(shopName, opts.brand), reason },
  })
  return finalizeEmailHtml(html, subject)
}

/** The plain text part's last lines: the legal line and why it came. */
function legalText(shopName: string, brand: EmailBrand | undefined, reason?: string | null): string[] {
  const why = reason === null ? "" : reason ?? et("You're getting this email because of your order with {shop}.", { shop: shopName })
  return ["", "--", legalLine(shopName, brand), ...(why ? [why] : [])]
}

/** Plain-text footer lines: the same ways to reach the store. */
function brandText(brand: EmailBrand | undefined): string[] {
  const out = [brand?.email, brand?.phone, brand?.websiteUrl].filter((x): x is string => !!x)
  return [...(out.length ? ["", ...out] : []), ...(brand?.helpUrl ? ["", `${et("Get help with this order")}: ${brand.helpUrl}`] : [])]
}

/** Where the parcel is, as four steps: confirmed, on its way, out for delivery, delivered. */
function progressBar(k: EmailKit, at: 0 | 1 | 2 | 3): string {
  return k.steps([et("Confirmed"), et("On its way"), et("Out for delivery"), et("Delivered")], at)
}

/** The carrier and the number, with the number large enough to read off, and a Track link. */
function trackingBox(k: EmailKit, carrier: string | null, number: string | null, url: string | null): string {
  return k.tracking(carrier, number, url)
}

/** A second way on, as a link under the button. */
function textLink(k: EmailKit, href: string, label: string): string {
  return k.link(label, href, { prefix: et("or") })
}

/**
 * An item's picture for an inbox: at Storelib's own address (never the
 * storage host), fetched through the image endpoint at the size it is drawn
 * (lib/email-campaigns/sender emailImageSrc), never the upload itself. Null
 * (a letter tile) for none, an SVG, or anything not https.
 */
function itemPicture(url: string | null | undefined): string | null {
  return url && /^https:\/\//.test(url) ? emailImageSrc(mediaUrl(url), ITEM_PX) : null
}

/** The items: picture, name, variant and quantity, and what was paid for each when `prices`. */
function linesTable(k: EmailKit, lines: EmailLine[], currency: string, prices = true): string {
  return k.items(
    lines.map((l) => ({
      title: l.title,
      detail: [l.variantName, et("Qty {quantity}", { quantity: l.quantity })].filter(Boolean).join(" · "),
      amount: prices ? formatMoney(l.cents, currency) : null,
      imageUrl: itemPicture(l.imageUrl),
    })),
  )
}

/** Delivery and cash on delivery's fee apart, though the order keeps them as one amount. */
function deliveryParts(t: EmailTotals): { fee: number; shipped: number; shipping: number } {
  const fee = Math.max(0, Math.min(t.codFee ?? 0, t.shipping))
  const shipped = t.shipping - fee
  return { fee, shipped, shipping: shipped - t.shippingDiscount }
}

function totalsTable(k: EmailKit, t: EmailTotals, extra: { label: string; value: string; tone?: "good" }[] = []): string {
  const { fee, shipped, shipping } = deliveryParts(t)
  return k.totals([
    { label: et("Subtotal"), value: formatMoney(t.subtotal, t.currency) },
    ...(t.discount > 0 ? [{ label: et("Discount"), value: `-${formatMoney(t.discount, t.currency)}` }] : []),
    ...(shipped > 0 || t.shippingDiscount > 0 ? [{ label: et("Shipping"), value: shipping === 0 ? et("Free") : formatMoney(shipping, t.currency) }] : []),
    ...(fee > 0 ? [{ label: et("Cash on delivery fee"), value: formatMoney(fee, t.currency) }] : []),
    ...taxRows(t),
    { label: et("Total"), value: formatMoney(t.total, t.currency), strong: true },
    ...extra,
  ])
}

/**
 * The tax as rows: one per line the checkout kept, else one row named as the
 * checkout named it ("VAT 19%"), else "Tax". Tax that was in the prices reads
 * "Including VAT 19%", the words receipts use (lib/tax/rules includedTaxLabel).
 */
function taxRows(t: EmailTotals): { label: string; value: string }[] {
  const name = (l: string) => {
    // eslint-disable-next-line no-control-regex
    const named = l.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60)
    /* Unnamed, it is the email's word for tax; named ("VAT 19%"), the checkout's name for it. */
    if (!named || /^tax$/i.test(named)) return t.taxIncluded ? et("Including tax") : et("Tax")
    return t.taxIncluded ? et("Including {tax}", { tax: /^tax\b/i.test(named) ? "tax" + named.slice(3) : named }) : named
  }
  const lines = (t.taxLines ?? []).filter((l) => l && l.cents > 0 && typeof l.label === "string" && l.label.trim())
  if (lines.length) return lines.map((l) => ({ label: name(l.label), value: formatMoney(l.cents, t.currency) }))
  return t.tax > 0 ? [{ label: name(t.taxLabel ?? ""), value: formatMoney(t.tax, t.currency) }] : []
}

/** The money as the plain text part says it, every row the HTML has. */
function totalsText(t: EmailTotals): string[] {
  const { fee, shipped, shipping } = deliveryParts(t)
  return [
    `${et("Subtotal")}: ${formatMoney(t.subtotal, t.currency)}`,
    ...(t.discount > 0 ? [`${et("Discount")}: -${formatMoney(t.discount, t.currency)}`] : []),
    ...(shipped > 0 || t.shippingDiscount > 0 ? [`${et("Shipping")}: ${shipping === 0 ? et("Free") : formatMoney(shipping, t.currency)}`] : []),
    ...(fee > 0 ? [`${et("Cash on delivery fee")}: ${formatMoney(fee, t.currency)}`] : []),
    ...taxRows(t).map((r) => `${r.label}: ${r.value}`),
    `${et("Total")}: ${formatMoney(t.total, t.currency)}`,
  ]
}

function addressBlock(k: EmailKit, label: string, address: Partial<Address> | null, extra?: string): string {
  const lines = addressLines(address)
  if (lines.length === 0 && !extra) return ""
  return k.labeled(label, `${lines.map(esc).join("<br>")}${extra ? `${lines.length ? "<br>" : ""}${extra}` : ""}`)
}

function button(k: EmailKit, href: string, label: string): string {
  return k.button(label, href)
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
  pickup?: PickupPlace | null
  /** Brought by the store itself (local delivery, part 154): worded as a delivery, never as shipping. */
  local?: boolean
  /** The store's live website, for "Visit our store" (lib/physical/store-link orderStoreUrl); never its creator page. Null leaves the button out. */
  storeUrl?: string | null
  /** How it was paid, as the receipt says it ("Visa ending 4242"). */
  paymentLabel?: string | null
  /** Where a question goes, said in the footer as well as by replying. */
  supportEmail?: string | null
  brand?: EmailBrand
  /** The store's own words from Settings › Customer emails (lib/emails/customer-custom.ts). */
  copy?: ResolvedCopy
  /** When it was placed, as the buyer reads it ("10 October 2026"; orderDateText). */
  orderDate?: string | null
  /** Paid in cash when it arrives (lib/physical/cash-on-delivery.ts): the email says how much to have ready. */
  cashDue?: boolean
  /** The shop's own note for paying on delivery (Settings › Checkout), after that line. */
  cashNote?: string | null
}

/** Where a pickup order is collected: the place, when it is usually ready, its opening hours and the store's instructions. */
export interface PickupPlace {
  name: string
  address: string[]
  ready: string | null
  instructions: string | null
  /** Opening hours as the store wrote them ("Mon to Fri 9:00 to 17:00"), when it gave them. */
  hours?: string | null
}

function pickupBlock(k: EmailKit, p: PickupPlace): string {
  const lines = [p.name, ...p.address].map(esc).join("<br>")
  const extra = [p.ready ? esc(p.ready) : "", p.hours ? et("Opening hours: {hours}", { hours: esc(p.hours) }) : "", p.instructions ? esc(p.instructions).replace(/\n/g, "<br>") : ""].filter(Boolean).join("<br><br>")
  return k.labeled(et("Pick up at"), `${lines}${extra ? `<br><br>${extra}` : ""}`)
}

/** A heading over a part of the email, with a rule above it. */
function sectionHeading(k: EmailKit, label: string): string {
  return k.section(label)
}

/** Two columns of label and lines, folding into one on a narrow screen. */
function infoGrid(k: EmailKit, cells: { label: string; html: string }[]): string {
  return k.columns(cells)
}

/**
 * ORDER CONFIRMED, THE WAY A GOOD STORE'S READS. The shop's name with the order
 * number across from it; a thank you and what happens next; the order page
 * and the store as two ways on; the order summary with what was saved; and
 * the customer information (where it goes, how, and how it was paid). The
 * footer says where questions go. Only what the order has is drawn: no
 * empty headings, no "Billing address" Storelib never asked for.
 */
export function orderConfirmationEmail(m: OrderEmailModel): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const subject = m.copy?.subject ?? et("Order {number} confirmed", { number: m.orderNumber })
  /* Whole sentences, with and without the name, so a translation can put the name where its language does. */
  const name = m.buyerFirstName ? esc(m.buyerFirstName) : null
  const next = m.pickup
    ? name ? et("Hi {name}, we're getting your order ready. We'll email you when it's ready to pick up.", { name }) : et("We're getting your order ready. We'll email you when it's ready to pick up.")
    : m.address?.line1 && m.local
      ? name ? et("Hi {name}, we're getting your order ready for delivery. We'll let you know when it's on its way.", { name }) : et("We're getting your order ready for delivery. We'll let you know when it's on its way.")
    : m.address?.line1
      ? name ? et("Hi {name}, we're getting your order ready to be shipped. We'll let you know when it's on its way.", { name }) : et("We're getting your order ready to be shipped. We'll let you know when it's on its way.")
      : name ? et("Hi {name}, your order is confirmed and everything is on your order page.", { name }) : et("Your order is confirmed and everything is on your order page.")
  const amount = formatMoney(m.totals.total, m.totals.currency)
  const cash = m.cashDue ? ` ${m.pickup ? et("Pay {amount} in cash when you pick it up.", { amount }) : et("Pay {amount} in cash when it's delivered.", { amount })}${m.cashNote ? ` ${m.cashNote}` : ""}` : ""
  const intro = (m.copy?.introHtml ?? `${next}${m.hasDownloads ? ` ${et("Your downloads are on your order page.")}` : ""}`) + esc(cash)
  const saved = m.totals.discount + m.totals.shippingDiscount
  const delivery = m.deliveryName ? `${esc(m.deliveryName)}${m.deliveryEstimate ? `<br>${esc(m.deliveryEstimate)}` : ""}` : null
  /* The store brings it: where it is delivered and how, not a shipping address and method. */
  const toLabel = m.local ? et("Delivering to") : et("Shipping address")
  const howLabel = m.local ? et("Delivery") : et("Shipping method")
  const info: { label: string; html: string }[] = []
  if (m.pickup) info.push({ label: et("Pick up at"), html: [m.pickup.name, ...m.pickup.address].map(esc).join("<br>") + (m.pickup.ready ? `<br><br>${esc(m.pickup.ready)}` : "") + (m.pickup.hours ? `<br><br>${et("Opening hours: {hours}", { hours: esc(m.pickup.hours) })}` : "") + (m.pickup.instructions ? `<br><br>${esc(m.pickup.instructions).replace(/\n/g, "<br>")}` : "") })
  else if (m.address?.line1) info.push({ label: toLabel, html: addressLines(m.address).map(esc).join("<br>") })
  if (!m.pickup && delivery) info.push({ label: howLabel, html: delivery })
  if (m.paymentLabel) info.push({ label: et("Payment method"), html: `${esc(m.paymentLabel)}<br>${esc(formatMoney(m.totals.total, m.totals.currency))}` })

  const viewOrder = m.copy?.button ?? et("View your order")
  const actions = k.button(viewOrder, m.statusUrl, { secondary: m.storeUrl && /^https:\/\//.test(m.storeUrl) ? { label: et("Visit our store"), url: m.storeUrl } : null })
  const body = [
    actions,
    sectionHeading(k, et("Order summary")),
    linesTable(k, m.lines, m.totals.currency, true),
    totalsTable(k, m.totals, saved > 0 ? [{ label: et("You saved"), value: formatMoney(saved, m.totals.currency), tone: "good" }] : []),
    info.length ? sectionHeading(k, et("Customer information")) + infoGrid(k, info) : "",
  ].join("")
  const text = [
    `${et("{shop}: order {number} confirmed", { shop: m.shopName, number: m.orderNumber })}${m.orderDate ? ` (${m.orderDate})` : ""}`,
    "",
    m.copy?.introText != null ? `${m.copy.introText}${cash}` : intro.replace(/<[^>]+>/g, ""),
    "",
    et("Order summary"),
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}: ${formatMoney(l.cents, m.totals.currency)}`),
    "",
    ...totalsText(m.totals),
    ...(saved > 0 ? [et("You saved {amount}", { amount: formatMoney(saved, m.totals.currency) })] : []),
    ...(m.pickup
      ? ["", `${et("Pick up at")}:`, m.pickup.name, ...m.pickup.address, ...(m.pickup.ready ? [m.pickup.ready] : []), ...(m.pickup.hours ? [et("Opening hours: {hours}", { hours: m.pickup.hours })] : []), ...(m.pickup.instructions ? ["", m.pickup.instructions] : [])]
      : m.address?.line1
        ? ["", `${toLabel}:`, ...addressLines(m.address), ...(m.deliveryName ? ["", `${howLabel}: ${m.deliveryName}`] : [])]
        : []),
    ...(m.paymentLabel ? ["", `${et("Payment method")}: ${m.paymentLabel}`] : []),
    "",
    `${viewOrder}: ${m.statusUrl}`,
    ...(m.storeUrl ? [`${et("Visit our store")}: ${m.storeUrl}`] : []),
    ...brandText(m.brand),
    ...legalText(m.shopName, m.brand),
  ].join("\n")
  const brand: EmailBrand = { ...m.brand, email: m.brand?.email ?? m.supportEmail ?? null }
  const footer = brand.email ? et("If you have any questions, reply to this email or write to the store:") : undefined
  return { subject, html: shell(m.shopName, m.copy?.heading ?? et("Thank you for your purchase!"), intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), footer, brand, date: m.orderDate }), text }
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
  pickup: PickupPlace
  statusUrl: string
  brand?: EmailBrand
  copy?: ResolvedCopy
  orderDate?: string | null
}): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const heading = m.copy?.heading ?? (m.kind === "ready" ? et("Your order is ready to pick up") : et("Your order was picked up"))
  const subject = m.copy?.subject ?? (m.kind === "ready" ? et("Order {number} is ready to pick up", { number: m.orderNumber }) : et("Order {number} was picked up", { number: m.orderNumber }))
  const name = m.buyerFirstName ? esc(m.buyerFirstName) : null
  const intro = m.copy?.introHtml ?? (
    m.kind === "ready"
      ? `${name ? `${et("Good news, {name}.", { name })} ` : ""}${et("Your order is waiting for you. Bring your order number, {number}, and we'll hand it over.", { number: esc(m.orderNumber) })}`
      : `${name ? `${et("Thanks, {name}.", { name })} ` : ""}${et("Your order was collected. We hope you love it.")}`)
  const directions = m.kind === "ready" ? directionsUrl(m.pickup) : null
  const body = [
    m.kind === "ready" ? pickupBlock(k, { ...m.pickup, ready: null }) : "",
    m.kind === "ready" && directions ? button(k, directions, m.copy?.button ?? et("Get directions")) : button(k, m.statusUrl, m.copy?.button ?? et("View your order")),
    m.kind === "ready" && directions ? textLink(k, m.statusUrl, et("View your order")) : "",
    sectionHeading(k, m.kind === "ready" ? et("Ready for you") : et("Picked up")),
    linesTable(k, m.lines, "USD", false),
  ].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(m.kind === "ready" ? ["", `${et("Pick up at")}:`, m.pickup.name, ...m.pickup.address, ...(m.pickup.hours ? [et("Opening hours: {hours}", { hours: m.pickup.hours })] : []), ...(m.pickup.instructions ? ["", m.pickup.instructions] : []), ...(directions ? ["", `${et("Directions")}: ${directions}`] : [])] : []),
    "",
    `${et("View your order")}: ${m.statusUrl}`,
    ...brandText(m.brand),
    ...legalText(m.shopName, m.brand),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }), text }
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
  /** tracking: the parcel already left and its tracking number changed. issue: the carrier (or the store's own delivery) could not deliver it (Delivery issue). */
  kind: "shipped" | "delivered" | "out_for_delivery" | "tracking" | "issue"
  /** Brought by the store itself (local delivery, part 154): no carrier or tracking, and the store's note for when. */
  local?: boolean
  localNote?: string | null
  /** What went wrong, as the carrier or the store said it, for a delivery issue. */
  problem?: string | null
  /** How it is coming, as the buyer chose it at checkout ("Standard, 3 to 5 business days"). */
  deliveryName?: string | null
  /** Some items of the order, not all: say so, so the buyer isn't left waiting on the rest by surprise. */
  partial?: boolean
  brand?: EmailBrand
  copy?: ResolvedCopy
  orderDate?: string | null
}

/**
 * SHIPPED, OUT FOR DELIVERY, DELIVERED, A NEW TRACKING NUMBER, OR A DELIVERY
 * ISSUE (the carrier, or the store's own delivery, could not deliver it). Where the
 * parcel is (the four steps), the carrier and the number with a Track link
 * that opens the carrier's own live tracking, where it's going, and what is
 * in it. A part-shipment says the rest follows.
 */
export function shipmentEmail(m: ShipmentEmailModel): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const issue = m.kind === "issue"
  /* Brought by the store itself (local delivery): no carrier, no tracking, the store's own words for when. */
  const local = !!m.local
  const own = issue
    ? et("There's a problem with your delivery")
    : m.kind === "delivered"
      ? et("Your order was delivered")
      : m.kind === "out_for_delivery"
        ? et("Your order is out for delivery")
        : m.kind === "tracking"
          ? et("Your tracking number changed")
          : m.partial
            ? et("Part of your order is on the way")
            : et("Your order is on the way")
  const heading = m.copy?.heading ?? own
  const number = m.orderNumber
  const subject =
    m.copy?.subject ??
    (m.kind === "tracking"
      ? et("New tracking number for order {number}", { number })
      : issue
        ? et("A problem delivering order {number}", { number })
        : m.kind === "delivered"
          ? et("Order {number} was delivered", { number })
          : m.kind === "out_for_delivery"
            ? et("Order {number} is out for delivery", { number })
            : m.partial
              ? et("Part of order {number} is on the way", { number })
              : et("Order {number} is on the way", { number }))
  /* Whole sentences, with and without the name, so a translation can put the name where its language does. */
  const name = m.buyerFirstName ? esc(m.buyerFirstName) : null
  const note = local && m.localNote ? ` ${esc(m.localNote)}` : ""
  const goodNews = name ? `${et("Good news, {name}.", { name })} ` : ""
  const intro =
    m.copy?.introHtml ??
    (issue
      ? `${local ? (name ? et("{name}, we couldn't deliver your order", { name }) : et("We couldn't deliver your order")) : name ? et("{name}, the carrier couldn't deliver your package", { name }) : et("The carrier couldn't deliver your package")}${m.problem ? `: ${esc(m.problem)}` : ""}. ${et("We're looking into it and will email you as soon as we know more. Nothing is needed from you yet; if you have a question, reply to this email.")}`
      : m.kind === "delivered"
      ? local
        ? name ? et("{name}, your order was handed over. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.", { name }) : et("Your order was handed over. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.")
        : name ? et("{name}, your package was delivered. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.", { name }) : et("Your package was delivered. If you can't find it, check around your door and with neighbours, then tell us and we'll sort it out.")
      : m.kind === "out_for_delivery"
        ? local
          ? `${name ? et("{name}, we're bringing your order to you today.", { name }) : et("We're bringing your order to you today.")}${note}`
          : name ? et("{name}, your package is with the driver and should arrive today.", { name }) : et("Your package is with the driver and should arrive today.")
        : m.kind === "tracking"
          ? et("The carrier gave your package a new tracking number. Use this one to follow it from now on.")
          : local
            ? `${goodNews}${et("Your order is on its way. We're delivering it to you ourselves.")}${note}`
            : `${goodNews}${m.partial ? et("Some of your items have shipped. The rest follow in another package, and we'll email you when they do.") : et("Your order has shipped.")}${m.trackingUrl ? ` ${et("Track it any time with the link below.")}` : ""}`)
  const at: 0 | 1 | 2 | 3 = m.kind === "delivered" ? 3 : m.kind === "out_for_delivery" ? 2 : 1
  const primary =
    m.trackingUrl && m.kind !== "delivered" && !local
      ? button(k, m.trackingUrl, m.copy?.button ?? et("Track your package")) + textLink(k, m.statusUrl, et("View your order"))
      : button(k, m.statusUrl, m.copy?.button ?? et("View your order"))
  const toLabel = m.kind === "delivered" ? et("Delivered to") : local ? et("Delivering to") : et("Shipping to")
  const howLabel = local ? et("Delivery") : et("Shipping method")
  const info: { label: string; html: string }[] = []
  if (m.address?.line1) info.push({ label: toLabel, html: addressLines(m.address).map(esc).join("<br>") })
  if (m.deliveryName) info.push({ label: howLabel, html: esc(m.deliveryName) })
  const body = [
    /* A delivery that went wrong is not a step along the way: no progress bar. */
    issue ? "" : progressBar(k, at),
    m.kind === "delivered" || local ? "" : trackingBox(k, m.carrier, m.trackingNumber, m.trackingUrl),
    primary,
    sectionHeading(k, m.kind === "delivered" ? et("In your package") : m.partial ? et("Items in this package") : issue || local ? et("Items in this delivery") : et("Items in this shipment")),
    linesTable(k, m.lines, "USD", false),
    info.length ? sectionHeading(k, et("Delivery")) + infoGrid(k, info) : "",
  ].join("")
  const tracking = m.trackingNumber && !local ? (m.carrier ? et("{carrier} tracking number {number}", { carrier: m.carrier, number: m.trackingNumber }) : et("tracking number {number}", { number: m.trackingNumber })) : null
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    ...(tracking ? ["", tracking] : []),
    ...(m.trackingUrl && !local ? [`${et("Track")}: ${m.trackingUrl}`] : []),
    ...(m.address?.line1 ? ["", `${toLabel}:`, ...addressLines(m.address)] : []),
    ...(m.deliveryName ? [`${howLabel}: ${m.deliveryName}`] : []),
    "",
    `${et("View your order")}: ${m.statusUrl}`,
    ...brandText(m.brand),
    ...legalText(m.shopName, m.brand),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }), text }
}

export function returnEmail(m: {
  shopName: string
  orderNumber: string
  status: "requested" | "approved" | "rejected" | "received" | "completed"
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
  orderDate?: string | null
}): {
  subject: string
  html: string
  text: string
} {
  const k = kitFor(m.shopName, m.brand)
  const own =
    m.status === "requested"
      ? et("We got your return request")
      : m.status === "approved"
        ? et("Your return was approved")
        : m.status === "rejected"
          ? et("About your return")
          : m.status === "received"
            ? et("We received your return")
            : et("Your return is complete")
  const heading = m.copy?.heading ?? own
  /* A refund is said whatever the store wrote above it. */
  const refundLine = m.status === "completed" && m.refundedCents > 0 ? et("A refund of {amount} is on its way to your original payment method. Banks usually take 5 to 10 business days to show it.", { amount: esc(formatMoney(m.refundedCents, m.currency)) }) : ""
  const stock =
    m.status === "requested"
      ? et("The store will look at your request and email you what happens next. Please don't send anything back until it's approved.")
      : m.status === "approved"
      ? m.returnAddress?.length
        ? et("Pack the items securely and send them back to the address below. Keep the shipping receipt until your refund arrives.")
        : et("Pack the items securely and follow the store's note below. Keep the shipping receipt until your refund arrives.")
      : m.status === "rejected"
        ? et("The store couldn't accept this return. Their note says why. If you think it's a mistake, reply to this email.")
        : m.status === "received"
          ? et("Your items arrived back at the store. They'll check them and send your refund.")
          : m.refundedCents > 0
            ? refundLine
            : et("Your return is closed.")
  const intro = m.copy?.introHtml !== undefined ? [m.copy.introHtml, refundLine].filter(Boolean).join("<br><br>") : stock
  const subject = m.copy?.subject ?? et("{heading} (order {number})", { heading: own, number: m.orderNumber })
  const body = [
    m.note ? addressBlock(k, et("From the store"), null, esc(m.note).replace(/\n/g, "<br>")) : "",
    m.status === "approved" && m.returnAddress?.length ? addressBlock(k, et("Send it to"), null, m.returnAddress.map(esc).join("<br>")) : "",
    button(k, m.statusUrl, m.copy?.button ?? et("View your order")),
    m.lines?.length ? sectionHeading(k, et("Items in this return")) + linesTable(k, m.lines, m.currency, false) : "",
  ].join("")
  return {
    subject,
    html: shell(m.shopName, heading, intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }),
    text: [
      `${m.shopName}: ${heading}`,
      "",
      m.copy?.introText !== undefined ? [m.copy.introText, refundLine.replace(/&amp;/g, "&")].filter(Boolean).join("\n\n") : intro.replace(/&amp;/g, "&"),
      ...(m.note ? ["", m.note] : []),
      ...(m.status === "approved" && m.returnAddress?.length ? ["", `${et("Send it to")}:`, ...m.returnAddress] : []),
      ...(m.lines?.length ? ["", `${et("Items in this return")}:`, ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`)] : []),
      "",
      `${et("View your order")}: ${m.statusUrl}`,
      ...brandText(m.brand),
      ...legalText(m.shopName, m.brand),
    ].join("\n"),
  }
}

/** The order was cancelled before it shipped: what was cancelled, and the money. */
export function orderCancelledEmail(m: { shopName: string; orderNumber: string; buyerFirstName: string | null; reason: string | null; refundedCents: number; totalCents: number; currency: string; lines: EmailLine[]; statusUrl: string; brand?: EmailBrand; copy?: ResolvedCopy; orderDate?: string | null }): {
  subject: string
  html: string
  text: string
} {
  const k = kitFor(m.shopName, m.brand)
  const subject = m.copy?.subject ?? et("Order {number} was cancelled", { number: m.orderNumber })
  const amount = esc(formatMoney(m.refundedCents, m.currency))
  const money =
    m.refundedCents >= m.totalCents && m.totalCents > 0
      ? et("Your payment of {amount} was refunded to your original payment method. Banks usually take 5 to 10 business days to show it.", { amount })
      : m.refundedCents > 0
        ? et("{amount} was refunded to your original payment method.", { amount })
        : et("If you were charged, the store will refund you and we'll email you when it's sent.")
  /* The money is said whatever the store wrote above it. */
  const intro = m.copy?.introHtml !== undefined ? [m.copy.introHtml, money].filter(Boolean).join("<br><br>") : `${m.buyerFirstName ? et("{name}, your order was cancelled and won't be shipped.", { name: esc(m.buyerFirstName) }) : et("Your order was cancelled and won't be shipped.")} ${money}`
  const body = [
    m.reason ? addressBlock(k, et("Reason"), null, esc(m.reason)) : "",
    button(k, m.statusUrl, m.copy?.button ?? et("View your order")),
    sectionHeading(k, et("Cancelled items")),
    linesTable(k, m.lines, m.currency, true),
  ].join("")
  const text = [`${m.shopName}: ${subject}`, "", m.copy?.introText !== undefined ? [m.copy.introText, money.replace(/&amp;/g, "&")].filter(Boolean).join("\n\n") : intro.replace(/&amp;/g, "&"), ...(m.reason ? ["", `${et("Reason")}: ${m.reason}`] : []), "", ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}: ${formatMoney(l.cents, m.currency)}`), "", `${et("View your order")}: ${m.statusUrl}`, ...brandText(m.brand), ...legalText(m.shopName, m.brand)].join("\n")
  return { subject, html: shell(m.shopName, m.copy?.heading ?? et("Your order was cancelled"), intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }), text }
}

/** Money went back: how much this time, how much in all, and when it shows. */
export function refundEmail(m: { shopName: string; orderNumber: string; buyerFirstName: string | null; amountCents: number; refundedCents: number; totalCents: number; currency: string; paymentLabel: string | null; statusUrl: string; brand?: EmailBrand; copy?: ResolvedCopy; orderDate?: string | null; cash?: boolean }): {
  subject: string
  html: string
  text: string
} {
  const k = kitFor(m.shopName, m.brand)
  const full = m.refundedCents >= m.totalCents && m.totalCents > 0
  const subject = m.copy?.subject ?? et("Refund for order {number}", { number: m.orderNumber })
  const r = { name: m.buyerFirstName ? esc(m.buyerFirstName) : "", amount: esc(formatMoney(m.amountCents, m.currency)), method: m.paymentLabel ? esc(m.paymentLabel) : "" }
  const intro =
    m.copy?.introHtml ??
    /* Paid in cash on delivery: there is no card or bank to send it to, the shop gives it back itself. */
    (m.cash
      ? m.buyerFirstName
        ? et("{name}, the shop refunded {amount} of your order. You paid in cash, so they give it back to you directly.", r)
        : et("The shop refunded {amount} of your order. You paid in cash, so they give it back to you directly.", r)
      : m.buyerFirstName
      ? m.paymentLabel
        ? et("{name}, we sent you a refund of {amount} to your {method}. Banks usually take 5 to 10 business days to show it.", r)
        : et("{name}, we sent you a refund of {amount} to your original payment method. Banks usually take 5 to 10 business days to show it.", r)
      : m.paymentLabel
        ? et("We sent you a refund of {amount} to your {method}. Banks usually take 5 to 10 business days to show it.", r)
        : et("We sent you a refund of {amount} to your original payment method. Banks usually take 5 to 10 business days to show it.", r))
  const table = k.totals([
    { label: et("This refund"), value: formatMoney(m.amountCents, m.currency), strong: true },
    ...(m.refundedCents !== m.amountCents ? [{ label: et("Refunded in all"), value: formatMoney(m.refundedCents, m.currency) }] : []),
    { label: et("Order total"), value: formatMoney(m.totalCents, m.currency) },
  ])
  const body = [table, button(k, m.statusUrl, m.copy?.button ?? et("View your order"))].join("")
  const text = [`${m.shopName}: ${subject}`, "", m.copy?.introText ?? intro.replace(/&amp;/g, "&"), "", `${et("This refund")}: ${formatMoney(m.amountCents, m.currency)}`, ...(m.refundedCents !== m.amountCents ? [`${et("Refunded in all")}: ${formatMoney(m.refundedCents, m.currency)}`] : []), `${et("Order total")}: ${formatMoney(m.totalCents, m.currency)}`, "", `${et("View your order")}: ${m.statusUrl}`, ...brandText(m.brand), ...legalText(m.shopName, m.brand)].join("\n")
  return { subject, html: shell(m.shopName, m.copy?.heading ?? (full ? et("Your order was refunded") : et("You were sent a refund")), intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }), text }
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
  const k = kitFor(m.shopName, m.brand)
  const subject = m.copy?.subject ?? et("You left {items} at checkout", { items: itemsText(m.lines.map((l) => l.title)) })
  const heading = m.copy?.heading ?? et("Still thinking it over?")
  const intro =
    m.copy?.introHtml ??
    (m.buyerFirstName
      ? et("Hi {name}, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off.", { name: esc(m.buyerFirstName) })
      : et("Hi there, you got as far as checkout and stopped there. If the payment failed or something looked off, you can pick up where you left off."))
  const label = m.copy?.button ?? et("Finish checkout")
  const body = [button(k, m.checkoutUrl, label), sectionHeading(k, et("In your checkout")), linesTable(k, m.lines, "USD", false)].join("")
  const footer = et("You're getting this because you asked {shop} for news. {link}.", { shop: esc(m.shopName), link: `<a href="${esc(m.unsubscribeUrl)}" style="color:${INK};text-decoration:underline;">${et("Unsubscribe")}</a>` })
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    "",
    `${label}: ${m.checkoutUrl}`,
    "",
    `${et("Unsubscribe")}: ${m.unsubscribeUrl}`,
    ...legalText(m.shopName, m.brand, null),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { footer, brand: m.brand ? { ...m.brand, helpUrl: null } : undefined, reason: null }), text }
}

/**
 * ORDER UPDATED: the store changed something on an order after it was
 * placed. Today that is the shipping address, before anything shipped
 * (lib/physical/orders-server updateAddress); the email says what it is now,
 * so a buyer who did not ask for it can say so.
 */
export function orderUpdatedEmail(m: {
  shopName: string
  orderNumber: string
  buyerFirstName: string | null
  change: "address"
  address: Partial<Address> | null
  lines: EmailLine[]
  statusUrl: string
  brand?: EmailBrand
  copy?: ResolvedCopy
  orderDate?: string | null
}): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const subject = m.copy?.subject ?? et("Order {number} was updated", { number: m.orderNumber })
  const heading = m.copy?.heading ?? et("Your order was updated")
  const intro =
    m.copy?.introHtml ??
    (m.buyerFirstName
      ? et("{name}, the shipping address on your order was changed. It will be sent to the address below. If that doesn't look right, reply to this email before it ships.", { name: esc(m.buyerFirstName) })
      : et("The shipping address on your order was changed. It will be sent to the address below. If that doesn't look right, reply to this email before it ships."))
  const lines = addressLines(m.address ?? {})
  const body = [
    lines.length ? addressBlock(k, et("Shipping to"), null, lines.map(esc).join("<br>")) : "",
    button(k, m.statusUrl, m.copy?.button ?? et("View your order")),
    m.lines.length ? sectionHeading(k, et("In your order")) + linesTable(k, m.lines, "USD", false) : "",
  ].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
    ...(lines.length ? ["", `${et("Shipping to")}:`, ...lines] : []),
    "",
    `${et("View your order")}: ${m.statusUrl}`,
    ...brandText(m.brand),
    ...legalText(m.shopName, m.brand),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { aside: et("Order {number}", { number: m.orderNumber }), brand: m.brand, date: m.orderDate }), text }
}

/**
 * PAYMENT FAILED: the buyer pressed Pay, their bank declined it, and they
 * left without paying another way. Sent once, a while later and only while
 * the order is still unpaid (lib/physical/jobs-server), with the way back to
 * the same checkout. Nothing was charged, and it says so.
 */
export function paymentFailedEmail(m: { shopName: string; buyerFirstName: string | null; lines: EmailLine[]; checkoutUrl: string; brand?: EmailBrand; copy?: ResolvedCopy }): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const subject = m.copy?.subject ?? et("Your payment to {shop} didn't go through", { shop: m.shopName })
  const heading = m.copy?.heading ?? et("Your payment didn't go through")
  const intro =
    m.copy?.introHtml ??
    (m.buyerFirstName
      ? et("Hi {name}, your bank declined the payment, so nothing was charged and your order wasn't placed. Your cart is saved: try again with the same card or another one.", { name: esc(m.buyerFirstName) })
      : et("Your bank declined the payment, so nothing was charged and your order wasn't placed. Your cart is saved: try again with the same card or another one."))
  const label = m.copy?.button ?? et("Try again")
  /* No order was placed, so the footer says why it came without calling it one. */
  const reason = et("You're getting this email because you tried to pay at {shop}.", { shop: m.shopName })
  const body = [button(k, m.checkoutUrl, label), m.lines.length ? sectionHeading(k, et("In your cart")) + linesTable(k, m.lines, "USD", false) : ""].join("")
  const text = [
    `${m.shopName}: ${subject}`,
    "",
    m.copy?.introText ?? intro.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'"),
    "",
    ...m.lines.map((l) => `${l.quantity} x ${l.title}${l.variantName ? ` (${l.variantName})` : ""}`),
    "",
    `${label}: ${m.checkoutUrl}`,
    ...brandText(m.brand),
    ...legalText(m.shopName, m.brand, reason),
  ].join("\n")
  return { subject, html: shell(m.shopName, heading, intro, body, subject, { brand: m.brand ? { ...m.brand, helpUrl: null } : undefined, reason }), text }
}

/** The order a supplier or dropshipper is asked to ship: what, how many, to whom. No prices. */
export function supplierOrderEmail(m: {
  shopName: string
  orderNumber: string
  locationName: string
  lines: (EmailLine & { sku?: string | null })[]
  address: Partial<Address> | null
  buyerEmail: string | null
  deliveryName: string | null
  note: string | null
  /** Where they add the tracking once it ships (lib/physical/partner-server.ts): the buyer is emailed it at once. */
  trackingLink?: string | null
}): {
  subject: string
  html: string
  text: string
} {
  const k = kitFor(m.shopName, undefined)
  const subject = `New order to fulfil: ${m.orderNumber} from ${m.shopName}`
  /* The product's picture beside each line, so the partner packs the right thing; no pictures column when none has one. */
  const pictures = m.lines.some((l) => l.imageUrl)
  const rows = k.items(
    m.lines.map((l) => ({ title: `${l.title}${l.variantName ? ` (${l.variantName})` : ""}`, detail: l.sku ? `SKU ${l.sku}` : null, amount: `x ${l.quantity}`, imageUrl: itemPicture(l.imageUrl) })),
    { pictures, below: 20 },
  )
  const body = [
    rows,
    addressBlock(k, "Ship to", m.address, m.deliveryName ? `Delivery: ${esc(m.deliveryName)}` : undefined),
    m.note ? addressBlock(k, "Buyer's note", null, esc(m.note)) : "",
    m.trackingLink ? button(k, m.trackingLink, "Add tracking") : "",
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
    ...(m.trackingLink ? ["", `Shipped it? Add the tracking here and the buyer gets it right away: ${m.trackingLink}`] : []),
  ].join("\n")
  const intro = m.trackingLink
    ? `Please ship these items for ${esc(m.shopName)}. When it's sent, press Add tracking and the buyer gets the tracking right away. You can also reply with it.`
    : `Please ship these items for ${esc(m.shopName)}, then reply with the tracking number.`
  return { subject, html: shell(m.shopName, `Order ${m.orderNumber} to fulfil`, intro, body, subject, { footer: `Sent by Storelib for ${esc(m.shopName)}. Reply to this email to reach them.`, reason: null }), text }
}

/**
 * THE LINK TO AN ORDER, ASKED FOR ON THE STORE'S WEBSITE (Track your order:
 * app/checkout/site/track). Sent only to the address the order was placed
 * with, so typing somebody's order number shows nothing to anybody else.
 * One order per email, each with its number and date, and the page that
 * follows it on the store's own address.
 */
export function orderLinkEmail(m: { shopName: string; orders: { number: string; date: string; url: string; status: string | null }[]; brand?: EmailBrand }): { subject: string; html: string; text: string } {
  const k = kitFor(m.shopName, m.brand)
  const list = m.orders.slice(0, 5)
  const one = list.length === 1
  const subject = one ? et("Your order {number} from {shop}", { number: list[0].number, shop: m.shopName }) : et("Your orders from {shop}", { shop: m.shopName })
  const intro = one ? et("Here's the link to your order. It shows where it is and its tracking.") : et("Here are the links to your orders. Each shows where it is and its tracking.")
  const body = list
    .map((o, i) =>
      one
        ? button(k, o.url, et("View your order"))
        : k.html(`<strong class="e-ink" style="color:${INK};">${et("Order {number}", { number: esc(o.number) })}</strong>${[o.date, o.status].filter(Boolean).length ? `<br><span class="e-muted" style="font-size:14px;color:#6b7280;">${esc([o.date, o.status].filter(Boolean).join(" · "))}</span>` : ""}`, { below: 4 }) + k.link(et("View order"), o.url, { below: i === list.length - 1 ? 8 : 20 }),
    )
    .join("")
  const heading = one ? et("Order {number}", { number: list[0].number }) : et("Your orders")
  const footer = et("You asked for this on {shop}'s website. If you didn't, you can ignore it.", { shop: esc(m.shopName) })
  const html = shell(m.shopName, heading, esc(intro), body, subject, { footer, brand: { ...m.brand, helpUrl: null }, reason: null })
  const text = [`${m.shopName}: ${subject}`, "", intro, "", ...list.map((o) => `${et("Order {number}", { number: o.number })}${o.date ? ` (${o.date})` : ""}: ${o.url}`), "", et("You asked for this on {shop}'s website. If you didn't, you can ignore it.", { shop: m.shopName }), ...brandText({ ...m.brand, helpUrl: null })].join("\n")
  return { subject, html, text }
}
