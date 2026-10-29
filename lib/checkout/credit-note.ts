import "server-only"

/**
 * ===========================================================================
 *  A CREDIT NOTE FOR EVERY REFUND
 * ===========================================================================
 * An invoice is never changed after it is issued. When money goes back, a
 * credit note is issued that names the invoice it corrects and says what it
 * gives back: each refunded line, and the tax inside the refund split by
 * rate, every figure negative. It is what an accountant files beside the
 * invoice, so its figures add up to exactly what was refunded.
 *
 * ONE PER REFUND, IN THE INVOICES' SEQUENCE. SQL part 329
 * (storelib_credit_note) numbers it from the same per store counter as
 * invoices (part 321), under the same lock, and keys it by the refund: a
 * refund made from the Orders page and seen again by the webhook, or a
 * webhook delivered twice, is one credit note with one number. A refund
 * Storelib did not see as it happened (before part 329, a webhook that
 * failed) gets its note the first time one is asked for, from the ledger's
 * refund events, which are the record of every refund applied
 * (lib/stripe/refund-sync.ts).
 *
 * IN THE BUYER'S LANGUAGE AND MONEY, as their invoice: the invoice's own
 * read (lib/checkout/invoice.ts invoiceForOrder) decides the language
 * (lib/markets/buyer-language.ts), the words (Translate › Checkout and
 * Storelib's dictionaries, lib/checkout-text/dict/credit-note.ts) and the
 * locale its money and dates are written in.
 *
 * WHAT EACH LINE GAVE BACK. A refund is split over the order's rows as the
 * ledger split it (lib/stripe/refund-allocation.ts); each row is one line of
 * its invoice. The tax in a row's share is the row's tax in the same
 * proportion as the share is of what the row was charged, rounded per row,
 * and the rest is its net: so lines, tax and total always add up.
 */

import { invoiceForOrder, invoiceDateText, latin1, loadFonts, moneyText, type InvoiceData, type OrderRow } from "./invoice"
import { percentText } from "@/lib/tax/rules"
import { checkoutT } from "@/lib/markets/checkout-words"
import { buyerMoneyLocale } from "@/lib/markets/buyer-language"

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** One order row's part of a refund, in the currency's minor units. */
export interface RefundShare {
  orderId: string
  cents: number
}

/** The stored note (store_credit_notes). */
export interface CreditNoteRow {
  id: string
  creator_id: string
  order_id: string
  refund_key: string
  seq: number
  amount_cents: number
  currency: string
  shares: RefundShare[]
  issued_at: string
}

export interface CreditNoteLine {
  description: string
  detail: string | null
  /** Negative: what this line gave back, before tax when the tax was added on top, with it when it was included. */
  amountCents: number
  /** Less than the line was charged. */
  partial: boolean
}

export interface CreditNoteTax {
  /** "VAT 19%", as the invoice named the tax. */
  label: string
  /** Negative. */
  netCents: number
  /** Negative. */
  taxCents: number
}

export interface CreditNoteData {
  number: string
  issuedAt: Date
  /** The invoice it corrects: its number, kind and date of issue. */
  original: { number: string; kind: InvoiceData["kind"]; issuedAt: Date }
  orderId: string
  refundReference: string | null
  currency: string
  timeZone?: string | null
  lang?: string
  words?: Record<string, string>
  seller: InvoiceData["seller"]
  buyer: InvoiceData["buyer"]
  lines: CreditNoteLine[]
  taxes: CreditNoteTax[]
  taxIncluded: boolean
  /** Negative: the lines added up. */
  subtotalCents: number
  /** Negative: what was refunded. */
  totalCents: number
}

/** The store's sequence, as invoices are written (lib/checkout/invoice.ts sequentialNumber). */
export function creditNoteNumber(seq: number): string {
  return String(Math.max(1, Math.floor(seq))).padStart(6, "0")
}

