import { sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { z } from "zod"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"

type Params = { params: Promise<{ installId: string }> }

// Settings is a free-form record of theme values; cap the overall size
// by limiting key count / nested depth implicitly via JSON shape.
const SettingsBodySchema = z.object({
  settings: z.record(z.unknown()).optional(),
  draft_settings: z.record(z.unknown()).optional(),
  mode: z.enum(["draft", "publish"]).optional(),
})

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
async function getCreatorInstall(installId: string) {
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null }
  // The creator id comes back too: a write that lands on the LIVE `settings`
  // column changes the website, so the cached published site has to go.
  return { error: null, status: 200, supabase: c.supabase, creatorId: c.creatorId, userId: c.userId }
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

  /* The database's own words go to the log, never to the browser. */
  if (fetchErr) {
    console.error("[theme-settings] failed", { code: fetchErr.code })
    return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
  }
  return NextResponse.json({ settings: data })
}

// PUT /api/website-builder/themes/[installId]/settings
// body: { settings?: object, draft_settings?: object }
// When saving from the visual editor, pass draft_settings.
// When publishing, pass settings (and clear draft_settings).
export async function PUT(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, creatorId, userId } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  /* Per person, after they are known, sized for autosave in two tabs: LIMITS.siteSave. */
  const limited = await rateLimit({
    bucket: "site-settings-save",
    subjects: [`user:${userId}`],
    windows: LIMITS.siteSave,
    message: "Too many saves in a short time. Wait a moment, then keep editing.",
  })
  if (limited) return limited

  /* Read up to a cap rather than whatever arrives: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.settings)
  if (read.ok === false) return read.response
  if (read.invalid) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  const body = read.json
  const parsed = SettingsBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const parsedSettings = parsed.data
  /**
   * The announcement bar's message and the other theme settings the theme
   * itself puts into the page are HTML, and the same rule applies to them as
   * to a section's rich text: nothing that can execute reaches the database.
   * See lib/website-builder/sanitize.ts.
   */
  const settings = parsedSettings.settings ? sanitizeThemeSettings(parsedSettings.settings) : undefined
  const draft_settings = parsedSettings.draft_settings ? sanitizeThemeSettings(parsedSettings.draft_settings) : parsedSettings.draft_settings
  const mode = parsedSettings.mode

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
    /* The database's own words go to the log, never to the browser. */
    if (updateErr) {
      console.error("[theme-settings] failed", { code: updateErr.code })
      return NextResponse.json({ error: "Could not save the settings. Try again." }, { status: 500 })
    }
    result = data
  } else {
    const { data, error: insertErr } = await supabase
      .from("store_theme_settings")
      .insert({ install_id: installId, ...update })
      .select()
      .single()
    /* The database's own words go to the log, never to the browser. */
    if (insertErr) {
      console.error("[theme-settings] failed", { code: insertErr.code })
      return NextResponse.json({ error: "Could not save the settings. Try again." }, { status: 500 })
    }
    result = data
  }

  /**
   * Whenever the LIVE column was written, whichever branch above decided to
   * write it. Keyed on `update.settings` rather than on `mode`, because one
   * of those branches writes it without being asked to publish.
   */
  if (update.settings !== undefined && creatorId) {
    await revalidatePublishedSite(creatorId)
    /* The theme's own words and search engine text, translated in a few minutes (lib/markets/translate-queue.ts). */
    translationsChanged(creatorId)
  }

  return NextResponse.json({ settings: result })
}
