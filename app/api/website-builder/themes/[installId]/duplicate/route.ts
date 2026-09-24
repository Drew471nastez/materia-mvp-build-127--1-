import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { copyCover, coverAfterCreate, renderOrigin } from "@/lib/website-builder/cover-take"

export const runtime = "nodejs"
/** The copy answers at once; its photograph is taken after, which needs a browser launch and two page loads. */
export const maxDuration = 60

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

  await admin.from("store_theme_settings").insert({
    install_id: newInstall.id,
    settings: srcSettings?.settings ?? {},
    draft_settings: srcSettings?.draft_settings ?? null,
  })

  const { data: srcPages } = await supabase
    .from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId)

  if (srcPages?.length) {
    await admin.from("store_theme_pages").insert(
      srcPages.map((p: { page_key: string; sections: unknown; draft_sections: unknown }) => ({
        install_id: newInstall.id,
        page_key: p.page_key,
        sections: p.sections,
        draft_sections: p.draft_sections ?? null,
      }))
    )
  }

  /* The creator's own section files, with their drafts where the database keeps drafts. */
  const withDrafts = await admin.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId)
  const files = withDrafts.error
    ? ((await admin.from("store_theme_custom_files").select("path, content").eq("install_id", installId)).data ?? [])
    : (withDrafts.data ?? [])
  if (files.length) {
    await admin.from("store_theme_custom_files").insert(
      (files as { path: string; content: string; draft_content?: string | null }[]).map((f) =>
        withDrafts.error
          ? { install_id: newInstall.id, path: f.path, content: f.content }
          : { install_id: newInstall.id, path: f.path, content: f.content, draft_content: f.draft_content ?? null },
      ),
    )
  }

  /*
    ITS COVER FROM THE START: the source's picture at once, so the card is
    right the moment it appears, then a photograph of the copy itself.
  */
  const owner = { installId: newInstall.id as string, userId: user.id, creatorId: creator.id as string }
  await copyCover(user.id, installId, owner)
  after(() => coverAfterCreate(owner, renderOrigin(req.url), "duplicate"))

  return NextResponse.json({ install: newInstall })
}
