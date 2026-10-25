import "server-only"

/**
 * ===========================================================================
 *  THE BUYER'S RECEIPT, OR INVOICE, AS A PDF
 * ===========================================================================
 * A formal document for one paid order: who sold it, who bought it (the
 * company, its tax number and address when the buyer bought for a
 * business), what was bought, every amount that made the total, and how
 * and when it was paid. It is called an Invoice when the buyer gave a
 * company to bill, and a Receipt otherwise; the two are the same document.
 * It is what an accountant files, so it says only what is true of the
 * payment: no tax line the checkout never charged, no reverse charge note
 * for a tax that was never worked out, no figure that is not the order's.
 *
 * ONE NUMBER, FOREVER. "SL-20260923-1A2B3C4D" is the day the order was
 * written and its id, both fixed in the database the moment the order
 * exists. The PDF emailed after paying, the one downloaded from the
 * receipt a year later and the one drawn by a webhook retry therefore all
 * carry the same number, with nothing stored and nothing to race over. A
 * basket's number is its first line's.
 *
 * Where each value comes from:
 *   the order rows     amounts, the card, the date, the products and options,
 *                      and the company (`business_details`, part 35)
 *   the PaymentIntent  what the checkout recorded when it priced one product:
 *                      the discount and its code, the price before it, and
 *                      the company again (lib/checkout/business.ts)
 *   the Checkout       a basket's lines as they were priced (quantity, unit
 *   Session            price, what a code took) and the company Stripe's
 *                      page asked for
 *   the creator        the seller's name and contact address
 *
 * Drawn by pdfkit in Inter, which is in the repository (lib/checkout/fonts,
 * SIL Open Font License) because the PDF standard fonts stop at Latin-1:
 * "Ștefan SRL" or "Łódź" would print as boxes in Helvetica.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { stripe } from "@/lib/stripe"
import { businessFromFields, businessFromMetadata, businessFromStripe, addressLines, taxIdFor, type BusinessDetails } from "./business"
import { countryName } from "./countries"
import { unpackItems, type PackedItem } from "./cart-items"
import { fullyRefunded } from "@/lib/orders/refund-state"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { includedTaxLabel, percentText } from "@/lib/tax/rules"
import { formatCurrency } from "@/lib/markets/money"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface InvoiceLine {
  description: string
  detail: string | null
  quantity: number
  unitCents: number
  /** Quantity times unit price, before any code. */
  amountCents: number
}

export interface InvoiceData {
  number: string
  /** "invoice" when a company is billed, "receipt" otherwise. */
  kind: "invoice" | "receipt"
  issuedAt: Date
  status: "paid" | "refunded" | "partially_refunded" | "disputed"
  currency: string
  /**
   * Who sold it: the store's name (Settings › Store details), and when the
   * store filled in its business details (SQL part 153) the legal name, the
   * address and the tax number an invoice must carry.
   */
  seller: { name: string; email: string | null; url: string | null; legalName?: string | null; address?: string[]; taxId?: string | null; taxIdLabel?: string | null }
  buyer: { name: string; email: string; business: BusinessDetails | null }
  /** Every line of the payment: one for a checkout, one per product for a basket. */
  lines: InvoiceLine[]
  /** What has gone back to the buyer, when any has. */
  refundedCents: number
  subtotalCents: number
  discountCents: number
  discountCode: string | null
  tipCents: number
  /** Settings › Taxes: the tax in the total, added on top or included in the price. */
  taxCents?: number
  taxIncluded?: boolean
  taxRateBps?: number
  /** "VAT 19%", as the checkout named the tax (lib/tax/rules taxLabel). */
  taxLabel?: string | null
  totalCents: number
  payment: string
  reference: string | null
  orderId: string
}

