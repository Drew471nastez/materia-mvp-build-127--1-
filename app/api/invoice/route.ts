import { NextResponse } from "next/server"
import { storeIdFor } from "@/lib/team/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ownedOrderLines, type OwnedLine } from "@/lib/orders/owned"
import { signOrderLink, verifyOrderLink } from "@/lib/orders/signed-link"
import { isTimeZone } from "@/lib/orders/time-zone"
import { invoiceFilename, invoiceForOrder, invoiceNumber, renderInvoicePdf, type OrderRow } from "@/lib/checkout/invoice"
import { addressLines, businessFromFields, businessFromMetadata, taxIdFor, type BusinessDetails } from "@/lib/checkout/business"
import { countryName } from "@/lib/checkout/countries"
import { stripe } from "@/lib/stripe"
import { STORELIB_LOGO_PNG, STORELIB_ORIGIN } from "@/lib/brand/logo"
import { formatMinor } from "@/lib/markets/money"
import { creditNoteFilename, creditNoteFor, ensureCreditNotes, renderCreditNotePdf } from "@/lib/checkout/credit-note"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  AN ORDER'S INVOICE, AS A PDF
 * ===========================================================================
 * GET  ?orderId=<id>&tz=<zone>   signed in: the creator's own order only.
 * GET  ?t=<signed link>          the phone app's system browser sheet, which
 *                                has no session (lib/platform/save-file.ts).
 *                                The link names the creator and the order,
 *                                and ownership is checked again here.
 * POST { orderId, disposition, timeZone }
 *                                signed in: answers with that link.
 *
 * ONE INVOICE PER ORDER. A basket is one payment and one order on the
 * Orders page, so its invoice lists every product in it, rather than a PDF
 * per product that each claim to be the whole sale.
 *
 * THE BUYER'S OWN DOCUMENT. A paid order is drawn by lib/checkout/invoice.ts,
 * the same function as the PDF the buyer was emailed and downloads from the
 * receipt: one number in the store's sequence, the store's legal details,
 * each line with its quantity, the offers, the code, shipping and the tax by
 * its name. Only an order that is not paid (pending, failed) is drawn here
 * by the plainer document below, which says so.
 *
 * It is the buyer's invoice: what they bought, what they paid, what came
 * back. What Storelib kept and what the creator receives are on the order's
 * page, not on a document the creator may forward to a customer.
 */

type Disposition = "inline" | "attachment"

/** `creditNote`: "latest", or one note's id. */
function creditNoteAsked(raw: unknown): string | null {
  if (raw === "latest") return "latest"
  return typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null
}

/* The store's, for its owner or a team member whose role has orders (lib/team). */
/* Round rel2-auth: a refusal other than "signed out" is handed back as it is (503 Try again, 403 no Orders), never "Sign in again". */
async function signedInCreator(): Promise<string | NextResponse | null> {
  const store = await storeIdFor("orders")
  if (store.ok) return store.creatorId
  return store.status === 401 ? null : NextResponse.json({ error: store.error, ...(store.status === 503 ? { retry: true } : {}) }, { status: store.status, headers: store.status === 503 ? { "Cache-Control": "no-store", "Retry-After": "2" } : undefined })
}

