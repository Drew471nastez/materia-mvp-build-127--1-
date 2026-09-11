import { NextResponse } from "next/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"

type Params = { params: Promise<{ installId: string }> }

// Settings is a free-form record of theme values; cap the overall size
// by limiting key count / nested depth implicitly via JSON shape.
const SettingsBodySchema = z.object({
  settings: z.record(z.unknown()).optional(),
  draft_settings: z.record(z.unknown()).optional(),
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

  // The creator id comes back too: a write that lands on the LIVE `settings`
  // column changes the website, so the cached published site has to go.
  return { error: null, status: 200, supabase, creatorId: (creator as { id: string }).id }
}

// GET /api/website-builder/themes/[installId]/settings
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data, error: fetchErr } = await supabase
    .from("store_theme_settings")
    .select("*")
    .eq("install_id", installId)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  return NextResponse.json({ settings: data })
}

// PUT /api/website-builder/themes/[installId]/settings
// body: { settings?: object, draft_settings?: object }
// When saving from the visual editor, pass draft_settings.
// When publishing, pass settings (and clear draft_settings).
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, creatorId } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = SettingsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { settings, draft_settings, mode } = parsed.data

  const update: Record<string, unknown> = {}

  if (mode === "publish" && settings) {
    update.settings = settings
    update.draft_settings = null
  } else if (draft_settings !== undefined) {
    update.draft_settings = draft_settings
  } else if (settings) {
    update.settings = settings
  }

  // Upsert
  const { data: existing } = await supabase
    .from("store_theme_settings")
    .select("id")
    .eq("install_id", installId)
    .maybeSingle()

  let result
  if (existing) {
    const { data, error: updateErr } = await supabase
      .from("store_theme_settings")
      .update(update)
      .eq("install_id", installId)
      .select()
      .single()
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    result = data
  } else {
    const { data, error: insertErr } = await supabase
      .from("store_theme_settings")
      .insert({ install_id: installId, ...update })
      .select()
      .single()
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
    result = data
  }

  /**
   * Whenever the LIVE column was written, whichever branch above decided to
   * write it. Keyed on `update.settings` rather than on `mode`, because one
   * of those branches writes it without being asked to publish.
   */
  if (update.settings !== undefined && creatorId) revalidatePublishedSite(creatorId)

  return NextResponse.json({ settings: result })
}
