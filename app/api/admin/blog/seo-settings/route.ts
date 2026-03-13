import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isAdminAuthenticated } from "@/lib/admin-blog-auth"

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("seo_overrides")
    .select("*")
    .order("updated_at", { ascending: false })

  if (error) {
    return NextResponse.json({ settings: [] })
  }

  return NextResponse.json({ settings: data || [] })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { type, username, url, seo_title, seo_description } = body

  if (!type) {
    return NextResponse.json({ error: "Missing type" }, { status: 400 })
  }

  // Build the identifier: username for creators, url path for pages
  const identifier = type === "creator" ? username : url
  if (!identifier) {
    return NextResponse.json({ error: "Missing identifier (username or url)" }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Upsert into seo_overrides table
  const { data, error } = await supabase
    .from("seo_overrides")
    .upsert(
      {
        type,
        identifier,
        seo_title: seo_title || null,
        seo_description: seo_description || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "type,identifier" }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    saved: data,
  })
}
