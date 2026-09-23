import "server-only"

/**
 * ===========================================================================
 *  THE BUYER'S INVOICE
 * ===========================================================================
 * A formal document for one paid order: who sold it, who bought it (the
 * company, its tax number and address when the buyer bought for a
 * business), what was bought, every amount that made the total, and how
 * and when it was paid. It is what an accountant files, so it says only
 * what is true of the payment: no tax line the checkout never charged, no
 * figure that is not the order's own.
 *
 * Where each value comes from:
 *   the order row      amounts, the card, the date, the product and variant
 *   the PaymentIntent  what the checkout recorded when it priced the order:
 *                      the discount and its code, the price before it, and
 *                      the business details (lib/checkout/business.ts)
 *   the creator        the seller's name and contact address
 *
 * Drawn by pdfkit in Inter, which is in the repository (lib/checkout/fonts,
 * SIL Open Font License) because the PDF standard fonts stop at Latin-1:
 * "Ștefan SRL" or "Łódź" would print as boxes in Helvetica.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripe } from "@/lib/stripe"
import { businessFromMetadata, addressLines, type BusinessDetails } from "./business"
import { countryName } from "./countries"
import { fullyRefunded } from "@/lib/orders/refund-state"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface InvoiceData {
  number: string
  issuedAt: Date
  status: "paid" | "refunded" | "partially_refunded" | "disputed"
  seller: { name: string; email: string | null; url: string | null }
  buyer: { name: string; email: string; business: BusinessDetails | null }
  /** Every line of the payment: one for a checkout, one per product for a basket. */
  lines: { description: string; detail: string | null; amountCents: number }[]
  /** What has gone back to the buyer, when any has. */
  refundedCents: number
  subtotalCents: number
  discountCents: number
  discountCode: string | null
  tipCents: number
  totalCents: number
  payment: string
  reference: string | null
  orderId: string
}

