import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * PUT /api/coupons/[id]
 * Update an existing coupon (must belong to authenticated creator).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const body = await request.json()
  const { code, discount_type, discount_value, product_ids, usage_limit, starts_at, expires_at, is_active } = body

  if (discount_type && !["percentage", "fixed"].includes(discount_type)) {
    return NextResponse.json({ error: "discount_type must be 'percentage' or 'fixed'" }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (code !== undefined) updates.code = code.trim().toUpperCase()
  if (discount_type !== undefined) updates.discount_type = discount_type
  if (discount_value !== undefined) updates.discount_value = discount_value
  if (product_ids !== undefined) updates.product_ids = product_ids?.length ? product_ids : null
  if (usage_limit !== undefined) updates.usage_limit = usage_limit || null
  if (starts_at !== undefined) updates.starts_at = starts_at || null
  if (expires_at !== undefined) updates.expires_at = expires_at || null
  if (is_active !== undefined) updates.is_active = is_active

  const { data, error } = await supabase
    .from("coupons")
    .update(updates)
    .eq("id", id)
    .eq("creator_id", creator.id)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A coupon with this code already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "Coupon not found" }, { status: 404 })

  return NextResponse.json({ coupon: data })
}

/**
 * DELETE /api/coupons/[id]
 * Delete a coupon (must belong to authenticated creator).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { error } = await supabase
    .from("coupons")
    .delete()
    .eq("id", id)
    .eq("creator_id", creator.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
