/**
 * ===========================================================================
 *  A CREDIT NOTE FOR EVERY REFUND (lib/checkout/credit-note.ts, SQL part 329)
 * ===========================================================================
 * One note per refund, numbered from the store's invoice counter, naming the
 * invoice it corrects, its lines and the tax inside the refund split by rate,
 * every figure negative, in the buyer's language and money. Linked from the
 * refund email, the receipt, the physical order page and the seller's order
 * menu.
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { buildCreditNote, creditNoteNumber, creditNotePath, ensureCreditNotes, issueCreditNote, renderCreditNotePdf, type CreditNoteRow } from "@/lib/checkout/credit-note"
import type { InvoiceData, OrderRow } from "@/lib/checkout/invoice"
import { buyerRefundEmail } from "@/lib/emails/notices"
import { refundEmail } from "@/lib/physical/email-templates"
import { checkoutSentences, emailSentences } from "@/lib/markets/checkout-words"
import ro from "@/lib/checkout-text/dict/ro"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")

const CREATOR = "33333333-3333-4333-8333-333333333333"
const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

/* The database's part 321 and 329 in memory: one counter per store, shared by invoices and credit notes, one note per refund. */
function numberedDb(tables: Record<string, any[]>) {
  const db: any = fakeDb(tables)
  const series = new Map<string, number>()
  const notes: CreditNoteRow[] = (tables.store_credit_notes ??= [])
  const invoices = new Map<string, number>()
  const next = (creator: string) => {
    const n = (series.get(creator) ?? 0) + 1
    series.set(creator, n)
    return n
  }
  db.rpc = async (fn: string, args: any) => {
    if (fn === "storelib_invoice_number") {
      if (!invoices.has(args.p_order)) invoices.set(args.p_order, next(args.p_creator))
      return { data: { seq: invoices.get(args.p_order), issued_at: "2026-10-01T10:00:00Z" }, error: null }
    }
    if (fn === "storelib_credit_note") {
      const have = notes.find((n) => n.creator_id === args.p_creator && n.refund_key === args.p_refund)
      if (have) return { data: have, error: null }
      if (!(args.p_amount > 0)) return { data: null, error: null }
      const row = { id: `cccccccc-cccc-4ccc-8ccc-${String(notes.length + 1).padStart(12, "0")}`, creator_id: args.p_creator, order_id: args.p_order, refund_key: args.p_refund, seq: next(args.p_creator), amount_cents: args.p_amount, currency: args.p_currency, shares: args.p_shares, issued_at: "2026-10-28T09:00:00Z" } as CreditNoteRow
      notes.push(row)
      return { data: row, error: null }
    }
    return { data: null, error: { message: "unknown" } }
  }
  return { db, notes, invoices, series }
}

const invoice = (over: Partial<InvoiceData> = {}): InvoiceData => ({
  number: "000153",
  kind: "invoice",
  issuedAt: new Date("2026-10-01T10:00:00Z"),
  orderedAt: new Date("2026-10-01T10:00:00Z"),
  timeZone: "Europe/Bucharest",
  status: "partially_refunded",
  currency: "RON",
  seller: { name: "Atelier Ana", email: "ana@example.com", url: "storelib.com/ana" },
  buyer: { name: "Maria Pop", email: "maria@example.com", business: null },
  lines: [
    { description: "Ceramic mug", detail: "Blue", quantity: 2, unitCents: 5000, amountCents: 10000 },
    { description: "Glaze course", detail: null, quantity: 1, unitCents: 8000, amountCents: 8000 },
  ],
  refundedCents: 0,
  subtotalCents: 18000,
  discountCents: 0,
  discountCode: null,
  tipCents: 0,
  taxCents: 0,
  taxIncluded: true,
  taxLabel: "TVA 19%",
  totalCents: 18000,
  payment: "Card",
  reference: "pi_1",
  orderId: A,
  ...over,
})
const row = (id: string, created: string, cents: number, tax: number, label: string | null): OrderRow =>
  ({ id, created_at: created, status: "refunded", amount_cents: cents, tip_cents: 0, tax_cents: tax, tax_included: true, tax_label: label, buyer_email: "maria@example.com", buyer_first_name: "Maria", buyer_last_name: "Pop", payment_method: "card", card_brand: "visa", card_last4: "4242", variant_name: null, stripe_payment_intent_id: "pi_1", product: { title: null, creator_id: CREATOR } }) as OrderRow