function readShares(raw: unknown): RefundShare[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => ({ orderId: String((s as { orderId?: unknown; order_id?: unknown })?.orderId ?? (s as { order_id?: unknown })?.order_id ?? ""), cents: Math.round(Number((s as { cents?: unknown })?.cents) || 0) }))
    .filter((s) => s.orderId && s.cents > 0)
}

function readRow(raw: unknown): CreditNoteRow | null {
  const r = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<CreditNoteRow> | null
  if (!r || typeof r.id !== "string" || !Number.isInteger(Number(r.seq))) return null
  return { ...(r as CreditNoteRow), seq: Number(r.seq), amount_cents: Number(r.amount_cents) || 0, shares: readShares(r.shares) }
}

/**
 * The credit note for this refund: issued now with the store's next number,
 * or the one it already has. Null before SQL part 329 has run, for an order
 * that is not the store's, or when the database cannot answer; the refund
 * itself never waits on it.
 */
export async function issueCreditNote(db: Db, input: { creatorId: string | null; orderId: string; refundKey: string; currency: string; shares: RefundShare[] }): Promise<CreditNoteRow | null> {
  const shares = input.shares.filter((s) => s.cents > 0)
  const amount = shares.reduce((n, s) => n + s.cents, 0)
  if (!input.creatorId || !input.refundKey || amount <= 0 || typeof db.rpc !== "function") return null
  try {
    const { data, error } = await db.rpc("storelib_credit_note", {
      p_creator: input.creatorId,
      p_order: input.orderId,
      p_refund: input.refundKey.slice(0, 200),
      p_amount: amount,
      p_currency: (input.currency || "usd").toUpperCase(),
      p_shares: shares.map((s) => ({ orderId: s.orderId, cents: s.cents })),
    })
    if (error || !data) return null
    return readRow(data)
  } catch {
    return null
  }
}

/** Every credit note of these order rows' purchase, oldest first. Empty before part 329. */
export async function creditNotesFor(db: Db, orderIds: string[]): Promise<CreditNoteRow[]> {
  if (orderIds.length === 0) return []
  try {
    const { data, error } = await db.from("store_credit_notes").select("*").in("order_id", orderIds.slice(0, 50)).order("issued_at", { ascending: true }).limit(100)
    if (error) return []
    return ((data ?? []) as unknown[]).map(readRow).filter((r): r is CreditNoteRow => !!r)
  } catch {
    return []
  }
}

/** A purchase's rows in the order they were written: the first is the one its invoice and its credit notes are filed under. */
function firstOf<T extends { id: string; created_at?: string | null }>(rows: T[]): T | null {
  return [...rows].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))[0] ?? null
}

/**
 * The credit notes of a purchase, every refund the ledger recorded on it
 * given one: those issued as the refund happened, and one now for any that
 * was not (a refund from before part 329, a moment the database could not
 * answer). Oldest first.
 */
export async function ensureCreditNotes(db: Db, rows: Array<{ id: string; created_at?: string | null; currency?: string | null }>, creatorId: string | null): Promise<CreditNoteRow[]> {
  const first = firstOf(rows)
  if (!first || !creatorId) return []
  const ids = rows.map((r) => r.id)
  const have = await creditNotesFor(db, [first.id])
  try {
    const { data, error } = await db.from("ledger_events").select("order_id, stripe_refund_id, amount_cents, currency, created_at").eq("event_type", "refund").in("order_id", ids.slice(0, 50)).limit(500)
    if (error) return have
    const byRefund = new Map<string, { shares: RefundShare[]; currency: string | null }>()
    for (const e of (data ?? []) as Array<{ order_id: string; stripe_refund_id: string | null; amount_cents: number | null; currency: string | null }>) {
      if (!e.stripe_refund_id || !(Number(e.amount_cents) > 0)) continue
      const got = byRefund.get(e.stripe_refund_id) ?? { shares: [], currency: e.currency }
      got.shares.push({ orderId: e.order_id, cents: Math.round(Number(e.amount_cents)) })
      byRefund.set(e.stripe_refund_id, got)
    }
    const known = new Set(have.map((n) => n.refund_key))
    for (const [refundKey, r] of byRefund) {
      if (known.has(refundKey)) continue
      /* The ledger's amount is in the wallet's currency; the note is in the order's, which is the same unless the store sold in another (then the order's rows are the truth). */
      const sameCurrency = !r.currency || !first.currency || r.currency.toLowerCase() === String(first.currency).toLowerCase()
      if (!sameCurrency) continue
      const note = await issueCreditNote(db, { creatorId, orderId: first.id, refundKey, currency: String(first.currency || r.currency || "usd"), shares: r.shares })
      if (note) have.push(note)
    }
  } catch {
    /* The notes already issued are still the answer. */
  }
  return have.sort((a, b) => a.seq - b.seq)
}

