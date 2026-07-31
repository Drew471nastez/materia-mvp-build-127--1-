import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/brands?q=nik&limit=30 — brand search for the listing form.
 *
 * Empty query returns the most popular, so the picker opens with something
 * useful rather than a blank list. Trigram-indexed, so "balencia" finds
 * Balenciaga. Fails soft to an empty list — the form always offers "Altele".
 */
export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 40)
    const limit = Math.min(50, Number(request.nextUrl.searchParams.get("limit")) || 30)
    const admin = createAdminClient()

    let query = admin.from("brands").select("name, slug").order("popularity", { ascending: false }).limit(limit)
    if (q) query = query.ilike("name", `%${q}%`)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ brands: data || [] })
  } catch (e: any) {
    console.error("[brands] search failed:", e?.message || e)
    return NextResponse.json({ brands: [] })
  }
}
