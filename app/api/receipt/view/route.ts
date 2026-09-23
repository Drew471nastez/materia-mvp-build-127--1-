import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isPlausibleToken, isUuid } from "@/lib/receipts/rules"

export const runtime = "nodejs"

/**
 * The old printable receipt. The receipt page at /receipt/<token> prints
 * cleanly by itself now, so this checks the pair it was given and forwards
 * there. The order id and token must belong together; a mismatch is the same
 * 404 as an order that does not exist.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get("orderId")
  const receiptToken = searchParams.get("receiptToken")

  if (!isUuid(orderId) || !isPlausibleToken(receiptToken)) {
    return new NextResponse("Receipt not found", { status: 404 })
  }

  const admin = createAdminClient()
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("receipt_token", receiptToken)
    .maybeSingle()

  if (!order) return new NextResponse("Receipt not found", { status: 404 })

  return NextResponse.redirect(new URL(`/receipt/${receiptToken}`, request.url), 303)
}
