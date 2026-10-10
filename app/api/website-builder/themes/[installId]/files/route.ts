import { NextResponse, after } from "next/server"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { editorContent, hasUnpublishedEdit, listVersions, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getDefaultFileContent } from "@/lib/website-builder/theme-file-tree"
import { compileThemeFile } from "@/lib/storelib-theme"
import { DEFAULT_THEME_SOURCES } from "../../../../../../themes/default/sources.generated"

type Params = { params: Promise<{ installId: string }> }

// Max 1MB per file is plenty for theme source files (JSON / Liquid-ish).
const MAX_FILE_BYTES = 1_000_000

const FilesBodySchema = z.object({
  path: z
    .string()
    .min(1)
    .max(256)
    // No path traversal, no absolute paths, no null bytes, no backslashes.
    .refine(p => !p.includes("..") && !p.startsWith("/") && !p.includes("\0") && !p.includes("\\"), {
      message: "Invalid path",
    }),
  content: z.string().max(MAX_FILE_BYTES),
  /**
   * What the row said when the editor loaded it. Sent back on save so a
   * second tab, a second device or somebody else on the account cannot be
   * overwritten without anyone noticing: last write wins is fine for a
   * setting and wrong for a file somebody spent an hour in. Optional, so an
   * older client still saves rather than breaking.
   */
  base_updated_at: z.string().optional(),
})

const SAFE_PATH = (p: string) => !p.includes("..") && !p.startsWith("/") && !p.includes("\0") && !p.includes("\\")
const RenameBodySchema = z.object({
  from: z.string().min(1).max(256).refine(SAFE_PATH, { message: "Invalid path" }),
  to: z.string().min(1).max(256).refine(SAFE_PATH, { message: "Invalid path" }),
})

/**
 * Which of this install's pages hold a section of this type — published or
 * draft. One answer for DELETE and for a rename, because they do the same
 * thing to the same pages.
 */
async function pagesUsingSection(
  supabase: NonNullable<Awaited<ReturnType<typeof getCreatorInstall>>["supabase"]>,
  installId: string,
  type: string,
): Promise<string[]> {
  const { data: pages } = await supabase
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", installId)
  const uses = (list: unknown) =>
    Array.isArray(list) && list.some((x) => x && typeof x === "object" && (x as { type?: unknown }).type === type)
  return (pages ?? []).filter((pg) => uses(pg.sections) || uses(pg.draft_sections)).map((pg) => pg.page_key as string)
}

async function getCreatorInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null, creator: null }

  const { data: creator } = await supabase
    .from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: "Creator not found", status: 404, supabase: null, creator: null }

  const { data: install } = await supabase
    .from("store_theme_installs").select("id, theme_id, name")
    .eq("id", installId).eq("creator_id", creator.id).maybeSingle()
  if (!install) return { error: "Theme not found", status: 404, supabase: null, creator: null }

  return { error: null, status: 200, supabase, creator, install }
}

