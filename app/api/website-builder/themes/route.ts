import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/website-builder/themes
// Returns all theme installs for the current creator, with settings, pages, and username
export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, display_name")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  // Get username from profile or creator slug
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle()

  const username = profile?.username || creator.slug || ""

  const { data: installs, error } = await supabase
    .from("store_theme_installs")
    .select(`
      *,
      theme:themes(*),
      settings:store_theme_settings(*),
      pages:store_theme_pages(id, page_key, sections, draft_sections, created_at, updated_at)
    `)
    .eq("creator_id", creator.id)
    .order("sort_order", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ installs: installs ?? [], username })
}
