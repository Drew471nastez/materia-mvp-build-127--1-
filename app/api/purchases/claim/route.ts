import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { canDeliver, isPlausibleToken } from "@/lib/receipts/rules"

/**
 * Moves a guest order into the signed-in person's library. The receipt token
 * is the proof of purchase, the same as on the receipt page, so whoever holds
 * it may attach the order to their account, once. An order already on
 * another account stays there.
 *
 * The entitlement written carries the order's variant. Without it an
 * entitlement reads as "the whole product", which would hand a buyer of the
 * cheaper option every file of the dearer one. Only a paid order grants
 * anything; a refunded one is attached for the record and grants nothing.
 */
export async function POST(request: Request) {
  try {
    const { receiptToken } = await request.json().catch(() => ({}))
    if (!isPlausibleToken(receiptToken)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { data: order } = await admin
      .from("orders")
      .select("id, buyer_id, product_id, variant_id, status, product:products(creator_id)")
      .eq("receipt_token", receiptToken)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    if (order.buyer_id && order.buyer_id !== user.id) {
      return NextResponse.json({ error: "This order is already in another account" }, { status: 409 })
    }

    if (!order.buyer_id) {
      const { error: updateError } = await admin
        .from("orders")
        .update({ buyer_id: user.id })
        .eq("id", order.id)
        .is("buyer_id", null)
      if (updateError) {
        console.error("[purchases/claim] could not attach order", order.id)
        return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
      }
    }

    if (canDeliver(order.status)) {
      const product: any = Array.isArray(order.product) ? order.product[0] : order.product
      const creatorId = product?.creator_id
      let q = admin.from("entitlements").select("id").eq("buyer_id", user.id).eq("product_id", order.product_id)
      q = order.variant_id ? q.eq("variant_id", order.variant_id) : q.is("variant_id", null)
      const { data: existing, error: readError } = await q.maybeSingle()

      if (!existing && creatorId) {
        const row = {
          buyer_id: user.id,
          creator_id: creatorId,
          product_id: order.product_id,
          variant_id: order.variant_id ?? null,
          community_access: false,
        }
        const { error: insertError } = await admin.from("entitlements").insert(row)
        /* A database from before entitlements had variant_id: the order row,
           which the download route reads first, still carries the variant. */
        if (insertError && readError) {
          const { variant_id: _drop, ...legacy } = row
          await admin.from("entitlements").insert(legacy)
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[purchases/claim] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
  }
}