/* ─── What a credit note says ─────────────────────────────────────────── */

/** A row's tax and the name it was charged under: the row's own, else the invoice's for a single product. */
function rowTax(row: OrderRow, inv: InvoiceData, single: boolean): { cents: number; label: string | null } {
  if (single) return { cents: Math.max(0, inv.taxCents ?? 0), label: inv.taxLabel ?? null }
  const snap = (row.product_snapshot ?? {}) as Record<string, unknown>
  const cents = Math.max(0, Math.round(Number(row.tax_cents) || Number(snap.tax_cents) || 0))
  const label = (typeof row.tax_label === "string" && row.tax_label.trim()) || (typeof snap.tax_label === "string" && snap.tax_label.trim()) || inv.taxLabel || null
  return { cents, label }
}

/**
 * The credit note, from the invoice it corrects, that invoice's rows (in
 * the order the invoice lists them: one line per row) and the stored note.
 * Pure: the tests build one without a database.
 */
export function buildCreditNote(inv: InvoiceData, rows: OrderRow[], note: Pick<CreditNoteRow, "seq" | "issued_at" | "shares" | "refund_key" | "amount_cents">): CreditNoteData {
  const ordered = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
  const single = ordered.length === 1
  const charged = (r: OrderRow) => Math.max(0, Number(r.amount_cents) || 0)
  /* A checkout's tax kept only on the checkout (an order that ships): spread over its rows by what each was charged. */
  const rowTaxes = ordered.map((r) => rowTax(r, inv, single))
  const spread = !single && rowTaxes.every((t) => t.cents === 0) && (inv.taxCents ?? 0) > 0
  const totalCharged = ordered.reduce((n, r) => n + charged(r), 0) || 1
  let spreadLeft = inv.taxCents ?? 0
  const taxOf = ordered.map((r, i) => {
    if (!spread) return rowTaxes[i]
    const cents = i === ordered.length - 1 ? spreadLeft : Math.round(((inv.taxCents ?? 0) * charged(r)) / totalCharged)
    spreadLeft -= cents
    return { cents, label: inv.taxLabel ?? null }
  })

  const lines: CreditNoteLine[] = []
  const taxes = new Map<string, CreditNoteTax>()
  let total = 0
  let subtotal = 0
  for (const share of note.shares) {
    const at = ordered.findIndex((r) => r.id === share.orderId)
    if (at < 0) continue
    const row = ordered[at]
    const line = inv.lines[at] ?? inv.lines[0]
    const rowCharged = charged(row)
    const cents = Math.min(share.cents, rowCharged || share.cents)
    const t = taxOf[at]
    /* The tax inside this share: the row's tax in the share's proportion of the row, rounded once for the row. */
    const tax = rowCharged > 0 && t.cents > 0 ? Math.min(cents, Math.round((cents * t.cents) / rowCharged)) : 0
    const net = cents - tax
    const shown = inv.taxIncluded ? cents : net
    lines.push({ description: line?.description ?? "Item", detail: line?.detail ?? null, amountCents: -shown, partial: cents < rowCharged })
    subtotal += shown
    total += cents
    if (tax > 0) {
      const label = (t.label || "").trim() || (inv.taxRateBps ? `Tax ${percentText(inv.taxRateBps)}` : "Tax")
      const g = taxes.get(label) ?? { label, netCents: 0, taxCents: 0 }
      g.netCents -= net
      g.taxCents -= tax
      taxes.set(label, g)
    }
  }
  return {
    number: creditNoteNumber(note.seq),
    issuedAt: new Date(note.issued_at),
    original: { number: inv.number, kind: inv.kind, issuedAt: inv.issuedAt },
    orderId: inv.orderId,
    refundReference: /^(re_|pyr_)/.test(note.refund_key) ? note.refund_key : null,
    currency: inv.currency,
    timeZone: inv.timeZone ?? null,
    ...(inv.lang ? { lang: inv.lang, words: inv.words ?? {} } : {}),
    seller: inv.seller,
    buyer: inv.buyer,
    lines,
    taxes: [...taxes.values()],
    taxIncluded: inv.taxIncluded === true,
    subtotalCents: -subtotal,
    totalCents: -total,
  }
}

