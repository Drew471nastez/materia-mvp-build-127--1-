/**
 * ===========================================================================
 *  WRITE ME A SECTION
 * ===========================================================================
 * The page assistant edits a page: add this section, set that setting. Every
 * one of its operations names something that already exists. This writes a
 * new section TYPE, which produces a file, and a file either compiles or it
 * does not — a different act, so a different door.
 *
 * What comes back from the model is never trusted. It is compiled by the same
 * compiler the code editor saves through, checked against the names already
 * taken here, and saved into the file's DRAFT half like any other save, with
 * a version row beside it. Nothing reaches a visitor until the creator
 * publishes, and nothing reaches the account at all unless it compiles.
 */
import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { reviewImages } from "@/lib/sites/agent/attachments"
import { createClient } from "@/lib/supabase/server"
import { resolveProvider } from "@/lib/sites/agent/provider"
import { writeSection } from "@/lib/website-builder/agent/write-section"
import { editorContent, recordVersion, saveDraft, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { LIMITS } from "@/lib/storelib-theme/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BodySchema = z.object({
  /**
   * What the creator asked for, in their words — WHICH MAY BE NONE OF THEM.
   *
   * There used to be a `.min(3)` here. It meant that attaching a picture of
   * a section and typing nothing failed validation, and the panel reported
   * "the assistant could not produce a section that compiles": a true
   * sentence about the wrong thing. A picture is a request.
   */
  prompt: z.string().max(2000),
  /** Checked by reviewImages, never trusted as shaped. */
  images: z.array(z.unknown()).max(16).optional(),
  provider: z.enum(["anthropic", "openai"]).optional(),
  tier: z.enum(["fast", "strong"]).optional(),
  /**
   * The theme the section is being written FOR, as the editor currently holds
   * it: its colour schemes, its fonts, its buttons. Optional, because an
   * older client does not send it and a section written without it is exactly
   * what this route produced before.
   */
  settings: z.record(z.unknown()).optional(),
  /** What the site is already built out of, for coherence. Names only. */
  sectionTypes: z.array(z.string().max(80)).max(60).optional(),
})

export async function POST(request: NextRequest, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to use this." }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return NextResponse.json({ error: "Only creators can edit themes." }, { status: 403 })

  /** RLS decides: a theme somebody else owns reads as absent. */
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", (creator as { id: string }).id)
    .maybeSingle()
  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  const parsed = BodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 })

  /**
   * The pictures are checked at the edge, against the limits in one module:
   * type, size, count, and the total the platform will carry. Nothing here
   * is stored by this route — the bytes go to the model and are gone.
   */
  const { images, rejected } = reviewImages(parsed.data.images)
  if (!parsed.data.prompt.trim() && images.length === 0) {
    return NextResponse.json(
      { error: "Describe the section you want, or attach a picture of one." },
      { status: 400 },
    )
  }

  /**
   * EVERY NAME AND TYPE ALREADY HERE: the theme's, and this creator's own. The
   * model is told what it may not use, and the answer is checked against the
   * same list rather than trusted to have listened.
   */
  let sources: Record<string, string> = {}
  {
    const withDraft = await supabase
      .from("store_theme_custom_files")
      .select("path, content, draft_content")
      .eq("install_id", installId)
      .like("path", "%.storelib")
    const rows = withDraft.error
      ? ((await supabase.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
      : (withDraft.data ?? [])
    Object.assign(sources, sourceMap(rows as { path: string; content: string; draft_content?: string | null }[]))
  }
  if (Object.keys(sources).length >= LIMITS.filesPerPackage) {
    return NextResponse.json({ error: `A theme holds ${LIMITS.filesPerPackage} files.` }, { status: 413 })
  }
  const mine = schemasFromSources(sources)
  const takenTypes = [...new Set([...Object.keys(SECTION_SCHEMAS), ...Object.keys(mine)])]
  const takenNames = [
    ...Object.values(SECTION_SCHEMAS).map((s) => s.name),
    ...Object.values(mine).map((s) => s.name),
  ].filter(Boolean)

  const resolved = resolveProvider({ requested: parsed.data.provider, tier: parsed.data.tier ?? "strong" })

  const written = await writeSection({
    provider: resolved.provider,
    model: resolved.model,
    prompt: parsed.data.prompt,
    images,
    takenTypes,
    takenNames,
    theme: {
      settings: parsed.data.settings ?? null,
      neighbours: (parsed.data.sectionTypes ?? []).map((type) => ({
        type,
        name: SECTION_SCHEMAS[type]?.name ?? mine[type]?.name,
      })),
    },
    signal: request.signal,
  })

  if (written.ok === false) {
    return NextResponse.json(
      { error: written.error, errors: written.errors, source: written.source },
      { status: 422 },
    )
  }

  /**
   * Saved the same way the code editor saves: into the draft half, with a
   * version row. The creator opens it, reads it, changes it and publishes it.
   * Nothing here puts it on a page or in front of a visitor.
   */
  const saved = await saveDraft(supabase, installId, written.value.path, written.value.source)
  if (saved.ok === false) return NextResponse.json({ error: saved.error }, { status: 500 })
  await recordVersion(supabase, installId, written.value.path, written.value.source, "save")

  return NextResponse.json({
    path: written.value.path,
    type: written.value.type,
    name: written.value.name,
    drafted: saved.drafts,
    /**
     * An attachment that was refused is named rather than dropped in
     * silence: otherwise the section comes back written from a picture the
     * creator thinks it saw and it never did.
     */
    ignored: rejected.length ? rejected.map((r) => r.reason) : undefined,
  })
}
