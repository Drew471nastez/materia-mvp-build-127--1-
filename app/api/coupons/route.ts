import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/coupons
 * List all coupons for the authenticated creator.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data, error } = await supabase
    .from("coupons")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ coupons: data })
}

/**
 * POST /api/coupons
 * Create a new coupon for the authenticated creator.
 *
 * Body:
 *   code: string
 *   discount_type: "percentage" | "fixed"
 *   discount_value: number
 *   product_ids?: string[] | null   (null = all products)
 *   usage_limit?: number | null
 *   starts_at?: string | null
 *   expires_at?: string | null
 *   is_active?: boolean
 */
export async function POST(request: NextRequest) {
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
  const { code, discount_type, discount_value, product_ids, usage_limit, starts_at, expires_at, min_purchase_cents, is_active } = body

  if (!code || !discount_type || discount_value == null) {
    return NextResponse.json({ error: "code, discount_type, and discount_value are required" }, { status: 400 })
  }
  if (!["percentage", "fixed"].includes(discount_type)) {
    return NextResponse.json({ error: "discount_type must be 'percentage' or 'fixed'" }, { status: 400 })
  }
  if (discount_type === "percentage" && (discount_value <= 0 || discount_value > 100)) {
    return NextResponse.json({ error: "Percentage discount must be between 1 and 100" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("coupons")
    .insert({
      creator_id: creator.id,
      code: code.trim().toUpperCase(),
      discount_type,
      discount_value,
      product_ids: product_ids?.length ? product_ids : null,
      usage_limit: usage_limit || null,
      starts_at: starts_at || null,
      expires_at: expires_at || null,
      min_purchase_cents: min_purchase_cents || null,
      is_active: is_active !== false,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A coupon with this code already exists" }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ coupon: data }, { status: 201 })
}