/** The order's rows as the invoice reads them. */
async function purchaseRows(db: Db, orderId: string): Promise<OrderRow[]> {
  const { data: order } = await db.from("orders").select("*, product:products(title, creator_id)").eq("id", orderId).maybeSingle()
  if (!order) return []
  if (order.stripe_session_id) {
    const { data: rows } = await db.from("orders").select("*, product:products(title, creator_id)").eq("stripe_session_id", order.stripe_session_id).order("created_at", { ascending: true }).limit(50)
    if (rows && rows.length > 0) return rows as OrderRow[]
  }
  return [order as OrderRow]
}

/** Everything a credit note's PDF needs, for one stored note. Null when its invoice cannot be drawn. */
export async function creditNoteFor(db: Db, note: CreditNoteRow): Promise<CreditNoteData | null> {
  const rows = await purchaseRows(db, note.order_id)
  if (rows.length === 0) return null
  const inv = await invoiceForOrder(db, rows[0], rows.length > 1 ? { basket: rows } : {})
  if (!inv) return null
  return buildCreditNote(inv, rows, note)
}

/** The credit notes reachable from a receipt token (the buyer's credential), each issued if it was not yet. */
export async function creditNotesForReceipt(db: Db, receiptToken: string): Promise<{ notes: CreditNoteRow[]; rows: OrderRow[] }> {
  const { data: order } = await db.from("orders").select("id, stripe_session_id, created_at, currency, status, product:products(creator_id)").eq("receipt_token", receiptToken).maybeSingle()
  if (!order) return { notes: [], rows: [] }
  const rows = await purchaseRows(db, order.id)
  const creatorId = (order as { product?: { creator_id?: string | null } | null }).product?.creator_id ?? rows[0]?.product?.creator_id ?? null
  if (!rows.some((r) => r.status === "refunded")) return { notes: [], rows }
  return { notes: await ensureCreditNotes(db, rows, creatorId), rows }
}

/**
 * The credit note of one refund made from the Orders page, issued if the
 * ledger's step (lib/stripe/refund-sync.ts) has not issued it already: a
 * cash refund never reaches the ledger, and a moment when Stripe's charge
 * could not be read leaves it to the webhook. The refund is the row's alone.
 */
export async function creditNoteForRefund(db: Db, input: { orderId: string; creatorId: string; refundKey: string; currency: string; cents: number }): Promise<{ note: CreditNoteRow; first: OrderRow } | null> {
  const rows = await purchaseRows(db, input.orderId)
  const first = firstOf(rows)
  if (!first) return null
  const have = (await creditNotesFor(db, [first.id])).find((n) => n.refund_key === input.refundKey)
  const note = have ?? (await issueCreditNote(db, { creatorId: input.creatorId, orderId: first.id, refundKey: input.refundKey, currency: input.currency, shares: [{ orderId: input.orderId, cents: input.cents }] }))
  return note ? { note, first } : null
}

/** The buyer's link to one credit note: their receipt token and the note's id, both unguessable. */
export function creditNotePath(receiptToken: string, noteId: string): string {
  return `/api/checkout/credit-note?token=${encodeURIComponent(receiptToken)}&id=${encodeURIComponent(noteId)}`
}

