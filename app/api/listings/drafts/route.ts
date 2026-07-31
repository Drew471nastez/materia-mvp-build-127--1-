import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/** GET /api/listings/drafts — the caller's unpublished listings, newest first. */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ drafts: [] })

    const admin = createAdminClient()
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", userId).maybeSingle()
    if (!creator?.id) return NextResponse.json({ drafts: [] })

    const { data } = await admin
      .from("products")
      .select("id, title, slug, price_cents, thumbnail_url, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(100)

    return NextResponse.json({ drafts: data || [] })
  } catch (e: any) {
    console.error("[listings/drafts] failed:", e?.message || e)
    return NextResponse.json({ drafts: [] })
  }
}