export async function POST(request: Request) {
  const creatorId = await signedInCreator()
  if (creatorId instanceof NextResponse) return creatorId
  if (!creatorId) return NextResponse.json({ error: "Sign in again to download the invoice." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const admin = createAdminClient()
  const lines = await ownedOrderLines(admin, creatorId, body?.orderId)
  if (!lines) return NextResponse.json({ error: "This order was not found." }, { status: 404 })

  const disposition: Disposition = body?.disposition === "inline" ? "inline" : "attachment"
  const zone = isTimeZone(body?.timeZone) ? body.timeZone : "UTC"
  const creditNote = creditNoteAsked(body?.creditNote)
  const token = signOrderLink({ k: "invoice", c: creatorId, o: lines[0].id, z: zone, d: disposition, ...(creditNote ? { cn: creditNote } : {}) })
  if (!token) return NextResponse.json({ error: "Invoices are not available right now." }, { status: 503 })

  const origin = new URL(request.url).origin
  return NextResponse.json({ url: `${origin}/api/invoice?t=${encodeURIComponent(token)}` }, { headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const admin = createAdminClient()

  let creatorId: string | null
  let orderId: string | null
  let zone = "UTC"
  let disposition: Disposition = "attachment"
  let creditNote: string | null = null

  const signed = searchParams.get("t")
  if (signed) {
    const link = verifyOrderLink(signed)
    if (!link || link.k !== "invoice") {
      return new NextResponse("This link has expired. Download the invoice again from the order.", {
        status: 410,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
      })
    }
    creatorId = link.c
    orderId = link.o
    zone = isTimeZone(link.z) ? link.z : "UTC"
    disposition = link.d === "inline" ? "inline" : "attachment"
    creditNote = creditNoteAsked(link.cn)
  } else {
    const signedIn = await signedInCreator()
    if (signedIn instanceof NextResponse) return signedIn
    creatorId = signedIn
    if (!creatorId) return NextResponse.json({ error: "Sign in again to download the invoice." }, { status: 401 })
    orderId = searchParams.get("orderId")
    const tz = searchParams.get("tz")
    if (isTimeZone(tz)) zone = tz
    creditNote = creditNoteAsked(searchParams.get("creditNote"))
  }

  const lines = await ownedOrderLines(admin, creatorId, orderId)
  if (!lines) return NextResponse.json({ error: "This order was not found." }, { status: 404 })

  /* A refund's credit note (lib/checkout/credit-note.ts), the one the buyer was sent, issued now if the refund has none yet. */
  if (creditNote) {
    try {
      const notes = await ensureCreditNotes(admin, lines as unknown as OrderRow[], creatorId)
      const note = creditNote === "latest" ? notes[notes.length - 1] : notes.find((n) => n.id === creditNote)
      const data = note ? await creditNoteFor(admin, note) : null
      if (!data) return NextResponse.json({ error: "This order has no credit note yet. One is made when a refund goes through." }, { status: 404 })
      const doc = await renderCreditNotePdf({ ...data, timeZone: data.timeZone ?? zone })
      return new NextResponse(new Uint8Array(doc), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${creditNoteFilename(data)}"`,
          "Content-Length": doc.length.toString(),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      })
    } catch (error) {
      console.error("[invoice] could not draw the credit note:", error instanceof Error ? error.message : "unknown error")
      return NextResponse.json({ error: "The credit note could not be made. Try again." }, { status: 500 })
    }
  }

  try {
    /* A paid order: the buyer's own document, letter for letter. The store's time zone, else the one this download was asked in. */
    const shared = await invoiceForOrder(admin, lines[0] as unknown as OrderRow, { basket: lines as unknown as OrderRow[] }).catch(() => null)
    if (shared) {
      const doc = await renderInvoicePdf({ ...shared, timeZone: shared.timeZone ?? zone })
      return new NextResponse(new Uint8Array(doc), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${disposition}; filename="${invoiceFilename(shared)}"`,
          "Content-Length": doc.length.toString(),
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      })
    }
    const [{ data: creator }, logo] = await Promise.all([
      admin.from("creators").select("username, user_id, support_email").eq("id", creatorId).maybeSingle(),
      storelibLogo(),
    ])
    let storeName = (creator?.username as string) || "Storelib"
    if (creator?.user_id) {
      const { data: profile } = await admin.from("profiles").select("display_name").eq("id", creator.user_id).maybeSingle()
      if (profile?.display_name?.trim()) storeName = profile.display_name.trim()
    }

    const pdf = await drawInvoice({
      lines,
      business: await companyOf(lines),
      storeName,
      supportEmail: (creator?.support_email as string | null)?.trim() || null,
      zone,
      logo,
    })
    const name = `invoice-${lines[0].id.slice(0, 8)}.pdf`
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${name}"`,
        "Content-Length": pdf.length.toString(),
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    })
  } catch (error) {
    console.error("[invoice] could not draw the PDF:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "The invoice could not be made. Try again." }, { status: 500 })
  }
}

/* ─── The drawing ─────────────────────────────────────────────────────── */

/**
 * The Storelib mark as a PNG, which the PDF library draws as it is. It used
 * to be an SVG turned into a PNG by `sharp`, and `sharp` is not in the
 * serverless bundle: every invoice logged "Cannot find module 'sharp'" and
 * went out without its mark.
 */
const LOGO_PATH = STORELIB_LOGO_PNG
const LOGO_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || STORELIB_ORIGIN

/* Kept for the life of the instance: the mark does not change between invoices. */
let logoCache: Buffer | null = null

/** The mark beside the store's name. A slow or missing logo never holds up the invoice. */
async function storelibLogo(): Promise<Buffer | null> {
  if (logoCache) return logoCache
  try {
    const res = await fetch(new URL(LOGO_PATH, LOGO_ORIGIN), { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    /* A PNG starts with these eight bytes; anything else would break the PDF. */
    if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null
    logoCache = bytes
    return bytes
  } catch {
    return null
  }
}

function paymentMethod(lines: OwnedLine[], totalCents: number): string {
  if (totalCents === 0) return "No payment needed"
  const line = lines[0]
  if (line.card_brand) {
    const brand = line.card_brand.replace(/^./, (c) => c.toUpperCase())
    return line.card_last4 ? `${brand} ending ${line.card_last4}` : brand
  }
  if (line.payment_method === "paypal") return "PayPal"
  if (line.payment_method && line.payment_method !== "card") return line.payment_method.replace(/_/g, " ")
  return "Card"
}

function refundedOf(line: OwnedLine): number {
  if (line.status !== "refunded") return 0
  /* amount_cents is what was charged, the tip already inside it. */
  const whole = line.amount_cents || 0
  const recorded = line.refund_amount_cents
  return typeof recorded === "number" && recorded > 0 ? Math.min(recorded, whole) : whole
}

/**
 * The company the buyer bought for: on the order since part 35, and before
 * that on the payment (lib/checkout/business.ts). The same one the buyer's
 * own copy carries, so the invoice a creator forwards names it too.
 */
async function companyOf(lines: OwnedLine[]): Promise<BusinessDetails | null> {
  const first = lines[0] as OwnedLine & { business_details?: unknown }
  const kept = businessFromFields(first.business_details)
  if (kept || first.stripe_session_id || !first.stripe_payment_intent_id) return kept
  try {
    return businessFromMetadata((await stripe.paymentIntents.retrieve(first.stripe_payment_intent_id)).metadata)
  } catch {
    return null
  }
}

async function drawInvoice({
  lines,
  business,
  storeName,
  supportEmail,
  zone,
  logo,
}: {
  lines: OwnedLine[]
  business: BusinessDetails | null
  storeName: string
  supportEmail: string | null
  zone: string
  logo: Buffer | null
}): Promise<Buffer> {
  const first = lines[0]
  /* The order's own currency. One nobody recorded is not guessed: the amounts are written plain. */
  const currency = String((first as { currency?: string | null }).currency || "").toUpperCase()
  /* In the currency's own decimals and word ("25.00 lei", "¥2,500"), by the app's one money writer. */
  const money = (cents: number) => (/^[A-Z]{3}$/.test(currency) ? formatMinor(cents, currency, "en-US") : (cents / 100).toFixed(2))
  const day = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "long", day: "numeric" }).format(new Date(iso))
  const time = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(iso))

  /* amount_cents is what was charged, the tip already inside it (the
     PaymentIntent's amount; lib/orders/order-view.ts reads it the same way),
     so the tip is taken out of each line for the prices and never added. */
  const priceOf = (l: OwnedLine) => Math.max(0, (l.amount_cents || 0) - (l.tip_cents || 0))
  const tip = lines.reduce((n, l) => n + (l.tip_cents || 0), 0)
  const total = lines.reduce((n, l) => n + (l.amount_cents || 0), 0)
  const subtotal = lines.reduce((n, l) => n + priceOf(l), 0)
  const refunded = lines.reduce((n, l) => n + refundedOf(l), 0)
  const pending = lines.some((l) => l.status === "pending")
  const status = pending ? "PENDING" : refunded >= total && refunded > 0 ? "REFUNDED" : refunded > 0 ? "PARTLY REFUNDED" : "PAID"
  const buyerName = [first.buyer_first_name, first.buyer_last_name].map((s) => (s || "").trim()).filter(Boolean).join(" ")
  const buyerEmail = lines.map((l) => l.buyer_email || l.customer_email).find(Boolean) || ""

  // @ts-ignore - pdfkit ships CommonJS without types
  const pdfkitModule = await import("pdfkit")
  const PDFDocument = (pdfkitModule as any).default || pdfkitModule
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Invoice ${first.id.slice(0, 8).toUpperCase()}`, Author: storeName } })
  const chunks: Buffer[] = []
  doc.on("data", (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))))

  const INK = "#1a1a2e"
  const MUTED = "#6b7280"
  const FAINT = "#9ca3af"
  const RULE = "#e5e7eb"
  const L = 50
  const R = 545

  /* Header: the store, and what this is. */
  let nameX = L
  if (logo) {
    try {
      /*
        THE LOGO'S 7PX CORNER, ON PAPER TOO. The file is a square, so the
        corner is a clip: 24pt is the 32px the logo is in an email, and 7px of
        32 is 5.25pt. A hairline at 6% ink is the page's faint shadow, as far
        as a PDF has one.
      */
      doc.save()
      doc.roundedRect(L, 47, 24, 24, 5.25).clip()
      doc.image(logo, L, 47, { width: 24, height: 24 })
      doc.restore()
      doc.save()
      doc.roundedRect(L, 47, 24, 24, 5.25).lineWidth(0.4).strokeOpacity(0.06).strokeColor("#0f172a").stroke()
      doc.restore()
      nameX = L + 32
    } catch {
      nameX = L
    }
  }
  doc.font("Helvetica-Bold").fontSize(17).fillColor(INK).text(storeName, nameX, 50, { width: 300, lineBreak: false, ellipsis: true })
  doc.font("Helvetica-Bold").fontSize(24).fillColor(INK).text("Invoice", 345, 46, { width: R - 345, align: "right" })

  const tone =
    status === "PAID" ? { bg: "#ecfdf3", fg: "#15803d" } : status === "PENDING" ? { bg: "#fff7e0", fg: "#a16207" } : { bg: "#fef2f2", fg: "#b91c1c" }
  doc.font("Helvetica-Bold").fontSize(8.5)
  const badgeW = doc.widthOfString(status) + 16
  doc.roundedRect(R - badgeW, 80, badgeW, 18, 4).fillColor(tone.bg).fill()
  doc.fillColor(tone.fg).text(status, R - badgeW, 85, { width: badgeW, align: "center" })

  doc.moveTo(L, 112).lineTo(R, 112).strokeColor(RULE).lineWidth(1).stroke()

  /* Who, when, how. */
  const label = (text: string, x: number, y: number) => doc.font("Helvetica-Bold").fontSize(8).fillColor(FAINT).text(text.toUpperCase(), x, y, { characterSpacing: 0.6 })
  const value = (text: string, x: number, y: number, width = 230) => doc.font("Helvetica").fontSize(11).fillColor(INK).text(text, x, y, { width })
  const small = (text: string, x: number, y: number, width = 230) => doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(text, x, y, { width })

  let y = 128
  label("Invoice number", L, y)
  label("Date", 300, y)
  /* The buyer's own copy's number (lib/checkout/invoice.ts): one order, one number, whoever downloads it. */
  value(invoiceNumber(first.id, first.created_at), L, y + 13)
  value(day(first.created_at), 300, y + 13)
  small(time(first.created_at), 300, y + 28)

  y += 52
  label("Billed to", L, y)
  label("Payment", 300, y)
  let billedEnd = y + 44
  if (business) {
    /* The company, its tax number and its address, then who at it paid. */
    value(business.company, L, y + 13)
    let by = y + 28
    const tax = business.taxId ? [`${taxIdFor(business.country).label} ${business.taxId}`] : []
    for (const line of [...tax, ...addressLines(business, countryName), buyerName ? `Attn: ${buyerName}` : "", buyerEmail].filter(Boolean)) {
      small(line, L, by)
      by += 13
    }
    billedEnd = by
  } else {
    value(buyerName || buyerEmail || "Customer", L, y + 13)
    if (buyerName && buyerEmail) small(buyerEmail, L, y + 28)
  }
  value(paymentMethod(lines, total), 300, y + 13)
  small(`Order ${first.id}`, 300, y + 28, 245)

  /* What was bought. */
  y = Math.max(y + 64, billedEnd + 20)
  doc.moveTo(L, y).lineTo(R, y).strokeColor(RULE).lineWidth(1).stroke()
  doc.font("Helvetica-Bold").fontSize(8).fillColor(FAINT)
  doc.text("ITEM", L, y + 10, { characterSpacing: 0.6 })
  doc.text("QTY", 380, y + 10, { width: 40, align: "center", characterSpacing: 0.6 })
  doc.text("AMOUNT", 430, y + 10, { width: R - 430, align: "right", characterSpacing: 0.6 })
  y += 28
  doc.moveTo(L, y).lineTo(R, y).strokeColor("#f1f2f4").lineWidth(1).stroke()
  y += 10

  for (const line of lines) {
    if (y > 700) {
      doc.addPage()
      y = 50
    }
    const title = line.product?.title || "Product"
    doc.font("Helvetica").fontSize(11).fillColor(INK)
    const titleHeight = doc.heightOfString(title, { width: 320 })
    doc.text(title, L, y, { width: 320 })
    doc.text("1", 380, y, { width: 40, align: "center" })
    doc.text(money(priceOf(line)), 430, y, { width: R - 430, align: "right" })
    let rowBottom = y + titleHeight
    const notes = [line.variant_name, line.status === "refunded" ? `Refunded ${money(refundedOf(line))}` : null].filter(Boolean).join(", ")
    if (notes) {
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(notes, L, rowBottom + 2, { width: 320 })
      rowBottom += 14
    }
    y = rowBottom + 12
  }

  /* The sums. */
  if (y > 640) {
    doc.addPage()
    y = 50
  }
  y += 4
  doc.moveTo(330, y).lineTo(R, y).strokeColor("#f1f2f4").lineWidth(1).stroke()
  y += 12
  const sum = (text: string, amount: string, strong = false) => {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 12 : 10.5).fillColor(strong ? INK : MUTED).text(text, 330, y)
    doc.fillColor(INK).text(amount, 430, y, { width: R - 430, align: "right" })
    y += strong ? 22 : 19
  }
  sum("Subtotal", money(subtotal))
  if (tip > 0) sum("Tip", money(tip))
  sum("Total", money(total), true)
  if (refunded > 0) {
    const refundDate = lines.map((l) => l.refunded_at).filter((d): d is string => Boolean(d)).sort().at(-1)
    sum(refundDate ? `Refunded ${day(refundDate)}` : "Refunded", `-${money(refunded)}`)
  }
  doc.moveTo(330, y).lineTo(R, y).strokeColor(INK).lineWidth(1.2).stroke()
  y += 10
  sum(pending ? "Amount due" : "Amount paid", money(pending ? total : Math.max(0, total - refunded)), true)

  /* Footer. */
  const footY = Math.max(y + 40, 700)
  doc.moveTo(L, footY).lineTo(R, footY).strokeColor(RULE).lineWidth(1).stroke()
  doc.font("Helvetica").fontSize(9.5).fillColor(FAINT)
  doc.text(supportEmail ? `Questions about this order? Write to ${supportEmail}.` : "Thank you for your order.", L, footY + 14, { width: R - L, align: "center" })
  doc.text(`${storeName}, sold on Storelib`, L, footY + 29, { width: R - L, align: "center" })

  doc.end()
  return done
}
