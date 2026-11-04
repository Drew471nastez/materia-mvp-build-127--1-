import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PUBLIC_CONFIG_COLUMNS, withoutPrivateConfig } from "@/lib/store-builder/public-config"

/*
  GET - a creator's published config, for public page rendering.

  Anybody may ask, so this is the same narrow read every public page makes
  (lib/store-builder/public-config.ts, round 48, R48-6): the server reads the
  published config and when it was published, never the draft, and hands it
  out without the contact address. It used to read with the visitor's own
  client, which needed the table open to the anon role, and it answered the
  whole published config, contact address included, to anybody, cached by
  the CDN for five minutes.
*/
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const pageType = searchParams.get("pageType")
  const creatorId = searchParams.get("creatorId")

  if (!pageType || !creatorId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
  }

  const { data: config } = await createAdminClient()
    .from("store_builder_configs")
    .select(`${PUBLIC_CONFIG_COLUMNS}, published_at`)
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .maybeSingle()

  /* An empty config is nothing published, as the old public policy answered it. */
  const published = config?.published_config && Object.keys(config.published_config).length > 0 ? withoutPrivateConfig(config.published_config) : null

  return NextResponse.json({
    config: published,
    publishedAt: published ? config?.published_at || null : null,
  }, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  })
}
