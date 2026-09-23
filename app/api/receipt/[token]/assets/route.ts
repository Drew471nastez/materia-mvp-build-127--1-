import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fullyRefunded } from "@/lib/orders/refund-state"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // Fetch order by receipt token
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*")
      .eq("receipt_token", token)
      .maybeSingle()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    /* A refunded order gave its money back, and its files with it. Every
       column is read because the refund amount's column is not in every
       database, and naming a missing one fails the whole read. */
    if (fullyRefunded(order)) {
      return NextResponse.json({ error: "This order was refunded." }, { status: 410 })
    }

    let assets: any[] = []

    if (order.variant_id) {
      // Variant-specific files
      const { data: variantFiles } = await admin
        .from("product_variant_files")
        .select(`
          digital_asset_id,
          digital_assets (
            id,
            file_name,
            file_size,
            mime_type
          )
        `)
        .eq("variant_id", order.variant_id)

      assets = variantFiles?.map((vf: any) => vf.digital_assets).filter(Boolean) || []
    } else {
      // All product files
      const { data: allAssets } = await admin
        .from("digital_assets")
        .select("id, file_name, file_size, mime_type")
        .eq("product_id", order.product_id)

      assets = allAssets || []
    }

    return NextResponse.json({
      assets,
      orderId: order.id,
    })
  } catch {
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 })
  }
}
