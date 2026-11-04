import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { canDeliver, isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { attachLine, grantLine, normaliseEmail } from "@/lib/orders/attach-guest-orders"
import { guestAccessFromCookieHeader } from "@/lib/receipts/guest-access"
import { heldGrants } from "@/lib/receipts/guest-access-server"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

/**
 * Moves a guest order into the signed-in person's library. The receipt token
 * is the proof of purchase, the same as on the receipt page, so whoever holds
 * it may attach the order to their account, once, by pressing Add to
 * library. An order already on another account stays there.
 *
 * Two other proofs, both of the same purchase:
 *
 *   { orderId }            an order this browser holds a signed guest grant
 *                          for (lib/receipts/guest-access.ts), from Add to
 *                          library on a product page bought as a guest.
 *   { receiptToken,        what the library asks by itself, with no press,
 *     match: "email" }     for receipts this browser kept: attached ONLY when
 *                          the order was paid with the account's own address,
 *                          so the next person to sign in on a shared computer
 *                          does not collect the last one's purchases.
 *
 * The entitlement written carries the order's variant. Without it an
 * entitlement reads as "the whole product", which would hand a buyer of the
 * cheaper option every file of the dearer one. Only a paid order grants
 * anything; a refunded one is attached for the record and grants nothing.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const receiptToken: unknown = body?.receiptToken
    const orderId: unknown = body?.orderId
    const sameEmailOnly = body?.match === "email"
    if (!isPlausibleToken(receiptToken) && !isUuid(orderId)) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const admin = createAdminClient()

    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const limited = await rateLimit({ bucket: "purchase-claim", subjects: [addressSubject(request), `user:${user.id}`], windows: [{ limit: 60, seconds: 600 }] })
    if (limited) return limited

    let order: any = null
    if (isPlausibleToken(receiptToken)) {
      const { data } = await admin.from("orders").select("*, product:products(creator_id)").eq("receipt_token", receiptToken).maybeSingle()
      order = data
    } else {
      /* Only an order this browser's signed grant names, and that grant must hold. */
      const held = await heldGrants(admin, guestAccessFromCookieHeader(request.headers.get("cookie")))
      const mine = held.open.find((o) => String(o.id).toLowerCase() === String(orderId).toLowerCase())
      if (mine) {
        const { data } = await admin.from("orders").select("*, product:products(creator_id)").eq("id", mine.id).maybeSingle()
        order = data
      }
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }
    if (order.buyer_id && order.buyer_id !== user.id) {
      return NextResponse.json({ error: "This order is already in another account" }, { status: 409 })
    }
    if (sameEmailOnly && normaliseEmail(order.buyer_email) !== normaliseEmail(user.email)) {
      return NextResponse.json({ error: "Paid with another email" }, { status: 409 })
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
          buyer matches for one of them (lib/orders/attach-guest-orders
          attachLine). The other gets no entitlement: an entitlement with no
          order of its own would decide access forever, refunds included.
        */
        const won = await attachLine(admin, user.id, line)
        if (!won && line.id === order.id) return NextResponse.json({ error: "This order is already in another account" }, { status: 409 })
        continue
      }
      if (canDeliver(line)) await grantLine(admin, user.id, line)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[purchases/claim] failed:", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Failed to claim order" }, { status: 500 })
  }
}