// GET /api/website-builder/themes/[installId]/files?path=templates/home.json
// Returns file content — custom override if it exists, else default
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install } = await getCreatorInstall(installId)
  if (error || !supabase || !install) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")

  /**
   * THE SAVED SECTIONS, FOR THE CANVAS. The editor and the published page
   * render a section from its .storelib source; this hands them every
   * source this install has saved, path to content, so a section a person
   * edited draws the way they edited it. Bounded by MAX_FILE_BYTES per row.
   */
  /**
   * AN IMPORTED SHOPIFY THEME'S OWN FILES, for the canvas that draws it
   * (components/website-builder/compat/compat-canvas.tsx): its templates,
   * config, default locale and text assets under `shopify/`, drafts first.
   * Fonts (kept as base64) and the other languages' locales are left out:
   * the canvas loads fonts by address and draws in the default language.
   */
  if (searchParams.get("compat") === "1") {
    const files: Record<string, string> = {}
    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error: readErr } = await supabase!
        .from("store_theme_custom_files")
        .select("path, content, draft_content")
        .eq("install_id", installId)
        .like("path", "shopify/%")
        .order("path")
        .range(from, from + 999)
      if (readErr) break
      const rows = (data ?? []) as { path: string; content: string | null; draft_content?: string | null }[]
      for (const r of rows) {
        if (/^shopify\/locales\/(?!.*\.default\.json$)/.test(r.path)) continue
        const text = r.draft_content ?? r.content
        if (typeof text === "string" && text !== "" && !text.startsWith("base64:")) files[r.path] = text
      }
      if (rows.length < 1000) break
    }
    return NextResponse.json({ files })
  }

  if (searchParams.get("sources") === "1") {
    /**
     * THE EDITOR SEES DRAFTS; A VISITOR SEES WHAT IS PUBLISHED. This is the
     * canvas, so it takes the draft where there is one — otherwise somebody
     * editing a section would be shown the version they have not saved over
     * yet. The storefront reads `content` and only `content`.
     */
    const { data, error: readErr } = await supabase!
      .from("store_theme_custom_files")
      .select("path, content, draft_content")
      .eq("install_id", installId)
      .like("path", "%.storelib")
    const rows = readErr
      ? ((await supabase!.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
      : (data ?? [])
    const files = sourceMap(rows as { path: string; content: string; draft_content?: string | null }[])
    return NextResponse.json({ files })
  }

  // List all custom files if no path
  if (!path) {
    const { data, error: listErr } = await supabase
      .from("store_theme_custom_files")
      .select("path, updated_at")
      .eq("install_id", installId)
    /* The database's own words go to the log, never to the browser. */
    if (listErr) {
      console.error("[theme-files] failed", { code: listErr.code })
      return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
    }
    return NextResponse.json({ customized_paths: data?.map(f => f.path) ?? [] })
  }

  /**
   * EVERY SAVE OF THIS FILE, newest first, for the history panel.
   * `?versions=1&path=…`.
   */
  if (searchParams.get("versions") === "1") {
    return NextResponse.json({ versions: await listVersions(supabase, installId, path) })
  }

  // Try custom file first
  let customFile: { content: string; updated_at?: string | null; draft_content?: string | null } | null = null
  {
    const withDraft = await supabase
      .from("store_theme_custom_files")
      .select("content, updated_at, draft_content")
      .eq("install_id", installId)
      .eq("path", path)
      .maybeSingle()
    if (withDraft.error) {
      const plain = await supabase
        .from("store_theme_custom_files")
        .select("content, updated_at")
        .eq("install_id", installId)
        .eq("path", path)
        .maybeSingle()
      customFile = plain.data
    } else {
      customFile = withDraft.data
    }
  }

  if (customFile) {
    return NextResponse.json({
      path,
      // The draft where there is one: this is the editor asking.
      content: editorContent(customFile),
      is_custom: true,
      updated_at: customFile.updated_at ?? null,
      /** Saved and not yet published, so the editor can say so. */
      unpublished: hasUnpublishedEdit(customFile),
    })
  }

  // Fallback to default content
  const content = getDefaultFileContent(path, (install as any).name)
  return NextResponse.json({ path, content, is_custom: false })
}

// PUT /api/website-builder/themes/[installId]/files
// body: { path: string, content: string }
/**
 * Every section name this install can see, lower-cased, mapped to the file
 * that holds it — the theme's own sections and the ones this creator wrote,
 * with a creator's file shadowing the theme's of the same path. `except` is
 * the file being saved, which is allowed to keep its own name.
 */

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
  const parsed = FilesBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    )
  }
  const { path, content } = parsed.data

  /**
   * One function holds every rule a save passes: the compiler, the name
   * nobody else has taken, the row nobody changed underneath you, the file
   * count, the draft half and the version row. An agent connected to the
   * site saves through the same one: lib/website-builder/save-theme-file.ts.
   */
  const result = await saveThemeFile(supabase, installId, path, content, {
    baseUpdatedAt: parsed.data.base_updated_at,
  })
  if (result.ok === false) {
    return NextResponse.json(
      { error: result.error, ...(result.errors ? { errors: result.errors } : {}), ...(result.conflict ? { conflict: result.conflict } : {}) },
      { status: result.status },
    )
  }

  /* Committed to the linked GitHub repository after the answer, if there is one. */
  after(() => mirrorToGitHub(installId, { kind: "save", path, content }))

  return NextResponse.json({
    file: result.row,
    /** False when this install has no draft column yet: the save went live. */
    drafted: result.drafted,
  })
}

