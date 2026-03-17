import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ installId: string }> }

// ── Auth helper ──────────────────────────────────────────────
async function getCreatorAndInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase, creator: null, install: null }

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return { error: "Creator not found", status: 404, supabase, creator: null, install: null }

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id, creator_id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()

  if (!install) return { error: "Theme not found", status: 404, supabase, creator, install: null }

  return { error: null, status: 200, supabase, creator, install }
}

// GET /api/website-builder/themes/[installId]
// Returns full install data with settings and pages
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

  const { data, error: fetchError } = await supabase!
    .from("store_theme_installs")
    .select(`
      *,
      theme:themes(*),
      settings:store_theme_settings(*),
      pages:store_theme_pages(*)
    `)
    .eq("id", installId)
    .single()

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json({ install: data })
}

// PATCH /api/website-builder/themes/[installId]
// Update install name only
export async function PATCH(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

  const body = await req.json()
  const { name } = body as { name?: string }

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data, error: updateError } = await supabase!
    .from("store_theme_installs")
    .update({ name: name.trim() })
    .eq("id", installId)
    .select()
    .single()

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  return NextResponse.json({ install: data })
}

// DELETE /api/website-builder/themes/[installId]
// Deletes the install. Cannot delete the published/live theme.
export async function DELETE(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorAndInstall(installId)
  if (error) return NextResponse.json({ error }, { status })

  // Prevent deleting the live theme
  const { data: install } = await supabase!
    .from("store_theme_installs")
    .select("status")
    .eq("id", installId)
    .single()

  if (install?.status === "published") {
    return NextResponse.json(
      { error: "Cannot delete the live theme. Publish another theme first." },
      { status: 400 },
    )
  }

  const { error: deleteError } = await supabase!
    .from("store_theme_installs")
    .delete()
    .eq("id", installId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
