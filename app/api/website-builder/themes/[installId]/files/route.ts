import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { getDefaultFileContent } from "@/lib/website-builder/theme-file-tree"
import { compileSection } from "@/lib/storelib-theme"
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
})

const SAFE_PATH = (p: string) => !p.includes("..") && !p.startsWith("/") && !p.includes("\0") && !p.includes("\\")
const RenameBodySchema = z.object({
  from: z.string().min(1).max(256).refine(SAFE_PATH, { message: "Invalid path" }),
  to: z.string().min(1).max(256).refine(SAFE_PATH, { message: "Invalid path" }),
})

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
  if (searchParams.get("sources") === "1") {
    const { data } = await supabase!
      .from("store_theme_custom_files")
      .select("path, content")
      .eq("install_id", installId)
      .like("path", "%.storelib")
    const files: Record<string, string> = {}
    for (const row of data ?? []) files[row.path] = row.content
    return NextResponse.json({ files })
  }

  // List all custom files if no path
  if (!path) {
    const { data, error: listErr } = await supabase
      .from("store_theme_custom_files")
      .select("path, updated_at")
      .eq("install_id", installId)
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
    return NextResponse.json({ customized_paths: data?.map(f => f.path) ?? [] })
  }

  // Try custom file first
  const { data: customFile } = await supabase
    .from("store_theme_custom_files")
    .select("content, updated_at")
    .eq("install_id", installId)
    .eq("path", path)
    .maybeSingle()

  if (customFile) {
    return NextResponse.json({ path, content: customFile.content, is_custom: true })
  }

  // Fallback to default content
  const content = getDefaultFileContent(path, (install as any).name)
  return NextResponse.json({ path, content, is_custom: false })
}

// PUT /api/website-builder/themes/[installId]/files
// body: { path: string, content: string }
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
   * COMPILE BEFORE STORE. A .storelib file that does not compile is not
   * saved, and the answer carries every error with the line it is on, so
   * the code editor can point at it. A section file must also be the
   * section its name says it is. Nothing half-broken ever reaches the
   * canvas or the storefront (docs/theme/12-validation-and-errors.md).
   */
  if (path.endsWith(".storelib")) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    const r = compileSection(content, { file: path, expectType: m ? m[1] : undefined })
    if (r.ok === false) {
      return NextResponse.json(
        { error: `${path} did not compile`, errors: r.errors },
        { status: 422 },
      )
    }
  }

  // Upsert
  const { data, error: upsertErr } = await supabase
    .from("store_theme_custom_files")
    .upsert({ install_id: installId, path, content }, { onConflict: "install_id,path" })
    .select()
    .single()

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  return NextResponse.json({ file: data })
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
    const type = m[1]
    const { data: pages } = await supabase
      .from("store_theme_pages")
      .select("page_key, sections, draft_sections")
      .eq("install_id", installId)
    const uses = (list: unknown) => Array.isArray(list) && list.some((x) => x && typeof x === "object" && (x as { type?: unknown }).type === type)
    const usedBy = (pages ?? []).filter((pg) => uses(pg.sections) || uses(pg.draft_sections)).map((pg) => pg.page_key as string)
    if (usedBy.length) {
      return NextResponse.json({ error: `${path} is used by ${usedBy.length} page${usedBy.length === 1 ? "" : "s"}`, used_by: usedBy }, { status: 409 })
    }
  }

  await supabase
    .from("store_theme_custom_files")
    .delete()
    .eq("install_id", installId)
    .eq("path", path)

  return NextResponse.json({ ok: true })
}

// PATCH /api/website-builder/themes/[installId]/files
// body: { from: string, to: string } — rename a saved file.
export async function PATCH(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await getCreatorInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const body = await req.json().catch(() => null)
  const parsed = RenameBodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 })
  const { from, to } = parsed.data
  if (from === to) return NextResponse.json({ ok: true, path: to })

  const { data: existing } = await supabase
    .from("store_theme_custom_files")
    .select("content")
    .eq("install_id", installId)
    .eq("path", from)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: `${from} is not a saved file` }, { status: 404 })

  /**
   * A section file's name and its schema's type are one thing (the
   * compiler refuses a file whose type disagrees with its name), so a
   * renamed section file is compiled under its new name before it moves.
   */
  if (to.endsWith(".storelib")) {
    const m = to.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    const r = compileSection(existing.content, { file: to, expectType: m ? m[1] : undefined })
    if (r.ok === false) return NextResponse.json({ error: `${to} did not compile`, errors: r.errors }, { status: 422 })
  }

  const { error: upsertErr } = await supabase
    .from("store_theme_custom_files")
    .upsert({ install_id: installId, path: to, content: existing.content }, { onConflict: "install_id,path" })
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  await supabase.from("store_theme_custom_files").delete().eq("install_id", installId).eq("path", from)
  return NextResponse.json({ ok: true, path: to })
}
