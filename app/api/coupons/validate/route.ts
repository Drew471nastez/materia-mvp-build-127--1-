import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"

/**
 * POST /api/coupons/validate
 *
 * Validates a coupon code at checkout time. Called from the checkout page
 * (no user auth required — buyers may be guests).
 *
 * Body:
 *   code: string
 *   creator_id: string     (UUID of the creator whose store this is)
 *   product_id: string     (UUID of the product being purchased)
 *   price_cents: number    (current product price in cents, for fixed discount cap)
 *
 * Returns on success:
 *   { ok: true, coupon_id, discount_type, discount_value, discount_cents, final_cents }
 * Returns on failure:
 *   { ok: false, error: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code, creator_id, product_id, price_cents } = body

    if (!code || !creator_id || !product_id || price_cents == null) {
      return NextResponse.json({ ok: false, error: "code, creator_id, product_id, and price_cents are required" }, { status: 400 })
    }

    /*
      A discount code is a short string and this endpoint says whether a
      guess was right. Without a limit, finding one is a loop. Ten a minute
      is more than anybody types and nowhere near enough to search.
    */
    const limited = await rateLimit({
      bucket: "coupon",
      subjects: [addressSubject(request)],
      windows: LIMITS.coupon,
      message: "Too many codes tried just now. Wait a moment and try again.",
    })
    if (limited) return limited

    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: coupon, error } = await admin
      .from("coupons")
      .select("*")
      .eq("creator_id", creator_id)
      .ilike("code", code.trim())
      .eq("is_active", true)
      .maybeSingle()

    if (error) return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
    if (!coupon) return NextResponse.json({ ok: false, error: "Invalid coupon code" })

    // Date range checks
    if (coupon.starts_at && coupon.starts_at > now) {
      return NextResponse.json({ ok: false, error: "Coupon is not yet active" })
    }
    if (coupon.expires_at && coupon.expires_at < now) {
      return NextResponse.json({ ok: false, error: "Coupon has expired" })
    }

    // Usage limit check
    if (coupon.usage_limit !== null && coupon.usage_count >= coupon.usage_limit) {
      return NextResponse.json({ ok: false, error: "Coupon usage limit reached" })
    }

    // Product scope check
    if (coupon.product_ids && coupon.product_ids.length > 0) {
      if (!coupon.product_ids.includes(product_id)) {
        return NextResponse.json({ ok: false, error: "Coupon does not apply to this product" })
      }
    }

    // Calculate discount
    let discount_cents = 0
    if (coupon.discount_type === "percentage") {
      discount_cents = Math.round(price_cents * (Number(coupon.discount_value) / 100))
    } else {
      // fixed — coupon value stored in dollars, convert to cents
      discount_cents = Math.min(Math.round(Number(coupon.discount_value) * 100), price_cents)
    }
    const final_cents = Math.max(0, price_cents - discount_cents)

    return NextResponse.json({
      ok: true,
      coupon_id: coupon.id,
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value),
      discount_cents,
      final_cents,
    })
  } catch {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
  }
}
