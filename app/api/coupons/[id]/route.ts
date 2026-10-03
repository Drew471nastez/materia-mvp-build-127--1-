import { NextRequest, NextResponse } from "next/server"
import { readCouponInput, type CouponValues } from "@/lib/checkout/coupons"
import { freeShippingCode } from "@/lib/physical/coupon-options"
import { TAKEN, codeTaken, productsAreTheirs, signedInCreator, writeCoupon } from "../write"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * PUT /api/coupons/[id]
 * An edit, which may be the whole form or one field (turning a code off from
 * the list sends only `is_active`). It is laid over the saved row and the
 * result checked as a whole, so an edit cannot leave an end before a start.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "That coupon is gone." }, { status: 404 })
  const who = await signedInCreator()
  if (!who.ok) return who.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 })
  }

  const { data: saved } = await who.supabase
    .from("coupons")
    .select("*")
    .eq("id", id)
    .eq("creator_id", who.creatorId)
    .maybeSingle()
  if (!saved) return NextResponse.json({ error: "That coupon is gone." }, { status: 404 })

  const input = readCouponInput(body, saved as Partial<CouponValues>, { allowZero: (await freeShippingCode(body)) || (saved as { free_shipping?: boolean }).free_shipping === true })
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })

  /*
    Only the products this edit ADDS have to be theirs now. A product the code
    already named and that has since been deleted stays named (the code then
    takes nothing off it, which is what a code for a deleted product should
    do); refusing it made that code impossible to edit, or even to turn off
    from the list, which sends the saved products back with `is_active`.
  */
  const before = new Set(((saved.product_ids ?? []) as string[]).map(String))
  const added = (input.values.product_ids ?? []).filter((pid) => !before.has(pid))
  if (!(await productsAreTheirs(who.supabase, who.creatorId, added))) {
    return NextResponse.json({ error: "Some of those products could not be found." }, { status: 400 })
  }
  if (input.values.code !== String(saved.code).toUpperCase() && (await codeTaken(who.supabase, who.creatorId, input.values.code, id))) {
    return TAKEN()
  }

  return writeCoupon(who.supabase, who.creatorId, input.values, id)
}

/**
 * DELETE /api/coupons/[id]
 * Removes a code. Orders already placed with it keep their discount.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return NextResponse.json({ error: "That coupon is gone." }, { status: 404 })
  const who = await signedInCreator()
  if (!who.ok) return who.response

  const { error } = await who.supabase.from("coupons").delete().eq("id", id).eq("creator_id", who.creatorId)
  if (error) {
    console.error("[coupons] delete failed", error.code)
    return NextResponse.json({ error: "The coupon could not be deleted. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