async function main() {
console.log("\n1. Numbering: the invoices' sequence, once per refund\n")
{
  const { db, notes, invoices } = numberedDb({ store_credit_notes: [], ledger_events: [] })
  await db.rpc("storelib_invoice_number", { p_order: A, p_creator: CREATOR })
  const first = await issueCreditNote(db, { creatorId: CREATOR, orderId: A, refundKey: "re_1", currency: "ron", shares: [{ orderId: A, cents: 5000 }] })
  const again = await issueCreditNote(db, { creatorId: CREATOR, orderId: A, refundKey: "re_1", currency: "ron", shares: [{ orderId: A, cents: 5000 }] })
  await db.rpc("storelib_invoice_number", { p_order: B, p_creator: CREATOR })
  const second = await issueCreditNote(db, { creatorId: CREATOR, orderId: A, refundKey: "re_2", currency: "ron", shares: [{ orderId: B, cents: 8000 }] })
  check("the invoice is 000001, its refund's credit note 000002, the next invoice 000003, the next refund 000004", invoices.get(A) === 1 && first?.seq === 2 && invoices.get(B) === 3 && second?.seq === 4, { a: invoices.get(A), first: first?.seq, b: invoices.get(B), second: second?.seq })
  check("the same refund seen twice (Orders page, then the webhook) is one note with one number", again?.id === first?.id && notes.length === 2)
  check("written in the store's sequence: 000002", creditNoteNumber(first!.seq) === "000002")
  check("nothing refunded is no note", (await issueCreditNote(db, { creatorId: CREATOR, orderId: A, refundKey: "re_0", currency: "ron", shares: [] })) === null)
  check("without part 329 (no rpc) the refund goes on with no note", (await issueCreditNote(fakeDb({}) as any, { creatorId: CREATOR, orderId: A, refundKey: "re_9", currency: "ron", shares: [{ orderId: A, cents: 1 }] })) === null)
}

console.log("\n2. A refund the ledger recorded without a note gets one when it is asked for\n")
{
  const { db, notes } = numberedDb({
    store_credit_notes: [],
    ledger_events: [
      { event_type: "refund", order_id: A, stripe_refund_id: "re_old", amount_cents: 3000, currency: "ron" },
      { event_type: "refund", order_id: B, stripe_refund_id: "re_old", amount_cents: 2000, currency: "ron" },
      { event_type: "sale", order_id: A, stripe_refund_id: null, amount_cents: 18000, currency: "ron" },
    ],
  })
  const rows = [{ id: B, created_at: "2026-10-01T10:00:01Z", currency: "ron" }, { id: A, created_at: "2026-10-01T10:00:00Z", currency: "ron" }]
  const got = await ensureCreditNotes(db, rows, CREATOR)
  const twice = await ensureCreditNotes(db, rows, CREATOR)
  check("one note for the refund, over both rows it was split across, filed under the purchase's first row", got.length === 1 && got[0].order_id === A && got[0].amount_cents === 5000 && got[0].shares.length === 2, got)
  check("asked again, the same note: nothing new issued", twice.length === 1 && notes.length === 1)
}

console.log("\n3. What it says: each line given back, the tax split by rate, negative\n")
{
  const inv = invoice()
  const rows = [row(A, "2026-10-01T10:00:00Z", 10000, 1597, "TVA 19%"), row(B, "2026-10-01T10:00:01Z", 8000, 1277, "TVA 19%")]
  const cn = buildCreditNote(inv, rows, { seq: 154, issued_at: "2026-10-28T09:00:00Z", refund_key: "re_3Abc", amount_cents: 12000, shares: [{ orderId: A, cents: 4000 }, { orderId: B, cents: 8000 }] })
  check("numbered 000154 and naming invoice 000153", cn.number === "000154" && cn.original.number === "000153" && cn.original.kind === "invoice")
  check("one line per refunded row, negative, the mug's marked partial", cn.lines.length === 2 && cn.lines[0].amountCents === -4000 && cn.lines[0].partial && cn.lines[1].amountCents === -8000 && !cn.lines[1].partial, cn.lines)
  check("the total is exactly what was refunded, negative", cn.totalCents === -12000)
  const t = cn.taxes[0]
  check("the tax inside it by rate: 639 + 1277 of TVA 19%, net the rest, all negative", cn.taxes.length === 1 && t.label === "TVA 19%" && t.taxCents === -(639 + 1277) && t.netCents === -(12000 - 639 - 1277), cn.taxes)
  check("net and tax add up to the total", t.netCents + t.taxCents === cn.totalCents)
  check("the Stripe refund is its reference", cn.refundReference === "re_3Abc")

  const two = buildCreditNote(invoice({ taxIncluded: false }), [row(A, "2026-10-01T10:00:00Z", 11900, 1900, "VAT 19%"), row(B, "2026-10-01T10:00:01Z", 10900, 900, "VAT 9%")], { seq: 9, issued_at: "2026-10-28T09:00:00Z", refund_key: "cash_x", amount_cents: 22800, shares: [{ orderId: A, cents: 11900 }, { orderId: B, cents: 10900 }] })
  check("two rates are two rows of the split", two.taxes.map((x) => `${x.label}:${x.netCents}/${x.taxCents}`).join() === "VAT 19%:-10000/-1900,VAT 9%:-10000/-900", two.taxes)
  check("tax added on top: the lines are net, the subtotal net, the total with the tax", two.subtotalCents === -20000 && two.totalCents === -22800 && two.lines[0].amountCents === -10000)
  check("a cash refund has no Stripe reference to print", two.refundReference === null)

  const single = buildCreditNote(invoice({ lines: [inv.lines[1]], taxCents: 1277, taxLabel: "TVA 19%" }), [row(B, "2026-10-01T10:00:00Z", 8000, 0, null)], { seq: 10, issued_at: "2026-10-28T09:00:00Z", refund_key: "re_s", amount_cents: 8000, shares: [{ orderId: B, cents: 8000 }] })
  check("one product: its tax from the invoice (the payment's own record)", single.taxes[0]?.taxCents === -1277, single.taxes)
}

console.log("\n4. The PDF, in the buyer's language and money\n")
{
  const inv = invoice({ lang: "ro", words: ro })
  const rows = [row(A, "2026-10-01T10:00:00Z", 10000, 1597, "TVA 19%"), row(B, "2026-10-01T10:00:01Z", 8000, 1277, "TVA 19%")]
  const cn = buildCreditNote(inv, rows, { seq: 154, issued_at: "2026-10-28T09:00:00Z", refund_key: "re_3Abc", amount_cents: 12000, shares: [{ orderId: A, cents: 4000 }, { orderId: B, cents: 8000 }] })
  const trace: string[] = []
  const pdf = await renderCreditNotePdf(cn, trace)
  const text = trace.join("\n")
  check("a PDF", pdf.subarray(0, 5).toString() === "%PDF-")
  check("titled and numbered in Romanian", text.includes("Factură de stornare") && text.includes("Numărul facturii de stornare") && text.includes("000154"), trace.slice(0, 8))
  check("names the original invoice", text.includes("Factura inițială") && text.includes("000153") && text.includes("Rambursarea facturii 000153."))
  check("money written the Romanian way, negative with a minus", /−120,00\s*RON|−120,00\s*lei/.test(text), trace.filter((s) => s.includes("120")))
  check("the tax split by rate is printed: rate, net, tax", text.includes("Cota de taxă") && text.includes("Valoare netă") && text.includes("TVA 19%"))
  check("dates on the store's clock, in Romanian", text.includes("28 octombrie 2026"))
  const en: string[] = []
  await renderCreditNotePdf(buildCreditNote(invoice({ currency: "USD" }), rows, { seq: 7, issued_at: "2026-10-28T09:00:00Z", refund_key: "re_e", amount_cents: 4000, shares: [{ orderId: A, cents: 4000 }] }), en)
  check("English without the buyer's words: Credit note, Original invoice, $40.00 negative", en.includes("Credit note") && en.includes("Original invoice") && en.some((s) => s.includes("−$40.00")) && en.includes("Blue · Partial refund"), en.slice(0, 12))
}

console.log("\n5. Every new word is curated, in Romanian at least\n")
{
  const words = ["Credit note", "Credit note {number}", "Credit note number", "Original invoice", "Original receipt", "Refund reference", "{amount} {currency} credited on {date}", "Partial refund", "Total credited", "Tax rate", "Net", "Refund of invoice {number}.", "Refund of receipt {number}."]
  const all = checkoutSentences()
  check("each is a checkout sentence (scripts/i18n/checkout-sentences.mjs ran)", words.every((w) => all.includes(w)), words.filter((w) => !all.includes(w)))
  check("the email's link too", emailSentences().includes("Download the credit note") && emailSentences().includes("Credit note"))
  check("and each has its Romanian", [...words, "Download the credit note"].every((w) => !!ro[w]))
}

console.log("\n6. Linked from the email, the receipt, the order page and the seller's menu\n")
{
  const url = `https://storelib.com${creditNotePath("tok_abcdefghijklmnop", "cccccccc-cccc-4ccc-8ccc-000000000001")}`
  const mail = buyerRefundEmail({ storeName: "Atelier Ana", productTitle: "Ceramic mug", amount: "40.00 lei", orderDate: "Oct 1", refundDate: "Oct 28", reason: "Requested by you", orderRef: "#11111111", contactEmail: "ana@example.com", creditNote: { number: "000154", url } })
  check("the refund email names the credit note and links its PDF", mail.html.includes("000154") && mail.html.includes(url.replace(/&/g, "&amp;")) && mail.text.includes(url), mail.html.length)
  const none = buyerRefundEmail({ storeName: "Atelier Ana", productTitle: "Ceramic mug", amount: "40.00 lei", orderDate: "Oct 1", refundDate: "Oct 28", reason: "Requested by you", orderRef: "#11111111", contactEmail: "ana@example.com" })
  check("without one (before part 329) the email is as it was", !none.html.includes("credit note") && !none.text.includes("credit note"))
  const parcel = refundEmail({ shopName: "Atelier Ana", orderNumber: "#1042", buyerFirstName: "Maria", amountCents: 4000, refundedCents: 4000, totalCents: 18000, currency: "RON", paymentLabel: null, statusUrl: "https://storelib.com/o/x", creditNote: { number: "000154", url } })
  check("the physical order's refund email links it too, in HTML and text", parcel.html.includes(url.replace(/&/g, "&amp;")) && parcel.html.includes("000154") && parcel.text.includes(url))
  check("  and its job reads the checkout's latest note", /const creditNote = await refundCreditNote\(db, co\.id, co\.creator_id\)/.test(read("lib/physical/jobs-server.ts")) && /ensureCreditNotes\(db as never, rows, creatorId\)/.test(read("lib/physical/jobs-server.ts")))
  check("the buyer's link is their receipt token and the note's id", creditNotePath("tok", "id-1") === "/api/checkout/credit-note?token=tok&id=id-1")
  const sync = read("lib/stripe/refund-sync.ts")
  check("the webhook's refund step issues it once per refund, keyed by the refund", /issueCreditNote\(db, \{ creatorId: await creatorOf\(db, rows\[0\]\.product_id\), orderId: rows\[0\]\.id, refundKey: refund\.id/.test(sync) && /emailRefund\(db, touched, refund, currency, note \?/.test(sync))
  const route = read("app/api/stripe/refund/route.ts")
  check("the Orders page refund (card or cash) has it and links it in its email", /creditNoteForRefund\(admin, \{ orderId, creatorId: creator\.id, refundKey: refund\.id/.test(route) && /creditNote,\n\s*\}\)/.test(route))
  check("the receipt page lists each note", /creditNotesForReceipt\(admin, token\)/.test(read("app/(storelib)/receipt/[token]/page.tsx")) && /data-credit-notes/.test(read("app/(storelib)/receipt/[token]/receipt-view.tsx")))
  check("the physical order page too", /creditNotesForReceipt\(db, noteToken\)/.test(read("app/(storelib)/checkout/physical/order/[token]/page.tsx")) && /data-order-credit-notes/.test(read("app/(storelib)/checkout/physical/order/[token]/order-status-view.tsx")))
  check("the seller's order menu downloads it", /Download credit note/.test(read("app/(storelib)/app/orders/order-detail.tsx")) && /creditNote=latest/.test(read("app/(storelib)/app/orders/orders-client.tsx")) && /creditNoteAsked\(searchParams\.get\("creditNote"\)\)/.test(read("app/api/invoice/route.ts")))
  const buyer = read("app/api/checkout/credit-note/route.ts")
  check("the buyer's PDF needs the receipt token, and the note must be that purchase's", /creditNotesForReceipt\(db, token\)/.test(buyer) && /notes\.find\(\(n\) => n\.id === id\)/.test(buyer) && /rateLimit/.test(buyer))
}

console.log("\n7. SQL part 329\n")
{
  const sql = read("supabase/sql/run-now/329_store_credit_notes.sql")
  check("one note per store and refund, one number per store", /unique \(creator_id, refund_key\)/.test(sql) && /unique \(creator_id, seq\)/.test(sql))
  check("numbered from the invoices' counter, under its lock", /update public\.store_invoice_series s set last_seq = s\.last_seq \+ 1/.test(sql) && /for update/.test(sql))
  check("only the store's own order", /join public\.products p on p\.id = o\.product_id where o\.id = p_order and p\.creator_id = p_creator/.test(sql))
  check("server only", /enable row level security/.test(sql) && /revoke all on function public\.storelib_credit_note\(uuid, uuid, text, integer, text, jsonb\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.storelib_credit_note\(uuid, uuid, text, integer, text, jsonb\) to service_role/.test(sql))
  check("checked after", /as p329_store_credit_notes/.test(read("supabase/sql/run-now/99_check_after.sql")) && /329_store_credit_notes\.sql/.test(read("supabase/sql/run-now/README.md")))
  check("and a migration copy", read("supabase/migrations/20271030_store_credit_notes.sql") === sql)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
