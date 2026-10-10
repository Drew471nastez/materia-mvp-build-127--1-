import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject, LIMITS } from "@/lib/api/rate-limit"
import { priceCart, priceOrder } from "@/lib/checkout/pricing"

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
 * A basket (the cart page on a creator's website) sends its lines instead,
 * and is priced by the same function its Check out is (priceCart):
 * Body:    { code, items: [{ productId, variantId?, quantity }] }
 * Answers: { ok: true, code, label, discountCents, subtotalCents,
 *            totalCents, lines: [{ productId, variantId, discountCents }] }
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
    if (Array.isArray(body.items)) {
      const cart = await priceCart(createAdminClient(), { items: body.items, couponCode: typeof body.code === "string" ? body.code : "" })
      if (cart.ok === false) return NextResponse.json({ ok: false, error: cart.error })
      /* A cart that ships is priced, code and all, by the physical checkout it goes on to. */
      if (cart.ships.length > 0) return NextResponse.json({ ok: false, error: "Something in this cart ships. Press Check out and add the code on the next page." })
      if (!cart.coupon) return NextResponse.json({ ok: false, error: cart.lines.length === 0 ? "These products can't be bought right now." : "That code is not valid." })
      return NextResponse.json({
        ok: true,
        code: cart.coupon.code,
        label: cart.couponLabel,
        discountCents: cart.discountCents,
        subtotalCents: cart.subtotalCents,
        totalCents: cart.totalCents,
        lines: cart.lines.map((l) => ({ productId: l.item.productId, variantId: l.item.variantId, discountCents: l.item.discountCents })),
      })
    }
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