/** "SL-20260923-1A2B3C4D": the day the order was written and the order it is for. */
export function invoiceNumber(orderId: string, at: Date | string): string {
  const day = new Date(at).toISOString().slice(0, 10).replace(/-/g, "")
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

export interface OrderRow {
  id: string
  created_at: string
  status: string | null
  amount_cents: number | null
  tip_cents: number | null
  currency?: string | null
  buyer_email: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  payment_method: string | null
  card_brand: string | null
  card_last4: string | null
  product_id?: string | null
  variant_id?: string | null
  variant_name: string | null
  stripe_payment_intent_id: string | null
  /** A payment id off Stripe (part 76): an order paid through Airwallex before it was removed. Read, never called. */
  provider_payment_id?: string | null
  stripe_session_id?: string | null
  /** Settings › Taxes: the tax in the amount (SQL part 110), and whether it was part of the price (part 129). */
  tax_cents?: number | null
  tax_included?: boolean | null
  /** "VAT 19%" (SQL part 153). */
  tax_label?: string | null
  refund_amount_cents?: number | null
  /** The company the buyer bought for, when the database has the column (part 35). */
  business_details?: unknown
  product: { title: string | null; creator_id: string | null } | null
}

/** A basket's rows in the order they were written: the first is the one the number is drawn from. */
function inOrder(rows: OrderRow[]): OrderRow[] {
  return [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
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
    if (rows && rows.length > 0) return invoiceForOrder(admin, order as OrderRow, { basket: rows as OrderRow[] })
  }
  return invoiceForOrder(admin, order as OrderRow)
}

export interface InvoiceContext {
  /** The PaymentIntent's metadata, when the caller already has it. */
  metadata?: Record<string, string>
  /** Every row of a basket's payment. */
  basket?: OrderRow[]
  /** A basket's lines as they were priced, when the caller already has them. */
  items?: PackedItem[]
  /** The company, when the caller already has it. */
  business?: BusinessDetails | null
  discountCode?: string | null
}

export async function invoiceForOrder(admin: Db, order: OrderRow, context: InvoiceContext = {}): Promise<InvoiceData | null> {
  const rows = inOrder(context.basket && context.basket.length > 0 ? context.basket : [order])
  const first = rows[0]
  const isBasket = !!first.stripe_session_id
  const total = rows.reduce((n, r) => n + Math.max(0, Number(r.amount_cents) || 0), 0)
  if (total <= 0 || !rows.some((r) => r.stripe_payment_intent_id || r.provider_payment_id)) return null
  /* Only a payment that went through has an invoice: one that is pending,
     failed or disputed would be printed "paid". A refunded sale keeps its
     invoice, as a record of the sale the refund reverses. */
  const orderStatus = String((order as { status?: string | null }).status ?? "completed")
  if (orderStatus !== "completed" && orderStatus !== "refunded") return null

  /* What the checkout recorded: a product's PaymentIntent, or a basket's Checkout Session. */
  let meta: Record<string, string> = context.metadata ?? {}
  let items = context.items ?? null
  /* Given by the caller, even as "none", it is the answer; otherwise the row's, then the payment's. */
  const businessKnown = context.business !== undefined
  let business = businessKnown ? (context.business ?? null) : businessFromFields(first.business_details)
  let discountCode = context.discountCode ?? null
  if (isBasket) {
    if ((!items || (!business && !businessKnown)) && first.stripe_session_id?.startsWith("cs_")) {
      try {
        const session = await stripe.checkout.sessions.retrieve(first.stripe_session_id)
        items = items ?? unpackItems((session.metadata ?? {}) as Record<string, string>)
        if (!businessKnown) business = business ?? businessFromStripe(session.customer_details)
        discountCode = discountCode ?? (session.metadata?.coupon_code || null)
      } catch {
        /* The rows alone still make the document: one line each, as charged. */
      }
    } else if ((!items || (!business && !businessKnown)) && first.stripe_session_id?.startsWith("pi_")) {
      /* A website's basket paid on its own checkout (app/checkout/site): the same lines, on its PaymentIntent. */
      try {
        const m = ((await stripe.paymentIntents.retrieve(first.stripe_session_id)).metadata ?? {}) as Record<string, string>
        items = items ?? unpackItems(m)
        if (!businessKnown) business = business ?? businessFromMetadata(m)
        discountCode = discountCode ?? (m.coupon_code || null)
      } catch {
        /* As above: the rows alone still make the document. */
      }
    }
  } else if (!context.metadata && first.stripe_payment_intent_id) {
    try {
      meta = (await stripe.paymentIntents.retrieve(first.stripe_payment_intent_id)).metadata ?? {}
    } catch {
      /* The order alone still makes an invoice: no discount line, no company from the payment. */
    }
  }
  if (!businessKnown) business = business ?? businessFromMetadata(meta)

  /* `amount_cents` is what each row was charged, the tip inside it. */
  const tip = rows.reduce((n, r) => n + Math.max(0, Number(r.tip_cents) || 0), 0)
  let lines: InvoiceLine[]
  let discount: number
  /* The tax in the amount: a single product's as stripe-session put it on the payment; a basket's on each of its rows (orders.tax_cents, tax_included). */
  const rowTax = (r: OrderRow) => Math.max(0, Number(r.tax_cents) || 0)
  const rowTaxIncluded = (r: OrderRow) => r.tax_included === true
  const basketTax = rows.reduce((n, r) => n + rowTax(r), 0)
  /* One order: the payment's own record, else the order's (a membership renewal's tax comes from its Stripe invoice onto the row, lib/memberships/sync.ts). */
  const metaTax = Math.max(0, Number.parseInt(meta.tax_cents || "0", 10) || 0)
  const singleFromRow = !isBasket && metaTax === 0 && rowTax(first) > 0
  const taxCents = !isBasket ? metaTax || rowTax(first) : basketTax
  const taxIncluded = !isBasket ? (singleFromRow ? rowTaxIncluded(first) : meta.tax_included === "true") : basketTax > 0 && rows.filter((r) => rowTax(r) > 0).every(rowTaxIncluded)
  const taxRateBps = Math.max(0, Number.parseInt(meta.tax_rate_bps || "0", 10) || 0)
  /* The tax's own words: the payment's for one product, the rows' for a basket (one label when they agree), else the rate. */
  const rowLabels = [...new Set(rows.filter((r) => rowTax(r) > 0).map((r) => (typeof r.tax_label === "string" ? r.tax_label.trim() : "")).filter(Boolean))]
  const taxLabel = (!isBasket ? (meta.tax_label || "").trim() || (singleFromRow ? rowLabels[0] ?? "" : "") : rowLabels.length === 1 ? rowLabels[0] : "") || (taxRateBps > 0 ? `Tax ${percentText(taxRateBps)}` : "Tax")
  const addedTax = taxIncluded ? 0 : taxCents
  if (!isBasket) {
    const recordedDiscount = Math.max(0, Number(meta.discount_cents) || 0)
    const recordedBase = Number(meta.base_price_cents)
    /* The price before the code, as the checkout recorded it, when it adds
       up to what was charged; otherwise what was paid, with no discount
       line, because a document whose figures do not add up is worse. */
    const adds = Number.isFinite(recordedBase) && recordedBase > 0 && recordedBase - recordedDiscount + tip + addedTax === total
    const base = adds ? recordedBase : total - tip - addedTax
    discount = adds ? recordedDiscount : 0
    discountCode = discount > 0 ? discountCode ?? (meta.coupon_code || null) : null
    lines = [{ description: first.product?.title || meta.product_title || "Digital product", detail: first.variant_name || null, quantity: 1, unitCents: base, amountCents: base }]
  } else {
    /* Each row with the line it was priced as: its quantity, its unit price and what a code took off it. */
    const left = [...(items ?? [])]
    const priced = rows.map((r) => {
      const at = left.findIndex((i) => i.productId === r.product_id && (i.variantId ?? null) === (r.variant_id ?? null))
      const item = at >= 0 ? left.splice(at, 1)[0] : null
      /* Tax added on top is in the row's amount; the line is its price, the tax its own row below. */
      const charged = Math.max(0, (Number(r.amount_cents) || 0) - (Number(r.tip_cents) || 0) - (rowTaxIncluded(r) ? 0 : rowTax(r)))
      const quantity = item ? Math.max(1, item.quantity) : 1
      const gross = item ? item.priceCents * quantity : charged
      const off = item ? Math.max(0, item.discountCents ?? 0) : 0
      /* Only a line whose pricing adds up to what it was charged is shown with it. */
      const fits = item !== null && gross - off === charged
      return {
        line: {
          description: r.product?.title || "Digital product",
          detail: r.variant_name || null,
          quantity: fits ? quantity : 1,
          unitCents: fits && item ? item.priceCents : charged,
          amountCents: fits ? gross : charged,
        },
        off: fits ? off : 0,
      }
    })
    lines = priced.map((p) => p.line)
    discount = priced.reduce((n, p) => n + p.off, 0)
    if (discount === 0) discountCode = null
  }
  const subtotal = lines.reduce((n, l) => n + l.amountCents, 0)

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

  const creatorId = first.product?.creator_id ?? order.product?.creator_id ?? null
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
        email = email || ownerAddress(profile?.email) || null
        name = name || profile?.display_name || null
        username = username || profile?.username || null
      }
      seller = { name: name || seller.name, email, url: username ? `storelib.com/${username}` : null }
    }
  }
    /* The store's own name over the person's, and the business behind it (Settings › Store details). Its own reads: an older database keeps the seller above. */
    try {
      let res = await admin.from("store_settings").select("store_name, legal").eq("creator_id", creatorId).maybeSingle()
      if (res.error) res = await admin.from("store_settings").select("store_name").eq("creator_id", creatorId).maybeSingle()
      const row = (res.data ?? {}) as { store_name?: string | null; legal?: unknown }
      if (typeof row.store_name === "string" && row.store_name.trim()) seller.name = row.store_name.trim()
      const legal = businessFromFields(row.legal)
      if (legal) {
        seller.legalName = legal.company
        seller.address = addressLines(legal, countryName)
        seller.taxId = legal.taxId || null
        seller.taxIdLabel = taxIdFor(legal.country).label
      }
    } catch {
      /* The seller as read above. */
    }

  const issuedAt = new Date(first.created_at)
  return {
    number: invoiceNumber(first.id, issuedAt),
    kind: business ? "invoice" : "receipt",
    issuedAt,
    status,
    currency: String(first.currency || "usd").toUpperCase(),
    seller,
    buyer: {
      name: [first.buyer_first_name, first.buyer_last_name].filter(Boolean).join(" ").trim(),
      email: first.buyer_email || meta.buyer_email || "",
      business,
    },
    lines,
    refundedCents: refunded,
    subtotalCents: subtotal,
    discountCents: discount,
    discountCode,
    tipCents: tip,
    taxCents,
    taxIncluded,
    taxRateBps,
    taxLabel: taxCents > 0 ? taxLabel : null,
    totalCents: total,
    payment: paymentLabel(first),
    reference: first.stripe_payment_intent_id ?? first.provider_payment_id ?? null,
    orderId: first.id,
  }
}

