import { NextRequest, NextResponse } from "next/server"
import { currencyRefusal } from "@/lib/store/currency-guard"
import { readCouponInput } from "@/lib/checkout/coupons"
import { freeShippingCode } from "@/lib/physical/coupon-options"
import { TAKEN, codeTaken, productsAreTheirs, signedInCreator, writeCoupon } from "./write"

/**
 * GET /api/coupons
 * The signed in creator's codes, newest first.
 */
export async function GET() {
  const who = await signedInCreator()
  if (!who.ok) return who.response
  const { data, error } = await who.supabase
    .from("coupons")
    .select("*")
    .eq("creator_id", who.creatorId)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("[coupons] list failed", error.code)
    return NextResponse.json({ error: "Your coupons could not be loaded." }, { status: 500 })
  }
  return NextResponse.json({ coupons: data })
}

/**
 * POST /api/coupons
 * A new code. Checked by readCouponInput (lib/checkout/coupons.ts), then:
 * one code per creator whatever its case, and only their own products.
 *
 * Body: { code, discount_type: "percentage" | "fixed", discount_value,
 *         product_ids?, usage_limit?, starts_at?, expires_at?,
 *         min_purchase_cents?, is_active? }
 */
export async function POST(request: NextRequest) {
  const who = await signedInCreator()
  if (!who.ok) return who.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 })
  }
  const moved = await currencyRefusal(who.supabase, who.creatorId, (body as { formCurrency?: unknown } | null)?.formCurrency)
  if (moved) return NextResponse.json({ error: moved, code: "currency_changed" }, { status: 409 })
  const allowZero = await freeShippingCode(body)
  const input = allowZero ? readCouponInput(body, null, { allowZero }) : readCouponInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  if (!(await productsAreTheirs(who.supabase, who.creatorId, input.values.product_ids))) {
    return NextResponse.json({ error: "Some of those products could not be found." }, { status: 400 })
  }
  if (await codeTaken(who.supabase, who.creatorId, input.values.code, null)) return TAKEN()

  return writeCoupon(who.supabase, who.creatorId, input.values, null)
}
