/**
 * ===========================================================================
 *  ONE ORDER'S PACKING SLIP, AS A PDF
 * ===========================================================================
 * The slip the page draws (./packing-slip.ts packingSlipHtml), as a file a
 * phone can hand to its share sheet: print it from there, AirDrop it, save it
 * to Files. The owner, round 23: "when I click the packing slip icon on
 * mobile ... it triggers the iOS [share sheet] and doesn't open in a new page
 * because it bugs", as Shopify's app does.
 *
 * The same facts as the page, in the same order: the store, the slip's
 * reference and date, where it goes and how, the items with their variant,
 * SKU and the buyer's choices, how many, the buyer's note and the cart's
 * fields (a gift message), and where a return goes. No pictures:
 * a slip is read by the person packing, and a picture fetched for each line
 * would make the file wait on every image host. Inter where the server has
 * it (lib/checkout/invoice.ts loadFonts), as the invoice is drawn.
 */
import { latin1, loadFonts } from "@/lib/checkout/invoice"
import { addressLines } from "./address"
import { slipReference, type SlipLine, type SlipOrder, type SlipStore } from "./packing-slip"

type Tt = (source: string, vars?: Record<string, string | number>) => string

const INK = "#1a1a2e"
const BODY = "#374151"
const MUTED = "#6b7280"
const RULE = "#e5e7eb"

/** The file's name: the slip and its order's reference, as the share sheet shows it. */
export function packingSlipFilename(order: Pick<SlipOrder, "id">): string {
  return `packing-slip-${slipReference(order.id).slice(1)}.pdf`
}

