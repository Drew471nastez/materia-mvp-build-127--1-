import { NextResponse } from "next/server"
import { LIMITS } from "@/lib/storelib-theme/types"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import type { SectionInstance } from "@/lib/website-builder/types"

type Params = { params: Promise<{ installId: string }> }

// ── Request schema ───────────────────────────────────────────
// We keep `settings` as a free-form record (section schemas vary widely)
// but cap it to reasonable shapes so callers can't inject crazy payloads.
const BlockSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  settings: z.record(z.unknown()),
})

const SectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  name: z.string().max(256),
  settings: z.record(z.unknown()),
  blocks: z.array(BlockSchema).max(500).optional(),
  hidden: z.boolean().optional(),
})

const PutBodySchema = z.object({
  page_key: z.string().min(1).max(64),
  sections: z.array(SectionSchema).max(500),
  mode: z.enum(["draft", "publish"]).optional(),
})

async function getCreatorInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null }

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: "Creator not found", status: 404, supabase: null }

  const { data: install } = await supabase
    .from("store_theme_installs").select("id")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle()
  if (!install) return { error: "Theme not found", status: 404, supabase: null }

  return { error: null, status: 200, supabase }
}

// GET /api/website-builder/themes/[installId]/sections?page=home
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const pageKey = searchParams.get("page") ?? "home"

  const { data, error: fetchErr } = await supabase
    .from("store_theme_pages")
    .select("*")
    .eq("install_id", installId)
    .eq("page_key", pageKey)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // Return draft_sections if present, else sections
  const sections = (data?.draft_sections ?? data?.sections) as SectionInstance[] | null

  return NextResponse.json({
    page: data,
    sections: sections ?? [],
    has_draft: data?.draft_sections !== null,
  })
}

// PUT /api/website-builder/themes/[installId]/sections
// body: { page_key: string, sections: SectionInstance[], mode: "draft" | "publish" }
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = PutBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { page_key, sections, mode } = parsed.data as {
    page_key: string
    sections: SectionInstance[]
    mode?: "draft" | "publish"
  }

  /**
   * ===========================================================================
   *  WHAT A PAGE WILL HOLD
   * ===========================================================================
   * These ceilings existed and were enforced when a theme was IMPORTED as a
   * package, and nowhere on the path people actually use: the editor and the
   * assistant could both grow a page past any of them, one section at a time,
   * and the first anyone would know is a page that takes a second to render.
   *
   * Checked here because this is the single door every section change goes
   * through, whichever surface made it.
   */
  if (sections.length > LIMITS.sectionsPerTemplate) {
    return NextResponse.json(
      { error: `A page holds ${LIMITS.sectionsPerTemplate} sections. This one has ${sections.length}.` },
      { status: 413 },
    )
  }
  const overfull = sections.find((s) => (s.blocks?.length ?? 0) > LIMITS.blocksPerSection)
  if (overfull) {
    return NextResponse.json(
      { error: `A section holds ${LIMITS.blocksPerSection} blocks. "${overfull.name || overfull.type}" has ${overfull.blocks?.length}.` },
      { status: 413 },
    )
  }

  const update =
    mode === "publish"
      ? { sections, draft_sections: null }
      : { draft_sections: sections }

  // Upsert
  const { data: existing } = await supabase
    .from("store_theme_pages")
    .select("id")
    .eq("install_id", installId)
    .eq("page_key", page_key)
    .maybeSingle()

  let result
  if (existing) {
    const { data, error: updateErr } = await supabase
      .from("store_theme_pages")
      .update(update)
      .eq("id", existing.id)
      .select()
      .single()
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    result = data
  } else {
    const insertData =
      mode === "publish"
        ? { install_id: installId, page_key, sections, draft_sections: null }
        : { install_id: installId, page_key, sections: [], draft_sections: sections }

    const { data, error: insertErr } = await supabase
      .from("store_theme_pages")
      .insert(insertData)
      .select()
      .single()
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    result = data
  }

  return NextResponse.json({ page: result })
}
