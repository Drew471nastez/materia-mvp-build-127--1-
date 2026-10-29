/**
 * ===========================================================================
 *  EVERY DOCUMENT A SALE MAKES, DRAWN FROM FIXTURE ORDERS (round docs-1028)
 * ===========================================================================
 * The receipt and invoice PDF (lib/checkout/invoice.ts), the receipt email
 * (lib/receipts/receipt-mail.ts), the order confirmation email of an order
 * that ships (lib/physical/email-templates.ts) and the packing slip, as a
 * page and as a PDF (lib/physical/packing-slip*.ts), each read for what it
 * says, from five orders:
 *
 *   a download          one product, a code, VAT on top, a Visa
 *   a parcel            two items with an option and an engraving, an
 *                       offer, a code, shipping, VAT inside the prices
 *   a bundle and code   a basket of downloads, a bundle's saving and a code
 *   a market order      a parcel paid in lei, the emails in Romanian
 *   a refund            a basket with one line refunded, then all of it
 *
 * The database is an in-memory stand-in; part 321's numbering is its rpc.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { invoiceForOrder, invoiceNumber, renderInvoicePdf, sequentialNumber, shippedParts, type OrderRow } from "@/lib/checkout/invoice"
import { buildReceiptEmail } from "@/lib/receipts/receipt-mail"
import type { ReceiptEmailModel } from "@/lib/receipts/email"
import { orderConfirmationEmail, type OrderEmailModel } from "@/lib/physical/email-templates"
import { inEmailLanguage } from "@/lib/emails/words"
import { checkoutWordsIn, emailWordsIn } from "@/lib/markets/checkout-words"
import { packingSlipHtml, slipLines, type SlipOrder } from "@/lib/physical/packing-slip"
import { renderPackingSlipPdf } from "@/lib/physical/packing-slip-pdf"
import { formatMessage } from "@/lib/i18n/text"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const USER = "u0000000-0000-4000-8000-000000000001"
const P1 = "p0000000-0000-4000-8000-000000000001"
const P2 = "p0000000-0000-4000-8000-000000000002"
const P3 = "p0000000-0000-4000-8000-000000000003"

/** The store: its name, its business (legal name, address, VAT number), its time zone. */
function store(extra: Record<string, any[]> = {}) {
  return {
    creators: [{ id: CREATOR, user_id: USER, display_name: "Ana Pop", support_email: "hello@atelier.test", username: "atelier" }],
    profiles: [{ id: USER, email: "ana@owner.test", display_name: "Ana Pop", username: "atelier", timezone: "Europe/Bucharest" }],
    store_settings: [{ creator_id: CREATOR, store_name: "Atelier Ana", legal: { company: "Atelier Ana SRL", line1: "Strada Lipscani 12", city: "București", postalCode: "030031", country: "RO", taxId: "RO12345678" } }],
    products: [
      { id: P1, title: "Lightroom presets", creator_id: CREATOR },
      { id: P2, title: "Leather wallet", creator_id: CREATOR },
      { id: P3, title: "Key ring", creator_id: CREATOR },
    ],
    ...extra,
  }
}

/** Part 321 as the database answers it: the store's next number, once per order. */
function numbering(db: ReturnType<typeof fakeDb>, start = 41) {
  const given = new Map<string, number>()
  let last = start
  ;(db as any).rpc = async (fn: string, args: { p_order: string; p_creator: string }) => {
    if (fn !== "storelib_invoice_number") return { data: null, error: { message: "no such function" } }
    if (!given.has(args.p_order)) given.set(args.p_order, ++last)
    return { data: { seq: given.get(args.p_order), issued_at: "2026-10-27T22:31:00Z" }, error: null }
  }
  return given
}

async function drawn(inv: NonNullable<Awaited<ReturnType<typeof invoiceForOrder>>>): Promise<{ text: string; pdf: Buffer }> {
  const trace: string[] = []
  const pdf = await renderInvoicePdf(inv, trace)
  return { text: trace.join("\n"), pdf }
}

const tt = (source: string, vars?: Record<string, string | number>) => formatMessage(source, vars ?? {}, "en")