/** "SL-20260923-1A2B3C4D": the day it was paid and the order it is for. */
export function invoiceNumber(orderId: string, at: Date): string {
  const day = at.toISOString().slice(0, 10).replace(/-/g, "")
  return `SL-${day}-${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
}

/** How it was paid, in the words a statement would use. */
export function paymentLabel(order: { payment_method?: string | null; card_brand?: string | null; card_last4?: string | null }): string {
  const method = order.payment_method || "card"
  if (method === "paypal") return "PayPal"
  if (method === "link") return "Link"
  if (order.card_brand || order.card_last4) {
    const brand = BRANDS[order.card_brand || ""] ?? (order.card_brand ? order.card_brand[0].toUpperCase() + order.card_brand.slice(1) : "Card")
    return order.card_last4 ? `${brand} ending ${order.card_last4}` : brand
  }
  return method === "card" ? "Card" : method.replace(/_/g, " ")
}

interface OrderRow {
  id: string
  created_at: string
  status: string | null
  amount_cents: number | null
  tip_cents: number | null
  buyer_email: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  payment_method: string | null
  card_brand: string | null
  card_last4: string | null
  variant_name: string | null
  stripe_payment_intent_id: string | null
  stripe_session_id?: string | null
  refund_amount_cents?: number | null
  product: { title: string | null; creator_id: string | null } | null
}

/**
 * Everything the document needs, for the order behind a receipt token.
 * Null when the token is unknown or the order is not a paid one.
 */
export async function invoiceForReceipt(admin: Db, receiptToken: string): Promise<InvoiceData | null> {
  const { data: order } = await admin
    .from("orders")
    /* Every column: the refund amount's is not in every database, and naming
       a missing column fails the read. */
    .select("*, product:products(title, creator_id)")
    .eq("receipt_token", receiptToken)
    .maybeSingle()
  if (!order) return null
  /* A basket is one payment over several rows: its invoice lists them all,
     whichever line's receipt it was opened from. */
  if (order.stripe_session_id) {
    const { data: rows } = await admin
      .from("orders")
      .select("*, product:products(title, creator_id)")
      .eq("stripe_session_id", order.stripe_session_id)
      .order("created_at", { ascending: true })
      .limit(50)
    if (rows && rows.length > 1) return invoiceForOrder(admin, order as OrderRow, undefined, rows as OrderRow[])
  }
  return invoiceForOrder(admin, order as OrderRow)
}

export async function invoiceForOrder(
  admin: Db,
  order: OrderRow,
  knownMetadata?: Record<string, string>,
  basket?: OrderRow[],
): Promise<InvoiceData | null> {
  const rows = basket && basket.length > 0 ? basket : [order]
  const total = rows.reduce((n, r) => n + Math.max(0, Number(r.amount_cents) || 0), 0)
  if (total <= 0 || !order.stripe_payment_intent_id) return null
  /* Only a payment that went through has an invoice: one that is pending,
     failed or disputed would be printed "paid". A refunded sale keeps its
     invoice, as a record of the sale the refund reverses. */
  const status = String((order as { status?: string | null }).status ?? "completed")
  if (status !== "completed" && status !== "refunded") return null

  let meta: Record<string, string> = knownMetadata ?? {}
  if (!knownMetadata) {
    try {
      meta = (await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id)).metadata ?? {}
    } catch {
      /* The order alone still makes an invoice: no discount line, no company. */
    }
  }

  /* `amount_cents` is what each row was charged, the tip inside it. */
  const tip = rows.reduce((n, r) => n + Math.max(0, Number(r.tip_cents) || 0), 0)
  const discount = rows.length === 1 ? Math.max(0, Number(meta.discount_cents) || 0) : 0
  /* The price before the code, as the checkout recorded it; failing that,
     worked back from what was paid. */
  const recordedBase = Number(meta.base_price_cents)
  const subtotal = rows.length === 1 && Number.isFinite(recordedBase) && recordedBase > 0 ? recordedBase : total - tip + discount
  const lines: InvoiceData["lines"] =
    rows.length === 1
      ? [{ description: order.product?.title || meta.product_title || "Digital product", detail: order.variant_name || null, amountCents: subtotal }]
      : rows.map((r) => ({
          description: r.product?.title || "Digital product",
          detail: r.variant_name || null,
          amountCents: Math.max(0, (Number(r.amount_cents) || 0) - (Number(r.tip_cents) || 0)),
        }))
  const refunded = rows.reduce((n, r) => {
    if (r.status !== "refunded") return n
    const charged = Math.max(0, Number(r.amount_cents) || 0)
    const recorded = Number(r.refund_amount_cents) || 0
    return n + (recorded > 0 ? Math.min(recorded, charged) : charged)
  }, 0)
  const status: InvoiceData["status"] = rows.some((r) => r.status === "disputed")
    ? "disputed"
    : rows.every((r) => fullyRefunded(r))
      ? "refunded"
      : refunded > 0
        ? "partially_refunded"
        : "paid"

  const creatorId = order.product?.creator_id ?? null
  let seller: InvoiceData["seller"] = { name: meta.creator_name || "Storelib seller", email: null, url: null }
  if (creatorId) {
    const { data: creator } = await admin
      .from("creators")
      .select("display_name, support_email, username, slug, user_id")
      .eq("id", creatorId)
      .maybeSingle()
    if (creator) {
      let email: string | null = creator.support_email || null
      let name: string | null = creator.display_name || null
      let username: string | null = creator.username || creator.slug || null
      if ((!email || !name || !username) && creator.user_id) {
        const { data: profile } = await admin.from("profiles").select("email, display_name, username").eq("id", creator.user_id).maybeSingle()
        email = email || profile?.email || null
        name = name || profile?.display_name || null
        username = username || profile?.username || null
      }
      seller = { name: name || seller.name, email, url: username ? `storelib.com/${username}` : null }
    }
  }

  const issuedAt = new Date(order.created_at)
  return {
    number: invoiceNumber(order.id, issuedAt),
    issuedAt,
    status,
    seller,
    buyer: {
      name: [order.buyer_first_name, order.buyer_last_name].filter(Boolean).join(" ").trim(),
      email: order.buyer_email || meta.buyer_email || "",
      business: businessFromMetadata(meta),
    },
    lines,
    refundedCents: refunded,
    subtotalCents: subtotal,
    discountCents: discount,
    discountCode: meta.coupon_code || null,
    tipCents: tip,
    totalCents: total,
    payment: paymentLabel(order),
    reference: order.stripe_payment_intent_id,
    orderId: order.id,
  }
}

/* ─── Drawing ─────────────────────────────────────────────────────────── */

const INK = "#1a1a2e"
const MUTED = "#6b7280"
const RULE = "#e5e7eb"

let fonts: { regular: Buffer; semibold: Buffer } | null | undefined

function loadFonts() {
  if (fonts !== undefined) return fonts
  try {
    const dir = join(process.cwd(), "lib", "checkout", "fonts")
    fonts = { regular: readFileSync(join(dir, "Inter-Regular.woff")), semibold: readFileSync(join(dir, "Inter-SemiBold.woff")) }
  } catch {
    fonts = null
  }
  return fonts
}

/** Without Inter, the standard font, and letters it cannot print lose their accent rather than become boxes. */
function latin1(text: string): string {
  return text.normalize("NFKD").replace(/[^\u0000-ÿ]/g, "")
}

export const moneyText = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100)

const dateText = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d)

export async function renderInvoicePdf(inv: InvoiceData): Promise<Buffer> {
  // @ts-ignore - pdfkit ships CJS without bundled types
  const pdfkit = await import("pdfkit")
  const PDFDocument = (pdfkit.default || pdfkit) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: { Title: `Invoice ${inv.number}`, Author: inv.seller.name, Subject: inv.lines.map((l) => l.description).join(", ").slice(0, 200), Creator: "Storelib" },
  })
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))))

  const f = loadFonts()
  if (f) {
    doc.registerFont("Body", f.regular)
    doc.registerFont("Strong", f.semibold)
  }
  const REG = f ? "Body" : "Helvetica"
  const BOLD = f ? "Strong" : "Helvetica-Bold"
  const t = (s: string) => (f ? s : latin1(s))

  const left = 56
  const right = doc.page.width - 56
  const width = right - left

  /* Title and status */
  doc.font(BOLD).fontSize(22).fillColor(INK).text("Invoice", left, 56)
  const STATUS: Record<InvoiceData["status"], [string, string]> = {
    paid: ["Paid", "#067647"],
    refunded: ["Refunded", "#b42318"],
    partially_refunded: ["Partially refunded", "#b54708"],
    disputed: ["Disputed", "#b42318"],
  }
  const [status, statusColor] = STATUS[inv.status]
  doc.font(BOLD).fontSize(11).fillColor(statusColor).text(status, left, 64, { width, align: "right" })

  /* The facts, as a small table */
  let y = 100
  const facts: [string, string][] = [
    ["Invoice number", inv.number],
    ["Date of issue", dateText(inv.issuedAt)],
    ["Date paid", dateText(inv.issuedAt)],
    ["Order", inv.orderId],
  ]
  for (const [k, v] of facts) {
    doc.font(REG).fontSize(9.5).fillColor(MUTED).text(k, left, y, { width: 110 })
    doc.font(REG).fontSize(9.5).fillColor(INK).text(t(v), left + 110, y, { width: width - 110 })
    y += 16
  }

  /* From and Bill to, side by side */
  y += 18
  const col = (width - 24) / 2
  const block = (x: number, heading: string, lines: string[], strong: string) => {
    doc.font(BOLD).fontSize(9.5).fillColor(INK).text(heading, x, y, { width: col })
    let yy = y + 16
    doc.font(BOLD).fontSize(10).fillColor(INK).text(t(strong), x, yy, { width: col })
    yy = doc.y + 2
    for (const line of lines) {
      doc.font(REG).fontSize(9.5).fillColor("#374151").text(t(line), x, yy, { width: col })
      yy = doc.y + 1
    }
    return yy
  }
  const sellerLines = [inv.seller.email, inv.seller.url].filter(Boolean) as string[]
  const fromEnd = block(left, "From", sellerLines, inv.seller.name)
  const b = inv.buyer.business
  const billLines = b
    ? [
        ...(b.taxId ? [`Tax ID: ${b.taxId}`] : []),
        ...addressLines(b, countryName),
        ...(inv.buyer.name ? [`Attn: ${inv.buyer.name}`] : []),
        inv.buyer.email,
      ]
    : [inv.buyer.email]
  const billEnd = block(left + col + 24, "Bill to", billLines.filter(Boolean), b ? b.company : inv.buyer.name || inv.buyer.email)
  y = Math.max(fromEnd, billEnd) + 26

  /* The headline figure */
  const headline = inv.status === "refunded" ? `${moneyText(inv.totalCents)} USD refunded` : `${moneyText(inv.totalCents)} USD paid on ${dateText(inv.issuedAt)}`
  doc.font(BOLD).fontSize(15).fillColor(INK).text(headline, left, y, { width })
  y = doc.y + 22

  /* Lines */
  const cQty = left + width * 0.58
  const cUnit = left + width * 0.68
  const cAmt = left + width * 0.84
  const head = (label: string, x: number, w: number, align: "left" | "right") =>
    doc.font(REG).fontSize(9).fillColor(MUTED).text(label, x, y, { width: w, align })
  head("Description", left, cQty - left - 8, "left")
  head("Qty", cQty, cUnit - cQty - 8, "right")
  head("Unit price", cUnit, cAmt - cUnit - 8, "right")
  head("Amount", cAmt, right - cAmt, "right")
  y += 16
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
  y += 10
  for (const line of inv.lines) {
    doc.font(REG).fontSize(10).fillColor(INK).text(t(line.description), left, y, { width: cQty - left - 8 })
    let lineEnd = doc.y
    if (line.detail) {
      doc.font(REG).fontSize(9).fillColor(MUTED).text(t(line.detail), left, lineEnd + 1, { width: cQty - left - 8 })
      lineEnd = doc.y
    }
    doc.font(REG).fontSize(10).fillColor(INK)
    doc.text("1", cQty, y, { width: cUnit - cQty - 8, align: "right" })
    doc.text(moneyText(line.amountCents), cUnit, y, { width: cAmt - cUnit - 8, align: "right" })
    doc.text(moneyText(line.amountCents), cAmt, y, { width: right - cAmt, align: "right" })
    y = lineEnd + 12
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
    y += 12
  }

  /* Totals, right-hand */
  const tLabel = left + width * 0.5
  const row = (label: string, value: string, strong = false) => {
    doc.font(strong ? BOLD : REG).fontSize(strong ? 10.5 : 10).fillColor(strong ? INK : "#374151")
    doc.text(t(label), tLabel, y, { width: cAmt - tLabel - 8 })
    doc.text(value, cAmt - 40, y, { width: right - cAmt + 40, align: "right" })
    y += strong ? 20 : 17
  }
  row("Subtotal", moneyText(inv.subtotalCents))
  if (inv.discountCents > 0) row(inv.discountCode ? `Discount (${inv.discountCode})` : "Discount", `-${moneyText(inv.discountCents)}`)
  if (inv.tipCents > 0) row("Tip", moneyText(inv.tipCents))
  y += 2
  doc.moveTo(tLabel, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
  y += 10
  row("Total", moneyText(inv.totalCents), true)
  row("Amount paid", `${moneyText(inv.totalCents)} USD`, true)
  if (inv.refundedCents > 0) row("Refunded", `-${moneyText(inv.refundedCents)} USD`, true)

  /* Payment */
  y += 14
  doc.font(BOLD).fontSize(9.5).fillColor(INK).text("Payment", left, y)
  y = doc.y + 4
  doc.font(REG).fontSize(9.5).fillColor("#374151").text(t(`${inv.payment}, ${dateText(inv.issuedAt)}`), left, y, { width })
  if (inv.reference) {
    doc.font(REG).fontSize(9).fillColor(MUTED).text(`Payment reference ${inv.reference}`, left, doc.y + 2, { width })
  }

  /* Footer */
  const footer = t(
    `Sold by ${inv.seller.name} through Storelib (storelib.com). Amounts are in US dollars.` +
      (inv.seller.email ? ` Questions about this purchase: ${inv.seller.email}.` : ""),
  )
  /* Inside the bottom margin, which pdfkit would otherwise answer with a new page. */
  doc.page.margins.bottom = 0
  doc.font(REG).fontSize(8.5).fillColor(MUTED).text(footer, left, doc.page.height - 56 - 30, { width, align: "left" })

  doc.end()
  return done
}

export function invoiceFilename(inv: Pick<InvoiceData, "number">): string {
  return `Invoice-${inv.number}.pdf`
}
