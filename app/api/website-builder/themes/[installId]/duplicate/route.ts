import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"

type Params = { params: Promise<{ installId: string }> }

// POST /api/website-builder/themes/[installId]/duplicate
// Clones the install (settings + pages) as a new draft
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  // Load source install
  const { data: source } = await supabase
    .from("store_theme_installs")
    .select("*")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (!source) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  // A copy is a website like any other, and counts towards the same limit.
  if ((await librarySlotsLeft(supabase, creator.id)) === 0) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const newName: string = body?.name ?? `${source.name} (copy)`

  // Count installs for sort_order
  const { count } = await supabase
    .from("store_theme_installs")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creator.id)

  // Create new install
  const { data: newInstall, error: installErr } = await admin
    .from("store_theme_installs")
    .insert({
      creator_id: creator.id,
      theme_id: source.theme_id,
      name: newName,
      status: "draft",
      is_custom: true,
      parent_install_id: installId,
      sort_order: (count ?? 0) + 1,
    })
    .select()
    .single()

  if (installErr || !newInstall) {
    return NextResponse.json({ error: installErr?.message ?? "Failed to duplicate" }, { status: 500 })
  }

  // Clone settings
  const { data: srcSettings } = await supabase
    .from("store_theme_settings").select("settings").eq("install_id", installId).maybeSingle()

  await admin.from("store_theme_settings").insert({
    install_id: newInstall.id,
    settings: srcSettings?.settings ?? {},
  })

  // Clone pages
  const { data: srcPages } = await supabase
    .from("store_theme_pages").select("*").eq("install_id", installId)

  if (srcPages?.length) {
    await admin.from("store_theme_pages").insert(
      srcPages.map((p: any) => ({
        install_id: newInstall.id,
        page_key: p.page_key,
        sections: p.sections,
        draft_sections: null,
      }))
    )
  }

  return NextResponse.json({ install: newInstall })
}
