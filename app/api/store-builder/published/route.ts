import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - Get published config for public page rendering
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageType = searchParams.get("pageType")
  const creatorId = searchParams.get("creatorId")

  if (!pageType || !creatorId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  const supabase = await createClient()

  // Get published config (public read)
  const { data: config } = await supabase
    .from("store_builder_configs")
    .select("published_config, published_at")
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .single()

  return NextResponse.json({
    config: config?.published_config || null,
    publishedAt: config?.published_at || null,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  })
}
