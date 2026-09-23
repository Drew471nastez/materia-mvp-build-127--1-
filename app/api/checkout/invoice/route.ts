import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { invoiceFilename, invoiceForReceipt, renderInvoicePdf } from "@/lib/checkout/invoice"

export const runtime = "nodejs"

/**
 * GET /api/checkout/invoice?token=<receipt token>
 *
 * The buyer's invoice as a PDF (lib/checkout/invoice.ts). The receipt token
 * is the credential, exactly as it is for the receipt page and its
 * downloads: 32 random characters that only the buyer's email and browser
 * hold. A free order has nothing to invoice and answers 404.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || ""
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 })
  }

  /* Each call reads Stripe and draws a PDF: plenty for a person, not a loop. */
  const limited = await rateLimit({
    bucket: "invoice",
    subjects: [addressSubject(request)],
    windows: [{ limit: 20, seconds: 600 }],
    message: "Too many invoices just now. Try again in a few minutes.",
  })
  if (limited) return limited

  try {
    const invoice = await invoiceForReceipt(createAdminClient(), token)
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 })
    const pdf = await renderInvoicePdf(invoice)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceFilename(invoice)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (e) {
    console.error("[invoice]", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "The invoice could not be made. Try again." }, { status: 500 })
  }
}
