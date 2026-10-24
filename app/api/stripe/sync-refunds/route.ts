import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"
import { syncChargeRefund } from "@/lib/stripe/refund-sync"

export const runtime = "nodejs"

/** How many of the newest paid payments one call checks with Stripe. */
const MAX_PAYMENTS = 60

/**
 * POST /api/stripe/sync-refunds
 *
 * Catches up refunds made in Stripe's dashboard on the signed-in creator's
 * own orders, for a webhook that never arrived.
 *
 * WHAT THIS REPLACED. It read every completed order of the creator, asked
 * Stripe about each one in turn (no limit), and wrote the PAYMENT's
 * amount_refunded onto every row of it: a basket of three with $5 refunded
 * on one line had all three marked refunded with $5 each, and a part refund
 * read as a refund of every line. Now each payment is checked once, the
 * newest MAX_PAYMENTS of them, and handed to the same refund sync the webhook
 * uses (lib/stripe/refund-sync.ts), which splits each refund over the rows it
 * belongs to, writes the seller's balance and the library once per refund,
 * and is safe to run again.
 *
 * Scoped by the session: only the orders of products this account's store
 * owns are read.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const admin = createAdminClient()
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { data: products } = await admin.from("products").select("id").eq("creator_id", creator.id)
    const productIds = ((products ?? []) as { id: string }[]).map((p) => p.id)
    if (productIds.length === 0) return NextResponse.json({ synced: 0, message: "No products found" })

    const { data: orders } = await admin
      .from("orders")
      .select("stripe_payment_intent_id, created_at")
      .in("product_id", productIds)
      .eq("status", "completed")
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1000)
    const intents = [...new Set(((orders ?? []) as { stripe_payment_intent_id: string | null }[]).map((o) => o.stripe_payment_intent_id).filter((x): x is string => !!x))].slice(0, MAX_PAYMENTS)
    if (intents.length === 0) return NextResponse.json({ synced: 0, message: "No orders to sync" })

    let synced = 0
    let failed = 0
    for (const intent of intents) {
      try {
        const pi = await stripe.paymentIntents.retrieve(intent, { expand: ["latest_charge"] })
        const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null
        if (!charge || !(charge.amount_refunded > 0)) continue
        synced += (await syncChargeRefund(admin, stripe, charge)).applied
      } catch (err) {
        failed++
        console.error("[sync-refunds]", intent, err instanceof Error ? err.message : err)
      }
    }

    return NextResponse.json({ synced, checked: intents.length, failed, message: `Synced ${synced} refund(s) from Stripe` })
  } catch (error) {
    console.error("[Sync Refunds Error]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to sync refunds" }, { status: 500 })
  }
}
