import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { routeUser } from "@/lib/auth/route-user"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")

  if (!productId) {
    return NextResponse.json({ error: "Missing productId" }, { status: 400 })
  }

  const supabase = await createClient()

  // Get current user
  const who = await routeUser({ fresh: true })
  const user = who.kind === "user" ? who.user : null

  if (!user) {
    return NextResponse.json({
      hasPurchased: false,
      isLoggedIn: false,
    })
  }

  // Check if user has an entitlement for this product
  const { data: entitlement } = await supabase
    .from("entitlements")
    .select("id, created_at")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .maybeSingle()

  if (!entitlement) {
    return NextResponse.json({
      hasPurchased: false,
      isLoggedIn: true,
    })
  }

  // Get the first digital asset for this product (for download)
  const { data: assets } = await supabase
    .from("digital_assets")
    .select("id, file_name")
    .eq("product_id", productId)
    .limit(1)

  // Try to get a receipt token for this purchase
  const { data: order } = await supabase
    .from("orders")
    .select("receipt_token")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    hasPurchased: true,
    isLoggedIn: true,
    assetId: assets && assets.length > 0 ? assets[0].id : null,
    receiptToken: order?.receipt_token || null,
  })
}
