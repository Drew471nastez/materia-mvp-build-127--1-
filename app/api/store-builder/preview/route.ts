import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: creator } = await supabase.from("creators").select("id, user_id").eq("id", creatorId).single()

  if (!creator || creator.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Get draft config for preview
  const { data: config } = await supabase
    .from("store_builder_configs")
    .select("draft_config")
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .single()

  return NextResponse.json({ config: config?.draft_config || null })
}
