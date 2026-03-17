import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/website-builder/themes
// Returns all theme installs for the current creator, with settings and pages
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

  const { data: installs, error } = await supabase
    .from("store_theme_installs")
    .select(`
      *,
      theme:themes(*),
      settings:store_theme_settings(*),
      pages:store_theme_pages(id, page_key, created_at, updated_at)
    `)
    .eq("creator_id", creator.id)
    .order("sort_order", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ installs: installs ?? [] })
}