export async function renderPackingSlipPdf(
  order: SlipOrder,
  lines: SlipLine[],
  store: SlipStore,
  o: { tt: Tt; lang: string; timeZone?: string | null; paper?: "a4" | "letter"; shipmentLabel?: string | null },
  trace?: string[],
): Promise<Buffer> {
  // @ts-ignore - pdfkit ships CJS without bundled types
  const pdfkit = await import("pdfkit")
  const PDFDocument = (pdfkit.default || pdfkit) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const { tt } = o
  const ref = slipReference(order.id)
  const doc = new PDFDocument({
    size: o.paper === "letter" ? "LETTER" : "A4",
    margins: { top: 48, bottom: 48, left: 48, right: 48 },
    info: { Title: `${tt("Packing slip")} ${ref}`, Author: store.name, Creator: "Storelib" },
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
  const put = (text: string, x: number, y: number, options?: Record<string, unknown>) => {
    const s = t(text)
    trace?.push(s)
    doc.text(s, x, y, options)
    return doc.y as number
  }

  const left = 48
  const right = doc.page.width - 48
  const width = right - left
  const bottom = doc.page.height - 48
  const rule = (y: number) => doc.moveTo(left, y).lineTo(right, y).lineWidth(0.75).strokeColor(RULE).stroke()

  const when = (() => {
    try {
      return new Intl.DateTimeFormat(o.lang, { dateStyle: "long", timeZone: o.timeZone || "UTC" }).format(new Date(order.paidAt || order.createdAt))
    } catch {
      return new Date(order.paidAt || order.createdAt).toISOString().slice(0, 10)
    }
  })()

  /* The store, and what this is. */
  doc.font(BOLD).fontSize(15).fillColor(INK)
  put(store.name, left, 48, { width: width / 2 })
  doc.font(REG).fontSize(9).fillColor(MUTED)
  put(tt("Packing slip").toUpperCase(), left + width / 2, 48, { width: width / 2, align: "right", characterSpacing: 0.6 })
  doc.font(BOLD).fontSize(18).fillColor(INK)
  put(tt("Order {number}", { number: ref }), left + width / 2, 62, { width: width / 2, align: "right" })
  doc.font(REG).fontSize(10).fillColor(MUTED)
  let y = put(when, left + width / 2, doc.y + 2, { width: width / 2, align: "right" })
  if (o.shipmentLabel) y = put(o.shipmentLabel, left + width / 2, y + 1, { width: width / 2, align: "right" })
  y = Math.max(y, 100) + 14
  rule(y)

  /* Where it goes, and how. */
  y += 16
  const col = (width - 24) / 2
  const pickup = order.deliveryMethod === "pickup"
  const address = pickup ? [] : addressLines(order.address as never)
  const heading = (s: string, x: number, yy: number) => {
    doc.font(BOLD).fontSize(8.5).fillColor(MUTED)
    return put(s.toUpperCase(), x, yy, { width: col, characterSpacing: 0.6 })
  }
  let yl = heading(pickup ? tt("Picked up by") : tt("Ship to"), left, y) + 4
  doc.font(REG).fontSize(10.5).fillColor(INK)
  if (pickup) {
    yl = put(order.buyerName || tt("The buyer"), left, yl, { width: col })
    if (order.pickup) {
      doc.fillColor(MUTED)
      yl = put(tt("At {place}", { place: order.pickup.name }), left, yl + 1, { width: col })
    }
  } else if (address.length) {
    for (const line of address) yl = put(line, left, yl, { width: col }) + 1
  } else {
    doc.fillColor(MUTED)
    yl = put(tt("No address"), left, yl, { width: col })
  }
  const how = pickup ? tt("Local pickup") : order.delivery?.name || null
  let yr = y
  if (how) {
    yr = heading(pickup ? tt("Delivery") : tt("Shipping method"), left + col + 24, y) + 4
    doc.font(REG).fontSize(10.5).fillColor(INK)
    yr = put(how, left + col + 24, yr, { width: col })
  }
  y = Math.max(yl, yr) + 18
  rule(y)

  /* The items. */
  y += 12
  doc.font(BOLD).fontSize(8.5).fillColor(MUTED)
  put(tt("Items").toUpperCase(), left, y, { width: width - 60, characterSpacing: 0.6 })
  put(tt("Qty").toUpperCase(), right - 60, y, { width: 60, align: "right", characterSpacing: 0.6 })
  y += 18
  if (!lines.length) {
    doc.font(REG).fontSize(10.5).fillColor(MUTED)
    y = put(tt("Nothing to pack."), left, y, { width }) + 10
  }
  for (const l of lines) {
    if (y > bottom - 60) {
      doc.addPage()
      y = 48
    }
    const top = y
    doc.font(BOLD).fontSize(11).fillColor(INK)
    y = put(l.title, left, y, { width: width - 80 })
    const sub = [l.variant, l.sku ? tt("SKU {sku}", { sku: l.sku }) : null].filter(Boolean).join(" · ")
    doc.font(REG).fontSize(9.5).fillColor(MUTED)
    if (sub) y = put(sub, left, y + 1, { width: width - 80 })
    doc.fillColor(BODY)
    for (const [k, v] of l.properties) y = put(`${k}: ${v}`, left, y + 1, { width: width - 80 })
    doc.font(BOLD).fontSize(13).fillColor(INK)
    put(String(l.quantity), right - 60, top - 1, { width: 60, align: "right" })
    y += 10
    rule(y)
    y += 10
  }
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  doc.font(BOLD).fontSize(10.5).fillColor(INK)
  y = put(tt("{n, plural, one {# item} other {# items}}", { n: count }), left, y, { width, align: "right" }) + 14

  /* What the buyer wrote. */
  const attributes = Object.entries(order.cartAttributes ?? {}).filter(([k, v]) => k.trim() && String(v).trim())
  const note = order.buyerNote?.trim()
  if (note || attributes.length) {
    if (y > bottom - 80) {
      doc.addPage()
      y = 48
    }
    if (note) {
      y = heading(tt("Note from the buyer"), left, y) + 4
      doc.font(REG).fontSize(10.5).fillColor(INK)
      y = put(note, left, y, { width }) + 12
    }
    if (attributes.length) {
      y = heading(tt("From the cart"), left, y) + 4
      doc.font(REG).fontSize(10.5).fillColor(INK)
      for (const [k, v] of attributes) y = put(`${k}: ${v}`, left, y, { width }) + 1
      y += 11
    }
  }

  /* Where a return goes: the store's own address, as the return email says it. */
  if (store.returnAddress?.length) {
    if (y > bottom - 80) {
      doc.addPage()
      y = 48
    }
    y = heading(tt("Return address"), left, y) + 4
    doc.font(REG).fontSize(10.5).fillColor(INK)
    for (const line of store.returnAddress) y = put(line, left, y, { width }) + 1
  }

  doc.end()
  return done
}
