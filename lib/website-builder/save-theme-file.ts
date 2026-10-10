/**
 * ===========================================================================
 *  SAVING ONE FILE OF A THEME, WHOEVER IS SAVING IT
 * ===========================================================================
 * The code editor saved through its own route, and that route held every
 * rule a save has to pass: the path, the size, the compiler, the name
 * nobody else has taken, the row nobody changed underneath you, the file
 * count. An agent connected to a site (Claude Code, Codex) saves too, and
 * two copies of those rules would be two sets of rules within a month.
 *
 * So there is one, here. The editor's PUT and the agent API both call it,
 * and a file an agent writes is held to exactly what a file a person writes
 * is held to. See app/api/website-builder/themes/[installId]/files/route.ts
 * and app/api/agent/v1.
 */
import { LIMITS, type ThemeError } from "@/lib/storelib-theme/types"
import { compileSection, compileThemeFile } from "@/lib/storelib-theme/storelib/compile"
import { CHROME_TYPES, chromeRefusal, declaredKind, kindTaken } from "@/lib/storelib-theme/chrome"
import { recordVersion, saveDraft, sourceMap, type FileRow } from "./theme-file-drafts"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { isCompatSource, splitCompatFile } from "@/lib/storelib-theme/compat/theme"
import { parseCompat } from "@/lib/storelib-theme/compat/parser"
import { CompatSyntaxError } from "@/lib/storelib-theme/compat/lexer"
import { validateBlockSchema, validateSectionSchema } from "@/lib/storelib-theme/schema/validate"

/** What is wrong with an imported theme's file: its markup, then its panel schema. Empty when nothing is. */
function compatFileErrors(path: string, content: string): ThemeError[] {
  const { markup, schema } = splitCompatFile(content)
  try {
    parseCompat(markup)
  } catch (e) {
    /* The markup starts on the file's second line, after <template compat="shopify">. */
    return [{ stage: "template", file: path, line: e instanceof CompatSyntaxError ? e.line + 1 : undefined, message: (e as Error).message }]
  }
  const section = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
  const block = path.match(/^blocks\/(_?[a-z][a-z0-9_-]*)\.storelib$/)
  if (!section && !block) return []
  if (!schema) return [{ stage: "schema", file: path, message: "The <schema> block is missing or is not JSON" }]
  const { shopify: _theirs, ...panel } = schema as Record<string, unknown>
  void _theirs
  const r = section ? validateSectionSchema({ ...panel, type: section[1] }) : validateBlockSchema(panel, { type: block![1] })
  return r.ok === false ? r.errors.map((e) => ({ ...e, file: path })) : []
}

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** A theme file's source, at most. */
export const MAX_FILE_BYTES = 1_000_000

/** No traversal, no absolute path, no null byte, no backslash. */
export function safeThemePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 256 &&
    !path.includes("..") &&
    !path.startsWith("/") &&
    !path.includes("\0") &&
    !path.includes("\\")
  )
}

export type SaveResult =
  | { ok: true; row: FileRow; drafted: boolean; created: boolean }
  | {
      ok: false
      status: number
      error: string
      errors?: ThemeError[]
      conflict?: { updated_at: string; content: string }
    }

/**
 * Every section name already in use in this install, except the file being
 * saved: the theme's own, and this creator's, drafts included.
 *
 * DRAFTS COUNT. A section renamed in the editor and not yet published is
 * still a name somebody has taken, and reading `content` alone would let a
 * second section be given the same one, the clash only appearing when both
 * went live. `sourceMap` takes the draft where there is one and skips a row
 * with nothing in either half.
 */
