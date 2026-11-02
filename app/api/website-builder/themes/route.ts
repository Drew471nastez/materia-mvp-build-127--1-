import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"

// GET /api/website-builder/themes
// Returns all theme installs for the store (the owner's, or the one a team member with Website works in), with settings, pages, and username
export async function GET() {
  /* The owner, or a team member with Website working in the store (lib/team/website). */
  const site = await websiteCaller({ read: true })
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const supabase = site.supabase
  const { data: creator } = await supabase.from("creators").select("id, slug, display_name").eq("id", site.creatorId).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  // Get username from the store owner's profile or creator slug
  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", site.ownerUserId)
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

  /* The database's own words go to the log, never to the browser. */
  if (error) {
    console.error("[themes/list] failed", { code: error.code })
    return NextResponse.json({ error: "Could not load your websites. Try again." }, { status: 500 })
  }

  return NextResponse.json({ installs: installs ?? [], username })
}
