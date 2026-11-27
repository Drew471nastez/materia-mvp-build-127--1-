import { websiteInstallCaller } from "@/lib/team/website"
import { draftAssetPass } from "@/lib/website-builder/draft-asset-pass"
import { NextResponse, after } from "next/server"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { editorContent, hasUnpublishedEdit, listVersions, sourceMap } from "@/lib/website-builder/theme-file-drafts"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { z } from "zod"
import { getDefaultFileContent, shownPath } from "@/lib/website-builder/theme-file-tree"
import { compileThemeFile } from "@/lib/storelib-theme"
import { DEFAULT_THEME_SOURCES } from "../../../../../../themes/default/sources.generated"
import { timed } from "@/lib/perf/server-timing"
import { withStorelibReviewsSection } from "@/lib/storelib-theme/compat/storelib-reviews"
import { THEME_DATA_FILE, THEME_SCHEMA_FILE } from "@/lib/storelib-theme/theme-config"
import { settingsDataFor } from "@/lib/website-builder/theme-config-store"
import { dbFailure } from "@/lib/website-builder/write-retry"
import { REVALIDATED_CACHE } from "@/lib/website-builder/revalidated-json"
import { filesRevision, revisionJson, unchangedSince } from "@/lib/website-builder/files-revision"
import { createHash } from "node:crypto"
import { fileCols, isRefRow, refsOn, resolveRef, resolveRefs, withRefColumn, type MaybeRef } from "@/lib/website-builder/theme-file-refs"
import { partSectionPaths, partTypes, sectionTagNames } from "@/lib/website-builder/source-parts"
import { PLAIN_SCRIPT, textVersion } from "@/lib/storelib-theme/compat/script-version"
import { asEditorRead } from "@/lib/website-builder/editor-reads"

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
  /**
   * Round L: the sha256 of the draft text the writer read (ProjectFileWrite
   * in lib/ai-builder/types.ts), null for a file it believes is new. The
   * builder's own writes send it; a mismatch is the same 409 as above.
   */
  expected_version: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
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

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
/* Round 50: a GET takes the request's read answer (lib/auth/route-user readerForRequest: Supabase Auth, or the token's verified signature when Auth is slow), as every other read does since round 49. A change still needs Auth itself. Row level security applies to every query either way. */
async function getCreatorInstall(installId: string, read = false) {
  const c = await websiteInstallCaller<{ id: string; theme_id: string; name: string }>(installId, "id, theme_id, name", { read })
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null, creator: null }
  return { error: null, status: 200, supabase: c.supabase, creator: c.creator, install: c.install }
}

