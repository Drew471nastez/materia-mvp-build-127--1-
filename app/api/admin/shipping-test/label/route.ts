import { NextResponse, type NextRequest } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { getLabelPdf } from "@/lib/eawb"

/**
 * The label PDF for a test shipment, streamed so it can be LOOKED AT.
 *
 *   GET /api/admin/shipping-test/label?orderId=183061&format=A6
 *
 * A GET rather than part of the JSON simulation endpoint because a browser can
 * point an <iframe> at a GET and render the PDF — barcode, QR and all — without
 * anything downloading or leaving the page. That is the entire reason this
 * exists: the point of a test AWB is to see the label, and a JSON blob
 * containing a URL does not show you a barcode.
 *
 * The bytes come from `POST /orders/labels`, which answers with application/pdf
 * directly, so the provider's own signed link never reaches the browser.
 *
 * Admin only, and 404 — not 403 — when it is not you, so the route's existence
 * is not confirmed to anyone who should not have it.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const orderId = Number(req.nextUrl.searchParams.get("orderId"))
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "orderId must be a positive integer" }, { status: 400 })
  }
  // A6 is the thermal-label size couriers expect; A4 prints four to a page.
  const format = req.nextUrl.searchParams.get("format") === "A4" ? "A4" : "A6"

  try {
    const { bytes, contentType } = await getLabelPdf([orderId], format)
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        // inline, so it renders in the iframe rather than downloading.
        "Content-Disposition": `inline; filename="AWB-${orderId}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    const e = err as Error & { code?: string; upstreamStatus?: number }
    // The message is authored in lib/eawb.ts and carries no credential.
    return NextResponse.json(
      { error: e?.message ?? "Could not fetch the label", code: e?.code ?? "error" },
      { status: 502 },
    )
  }
}
