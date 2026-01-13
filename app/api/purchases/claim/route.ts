import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const { receiptToken } = await request.json()

    if (!receiptToken) {
      return NextResponse.json({ error: "Missing receiptToken" }, { status: 400 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()

    // Get the logged-in user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Find the order by receipt token
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("*, product:products(*, creator:creators(id))")
      .eq("receipt_token", receiptToken)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Check if order is already claimed by another user
    if (order.buyer_id && order.buyer_id !== user.id) {
      return NextResponse.json({ error: "Order already claimed by another user" }, { status: 400 })
    }

    // If already claimed by this user, just return success
    if (order.buyer_id === user.id) {
      return NextResponse.json({ ok: true, message: "Order already claimed" })
    }

    // Update the order to attach to this user
    const { error: updateError } = await admin.from("orders").update({ buyer_id: user.id }).eq("id", order.id)

    if (updateError) {
      console.error("Error updating order:", updateError)
      return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
    }

    // Create entitlement if it doesn't exist
    const { data: existingEntitlement } = await admin
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", order.product_id)
      .maybeSingle()

    if (!existingEntitlement) {
      const creatorId = order.product?.creator?.id || order.product?.creator_id

      if (creatorId) {
        await admin.from("entitlements").insert({
          buyer_id: user.id,
          creator_id: creatorId,
          product_id: order.product_id,
          community_access: order.product?.includes_community || false,
        })
      }
    }

    return NextResponse.json({ ok: true, message: "Order claimed successfully" })
  } catch (error) {
    console.error("Error claiming order:", error)
    return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
  }
}
