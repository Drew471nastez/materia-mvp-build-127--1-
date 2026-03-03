import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get("orderId")

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, username, default_currency")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    // Fetch order with product info
    const { data: order, error: orderError } = await adminSupabase
      .from("orders")
      .select("*, product:products(id, title, creator_id)")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Verify this order belongs to the creator's product
    if (order.product?.creator_id !== creator.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const currency = creator.default_currency || "USD"
    const storeName = creator.username || "Storelib"

    const formatPrice = (cents: number) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
      }).format(cents / 100)
    }

    const invoiceDate = new Date(order.created_at).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    })
    const invoiceTime = new Date(order.created_at).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit",
    })

    const isRefunded = order.status === "refunded"
    const refundDate = order.refunded_at
      ? new Date(order.refunded_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : null
    const refundTime = order.refunded_at
      ? new Date(order.refunded_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null

    // Fetch Storelib logo for invoice branding
    let logoPngBuffer: Buffer | null = null
    try {
      const logoUrl = "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/bimi-svg-tiny-12-ps%20(1).svg"
      const logoResponse = await fetch(logoUrl)
      if (logoResponse.ok) {
        const svgBuffer = Buffer.from(await logoResponse.arrayBuffer())
        // Use runtime require so sharp remains optional at build time.
        // This prevents Turbopack from failing module resolution when sharp
        // is not installed in the deploy image.
        const runtimeRequire = (0, eval)("require") as NodeRequire
        const sharpMod = runtimeRequire("sharp")
        const sharpFn = sharpMod.default || sharpMod
        logoPngBuffer = await (sharpFn as any)(svgBuffer).resize(80, 80, { fit: "inside" }).png().toBuffer()
      }
    } catch (logoErr) {
      console.error("[Invoice] Logo fetch/convert failed:", logoErr)
    }

    // Generate PDF using PDFKit
    // @ts-ignore - pdfkit CJS module
    const pdfkitModule = await import("pdfkit")
    const PDFDocument = pdfkitModule.default || pdfkitModule

    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)))
    })

    // Header — Storelib logo next to Store name + INVOICE
    if (logoPngBuffer) {
      try {
        const logoHeight = 26
        doc.image(logoPngBuffer, 50, 48, { height: logoHeight })
        doc.fontSize(17).font("Helvetica-Bold").fillColor("#1a1a2e").text(storeName, 50 + logoHeight + 8, 50)
      } catch {
        doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a2e").text(storeName, 50, 50)
      }
    } else {
      doc.fontSize(22).font("Helvetica-Bold").fillColor("#1a1a2e").text(storeName, 50, 50)
    }

    doc.fontSize(28).font("Helvetica-Bold").fillColor("#9ca3af").text("INVOICE", 400, 50, { align: "right" })

    // Status badge next to INVOICE
    if (isRefunded) {
      doc.roundedRect(460, 82, 85, 20, 4).fillColor("#fef2f2").fill()
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#dc2626").text("REFUNDED", 467, 87, { width: 71, align: "center" })
    } else {
      doc.roundedRect(490, 82, 55, 20, 4).fillColor("#ecfdf5").fill()
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#059669").text("PAID", 497, 87, { width: 41, align: "center" })
    }

    // Divider
    doc.moveTo(50, 110).lineTo(545, 110).strokeColor("#e5e7eb").lineWidth(1).stroke()

    // Invoice details grid — 2x2 layout
    const metaY = 125
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
    doc.text("INVOICE NUMBER", 50, metaY)
    doc.text("DATE", 300, metaY)

    doc.fontSize(12).font("Helvetica").fillColor("#1a1a2e")
    doc.text(`#INV-${order.id.slice(0, 8).toUpperCase()}`, 50, metaY + 15)
    doc.text(`${invoiceDate}`, 300, metaY + 15)
    doc.fontSize(10).fillColor("#6b7280").text(`${invoiceTime}`, 300, metaY + 30)

    const metaY2 = metaY + 50
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
    doc.text("CUSTOMER EMAIL", 50, metaY2)
    doc.text("PAYMENT METHOD", 300, metaY2)

    doc.fontSize(12).font("Helvetica").fillColor("#1a1a2e")
    doc.text(order.customer_email || order.buyer_email || "N/A", 50, metaY2 + 15)
    doc.text("Stripe", 300, metaY2 + 15)

    // Buyer name if available
    const buyerName = [order.buyer_first_name, order.buyer_last_name].filter(Boolean).join(" ")
    const metaY3 = metaY2 + 45
    if (buyerName) {
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
      doc.text("CUSTOMER NAME", 50, metaY3)
      doc.fontSize(12).font("Helvetica").fillColor("#1a1a2e")
      doc.text(buyerName, 50, metaY3 + 15)
    }

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
    doc.text("ORDER ID", 300, metaY3)
    doc.fontSize(10).font("Helvetica").fillColor("#6b7280")
    doc.text(order.id, 300, metaY3 + 15)

    // Line items table
    const tableY = metaY3 + 50
    doc.moveTo(50, tableY).lineTo(545, tableY).strokeColor("#e5e7eb").lineWidth(1.5).stroke()

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#6b7280")
    doc.text("ITEM", 50, tableY + 10)
    doc.text("QTY", 380, tableY + 10, { width: 40, align: "center" })
    doc.text("AMOUNT", 430, tableY + 10, { align: "right", width: 115 })

    doc.moveTo(50, tableY + 28).lineTo(545, tableY + 28).strokeColor("#f3f4f6").lineWidth(1).stroke()

    // Item row
    doc.fontSize(12).font("Helvetica").fillColor("#1a1a2e")
    doc.text(order.product?.title || "Product", 50, tableY + 38, { width: 320 })
    doc.text("1", 380, tableY + 38, { width: 40, align: "center" })
    doc.text(formatPrice(order.amount_cents || 0), 430, tableY + 38, { align: "right", width: 115 })

    // Totals section
    const totalsY = tableY + 80
    doc.moveTo(330, totalsY).lineTo(545, totalsY).strokeColor("#f3f4f6").lineWidth(1).stroke()

    doc.fontSize(11).font("Helvetica").fillColor("#6b7280")
    doc.text("Subtotal", 330, totalsY + 12)
    doc.fillColor("#1a1a2e").text(formatPrice(order.amount_cents || 0), 430, totalsY + 12, { align: "right", width: 115 })

    doc.fillColor("#6b7280").text("Platform Fee", 330, totalsY + 34)
    doc.fillColor("#1a1a2e").text(`-${formatPrice(order.fee_cents || 0)}`, 430, totalsY + 34, { align: "right", width: 115 })

    doc.moveTo(330, totalsY + 56).lineTo(545, totalsY + 56).strokeColor("#1a1a2e").lineWidth(1.5).stroke()

    doc.fontSize(14).font("Helvetica-Bold").fillColor("#1a1a2e")
    doc.text("Net Earnings", 330, totalsY + 66)
    doc.text(formatPrice((order.amount_cents || 0) - (order.fee_cents || 0)), 430, totalsY + 66, { align: "right", width: 115 })

    // Refund section
    let currentY = totalsY + 105
    if (isRefunded) {
      doc.roundedRect(50, currentY, 495, 75, 6).fillColor("#fef2f2").fill()

      doc.fontSize(12).font("Helvetica-Bold").fillColor("#dc2626")
      doc.text("Refund Information", 65, currentY + 12)

      doc.fontSize(10).font("Helvetica").fillColor("#7f1d1d")
      doc.text(`Amount Refunded: ${formatPrice(order.refund_amount_cents || order.amount_cents)}`, 65, currentY + 30)
      if (refundDate) doc.text(`Refund Date: ${refundDate}${refundTime ? ` at ${refundTime}` : ""}`, 65, currentY + 46)
      if (order.refund_reason) doc.text(`Reason: ${order.refund_reason}`, 65, currentY + 62)

      currentY += 95
    }

    // Footer
    currentY = Math.max(currentY, 660)
    doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor("#e5e7eb").lineWidth(1).stroke()

    doc.fontSize(10).font("Helvetica").fillColor("#9ca3af")
    doc.text("Thank you for your purchase.", 50, currentY + 15, { align: "center", width: 495 })
    doc.text(`${storeName} — Powered by Storelib`, 50, currentY + 30, { align: "center", width: 495 })
    doc.fontSize(8).text(`Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, 50, currentY + 46, { align: "center", width: 495 })

    doc.end()
    const pdfBuffer = await pdfReady

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${order.id.slice(0, 8)}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error("[Invoice PDF Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to generate invoice" },
      { status: 500 }
    )
  }
}