// DELETE /api/website-builder/themes/[installId]/files?path=...
// Reverts a file to default (removes custom override)
export async function DELETE(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 })
  // Same path-safety rules as PUT — belt & suspenders even though we only
  // equality-match against existing rows.
  if (path.length > 256 || path.includes("..") || path.startsWith("/") || path.includes("\0") || path.includes("\\")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  }

  /**
   * A SECTION SOMEBODY'S PAGES USE DOES NOT VANISH QUIETLY. Deleting a
   * section file the default theme does not have makes every instance of
   * that type render nothing. So the first request is refused with the
   * pages that use it, the code editor shows them, and only a second
   * request with force=1 goes through. Reverting a file the default theme
   * does have needs no warning: the default takes over.
   */
  const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
  if (m && !(path in DEFAULT_THEME_SOURCES) && searchParams.get("force") !== "1") {
    const usedBy = await pagesUsingSection(supabase, installId, m[1])
    if (usedBy.length) {
      return NextResponse.json({ error: `${path} is used by ${usedBy.length} page${usedBy.length === 1 ? "" : "s"}`, used_by: usedBy }, { status: 409 })
    }
  }

  await supabase
    .from("store_theme_custom_files")
    .delete()
    .eq("install_id", installId)
    .eq("path", path)

  /* On GitHub too: a shipped section goes back to the theme's text, one of
     your own is removed. */
  const shipped = (DEFAULT_THEME_SOURCES as Record<string, string>)[path]
  after(() => mirrorToGitHub(installId, typeof shipped === "string" ? { kind: "save", path, content: shipped } : { kind: "delete", path }))

  return NextResponse.json({ ok: true })
}

// PATCH /api/website-builder/themes/[installId]/files
// body: { from: string, to: string } — rename a saved file.
export async function PATCH(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const body = await req.json().catch(() => null)
  const parsed = RenameBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 })
  const { from, to } = parsed.data
  if (from === to) return NextResponse.json({ ok: true, path: to })

  /**
   * THE DRAFT MOVES WITH IT. This read `content` alone, which is what was
   * last PUBLISHED, and wrote only that under the new name: a file saved and
   * not yet published was renamed back to an older version, or to nothing,
   * and the draft was deleted with the old row.
   */
  const withDraft = await supabase
    .from("store_theme_custom_files")
    .select("content, draft_content")
    .eq("install_id", installId)
    .eq("path", from)
    .maybeSingle()
  const hasDraftColumn = !withDraft.error
  const existing = (hasDraftColumn
    ? withDraft.data
    : (await supabase.from("store_theme_custom_files").select("content").eq("install_id", installId).eq("path", from).maybeSingle()).data) as
    | { content: string; draft_content?: string | null }
    | null
  if (!existing) return NextResponse.json({ error: `${from} is not a saved file` }, { status: 404 })
  const source = editorContent({ content: existing.content, draft_content: existing.draft_content ?? null })

  /**
   * A RENAME IS A DELETE, FOR THE PAGES THAT USE IT. `sections/x.storelib`
   * renamed to `sections/y.storelib` takes the type with it, and every
   * instance of `x` on every page goes back to rendering nothing — exactly
   * what DELETE refuses to do quietly, so this refuses it the same way and
   * with the same answer.
   */
  const fromSection = from.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
  if (fromSection && fromSection[1] !== to.match(/^sections\/([a-z0-9_-]+)\.storelib$/)?.[1] && searchParams.get("force") !== "1") {
    const usedBy = await pagesUsingSection(supabase, installId, fromSection[1])
    if (usedBy.length) {
      return NextResponse.json({ error: `${from} is used by ${usedBy.length} page${usedBy.length === 1 ? "" : "s"}`, used_by: usedBy }, { status: 409 })
    }
  }

  /**
   * Compiled under its new name before it moves, so a rename cannot leave an
   * unusable file behind. NOT under a required type: the file name is the
   * type, and insisting the schema's `type` line agree with it is what made
   * every rename fail with a compile error it could do nothing about.
   */
  if (to.endsWith(".storelib")) {
    const r = compileThemeFile(source, { file: to })
    if (r.ok === false) return NextResponse.json({ error: `${to} did not compile`, errors: r.errors }, { status: 422 })
  }

  const { error: upsertErr } = await supabase
    .from("store_theme_custom_files")
    .upsert(
      hasDraftColumn
        ? { install_id: installId, path: to, content: existing.content, draft_content: existing.draft_content ?? null }
        : { install_id: installId, path: to, content: existing.content },
      { onConflict: "install_id,path" },
    )
  /* The database's own words go to the log, never to the browser. */
  if (upsertErr) {
    console.error("[theme-files] failed", { code: upsertErr.code })
    return NextResponse.json({ error: "Could not save the file. Try again." }, { status: 500 })
  }
  await supabase.from("store_theme_custom_files").delete().eq("install_id", installId).eq("path", from)
  after(() => mirrorToGitHub(installId, { kind: "rename", from, to, content: source }))
  return NextResponse.json({ ok: true, path: to })
}
