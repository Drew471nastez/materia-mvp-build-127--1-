import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { creatorPageStore } from "@/lib/team/creator-page"
import { readUserForRoute } from "@/lib/auth/route-user"

// GET - Get preview data (draft config) for rendering
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageType = searchParams.get("pageType")
  const creatorId = searchParams.get("creatorId")

  if (!pageType || !creatorId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  const supabase = await createClient()

  // Verify user owns this creator
  const { data: { user } } = await readUserForRoute()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  /* The owner's own page, or the store's for a team member with Creator page (round 42, lib/team/creator-page): the store named must be that one. */
  const page = await creatorPageStore(supabase, user.id)
  if (page.kind !== "page" || page.creatorId !== creatorId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get draft config for preview
  const { data: config } = await page.db
    .from("store_builder_configs")
    .select("draft_config")
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .single()

  return NextResponse.json({ config: config?.draft_config || null })
}