export async function sectionNamesInUse(db: Db, installId: string, except: string): Promise<Map<string, string>> {
  const withDraft = await db
    .from("store_theme_custom_files")
    .select("path, content, draft_content")
    .eq("install_id", installId)
    .like("path", "%.storelib")
  const rows = withDraft.error
    ? ((await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
    : (withDraft.data ?? [])
  const sources: Record<string, string> = {}
  for (const [p, c] of Object.entries(DEFAULT_THEME_SOURCES)) {
    if (/^sections\/[a-z0-9_-]+\.storelib$/.test(p)) sources[p] = c
  }
  for (const [p, c] of Object.entries(sourceMap(rows as { path: string; content: string; draft_content?: string | null }[]))) {
    if (/^sections\/[a-z0-9_-]+\.storelib$/.test(p)) sources[p] = c
  }
  const out = new Map<string, string>()
  for (const [p, c] of Object.entries(sources)) {
    if (p === except) continue
    const r = compileSection(c, { file: p })
    if (r.ok !== true) continue
    out.set(r.value.schema.name.trim().toLowerCase(), p)
    /* And which file is the site's own header or footer, if one is (chrome.ts, declaredKind). */
    const kind = declaredKind(r.value.schema as unknown as Record<string, unknown>)
    if (kind) out.set(kindKey(kind), p)
  }
  return out
}

/** The key sectionNamesInUse files a declared kind under: no section name starts with a NUL. */
export const kindKey = (kind: string) => `\0kind:${kind}`

/**
 * Compile, check, and save one file into its draft half, recording a
 * version. Nothing half broken is ever stored: a `.storelib` file that does
 * not compile comes back with every error and the line it is on.
 */
export async function saveThemeFile(
  db: Db,
  installId: string,
  path: string,
  content: string,
  opts: { baseUpdatedAt?: string } = {},
): Promise<SaveResult> {
  if (!safeThemePath(path)) return { ok: false, status: 400, error: "Invalid path" }
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: `A file is at most ${MAX_FILE_BYTES / 1_000_000} MB` }
  }

  /**
   * COMPILE BEFORE STORE. A section's type is its FILE NAME, which is what a
   * page stores and what the library is keyed by; the schema's own `type`
   * line is documentation, so a copy saved under a new name saves.
   */
  if (path.endsWith(".storelib") && isCompatSource(content)) {
    /*
      AN IMPORTED SHOPIFY THEME'S FILE (lib/storelib-theme/compat): its markup
      read by the compatible profile's own parser, and the panel's schema
      checked as the builder reads it. Refused with the line, like any file.
    */
    const errors = compatFileErrors(path, content)
    if (errors.length) return { ok: false, status: 422, error: `${path} did not read`, errors }
  } else if (path.endsWith(".storelib") && path.startsWith("blocks/")) {
    /* A theme block: compiled by a block's rules (compile.ts, compileBlock). It is never a header or a footer, and its name is the Add block menu's, not Add section's. */
    const r = compileThemeFile(content, { file: path })
    if (r.ok === false) return { ok: false, status: 422, error: `${path} did not compile`, errors: r.errors }
  } else if (path.endsWith(".storelib")) {
    const r = compileSection(content, { file: path })
    if (r.ok === false) return { ok: false, status: 422, error: `${path} did not compile`, errors: r.errors }
    /**
     * NO TWO SECTIONS SHARE A NAME. The name is what Add Section, the
     * sidebar and the page's own list show, so two called "FAQ" are two rows
     * nobody can tell apart.
     */
    if (/^sections\/[a-z0-9_-]+\.storelib$/.test(path)) {
      /**
       * THE NAMES header AND footer ARE THE BUILT-IN SECTIONS. A header or
       * footer of the creator's own is any other file, designed however they
       * like. Only these two filenames are refused, so they do not shadow
       * the built-in sections every page's chrome settings are stored for.
       */
      const fileType = path.slice("sections/".length, -".storelib".length)
      /* A header or footer of the creator's own is any other file, designed however they like, and placed as the site's header or footer when it says so or reads as one. */
      if ((Object.values(CHROME_TYPES) as string[]).includes(fileType)) {
        return { ok: false, status: 422, error: chromeRefusal(fileType as "header" | "footer") }
      }

      const taken = await sectionNamesInUse(db, installId, path)
      /* A header of the creator's own is one file: a second would be two headers. */
      const kind = declaredKind(r.value.schema as unknown as Record<string, unknown>)
      const other = kind ? taken.get(kindKey(kind)) : undefined
      if (kind && other) return { ok: false, status: 409, error: kindTaken(kind, other) }
      const name = r.value.schema.name.trim()
      const clash = taken.get(name.toLowerCase())
      if (clash) {
        return {
          ok: false,
          status: 409,
          error: `Another section is already called "${name}". It is ${clash}. Give this one a different name in its schema.`,
        }
      }
    }
  }

  const { data: current } = await db
    .from("store_theme_custom_files")
    .select("path, content, updated_at")
    .eq("install_id", installId)
    .eq("path", path)
    .maybeSingle()

  /**
   * HAS IT MOVED SINCE? Only checked when the caller said what it loaded,
   * and refused only when the row is genuinely newer. The answer carries
   * what is there now, so the caller can show both rather than just no.
   */
  if (opts.baseUpdatedAt && current && current.updated_at && current.updated_at !== opts.baseUpdatedAt) {
    return {
      ok: false,
      status: 409,
      error: "This file was saved somewhere else while you were editing it.",
      conflict: { updated_at: current.updated_at, content: current.content },
    }
  }

  /**
   * HOW MANY FILES ONE THEME HOLDS, counted only when this is a new one:
   * editing the two-thousandth file is not what the limit is for.
   */
  if (!current) {
    const { count } = await db
      .from("store_theme_custom_files")
      .select("path", { count: "exact", head: true })
      .eq("install_id", installId)
    if ((count ?? 0) >= LIMITS.filesPerPackage) {
      return { ok: false, status: 413, error: `A theme holds ${LIMITS.filesPerPackage} files. Delete one to add another.` }
    }
  }

  /**
   * SAVED, NOT SHIPPED. Into the draft half, so the live site carries on
   * showing what was published until somebody presses Publish. And kept: a
   * row per version, so a mistake made this morning can be undone.
   */
  const saved = await saveDraft(db, installId, path, content)
  if (saved.ok === false) return { ok: false, status: 500, error: saved.error }
  await recordVersion(db, installId, path, content, "save")
  return { ok: true, row: saved.row, drafted: saved.drafts, created: !current }
}
