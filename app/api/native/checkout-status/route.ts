import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { routeUser } from "@/lib/auth/route-user"

/**
 * GET /api/native/checkout-status?productId=X
 *
 * Called from the native WKWebView after the in-app browser (SFSafariViewController)
 * closes. Checks whether a purchase of the given product was recently completed so
 * the main app can decide to navigate the user to their library.
 *
 * Uses the WKWebView session cookies (set by Supabase when the user logs in) to
 * identify the buyer. For logged-in users, checks entitlements; also checks orders
 * created in the last 30 minutes to catch same-session purchases that haven't yet
 * propagated to entitlements.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")

  if (!productId) {
    return NextResponse.json({ purchased: false })
  }

  try {
    const supabase = await createClient()
    const who = await routeUser()
    const user = who.kind === "user" ? who.user : null

    if (!user) {
      return NextResponse.json({ purchased: false })
    }

    // 1. Fast path: check existing entitlement
    const { data: entitlement } = await supabase
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", productId)
      .limit(1)
      .maybeSingle()

    if (entitlement) {
      return NextResponse.json({ purchased: true })
    }

    // 2. Also check orders created in the last 30 minutes linked to this user
    //    (covers the case where email-based linking just ran but entitlement
    //    propagation is still in-flight)
    const admin = createAdminClient()
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: recentOrder } = await admin
      .from("orders")
      .select("id, receipt_token")
      .eq("product_id", productId)
      .eq("buyer_id", user.id)
      .gte("created_at", thirtyMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentOrder) {
      return NextResponse.json({ purchased: true })
    }

    return NextResponse.json({ purchased: false })
  } catch (err) {
    console.error("[native/checkout-status] Error:", err)
    return NextResponse.json({ purchased: false })
  }
}