/* ─── Drawing ─────────────────────────────────────────────────────────── */

const INK = "#1a1a2e"
const BODY = "#374151"
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

export function moneyText(cents: number, currency = "USD"): string {
  return formatCurrency((cents || 0) / 100, currency || "USD", "en-US")
}

const dateText = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d)

/**
 * The PDF. `trace`, when given, is handed every piece of text as it is
 * drawn, which is how the tests read what the document says without a PDF
 * reader of their own.
 */
export async function renderInvoicePdf(inv: InvoiceData, trace?: string[]): Promise<Buffer> {
  // @ts-ignore - pdfkit ships CJS without bundled types
  const pdfkit = await import("pdfkit")
  const PDFDocument = (pdfkit.default || pdfkit) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const title = inv.kind === "invoice" ? "Invoice" : "Receipt"
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 56, left: 56, right: 56 },
    info: { Title: `${title} ${inv.number}`, Author: inv.seller.name, Subject: inv.lines.map((l) => l.description).join(", ").slice(0, 200), Creator: "Storelib" },
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
  /** Every string on the page goes through here. */
  const put = (text: string, x: number, y: number, options?: Record<string, unknown>) => {
    const s = t(text)
    trace?.push(s)
    doc.text(s, x, y, options)
    return doc.y as number
  }
  const money = (cents: number) => moneyText(cents, inv.currency)

  const left = 56
  const right = doc.page.width - 56
  const width = right - left
  const pageBottom = doc.page.height - 56 - 40

  /* ── Header: what this is, and whose ─────────────────────────────── */
  doc.font(BOLD).fontSize(22).fillColor(INK)
  put(title, left, 52, { width: width / 2, lineBreak: false })
  doc.font(BOLD).fontSize(11).fillColor(INK)
  put(inv.seller.name, left + width / 2, 54, { width: width / 2, align: "right" })
  doc.font(REG).fontSize(9).fillColor(MUTED)
  put("Sold through Storelib", left + width / 2, doc.y + 2, { width: width / 2, align: "right" })

  const STATUS: Record<InvoiceData["status"], [string, string]> = {
    paid: ["Paid", "#067647"],
    refunded: ["Refunded", "#b42318"],
    partially_refunded: ["Partially refunded", "#b54708"],
    disputed: ["Disputed", "#b42318"],
  }

  /* ── The facts ───────────────────────────────────────────────────── */
  let y = 104
  const facts: [string, string, string?][] = [
    [`${title} number`, inv.number],
    ["Date of issue", dateText(inv.issuedAt)],
    ["Order date", dateText(inv.issuedAt)],
    ["Order", inv.orderId.replace(/-/g, "").slice(0, 8).toUpperCase()],
    ["Payment", inv.payment],
    ...(inv.reference ? ([["Payment reference", inv.reference]] as [string, string][]) : []),
    ["Status", STATUS[inv.status][0], STATUS[inv.status][1]],
  ]
  for (const [k, v, color] of facts) {
    doc.font(REG).fontSize(9.5).fillColor(MUTED)
    put(k, left, y, { width: 104 })
    doc.font(color ? BOLD : REG).fontSize(9.5).fillColor(color ?? INK)
    put(v, left + 104, y, { width: width - 104 })
    y += 15
  }

  /* ── Billed to, and From ─────────────────────────────────────────── */
  y += 20
  const col = (width - 32) / 2
  const block = (x: number, heading: string, strong: string, lines: string[]) => {
    doc.font(REG).fontSize(9).fillColor(MUTED)
    put(heading, x, y, { width: col })
    doc.font(BOLD).fontSize(10.5).fillColor(INK)
    let yy = put(strong, x, y + 15, { width: col }) + 2
    for (const line of lines) {
      doc.font(REG).fontSize(9.5).fillColor(BODY)
      yy = put(line, x, yy, { width: col }) + 1.5
    }
    return yy
  }
  const b = inv.buyer.business
  const taxLabel = b ? taxIdFor(b.country).label : "Tax ID"
  const billLines = b
    ? [
        ...(b.taxId ? [`${taxLabel} ${b.taxId}`] : []),
        ...addressLines(b, countryName),
        ...(inv.buyer.name ? [`Attn: ${inv.buyer.name}`] : []),
        inv.buyer.email,
      ]
    : inv.buyer.name
      ? [inv.buyer.email]
      : []
  const billEnd = block(left, b ? "Billed to" : "Paid by", b ? b.company : inv.buyer.name || inv.buyer.email, billLines.filter(Boolean))
  /* The seller as the law asks for it: the legal name, the store's name it trades as, the address and the tax number, then how to reach it. */
  const legalName = inv.seller.legalName && inv.seller.legalName !== inv.seller.name ? inv.seller.legalName : null
  const sellerLines = [
    ...(legalName ? [`Trading as ${inv.seller.name}`] : []),
    ...(inv.seller.address ?? []),
    ...(inv.seller.taxId ? [`${inv.seller.taxIdLabel || "Tax ID"} ${inv.seller.taxId}`] : []),
    inv.seller.email,
    inv.seller.url,
  ].filter(Boolean) as string[]
  const fromEnd = block(left + col + 32, "Sold by", legalName ?? inv.seller.name, sellerLines)
  y = Math.max(fromEnd, billEnd) + 26

  /* ── The headline figure ─────────────────────────────────────────── */
  doc.font(BOLD).fontSize(15).fillColor(INK)
  put(
    inv.status === "refunded"
      ? `${money(inv.totalCents)} ${inv.currency} refunded`
      : `${money(inv.totalCents)} ${inv.currency} paid on ${dateText(inv.issuedAt)}`,
    left,
    y,
    { width },
  )
  y = doc.y + 20

  /* ── The lines ───────────────────────────────────────────────────── */
  const cQty = left + width * 0.56
  const cUnit = left + width * 0.66
  const cAmt = left + width * 0.83
  const header = () => {
    doc.font(REG).fontSize(9).fillColor(MUTED)
    put("Description", left, y, { width: cQty - left - 8 })
    put("Qty", cQty, y, { width: cUnit - cQty - 8, align: "right" })
    put("Unit price", cUnit, y, { width: cAmt - cUnit - 8, align: "right" })
    put("Amount", cAmt, y, { width: right - cAmt, align: "right" })
    y += 16
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
    y += 10
  }
  header()
  for (const line of inv.lines) {
    if (y > pageBottom - 40) {
      doc.addPage()
      y = 56
      header()
    }
    doc.font(REG).fontSize(10).fillColor(INK)
    let lineEnd = put(line.description, left, y, { width: cQty - left - 8 })
    if (line.detail) {
      doc.font(REG).fontSize(9).fillColor(MUTED)
      lineEnd = put(line.detail, left, lineEnd + 1, { width: cQty - left - 8 })
    }
    doc.font(REG).fontSize(10).fillColor(INK)
    put(String(line.quantity), cQty, y, { width: cUnit - cQty - 8, align: "right" })
    put(money(line.unitCents), cUnit, y, { width: cAmt - cUnit - 8, align: "right" })
    put(money(line.amountCents), cAmt, y, { width: right - cAmt, align: "right" })
    y = lineEnd + 11
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
    y += 11
  }

  /* ── The sums, right hand ────────────────────────────────────────── */
  if (y > pageBottom - 150) {
    doc.addPage()
    y = 56
  }
  const tLabel = left + width * 0.5
  const row = (label: string, value: string, strong = false) => {
    doc.font(strong ? BOLD : REG).fontSize(strong ? 10.5 : 10).fillColor(strong ? INK : BODY)
    put(label, tLabel, y, { width: cAmt - tLabel - 8 })
    put(value, cAmt - 60, y, { width: right - cAmt + 60, align: "right" })
    y += strong ? 20 : 17
  }
  row("Subtotal", money(inv.subtotalCents))
  if (inv.discountCents > 0) row(inv.discountCode ? `Discount (${inv.discountCode})` : "Discount", `−${money(inv.discountCents)}`)
  if (inv.tipCents > 0) row("Tip", money(inv.tipCents))
  /* Named as the checkout named it: "VAT 19%". */
  const taxName = inv.taxLabel || (inv.taxRateBps ? `Tax ${percentText(inv.taxRateBps)}` : "Tax")
  if (inv.taxCents && !inv.taxIncluded) row(taxName, money(inv.taxCents))
  y += 2
  doc.moveTo(tLabel, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
  y += 10
  row("Total", money(inv.totalCents), true)
  if (inv.taxCents && inv.taxIncluded) row(includedTaxLabel(taxName), money(inv.taxCents))
  row("Amount paid", `${money(inv.totalCents)} ${inv.currency}`, true)
  if (inv.refundedCents > 0) row("Refunded", `−${money(inv.refundedCents)} ${inv.currency}`, true)

  /* ── The small print, at the foot of the last page ───────────────── */
  const footer =
    `${title} for a completed payment. Sold by ${inv.seller.name} through Storelib (storelib.com). ` +
    `Amounts are in ${inv.currency === "USD" ? "US dollars" : inv.currency}.` +
    (inv.seller.email ? ` Questions about this purchase: ${inv.seller.email}.` : "")
  /* Inside the bottom margin, which pdfkit would otherwise answer with a new page. */
  doc.page.margins.bottom = 0
  doc.moveTo(left, doc.page.height - 56 - 44).lineTo(right, doc.page.height - 56 - 44).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.font(REG).fontSize(8.5).fillColor(MUTED)
  put(footer, left, doc.page.height - 56 - 32, { width, align: "left" })

  doc.end()
  return done
}

export function invoiceFilename(inv: Pick<InvoiceData, "number"> & Partial<Pick<InvoiceData, "kind">>): string {
  return `${inv.kind === "invoice" ? "Invoice" : "Receipt"}-${inv.number}.pdf`
}