// GET /api/website-builder/themes/[installId]/files?path=templates/home.json
// Returns file content — custom override if it exists, else default
async function handleGET(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, install } = await getCreatorInstall(installId, true)
  if (error || !supabase || !install) return NextResponse.json({ error }, { status })

  const { searchParams } = new URL(req.url)
  const path = searchParams.get("path")
  /*
    ROUND 27: A WEBSITE'S UNCHANGED FILES MAY BE KEPT ONCE (lib/website-builder/
    theme-file-refs.ts). Reads ask for the reference column only when that is
    on and the column is there; a reference's text comes from the blobs
    (service role: the blobs are nobody's to read directly), after this
    caller was found to own the install above. Null when a blob could not be read.
  */
  const refsHere = (): Promise<boolean> => refsOn()
  const resolveHere = async <R extends { path: string; content?: string | null }>(rows: R[]): Promise<R[] | null> => {
    if (!rows.some((r) => isRefRow(r as MaybeRef))) return rows
    try {
      return await resolveRefs(rows)
    } catch (e) {
      console.error("[theme-files] the shared files could not be read:", e instanceof Error ? e.message : e)
      return null
    }
  }

  /**
   * THE SAVED SECTIONS, FOR THE CANVAS. The editor and the published page
   * render a section from its .storelib source; this hands them every
   * source this install has saved, path to content, so a section a person
   * edited draws the way they edited it. Bounded by MAX_FILE_BYTES per row.
   */
  /**
   * AN IMPORTED SHOPIFY THEME'S OWN FILES, for the canvas that draws it
   * (components/website-builder/compat/compat-canvas.tsx): its templates,
   * config, default locale (words and schema words) and text assets under `shopify/`, drafts first.
   * Fonts (kept as base64) and the other languages' locales are left out:
   * the canvas loads fonts by address and draws in the default language.
   */
  /*
    ONE OTHER LANGUAGE'S WORDS of an imported theme (shopify/locales/fr.json),
    for the canvas previewing the website in it: the theme's own `| t`
    words, as the live site draws them at /fr.
  */
  const wordsOf = searchParams.get("compat-locale")
  if (wordsOf !== null) {
    const lang = wordsOf.toLowerCase()
    if (!/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(lang)) return NextResponse.json({ files: {} })
    const names = new Set([`shopify/locales/${lang}.json`, `shopify/locales/${lang.split("-")[0]}.json`])
    const { data, error: wordsError } = await supabase!
      .from("store_theme_custom_files")
      .select(withRefColumn("path, content, draft_content", await refsHere()))
      .eq("install_id", installId)
      .like("path", "shopify/locales/%")
    if (wordsError) return NextResponse.json({ error: "Could not read theme translations. Try again." }, { status: 503 })
    const files: Record<string, string> = {}
    const wordRows = await resolveHere((data ?? []) as unknown as { path: string; content: string | null; draft_content?: string | null }[])
    if (!wordRows) return NextResponse.json({ error: "Could not read theme translations. Try again." }, { status: 503 })
    for (const r of wordRows) {
      if (!names.has(r.path.toLowerCase())) continue
      const text = r.draft_content ?? r.content
      if (typeof text === "string" && text !== "") files[r.path] = text
    }
    return NextResponse.json({ files })
  }

  if (searchParams.get("compat") === "1") {
    /*
      Round 66: asked first whether the rows changed since the copy the
      browser holds, by their paths and times alone (lib/website-builder/
      files-revision.ts). Unchanged: a 304 before a file is read.
    */
    const pass = draftAssetPass(installId)
    /* Round 68: the editor's read names each plain script by its version, not its text (lib/storelib-theme/compat/script-version.ts). */
    const leanScripts = searchParams.get("scripts") === "versions"
    const revision = await filesRevision(supabase!, installId, ["shopify/%"], `compat:${createHash("sha1").update(pass).digest("base64url")}${leanScripts ? ":scripts" : ""}`)
    const unchanged = unchangedSince(req, revision)
    if (unchanged) return unchanged
    const files: Record<string, string> = {}
    const scriptVersions: Record<string, string> = {}
    const refCols = withRefColumn("path, content, draft_content", await refsHere())
    for (let from = 0; from < 10_000; from += 1000) {
      const { data, error: readErr } = await supabase!
        .from("store_theme_custom_files")
        .select(refCols)
        .eq("install_id", installId)
        .like("path", "shopify/%")
        /*
          A font or picture kept as base64 with no draft is dropped below
          anyway, so it is left in the database (round 54): on an imported
          theme they were most of the bytes this read moved, 12 MB of 17 in
          the harness's theme (scripts/sql-harness, 40 fonts beside 360 files).
        */
        .or('content.not.like."base64:*",draft_content.not.is.null')
        .order("path")
        .range(from, from + 999)
      if (readErr) return NextResponse.json({ error: "Could not read theme files. Try again." }, { status: 503 })
      const read = (data ?? []) as unknown as { path: string; content: string | null; draft_content?: string | null }[]
      const rows = await resolveHere(read)
      if (!rows) return NextResponse.json({ error: "Could not read theme files. Try again." }, { status: 503 })
      for (const r of rows) {
        if (/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(r.path)) continue
        const text = r.draft_content ?? r.content
        if (typeof text !== "string" || text === "" || text.startsWith("base64:")) continue
        const script = leanScripts ? PLAIN_SCRIPT.exec(r.path) : null
        if (script) scriptVersions[script[1]] = textVersion(text)
        else files[r.path] = text
      }
      if (read.length < 1000) break
    }
    /* The pass the canvas's draft asset addresses carry (lib/storelib-theme/compat/draft-version.ts): only for whoever may read these files. */
    /* Round 27: megabytes on a Materia theme; asked again with what the browser has, unchanged files are a 304 and nothing is sent (revalidated-json.ts). */
    return revisionJson(req, revision, leanScripts ? { files, asset_pass: pass, script_versions: scriptVersions } : { files, asset_pass: pass })
  }

  if (searchParams.get("sources") === "1") {
    /**
     * THE EDITOR SEES DRAFTS; A VISITOR SEES WHAT IS PUBLISHED. This is the
     * canvas, so it takes the draft where there is one — otherwise somebody
     * editing a section would be shown the version they have not saved over
     * yet. The storefront reads `content` and only `content`.
     */
    /*
      Round 68: AN IMPORTED THEME'S SOURCES IN TWO PARTS (lib/website-builder/source-parts.ts). `types=`: what the
      page being opened draws from, so its canvas is drawn after 7.8 MB rather than 22.8 MB on Materia; `rest=`: the
      other sections, asked once it is drawn. Without either, every source, as before.
    */
    const pageTypes = partTypes(searchParams.get("types"))
    const restTypes = pageTypes ? null : partTypes(searchParams.get("rest"))
    if (pageTypes || restTypes) {
      const named = (pageTypes ?? restTypes)!
      const revision = await filesRevision(supabase!, installId, ["%.storelib", THEME_SCHEMA_FILE], `sources:${pageTypes ? "types" : "rest"}=${named.join(",")}`)
      const unchanged = unchangedSince(req, revision)
      if (unchanged) return unchanged
      const cols = withRefColumn("path, content, draft_content", await refsHere())
      type SourceRow = { path: string; content: string; draft_content?: string | null }
      const read = async (q: PromiseLike<{ data: unknown; error: unknown }>): Promise<SourceRow[] | null> => {
        const r = await q
        if (r.error) return null
        return resolveHere((r.data ?? []) as SourceRow[])
      }
      const base = () => supabase!.from("store_theme_custom_files").select(cols).eq("install_id", installId)
      if (restTypes) {
        const quoted = partSectionPaths(restTypes).map((p) => `"${p}"`).join(",")
        const rows = await read(base().like("path", "sections/%.storelib").not("path", "in", `(${quoted})`))
        if (!rows) return NextResponse.json({ error: "Could not read theme sources. Try again." }, { status: 503 })
        return revisionJson(req, revision, { files: sourceMap(rows), settings_schema: null, part: "rest" })
      }
      const sectionPaths = partSectionPaths(pageTypes!)
      const [others, sections, schemaRows] = await Promise.all([
        read(base().like("path", "%.storelib").not("path", "like", "sections/%")),
        read(base().in("path", sectionPaths)),
        read(base().eq("path", THEME_SCHEMA_FILE)),
      ])
      if (!others || !sections || !schemaRows) return NextResponse.json({ error: "Could not read theme sources. Try again." }, { status: 503 })
      const files = sourceMap([...others, ...sections])
      /* A section the layout or a snippet draws by name ({% section 'cart-drawer' %}) is drawn on every page: in this part too. */
      const tagged = sectionTagNames(files).map((t) => `sections/${t}.storelib`).filter((p) => !(p in files))
      if (tagged.length) {
        const more = await read(base().in("path", tagged))
        if (!more) return NextResponse.json({ error: "Could not read theme sources. Try again." }, { status: 503 })
        Object.assign(files, sourceMap(more))
      }
      const settingsSchema = schemaRows.length ? (sourceMap(schemaRows)[THEME_SCHEMA_FILE] ?? null) : null
      return revisionJson(req, revision, { files: withStorelibReviewsSection(files), settings_schema: settingsSchema, part: "page" })
    }
    /* Round 66: the rows' paths and times first; unchanged since the browser's copy, a 304 before a file is read (lib/website-builder/files-revision.ts). */
    const revision = await filesRevision(supabase!, installId, ["%.storelib", THEME_SCHEMA_FILE], "sources")
    const unchanged = unchangedSince(req, revision)
    if (unchanged) return unchanged
    /* Round 27: the theme's own settings file is asked beside the sources, not after them. */
    const sourceCols = withRefColumn("path, content, draft_content", await refsHere())
    const schemaAsked = Promise.resolve(supabase!.from("store_theme_custom_files").select(sourceCols).eq("install_id", installId).eq("path", THEME_SCHEMA_FILE).maybeSingle())
    schemaAsked.catch(() => {})
    const { data, error: readErr } = await supabase!
      .from("store_theme_custom_files")
      .select(sourceCols)
      .eq("install_id", installId)
      .like("path", "%.storelib")
    const fallback = readErr
      ? await supabase!.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")
      : null
    if (readErr && fallback?.error) return NextResponse.json({ error: "Could not read theme sources. Try again." }, { status: 503 })
    const rows = await resolveHere((readErr ? (fallback?.data ?? []) : (data ?? [])) as unknown as { path: string; content: string; draft_content?: string | null }[])
    if (!rows) return NextResponse.json({ error: "Could not read theme sources. Try again." }, { status: 503 })
    const files = sourceMap(rows)
    /* The theme's own Theme settings, when it has a config/settings_schema.json: the sidebar draws its groups from it (lib/storelib-theme/theme-config.ts). */
    const schemaRead = await schemaAsked
    const schemaRow = schemaRead.error
      ? await supabase!.from("store_theme_custom_files").select("path, content").eq("install_id", installId).eq("path", THEME_SCHEMA_FILE).maybeSingle()
      : schemaRead
    if (schemaRow.error) return NextResponse.json({ error: "Could not read theme settings. Try again." }, { status: 503 })
    const schemaRows = schemaRow.error || !schemaRow.data ? [] : await resolveHere([schemaRow.data as unknown as { path: string; content: string; draft_content?: string | null }])
    if (!schemaRows) return NextResponse.json({ error: "Could not read theme settings. Try again." }, { status: 503 })
    const settingsSchema = schemaRows.length ? (sourceMap(schemaRows)[THEME_SCHEMA_FILE] ?? null) : null
    /* An imported theme offers Storelib Reviews' section in Add section like one of its own (lib/storelib-theme/compat/storelib-reviews.ts). */
    return revisionJson(req, revision, { files: withStorelibReviewsSection(files), settings_schema: settingsSchema })
  }

  // List all custom files if no path
  if (!path) {
    /*
      EVERY FILE, NOT THE FIRST THOUSAND (round 51). The code editor lists
      what this answers, and the read had no range: PostgREST hands back at
      most its max_rows (1,000 on Supabase) in no order, so an imported theme
      with its locales, assets and snippets past that lost whichever files
      fell off the end, its sections among them ("sometimes there are no
      sections in it"). Read a thousand at a time, by path, like the canvas's
      own read above. A database that blinked is a 503 the editor asks again
      (write-retry.ts dbFailure), never an empty list.
    */
    const paths: string[] = []
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error: listErr } = await supabase
        .from("store_theme_custom_files")
        .select("path")
        .eq("install_id", installId)
        .order("path")
        .range(from, from + 999)
      /* The database's own words go to the log, never to the browser. */
      if (listErr) {
        console.error("[theme-files] failed", { code: listErr.code })
        return dbFailure(listErr, "Could not list the website's files. Try again.")
      }
      const rows = (data ?? []) as { path: string }[]
      for (const r of rows) paths.push(r.path)
      if (rows.length < 1000) break
    }
    return NextResponse.json({ customized_paths: paths })
  }

  /**
   * EVERY SAVE OF THIS FILE, newest first, for the history panel.
   * `?versions=1&path=…`.
   */
  if (searchParams.get("versions") === "1") {
    return NextResponse.json({ versions: await listVersions(supabase, installId, path) })
  }

  /*
    THE THEME'S VALUES, NOW. config/settings_data.json is the install's theme
    settings as a file (lib/storelib-theme/theme-config.ts), never a stored
    copy that could fall behind the sidebar.
  */
  if (path === THEME_DATA_FILE) {
    const data = await settingsDataFor(supabase, installId)
    if (!data) return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
    return NextResponse.json({ path, content: data.text, is_custom: true, updated_at: null, unpublished: false })
  }

  // Try custom file first
  let customFile: { content: string; updated_at?: string | null; draft_content?: string | null } | null = null
  {
    const withDraft = await supabase
      .from("store_theme_custom_files")
      .select(withRefColumn("path, content, updated_at, draft_content", await refsHere()))
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
      if (plain.error) return NextResponse.json({ error: "Could not read that theme file. Try again." }, { status: 503 })
      customFile = plain.data
    } else {
      const one = withDraft.data ? await resolveHere([withDraft.data as unknown as { path: string; content: string; updated_at?: string | null; draft_content?: string | null }]) : []
      if (!one) return NextResponse.json({ error: "Could not read that theme file. Try again." }, { status: 503 })
      customFile = one[0] ?? null
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
    expectedVersion: parsed.data.expected_version,
    /* A person, in the code editor or the builder: the history says "You". */
    author: "creator",
  })
  if (result.ok === false) {
    return NextResponse.json(
      { error: result.error, ...(result.errors ? { errors: result.errors } : {}), ...(result.conflict ? { conflict: result.conflict } : {}) },
      { status: result.status },
    )
  }

  /* What was kept: an imported theme's panel made again from its schema is the file now, here and on GitHub. */
  const kept = result.source ?? content
  /* Committed to the linked GitHub repository after the answer, if there is one. */
  after(() => mirrorToGitHub(installId, { kind: "save", path, content: kept }))

  return NextResponse.json({
    file: result.row,
    /** False when this install has no draft column yet: the save went live. */
    drafted: result.drafted,
    /** The text kept when it is not the text sent, so the code editor shows what is stored (lib/storelib-theme/compat/schema-sync.ts). */
    ...(result.source !== undefined ? { stored: result.source } : {}),
    /** What the builder cannot show of a schema it took. */
    ...(result.notes?.length ? { notes: result.notes } : {}),
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
      return NextResponse.json({ error: `${shownPath(path)} is used by ${usedBy.length} page${usedBy.length === 1 ? "" : "s"}`, used_by: usedBy }, { status: 409 })
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
    .select(await fileCols("path, content, draft_content"))
    .eq("install_id", installId)
    .eq("path", from)
    .maybeSingle()
  const hasDraftColumn = !withDraft.error
  /* Round 27: a reference's text goes to the new name (lib/website-builder/theme-file-refs.ts). */
  const existing = (await resolveRef((hasDraftColumn
    ? withDraft.data
    : (await supabase.from("store_theme_custom_files").select("path, content").eq("install_id", installId).eq("path", from).maybeSingle()).data) as unknown as
    | { path: string; content: string; draft_content?: string | null }
    | null))
  if (!existing) return NextResponse.json({ error: `${shownPath(from)} is not a saved file` }, { status: 404 })
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
      return NextResponse.json({ error: `${shownPath(from)} is used by ${usedBy.length} page${usedBy.length === 1 ? "" : "s"}`, used_by: usedBy }, { status: 409 })
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
    if (r.ok === false) return NextResponse.json({ error: `${shownPath(to)} did not compile`, errors: r.errors }, { status: 422 })
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

/* Timed on the server for /admin/performance (lib/perf/server-timing.ts). */
export const GET = timed("builder", "/api/website-builder/themes/:id/files", async (req: Request, params: Params) => {
  /* Counted while it is answered: the work after a Publish waits for the editor's open on this server (round 68, editor-reads.ts). */
  const res = await asEditorRead(() => handleGET(req, params))
  /* A push just wrote these. A cached copy is the editor showing the old theme until a hard refresh. */
  /* Round 27: the two large reads may be kept by the browser only as "ask me first" (no-cache with their ETag, ./revalidated-json.ts), so it is never shown without the server saying it is still the theme. */
  if (res.headers.get("Cache-Control") !== REVALIDATED_CACHE) res.headers.set("Cache-Control", "no-store")
  return res
})