async function main() {
  /* ── 1. A download: one product, a code, VAT on top, paid by Visa ─────── */
  console.log("\nA download with a code and VAT on top")
  {
    const ORDER = "a0000000-0000-4000-8000-000000000001"
    const row = {
      id: ORDER,
      created_at: "2026-10-27T22:30:00Z",
      status: "completed",
      amount_cents: 2142,
      tip_cents: 0,
      currency: "eur",
      buyer_email: "ion@buyer.test",
      buyer_first_name: "Ion",
      buyer_last_name: "Popescu",
      payment_method: "card",
      card_brand: "visa",
      card_last4: "4242",
      product_id: P1,
      variant_id: null,
      variant_name: "Full pack",
      stripe_payment_intent_id: "pi_doc1",
      stripe_session_id: null,
      receipt_token: "tok_digital_000000001",
    }
    const db = fakeDb(store({ orders: [row] }))
    numbering(db)
    const meta = { base_price_cents: "2000", discount_cents: "200", coupon_code: "SPRING10", tax_cents: "342", tax_included: "false", tax_rate_bps: "1900", tax_label: "VAT 19%" }
    const inv = await invoiceForOrder(db, { ...row, product: { title: "Lightroom presets", creator_id: CREATOR } } as OrderRow, { metadata: meta, business: null })
    check("an invoice is drawn for the paid order", !!inv)
    if (inv) {
      const { text } = await drawn(inv)
      check("its number is the store's next in sequence (part 321), six digits", inv.number === "000042" && text.includes("Receipt number\n000042"), inv.number)
      check("the order date is the store's day: 22:30 UTC on the 27th is October 28 in Bucharest", text.includes("Order date\nOctober 28, 2026") && text.includes("Date of issue\nOctober 28, 2026"), text.split("\n").slice(0, 14))
      check("seller: legal name, trading name, address, VAT number, contact", ["Atelier Ana SRL", "Trading as Atelier Ana", "Strada Lipscani 12", "RO12345678", "hello@atelier.test"].every((s) => text.includes(s)))
      check("buyer: name and email", text.includes("Ion Popescu") && text.includes("ion@buyer.test"))
      check("the line: title, option, quantity, unit price and amount before the code", /Lightroom presets\nFull pack\n1\n€20\.00\n€20\.00/.test(text), text)
      check("the code's row, named by the code, as at the checkout", text.includes("Discount (SPRING10)\n−€2.00"))
      check("VAT 19% added on top, then the total in euro", text.includes("VAT 19%\n€3.42") && text.includes("Total\n€21.42") && text.includes("€21.42 EUR"))
      check("paid with Visa ending 4242, its payment reference", text.includes("Visa ending 4242") && text.includes("pi_doc1"))
      check("the rows add up: 20.00 − 2.00 + 3.42 = 21.42", inv.subtotalCents - inv.discountCents + (inv.taxCents ?? 0) === inv.totalCents)
    }
    const again = await invoiceForOrder(db, { ...row, product: { title: "Lightroom presets", creator_id: CREATOR } } as OrderRow, { metadata: meta, business: null })
    check("drawn again, the same number", again?.number === "000042", again?.number)
    const before = fakeDb(store({ orders: [row] }))
    const old = await invoiceForOrder(before, { ...row, product: { title: "Lightroom presets", creator_id: CREATOR } } as OrderRow, { metadata: meta, business: null })
    check("before part 321 runs (no number given), the number it always had", old?.number === invoiceNumber(ORDER, row.created_at), old?.number)
  }

  /* ── 2. A parcel: options, an engraving, an offer, a code, shipping ───── */
  console.log("\nA parcel with options, personalization, an offer, a code and shipping")
  const CHECKOUT = "b0000000-0000-4000-8000-0000000000c1"
  const W = "b0000000-0000-4000-8000-000000000001"
  const K = "b0000000-0000-4000-8000-000000000002"
  /* Wallet 2 × 45.00, the bundle took 9.00 and the code 4.50; key ring 1 × 12.00, the code 0.60. Shipping 7.00 shared out; VAT 19% inside the prices. */
  const parcelRows = [
    {
      id: W, created_at: "2026-10-20T09:00:00Z", status: "completed", amount_cents: 7650 + 520, tip_cents: 0, currency: "eur", buyer_email: "ion@buyer.test", buyer_first_name: "Ion", buyer_last_name: "Popescu",
      payment_method: "card", card_brand: "mastercard", card_last4: "5555", product_id: P2, variant_id: "v-brown", variant_name: "Brown", stripe_payment_intent_id: "pi_parcel", stripe_session_id: "cs_parcel", receipt_token: "tok_parcel_00000001",
      checkout_id: CHECKOUT, quantity: 2, unit_price_cents: 4500, shipping_cents: 520,
      product_snapshot: { title: "Leather wallet", variant_name: "Brown", sku: "WAL-BRN", unit_cents: 4500, discount_cents: 1350, tax_cents: 1305, tax_included: true, tax_label: "VAT 19%", properties: { Engraving: "I.P.", _sl_group: "x" }, offers: [{ title: "Bundle: wallet + ring", saved_cents: 900 }] },
    },
    {
      id: K, created_at: "2026-10-20T09:00:00Z", status: "completed", amount_cents: 1140 + 180, tip_cents: 0, currency: "eur", buyer_email: "ion@buyer.test", buyer_first_name: "Ion", buyer_last_name: "Popescu",
      payment_method: "card", card_brand: "mastercard", card_last4: "5555", product_id: P3, variant_id: null, variant_name: null, stripe_payment_intent_id: "pi_parcel", stripe_session_id: "cs_parcel", receipt_token: "tok_parcel_00000002",
      checkout_id: CHECKOUT, quantity: 1, unit_price_cents: 1200, shipping_cents: 180,
      product_snapshot: { title: "Key ring", variant_name: null, sku: null, unit_cents: 1200, discount_cents: 60, tax_cents: 211, tax_included: true, tax_label: "VAT 19%" },
    },
  ]
  const parcelCheckout = {
    id: CHECKOUT, creator_id: CREATOR, currency: "EUR", items_subtotal_cents: 10200, discount_cents: 1410, shipping_cents: 700, shipping_discount_cents: 0, tax_cents: 1516, total_cents: 9490, refunded_cents: 0,
    coupon_code: "SPRING10", delivery_method: "ship",
    shipping_rate: { name: "Courier, 2 to 3 days", tax_included: true, tax_label: "VAT 19%" },
    shipping_address: { name: "Ion Popescu", line1: "Bulevardul Unirii 5", line2: "Ap. 3", city: "Cluj-Napoca", region: "CJ", postalCode: "400000", country: "RO", phone: "+40 700 000 000" },
  }
  {
    const db = fakeDb(store({ orders: parcelRows, commerce_checkouts: [parcelCheckout] }))
    numbering(db, 99)
    const rows = parcelRows.map((r) => ({ ...r, product: { title: r.product_snapshot.title, creator_id: CREATOR } })) as unknown as OrderRow[]
    const inv = await invoiceForOrder(db, rows[0], { basket: rows, business: null })
    check("the parcel's invoice is drawn from its checkout", !!inv && inv.shippingCents === 700, inv?.shippingCents)
    if (inv) {
      const { text } = await drawn(inv)
      check("each line at its unit price and quantity: 2 × €45.00 = €90.00", /Leather wallet\nBrown · Engraving: I\.P\.\n2\n€45\.00\n€90\.00/.test(text), text)
      check("the buyer's engraving under the line, a theme's own note (_sl_group) left out", text.includes("Engraving: I.P.") && !text.includes("_sl_group"))
      check("the bundle by its name, then the code's part named by the code", text.includes("Bundle: wallet + ring\n−€9.00") && text.includes("Discount (SPRING10)\n−€5.10"))
      check("shipping its own row, and how it was sent", text.includes("Shipping\n€7.00") && text.includes("Shipping method\nCourier, 2 to 3 days"))
      check("VAT inside the prices said under the total, never added", text.includes("Total\n€94.90") && /Including VAT 19%\n€15\.16/.test(text) && !/\nVAT 19%\n€15\.16/.test(text))
      check("shipped to: the parcel's name and address, no phone", ["Shipped to", "Ion Popescu", "Bulevardul Unirii 5", "Cluj-Napoca, CJ, 400000", "Romania"].every((s) => text.includes(s)) && !text.includes("+40 700"))
      check("the rows add up to what was charged", inv.subtotalCents - inv.discountCents + (inv.shippingCents ?? 0) === inv.totalCents, [inv.subtotalCents, inv.discountCents, inv.shippingCents, inv.totalCents])
      check("one number for the whole parcel, the first line's", inv.number === "000100", inv.number)
    }
    check("figures that do not add up are listed as charged, never invented", shippedParts(rows, { ...parcelCheckout, shipping_cents: 900 }) === null)

    /* The confirmation email of the same order. */
    const lines = parcelRows.map((r) => ({ title: r.product_snapshot.title, variantName: r.product_snapshot.variant_name, quantity: r.quantity, cents: r.product_snapshot.unit_cents * r.quantity - r.product_snapshot.discount_cents, imageUrl: null, sku: r.product_snapshot.sku, ...(r.product_snapshot.properties ? { properties: [["Engraving", "I.P."]] as [string, string][] } : {}) }))
    const model: OrderEmailModel = {
      shopName: "Atelier Ana", orderNumber: "#B0000000", buyerFirstName: "Ion", lines,
      totals: { subtotal: 10200, discount: 1410, shipping: 700, shippingDiscount: 0, tax: 1516, taxIncluded: true, taxLabel: "VAT 19%", total: 9490, currency: "EUR", savings: [{ label: "Bundle: wallet + ring", cents: 900 }], couponCode: "SPRING10" },
      address: parcelCheckout.shipping_address as never, deliveryName: "Courier, 2 to 3 days", deliveryEstimate: "Arrives in 2 to 3 business days", statusUrl: "https://atelier.test/orders/x", hasDownloads: false,
      paymentLabel: "Mastercard ending 5555", supportEmail: "hello@atelier.test", orderDate: "20 October 2026",
    }
    const mail = orderConfirmationEmail(model)
    check("confirmation: each item with its option, engraving and quantity", mail.text.includes("2 x Leather wallet (Brown), Engraving: I.P.: €76.50") && mail.html.includes("Brown · Engraving: I.P. · Qty 2"))
    check("confirmation: the bundle by name, the code's row named by the code, as the checkout", mail.text.includes("Bundle: wallet + ring: -€9.00") && mail.text.includes("Discount (SPRING10): -€5.10") && mail.html.includes("Discount (SPRING10)"))
    check("confirmation: shipping, the tax included, the total", mail.text.includes("Shipping: €7.00") && mail.text.includes("Including VAT 19%: €15.16") && mail.text.includes("Total: €94.90"))
    check("confirmation: where it goes, how, and how it was paid", ["Bulevardul Unirii 5", "Courier, 2 to 3 days", "Payment method: Mastercard ending 5555"].every((s) => mail.text.includes(s)))

    /* The packing slip of the same order. */
    const slipOrder: SlipOrder = {
      id: CHECKOUT, createdAt: "2026-10-20T09:00:00Z", paidAt: "2026-10-20T09:00:00Z", address: parcelCheckout.shipping_address, delivery: { name: "Courier, 2 to 3 days" }, deliveryMethod: "ship", pickup: null,
      buyerName: "Ion Popescu", buyerNote: "Leave it with the neighbour", cartAttributes: { "Gift message": "Happy birthday, Dan!" },
      lines: parcelRows.map((r) => ({ orderId: r.id, title: r.product_snapshot.title, variantName: r.product_snapshot.variant_name, sku: r.product_snapshot.sku, imageUrl: null, quantity: r.quantity, fulfilled: 0, requiresShipping: true, locationId: null, properties: (r.product_snapshot as { properties?: Record<string, string> }).properties ?? null, unitCents: r.product_snapshot.unit_cents, offers: r.id === W ? [{ title: "Bundle: wallet + ring", savedCents: 900 }] : null })),
      shipments: [],
    }
    const shop = { name: "Atelier Ana", logoUrl: "https://cdn.atelier.test/logo.png", returnAddress: ["Atelier Ana", "Strada Lipscani 12", "București, 030031", "Romania"] }
    const slip = packingSlipHtml(slipOrder, slipLines(slipOrder), shop, { tt, lang: "en", timeZone: "Europe/Bucharest", back: "/app/orders" })
    check("slip: the order number the buyer's emails use, and the date", slip.includes("Order #B0000000") && slip.includes("October 20, 2026"))
    check("slip: the store's name and logo", slip.includes("Atelier Ana") && slip.includes('src="https://cdn.atelier.test/logo.png"'))
    check("slip: ship to, and how", slip.includes("Bulevardul Unirii 5") && slip.includes("Courier, 2 to 3 days"))
    check("slip: each item with its option, SKU, engraving and quantity", slip.includes("Brown · SKU WAL-BRN") && slip.includes("Engraving: I.P.") && /<td class="qty">2<\/td>/.test(slip))
    check("slip: a theme's own note is not the buyer's", !slip.includes("_sl_group"), null)
    check("slip: the gift message and the buyer's note", slip.includes("Gift message:</span> Happy birthday, Dan!") && slip.includes("Leave it with the neighbour"))
    check("slip: where a return goes", slip.includes("data-slip-return") && slip.includes("Return address") && slip.includes("Strada Lipscani 12"))
    check("slip: no prices unless the store asks", !/€/.test(slip))
    const priced = packingSlipHtml(slipOrder, slipLines(slipOrder), shop, { tt, lang: "en", timeZone: "Europe/Bucharest", back: "/app/orders", prices: { currency: "EUR", totals: { currency: "EUR", itemsSubtotalCents: 10200, discountCents: 1410, shippingCents: 700, shippingDiscountCents: 0, taxCents: 1516, taxIncluded: true, taxLabel: "VAT 19%", totalCents: 9490, refundedCents: 0, couponCode: "SPRING10" } } })
    check("slip with prices: the bundle by name, the code's row by the code, as the checkout", priced.includes("<span>Bundle: wallet + ring</span><span>−€9.00</span>") && priced.includes("<span>Discount (SPRING10)</span><span>−€5.10</span>"))
    check("slip with prices: shipping, the tax included and the total", priced.includes("<span>Shipping</span><span>€7.00</span>") && priced.includes("VAT 19% included") && priced.includes("<span>Total</span><span>€94.90</span>"))
    const trace: string[] = []
    await renderPackingSlipPdf(slipOrder, slipLines(slipOrder), shop, { tt, lang: "en", timeZone: "Europe/Bucharest" }, trace)
    const pdfText = trace.join("\n")
    check("slip PDF: the same items, engraving, gift message and return address", ["Leather wallet", "Brown · SKU WAL-BRN", "Engraving: I.P.", "Gift message: Happy birthday, Dan!", "RETURN ADDRESS", "Strada Lipscani 12"].every((s) => pdfText.includes(s)), trace)
  }

  /* ── 3. A basket of downloads: a bundle's saving and a code ───────────── */
  console.log("\nA basket of downloads with a bundle and a code")
  {
    const A = "d0000000-0000-4000-8000-000000000001"
    const B = "d0000000-0000-4000-8000-000000000002"
    const base = { created_at: "2026-10-21T12:00:00Z", status: "completed", tip_cents: 0, currency: "usd", buyer_email: "mia@buyer.test", buyer_first_name: "Mia", buyer_last_name: "Lee", payment_method: "card", card_brand: "amex", card_last4: "0005", stripe_payment_intent_id: "pi_basket", stripe_session_id: "cs_basket" }
    /* Presets 30.00 − bundle 6.00 − code 2.40 = 21.60; brushes 20.00 − bundle 4.00 − code 1.60 = 14.40. */
    const rows = [
      { ...base, id: A, product_id: P1, variant_id: null, variant_name: null, amount_cents: 2160, product_snapshot: { offers: [{ title: "Creator bundle", saved_cents: 600 }] }, product: { title: "Lightroom presets", creator_id: CREATOR } },
      { ...base, id: B, product_id: P3, variant_id: null, variant_name: null, amount_cents: 1440, product_snapshot: { offers: [{ title: "Creator bundle", saved_cents: 400 }] }, product: { title: "Procreate brushes", creator_id: CREATOR } },
    ] as unknown as OrderRow[]
    const items = [
      { productId: P1, variantId: null, quantity: 1, priceCents: 3000, discountCents: 840 },
      { productId: P3, variantId: null, quantity: 1, priceCents: 2000, discountCents: 560 },
    ]
    const db = fakeDb(store({ orders: rows as any[] }))
    numbering(db, 7)
    const inv = await invoiceForOrder(db, rows[0], { basket: rows, items, business: null, discountCode: "WELCOME" })
    const { text } = inv ? await drawn(inv) : { text: "" }
    check("both lines at their price before any saving", /Lightroom presets\n1\n\$30\.00\n\$30\.00/.test(text) && /Procreate brushes\n1\n\$20\.00\n\$20\.00/.test(text), text)
    check("the bundle as one row by its name, the code's part named by the code", text.includes("Creator bundle\n−$10.00") && text.includes("Discount (WELCOME)\n−$4.00"))
    check("paid with American Express, in US dollars", text.includes("American Express ending 0005") && text.includes("Total\n$36.00") && text.includes("$36.00 USD"))

    /* The receipt email of the same payment, with the rows the page shows. */
    const model: ReceiptEmailModel = {
      firstName: "Mia", sellerName: "Atelier Ana", orderNumber: "D0000000", dateText: "October 21, 2026", dateIso: "2026-10-21T23:30:00Z", timeZone: "Europe/Bucharest",
      items: [
        { title: "Lightroom presets", variantName: "Creator bundle −$6.00", amountText: "$30.00", note: null },
        { title: "Procreate brushes", variantName: "Creator bundle −$4.00", amountText: "$20.00", note: null },
      ],
      subtotalText: "$50.00", savings: [{ label: "Creator bundle", text: "$10.00" }], discountText: "$4.00", discountCode: "WELCOME",
      payment: { method: "card", brand: "amex", last4: "0005" },
      tipText: null, totalText: "$36.00", refundedText: null, link: "https://storelib.com/receipt/tok", buttonLabel: "Download your files", supportEmail: "hello@atelier.test",
    }
    const mail = buildReceiptEmail(model, null)
    check("receipt email: subtotal, the bundle by name, the code by name, the total", ["Subtotal: $50.00", "Creator bundle: −$10.00", "Discount (WELCOME): −$4.00", "Total: $36.00"].every((s) => mail.text.includes(s)), mail.text)
    check("receipt email: the same rows in its HTML", mail.html.includes("Creator bundle") && mail.html.includes("Discount (WELCOME)") && mail.html.includes("−$4.00"))
    check("receipt email: how it was paid", mail.text.includes("Payment method: American Express ending 0005") && mail.html.includes("American Express ending 0005"))
    check("receipt email: the store's day, 23:30 UTC is October 22 in Bucharest", mail.text.includes("October 22, 2026"), mail.text.split("\n").slice(0, 5))
  }

  /* ── 4. A market order paid in lei, its emails in Romanian ────────────── */
  console.log("\nA market order in lei, in Romanian")
  {
    const ro = emailWordsIn("ro", null)
    const model: OrderEmailModel = {
      shopName: "Atelier Ana", orderNumber: "#E0000000", buyerFirstName: "Ioana",
      lines: [{ title: "Leather wallet", variantName: "Negru", quantity: 1, cents: 19900, imageUrl: null, properties: [["Gravură", "I.M."]] }],
      totals: { subtotal: 22900, discount: 3000, shipping: 1500, shippingDiscount: 0, tax: 3416, taxIncluded: true, taxLabel: "TVA 19%", total: 21400, currency: "RON", couponCode: "TOAMNA" },
      address: { name: "Ioana M", line1: "Str. Mare 1", city: "Iași", postalCode: "700000", country: "RO" } as never, deliveryName: "Fan Courier", deliveryEstimate: null, statusUrl: "https://atelier.test/o", hasDownloads: false, paymentLabel: "Visa terminat în 4242",
    }
    const mail = inEmailLanguage("ro", ro, () => orderConfirmationEmail(model))
    check("the money in lei, written the Romanian way (214,00 lei), as the order page writes it", /Total: 214,00\s?lei/.test(mail.text) && !/214\.00/.test(mail.text), mail.text.match(/Total[^\n]*/)?.[0])
    const english = orderConfirmationEmail(model)
    check("  and in English as it always read (214.00 lei)", /Total: 214\.00\s?lei/.test(english.text), english.text.match(/Total[^\n]*/)?.[0])
    check("the code's row in Romanian, named by the code", mail.text.includes("Reducere (TOAMNA)"), mail.text.match(/[^\n]*TOAMNA[^\n]*/)?.[0])
    check("the subject in Romanian", mail.subject === "Comanda #E0000000 a fost confirmată", mail.subject)
    check("the buyer's engraving kept as they wrote it", mail.text.includes("Gravură: I.M."))
    const receipt = buildReceiptEmail(
      { firstName: "Ioana", sellerName: "Atelier Ana", orderNumber: "E1", dateText: "", dateIso: "2026-10-27T22:30:00Z", timeZone: "Europe/Bucharest", items: [{ title: "Presets", variantName: null, amountText: "100,00 lei", note: null }], subtotalText: "100,00 lei", discountText: "10,00 lei", discountCode: "TOAMNA", tipText: null, totalText: "90,00 lei", refundedText: null, link: "https://x.test/r", buttonLabel: "View your receipt", supportEmail: "a@b.test", payment: { method: "card", brand: "visa", last4: "4242" } },
      { lang: "ro", words: ro, own: false },
    )
    check("receipt email in Romanian: the code's row and the card", receipt.text.includes("Reducere (TOAMNA): −10,00 lei") && receipt.text.includes("Visa terminat în 4242"), receipt.text)
    check("receipt email in Romanian: the store's day in Romanian", /28 octombrie 2026/.test(receipt.text), receipt.text.split("\n").slice(0, 5))

    const ORDER = "e0000000-0000-4000-8000-000000000001"
    const row = { id: ORDER, created_at: "2026-10-27T10:00:00Z", status: "completed", amount_cents: 9000, tip_cents: 0, currency: "ron", buyer_email: "ioana@buyer.test", buyer_first_name: "Ioana", buyer_last_name: "M", payment_method: "card", card_brand: "visa", card_last4: "4242", product_id: P1, variant_id: null, variant_name: null, stripe_payment_intent_id: "pi_ron", stripe_session_id: null, product: { title: "Presets", creator_id: CREATOR } }
    const inv = await invoiceForOrder(fakeDb(store({ orders: [row] })), row as unknown as OrderRow, { metadata: { base_price_cents: "10000", discount_cents: "1000", coupon_code: "TOAMNA" }, business: { company: "Client SRL", taxId: "RO87654321", line1: "Str. Mică 2", city: "Iași", postalCode: "700001", country: "RO" } as never })
    const { text } = inv ? await drawn(inv) : { text: "" }
    check("invoice in lei: the currency charged, never the store's", inv?.currency === "RON" && text.includes("lei") && text.includes("RON"), text.match(/[^\n]*RON[^\n]*/)?.[0])
    check("a company billed: called Invoice, with its VAT number and address", text.startsWith("Invoice") && text.includes("Client SRL") && text.includes("RO87654321") && text.includes("Str. Mică 2"))

    /* The same order bought in Romanian: the PDF in the order's language (lib/markets/buyer-language.ts), through the checkout's words. */
    const roInv = await invoiceForOrder(fakeDb(store({ orders: [row] })), row as unknown as OrderRow, { metadata: { base_price_cents: "10000", discount_cents: "1000", coupon_code: "TOAMNA" }, business: { company: "Client SRL", taxId: "RO87654321", line1: "Str. Mică 2", city: "Iași", postalCode: "700001", country: "RO" } as never, language: { lang: "ro", words: checkoutWordsIn("ro", null) } })
    const r = roInv ? await drawn(roInv) : { text: "" }
    check("PDF in Romanian: Factură, its number, issue date and order date", r.text.startsWith("Factură") && ["Numărul facturii", "Data emiterii", "Data comenzii", "Facturat către", "Vândut de", "Descriere", "Preț unitar", "Sumă plătită"].every((w) => r.text.includes(w)), r.text.split("\n").slice(0, 20))
    check("  the code's row and the card in Romanian", r.text.includes("Reducere (TOAMNA)") && r.text.includes("Visa terminat în 4242"))
    check("  money written the Romanian way: 100,00 lei, 90,00 lei", r.text.includes("100,00\u00a0lei") && r.text.includes("90,00\u00a0lei") && !/90\.00/.test(r.text), r.text.match(/[^\n]*lei[^\n]*/g))
    check("  the date in Romanian on the store's clock", r.text.includes("27 octombrie 2026"))
    check("  the small print in Romanian", r.text.includes("Factură pentru o plată finalizată.") && r.text.includes("Sumele sunt în RON."))
    check("English when no language is given, as it always read", !text.includes("Factură") && text.includes("Invoice number"))
  }

  /* ── 5. Refunds: one line of a basket, then all of it ─────────────────── */
  console.log("\nRefunded, in part and in full")
  {
    const A = "f0000000-0000-4000-8000-000000000001"
    const B = "f0000000-0000-4000-8000-000000000002"
    const base = { created_at: "2026-10-22T12:00:00Z", tip_cents: 0, currency: "usd", buyer_email: "mia@buyer.test", buyer_first_name: "Mia", buyer_last_name: "Lee", payment_method: "card", card_brand: "visa", card_last4: "4242", stripe_payment_intent_id: "pi_ref", stripe_session_id: "cs_ref", variant_id: null, variant_name: null }
    const partly = [
      { ...base, id: A, status: "refunded", refund_amount_cents: 1000, amount_cents: 1000, product_id: P1, product: { title: "Lightroom presets", creator_id: CREATOR } },
      { ...base, id: B, status: "completed", amount_cents: 2000, product_id: P3, product: { title: "Procreate brushes", creator_id: CREATOR } },
    ] as unknown as OrderRow[]
    const one = await invoiceForOrder(fakeDb(store({ orders: partly as any[] })), partly[0], { basket: partly, items: [], business: null })
    const p = one ? await drawn(one) : { text: "" }
    check("one line refunded: Partially refunded, the refund its own row", one?.status === "partially_refunded" && p.text.includes("Partially refunded") && p.text.includes("Refunded\n−$10.00 USD"), one?.status)
    const all = partly.map((r) => ({ ...r, status: "refunded", refund_amount_cents: r.amount_cents })) as unknown as OrderRow[]
    const whole = await invoiceForOrder(fakeDb(store({ orders: all as any[] })), all[0], { basket: all, items: [], business: null })
    const w = whole ? await drawn(whole) : { text: "" }
    check("all of it refunded: Refunded, the whole amount back", whole?.status === "refunded" && w.text.includes("$30.00 USD refunded") && w.text.includes("Refunded\n−$30.00 USD"), whole?.status)
    /* A parcel refunded in part on its checkout (one item back), the rows still completed. */
    const rows = parcelRows.map((r) => ({ ...r, product: { title: r.product_snapshot.title, creator_id: CREATOR } })) as unknown as OrderRow[]
    const parcel = await invoiceForOrder(fakeDb(store({ orders: parcelRows, commerce_checkouts: [{ ...parcelCheckout, refunded_cents: 1320 }] })), rows[0], { basket: rows, business: null })
    check("a parcel refunded in part on its checkout reads Partially refunded with the amount", parcel?.status === "partially_refunded" && parcel.refundedCents === 1320, [parcel?.status, parcel?.refundedCents])
    const receipt = buildReceiptEmail({ firstName: "Mia", sellerName: "Atelier Ana", orderNumber: "F1", dateText: "October 22, 2026", items: [{ title: "Lightroom presets", variantName: null, amountText: "$10.00", note: "Refunded" }], subtotalText: null, tipText: null, totalText: "$30.00", refundedText: "$10.00", link: "https://x.test/r", buttonLabel: "View your receipt", supportEmail: "a@b.test" }, null)
    check("receipt email: the refunded line says so, and the refund is its own row", receipt.text.includes("Lightroom presets: $10.00 (Refunded)") && receipt.text.includes("Refunded: $10.00"))
  }

  console.log("\nThe store's logo on the PDF")
  {
    const ORDER = "e0000000-0000-4000-8000-0000000000aa"
    const row = { id: ORDER, created_at: "2026-10-27T10:00:00Z", status: "completed", amount_cents: 1000, tip_cents: 0, currency: "usd", buyer_email: "a@b.test", buyer_first_name: "A", buyer_last_name: "B", payment_method: "card", card_brand: "visa", card_last4: "4242", product_id: P1, variant_id: null, variant_name: null, stripe_payment_intent_id: "pi_logo", stripe_session_id: null, product: { title: "Presets", creator_id: CREATOR } }
    const withLogo = store({ orders: [row] })
    withLogo.store_settings[0] = { ...withLogo.store_settings[0], logo_url: "https://xyz.supabase.co/storage/v1/object/public/avatars/logo.png" } as never
    const inv = await invoiceForOrder(fakeDb(withLogo), row as unknown as OrderRow, { metadata: {}, business: null, language: null })
    check("the store's logo is the one its receipt carries", !!inv?.seller.logoUrl && /logo\.png/.test(inv.seller.logoUrl), inv?.seller.logoUrl)
    const png = readFileSync(join(process.cwd(), "app/icon.png"))
    const asked: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (u: URL | string) => {
      asked.push(String(u))
      return new Response(new Uint8Array(png), { status: 200, headers: { "Content-Type": "image/png" } })
    }) as typeof fetch
    const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length
    const drawnWith = inv ? await drawn(inv) : null
    check("  drawn on the PDF, fetched as a PNG at its size", !!drawnWith && images(drawnWith.pdf) >= 1 && asked.length === 1, asked)
    globalThis.fetch = (async () => new Response("<svg/>", { status: 200 })) as typeof fetch
    const notPng = inv ? await drawn(inv) : null
    check("  anything but a PNG or JPEG: the PDF without it", !!notPng && images(notPng.pdf) === 0)
    globalThis.fetch = realFetch
    const none = inv ? await drawn({ ...inv, seller: { ...inv.seller, logoUrl: null } }) : null
    check("  no logo: none drawn, nothing fetched", !!none && images(none.pdf) === 0)
  }

  console.log("\nWhere the numbers come from")
  {
    const sql = read("supabase/sql/run-now/321_store_invoice_numbers.sql")
    check("part 321: one number per order, unique per store", /order_id uuid primary key/.test(sql) && /unique \(creator_id, seq\)/.test(sql))
    check("  given under a lock on the store's row, and the same one after", /for update/.test(sql) && /if v_seq is not null then return/.test(sql))
    check("  an order from before the part keeps its old number", /v_created < v_start then return null/.test(sql))
    check("  for the server only", /revoke all on function public\.storelib_invoice_number\(uuid, uuid\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.storelib_invoice_number\(uuid, uuid\) to service_role/.test(sql))
    check("  its copy in migrations is byte for byte", read("supabase/migrations/20271028_store_invoice_numbers.sql") === sql)
    check("sequentialNumber pads to six", sequentialNumber(7) === "000007" && sequentialNumber(1234567) === "1234567")
    const route = read("app/api/invoice/route.ts")
    check("the seller's copy of a paid order is the buyer's document, same number", /invoiceForOrder\(admin, lines\[0\]/.test(route) && /renderInvoicePdf\(\{ \.\.\.shared/.test(route))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
