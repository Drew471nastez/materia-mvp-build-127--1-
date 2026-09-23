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
      .select("*, product:products(creator_id)")
      .eq("receipt_token", receiptToken)
      .maybeSingle()

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    if (order.buyer_id && order.buyer_id !== user.id) {
      return NextResponse.json({ error: "This order is already in another account" }, { status: 409 })
    }

    /*
      A BASKET IS CLAIMED WHOLE. Its lines are separate rows with their own
      tokens, and the sign-up link carries only the first; the others would
      stay guest orders and never reach the library. So every line of the
      same payment, for the same buyer address, still unclaimed, comes along.
    */
    let lines: any[] = [order]
    if (order.stripe_session_id && order.buyer_email) {
      const { data: siblings } = await admin
        .from("orders")
        .select("*, product:products(creator_id)")
        .eq("stripe_session_id", order.stripe_session_id)
        .eq("buyer_email", order.buyer_email)
      lines = [order, ...((siblings ?? []) as any[]).filter((r) => r.id !== order.id && (!r.buyer_id || r.buyer_id === user.id))]
    }

    for (const line of lines) {
      if (!line.buyer_id) {
        /*
          CLAIMED BY THIS REQUEST, OR NOT AT ALL. Two accounts claiming at
          once both pass the check above; the update filtered on an empty
          buyer matches for one of them, and `.select` says which. The other
          gets no entitlement: an entitlement with no order of its own would
          decide access forever, refunds included.
        */
        const { data: won, error: updateError } = await admin
          .from("orders")
          .update({ buyer_id: user.id })
          .eq("id", line.id)
          .is("buyer_id", null)
          .select("id")
        if (updateError) {
          console.error("[purchases/claim] could not attach order", line.id)
          return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
        }
        if (!won || won.length === 0) {
          if (line.id === order.id) return NextResponse.json({ error: "This order is already in another account" }, { status: 409 })
          continue
        }
      }
      if (canDeliver(line)) await grant(admin, user.id, line)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[purchases/claim] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
  }
}

/** The entitlement for one paid line, carrying its variant. */
async function grant(admin: any, userId: string, line: any) {
  const product: any = Array.isArray(line.product) ? line.product[0] : line.product
  const creatorId = product?.creator_id
  if (!creatorId) return
  let q = admin.from("entitlements").select("id").eq("buyer_id", userId).eq("product_id", line.product_id)
  q = line.variant_id ? q.eq("variant_id", line.variant_id) : q.is("variant_id", null)
  const { data: existing, error: readError } = await q.maybeSingle()
  if (existing) return
  const row = {
    buyer_id: userId,
    creator_id: creatorId,
    product_id: line.product_id,
    variant_id: line.variant_id ?? null,
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
