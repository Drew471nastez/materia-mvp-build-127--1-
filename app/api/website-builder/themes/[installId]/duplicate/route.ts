import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, isLibraryFullError, keptWithinLimit, librarySlotsLeft, nextSortOrder } from "@/lib/website-builder/library-limit"
import { copyCover, coverForNewWebsite, renderOrigin } from "@/lib/website-builder/cover-take"
import { copyRows, fileCols } from "@/lib/website-builder/theme-file-refs"

export const runtime = "nodejs"
/** The copy answers with its source's picture; its own photograph is taken after, a browser launch and two page loads. */
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

// POST /api/website-builder/themes/[installId]/duplicate
// Clones the install (settings + pages) as a new draft
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const admin = createAdminClient()
  /* The owner, or a team member with Website working in the store (lib/team/website): the new website is the store's. */
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, user, creator } = site

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
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }

  /* A name the page may send, as text of the length Rename allows; anything else is the usual one. */
  const body = await req.json().catch(() => ({}))
  const asked = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : ""
  const newName = asked || `${source.name} (copy)`.slice(0, 80)

  // After every website already there, where the page draws it arriving.
  const sortOrder = await nextSortOrder(admin, creator.id)

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
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (isLibraryFullError(installErr)) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }
  if (installErr || !newInstall) {
    return NextResponse.json({ error: installErr?.message ?? "Failed to duplicate" }, { status: 500 })
  }
  if (!(await keptWithinLimit(admin, creator.id, newInstall.id as string))) {
    return NextResponse.json({ error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }, { status: 400 })
  }
  /* The whole copy or none of it: a copy missing its pages opens to an empty editor, which reads as loss. */
  const undo = async () => {
    await admin.from("store_theme_installs").delete().eq("id", newInstall.id)
    return NextResponse.json({ error: "Could not copy this website. Try again." }, { status: 500 })
  }

  /*
    A COPY IS THE WEBSITE AS IT STANDS, not only what was last published. It
    used to copy the published settings and pages and nothing else, so work
    the creator had not published yet, and every section file they had
    written, were missing from the copy: a duplicate that looked older than
    the site it was made from. Drafts, live values and section files are all
    copied now, exactly.
  */
  const { data: srcSettings } = await supabase
    .from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()

  const { error: settingsErr } = await admin.from("store_theme_settings").insert({
    install_id: newInstall.id,
    settings: srcSettings?.settings ?? {},
    draft_settings: srcSettings?.draft_settings ?? null,
  })
  if (settingsErr) return undo()

  const { data: srcPages } = await supabase
    .from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId)

  if (srcPages?.length) {
    const { error: pagesErr } = await admin.from("store_theme_pages").insert(
      srcPages.map((p: { page_key: string; sections: unknown; draft_sections: unknown }) => ({
        install_id: newInstall.id,
        page_key: p.page_key,
        sections: p.sections,
        draft_sections: p.draft_sections ?? null,
      }))
    )
    if (pagesErr) return undo()
  }

  /* The creator's own section files, with their drafts where the database keeps drafts. */
  /* Round 27: a reference stays a reference in the copy (lib/website-builder/theme-file-refs.ts copyRows): a copy of a template website costs no text. */
  const withDrafts = await admin.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId)
  const files = withDrafts.error
    ? ((await admin.from("store_theme_custom_files").select("path, content").eq("install_id", installId)).data ?? [])
    : (withDrafts.data ?? [])
  if (files.length) {
    const { error: filesErr } = await admin.from("store_theme_custom_files").insert(
      await copyRows((files as unknown as { path: string; content: string; draft_content?: string | null; blob_sha256?: string | null }[]).map((f) =>
        withDrafts.error
          ? { install_id: newInstall.id, path: f.path, content: f.content }
          : { install_id: newInstall.id, path: f.path, content: f.content, draft_content: f.draft_content ?? null, ...(f.blob_sha256 ? { blob_sha256: f.blob_sha256 } : {}) },
      )),
    )
    if (filesErr) return undo()
  }

  /*
    ITS COVER FROM THE START: the source's picture at once, handed back in
    the answer so the card is right the moment it appears, then a photograph
    of the copy itself. A source with no picture yet is photographed now.
  */
  const owner = { installId: newInstall.id as string, userId: site.ownerUserId, creatorId: creator.id as string }
  const first = await coverForNewWebsite(owner, renderOrigin(req.url), "duplicate", await copyCover(site.ownerUserId, installId, owner))

  return NextResponse.json({ install: newInstall, ...first })
}
