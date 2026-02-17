import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

    // Generate PDF using PDFKit
    // @ts-ignore - pdfkit has no type declarations
    const PDFDocument = (await import("pdfkit")).default

    const doc = new PDFDocument({ size: "A4", margin: 50 })
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)))
    })

    // Header
    doc.fontSize(22).font("Helvetica-Bold").text(storeName, 50, 50)
    doc.fontSize(11).font("Helvetica").fillColor("#6b7280").text("Digital Product Invoice", 50, 75)

    doc.fontSize(28).font("Helvetica-Bold").fillColor("#6b7280").text("INVOICE", 400, 50, { align: "right" })

    // Line
    doc.moveTo(50, 100).lineTo(545, 100).strokeColor("#e5e7eb").lineWidth(1).stroke()

    // Meta grid
    const metaY = 120
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
    doc.text("INVOICE NUMBER", 50, metaY)
    doc.text("DATE", 280, metaY)

    doc.fontSize(13).font("Helvetica").fillColor("#1a1a2e")
    doc.text(`#INV-${order.id.slice(0, 8).toUpperCase()}`, 50, metaY + 16)
    doc.text(`${invoiceDate} at ${invoiceTime}`, 280, metaY + 16)

    const metaY2 = metaY + 45
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#9ca3af")
    doc.text("CUSTOMER", 50, metaY2)
    doc.text("STATUS", 280, metaY2)

    doc.fontSize(13).font("Helvetica").fillColor("#1a1a2e")
    doc.text(order.customer_email || order.buyer_email || "N/A", 50, metaY2 + 16)
    if (isRefunded) {
      doc.fillColor("#dc2626").text("Refunded", 280, metaY2 + 16)
    } else {
      doc.fillColor("#059669").text("Paid", 280, metaY2 + 16)
    }

    // Table header
    const tableY = metaY2 + 55
    doc.moveTo(50, tableY).lineTo(545, tableY).strokeColor("#e5e7eb").lineWidth(2).stroke()

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#6b7280")
    doc.text("ITEM", 50, tableY + 8)
    doc.text("AMOUNT", 450, tableY + 8, { align: "right" })

    // Table line
    doc.moveTo(50, tableY + 25).lineTo(545, tableY + 25).strokeColor("#e5e7eb").lineWidth(1).stroke()

    // Table row
    doc.fontSize(13).font("Helvetica").fillColor("#1a1a2e")
    doc.text(order.product?.title || "Digital Product", 50, tableY + 35)
    doc.text(formatPrice(order.amount_cents || 0), 350, tableY + 35, { align: "right", width: 195 })

    // Totals
    const totalsY = tableY + 75
    doc.moveTo(330, totalsY).lineTo(545, totalsY).strokeColor("#f3f4f6").lineWidth(1).stroke()

    doc.fontSize(12).font("Helvetica").fillColor("#1a1a2e")
    doc.text("Subtotal", 330, totalsY + 10)
    doc.text(formatPrice(order.amount_cents || 0), 350, totalsY + 10, { align: "right", width: 195 })

    doc.text("Platform Fee", 330, totalsY + 30)
    doc.text(`-${formatPrice(order.fee_cents || 0)}`, 350, totalsY + 30, { align: "right", width: 195 })

    doc.moveTo(330, totalsY + 52).lineTo(545, totalsY + 52).strokeColor("#1a1a2e").lineWidth(2).stroke()

    doc.fontSize(16).font("Helvetica-Bold")
    doc.text("Net Amount", 330, totalsY + 62)
    doc.text(formatPrice((order.amount_cents || 0) - (order.fee_cents || 0)), 350, totalsY + 62, { align: "right", width: 195 })

    // Refund section
    let currentY = totalsY + 100
    if (isRefunded) {
      // Red background box
      doc.roundedRect(50, currentY, 495, 80, 6).fillColor("#fef2f2").fill()

      doc.fontSize(13).font("Helvetica-Bold").fillColor("#dc2626")
      doc.text("Refund Details", 65, currentY + 12)

      doc.fontSize(11).font("Helvetica").fillColor("#7f1d1d")
      doc.text(`Amount: ${formatPrice(order.refund_amount_cents || order.amount_cents)}`, 65, currentY + 32)
      if (refundDate) doc.text(`Date: ${refundDate}${refundTime ? ` at ${refundTime}` : ""}`, 65, currentY + 48)
      if (order.refund_reason) doc.text(`Reason: ${order.refund_reason}`, 65, currentY + 64)

      currentY += 100
    }

    // Footer
    currentY = Math.max(currentY, 650)
    doc.moveTo(50, currentY).lineTo(545, currentY).strokeColor("#e5e7eb").lineWidth(1).stroke()

    doc.fontSize(11).font("Helvetica").fillColor("#9ca3af")
    doc.text("Thank you for your purchase.", 50, currentY + 15, { align: "center", width: 495 })
    doc.text(`${storeName} — Powered by Storelib`, 50, currentY + 32, { align: "center", width: 495 })
    doc.fontSize(9).text(`Order ID: ${order.id}`, 50, currentY + 50, { align: "center", width: 495 })

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
