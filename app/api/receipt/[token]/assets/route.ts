import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadReceiptByToken } from "@/lib/receipts/load"
import { isPlausibleToken } from "@/lib/receipts/rules"

export const runtime = "nodejs"

/**
 * The files a receipt token gives access to, for callers that only need the
 * list. Read through the same loader as the receipt page, so the variant rule
 * and the payment state are the same: a refunded or unpaid order lists no
 * files and says why. Names and sizes only, never where a file is stored.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPlausibleToken(token)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 })
  }

  try {
    const loaded = await loadReceiptByToken(createAdminClient(), token)
    const item = loaded?.view.items.find((i) => i.token === token)
    if (!loaded || !item) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    return NextResponse.json(
      {
        orderId: item.orderId,
        state: item.state,
        assets: item.files.map((f) => ({ id: f.id, file_name: f.name, file_size: f.sizeBytes })),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}
