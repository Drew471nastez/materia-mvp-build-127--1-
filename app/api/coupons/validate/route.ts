import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { priceOrder } from "@/lib/checkout/pricing"

/**
 * POST /api/coupons/validate
 *
 * The checkout's Apply button. Guests use it, so there is no session to
 * check; what it answers is only whether a code takes something off THIS
 * product, priced by the server from the database (lib/checkout/pricing.ts).
 * The page no longer sends a price, because it no longer gets to choose one.
 *
 * Body:    { code, productId, variantId?, customPriceCents? }
 * Answers: { ok: true, code, label, discountCents } or { ok: false, error }
 *
 * The coupon's id is not returned: nothing outside the server needs it, and
 * the endpoint that took one to count a use is gone. A use is counted when
 * an order is created with the code (lib/checkout/fulfil-payment.ts and the
 * free checkout).
 */
export async function POST(request: NextRequest) {
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "That code is not valid." }, { status: 400 })
  }

  try {
    const priced = await priceOrder(createAdminClient(), {
      productId: body.productId,
      variantId: body.variantId,
      customPriceCents: body.customPriceCents,
      couponCode: typeof body.code === "string" ? body.code : "",
    }, "id, creator_id, price_cents, pay_what_you_want, pwyw_min_price_cents, status")
    if (priced.ok === false) return NextResponse.json({ ok: false, error: priced.error })
    if (!priced.coupon) return NextResponse.json({ ok: false, error: "That code is not valid." })
    return NextResponse.json({
      ok: true,
      code: priced.coupon.code,
      label: priced.couponLabel,
      discountCents: priced.totals.discountCents,
    })
  } catch {
    return NextResponse.json({ ok: false, error: "The code could not be checked. Try again." }, { status: 500 })
  }
}