export function creditNoteFilename(cn: Pick<CreditNoteData, "number">): string {
  return `Credit-note-${cn.number}.pdf`
}

/* ─── Drawing ─────────────────────────────────────────────────────────── */

const INK = "#1a1a2e"
const BODY = "#374151"
const MUTED = "#6b7280"
const RULE = "#e5e7eb"

/** The PDF, in the invoice's look. `trace` is handed every piece of text as it is drawn, for the tests. */
export async function renderCreditNotePdf(cn: CreditNoteData, trace?: string[]): Promise<Buffer> {
  // @ts-ignore - pdfkit ships CJS without bundled types
  const pdfkit = await import("pdfkit")
  const PDFDocument = (pdfkit.default || pdfkit) as any // eslint-disable-line @typescript-eslint/no-explicit-any

  const ct = checkoutT(cn.lang || "en", cn.words ?? {})
  const locale = buyerMoneyLocale(cn.lang)
  const title = ct("Credit note")
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: `${title} ${cn.number}`, Author: cn.seller.name, Creator: "Storelib" } })
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
  const put = (text: string, x: number, y: number, options?: Record<string, unknown>) => {
    const s = f ? text : latin1(text)
    trace?.push(s)
    doc.text(s, x, y, options)
    return doc.y as number
  }
  /* Negative amounts with a true minus sign, in the buyer's money format. */
  const money = (cents: number) => (cents < 0 ? `−${moneyText(-cents, cn.currency, locale)}` : moneyText(cents, cn.currency, locale))
  const dateText = (d: Date) => invoiceDateText(d, cn.timeZone, locale)

  const left = 56
  const right = doc.page.width - 56
  const width = right - left

  doc.font(BOLD).fontSize(22).fillColor(INK)
  put(title, left, 52, { width: width / 2, lineBreak: false })
  doc.font(BOLD).fontSize(11).fillColor(INK)
  put(cn.seller.name, left + width / 2, 54, { width: width / 2, align: "right" })
  doc.font(REG).fontSize(9).fillColor(MUTED)
  put(ct("Sold through Storelib"), left + width / 2, doc.y + 2, { width: width / 2, align: "right" })

  let y = 104
  const facts: [string, string][] = [
    [ct("Credit note number"), cn.number],
    [ct("Date of issue"), dateText(cn.issuedAt)],
    [cn.original.kind === "invoice" ? ct("Original invoice") : ct("Original receipt"), cn.original.number],
    [ct("Order"), cn.orderId.replace(/-/g, "").slice(0, 8).toUpperCase()],
    ...(cn.refundReference ? ([[ct("Refund reference"), cn.refundReference]] as [string, string][]) : []),
  ]
  for (const [k, v] of facts) {
    doc.font(REG).fontSize(9.5).fillColor(MUTED)
    put(k, left, y, { width: 110 })
    doc.font(REG).fontSize(9.5).fillColor(INK)
    put(v, left + 110, y, { width: width - 110 })
    y += 15
  }

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
  const b = cn.buyer.business
  const billEnd = block(left, b ? ct("Billed to") : ct("Paid by"), b ? b.company : cn.buyer.name || cn.buyer.email, (b ? [...(b.taxId ? [b.taxId] : []), cn.buyer.email] : cn.buyer.name ? [cn.buyer.email] : []).filter(Boolean))
  const legalName = cn.seller.legalName && cn.seller.legalName !== cn.seller.name ? cn.seller.legalName : null
  const sellerLines = [...(legalName ? [ct("Trading as {store}", { store: cn.seller.name })] : []), ...(cn.seller.address ?? []), ...(cn.seller.taxId ? [cn.seller.taxId] : []), cn.seller.email, cn.seller.url].filter(Boolean) as string[]
  const fromEnd = block(left + col + 32, ct("Sold by"), legalName ?? cn.seller.name, sellerLines)
  y = Math.max(billEnd, fromEnd) + 26

  doc.font(BOLD).fontSize(15).fillColor(INK)
  put(ct("{amount} {currency} credited on {date}", { amount: money(cn.totalCents), currency: cn.currency, date: dateText(cn.issuedAt) }), left, y, { width })
  y = doc.y + 20

  const cAmt = left + width * 0.75
  doc.font(REG).fontSize(9).fillColor(MUTED)
  put(ct("Description"), left, y, { width: cAmt - left - 8 })
  put(ct("Amount"), cAmt, y, { width: right - cAmt, align: "right" })
  y += 16
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
  y += 10
  for (const line of cn.lines) {
    doc.font(REG).fontSize(10).fillColor(INK)
    let end = put(line.description, left, y, { width: cAmt - left - 8 })
    const detail = [line.detail, line.partial ? ct("Partial refund") : null].filter(Boolean).join(" · ")
    if (detail) {
      doc.font(REG).fontSize(9).fillColor(MUTED)
      end = put(detail, left, end + 1, { width: cAmt - left - 8 })
    }
    doc.font(REG).fontSize(10).fillColor(INK)
    put(money(line.amountCents), cAmt, y, { width: right - cAmt, align: "right" })
    y = end + 11
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
    y += 11
  }

  const tLabel = left + width * 0.45
  const row = (label: string, value: string, strong = false) => {
    doc.font(strong ? BOLD : REG).fontSize(strong ? 10.5 : 10).fillColor(strong ? INK : BODY)
    put(label, tLabel, y, { width: cAmt - tLabel - 8 })
    put(value, cAmt - 60, y, { width: right - cAmt + 60, align: "right" })
    y += strong ? 20 : 17
  }
  row(ct("Subtotal"), money(cn.subtotalCents))
  if (!cn.taxIncluded) for (const t of cn.taxes) row(t.label, money(t.taxCents))
  y += 2
  doc.moveTo(tLabel, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
  y += 10
  row(ct("Total credited"), `${money(cn.totalCents)} ${cn.currency}`, true)
  if (cn.taxIncluded) for (const t of cn.taxes) row(ct("Including {tax}", { tax: t.label }), money(t.taxCents))

  /* The tax split by rate, as an accountant files it: the net and the tax of each, negative. */
  if (cn.taxes.length > 0) {
    y += 14
    doc.font(REG).fontSize(9).fillColor(MUTED)
    put(ct("Tax rate"), left, y, { width: width * 0.4 })
    put(ct("Net"), left + width * 0.4, y, { width: width * 0.3, align: "right" })
    put(ct("Tax"), left + width * 0.7, y, { width: width * 0.3, align: "right" })
    y += 16
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()
    y += 8
    for (const t of cn.taxes) {
      doc.font(REG).fontSize(10).fillColor(INK)
      put(t.label, left, y, { width: width * 0.4 })
      put(money(t.netCents), left + width * 0.4, y, { width: width * 0.3, align: "right" })
      put(money(t.taxCents), left + width * 0.7, y, { width: width * 0.3, align: "right" })
      y += 17
    }
  }

  const footer = [
    cn.original.kind === "invoice" ? ct("Refund of invoice {number}.", { number: cn.original.number }) : ct("Refund of receipt {number}.", { number: cn.original.number }),
    ct("Sold by {store} through Storelib (storelib.com).", { store: cn.seller.name }),
    ct("Amounts are in {currency}.", { currency: cn.currency === "USD" ? ct("US dollars") : cn.currency }),
    cn.seller.email ? ct("Questions about this purchase: {email}.", { email: cn.seller.email }) : "",
  ]
    .filter(Boolean)
    .join(" ")
  doc.page.margins.bottom = 0
  doc.moveTo(left, doc.page.height - 56 - 44).lineTo(right, doc.page.height - 56 - 44).lineWidth(0.75).strokeColor(RULE).stroke()
  doc.font(REG).fontSize(8.5).fillColor(MUTED)
  put(footer, left, doc.page.height - 56 - 32, { width, align: "left" })

  doc.end()
  return done
}
