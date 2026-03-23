import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import type { SectionInstance } from "@/lib/website-builder/types"

type Params = { params: Promise<{ installId: string }> }

// PUT /api/website-builder/themes/[installId]/sections/sync-global
// Syncs header/footer sections to ALL pages for this install
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install } = await supabase
    .from("store_theme_installs").select("id")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const body = await req.json()
  const { header, footer, current_page, mode } = body as {
    header: SectionInstance | null
    footer: SectionInstance | null
    current_page: string
    mode: "draft" | "publish"
  }

  // Get all pages except the current one (current page already has the updated header/footer)
  const { data: pages } = await supabase
    .from("store_theme_pages")
    .select("id, page_key, sections, draft_sections")
    .eq("install_id", installId)
    .neq("page_key", current_page)

  if (!pages || pages.length === 0) {
    return NextResponse.json({ ok: true, synced: 0 })
  }

  let synced = 0
  for (const page of pages) {
    const existing: SectionInstance[] = (page.draft_sections ?? page.sections ?? []) as SectionInstance[]

    // Remove old header/footer and replace with shared ones
    const bodySections = existing.filter(s => s.type !== "header" && s.type !== "footer")
    const merged = [
      ...(header ? [header] : existing.filter(s => s.type === "header")),
      ...bodySections,
      ...(footer ? [footer] : existing.filter(s => s.type === "footer")),
    ]

    const update = mode === "publish"
      ? { sections: merged, draft_sections: null }
      : { draft_sections: merged }

    await supabase
      .from("store_theme_pages")
      .update(update)
      .eq("id", page.id)

    synced++
  }

  return NextResponse.json({ ok: true, synced })
}
