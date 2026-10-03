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
import { compileSection } from "@/lib/storelib-theme"
import { CHROME_TYPES, chromeRefusal, chromeRoleOf } from "@/lib/storelib-theme/chrome"
import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { recordVersion, saveDraft, sourceMap, type FileRow } from "./theme-file-drafts"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"

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
    if (r.ok === true) out.set(r.value.schema.name.trim().toLowerCase(), p)
  }
  return out
}

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
  if (path.endsWith(".storelib")) {
    const r = compileSection(content, { file: path })
    if (r.ok === false) return { ok: false, status: 422, error: `${path} did not compile`, errors: r.errors }
    /**
     * NO TWO SECTIONS SHARE A NAME. The name is what Add Section, the
     * sidebar and the page's own list show, so two called "FAQ" are two rows
     * nobody can tell apart.
     */
    if (/^sections\/[a-z0-9_-]+\.storelib$/.test(path)) {
      /**
       * NOT A SECOND HEADER OR FOOTER. The site has one of each, built in,
       * and a file that is another one is a copy without the cart drawer,
       * the search, the menus or the sticky behaviour, put in the page body
       * under the real one. Refused for everybody, with what to change
       * instead: lib/storelib-theme/chrome.ts.
       */
      const fileType = path.slice("sections/".length, -".storelib".length)
      const parsed = parseStorelib(content, path)
      const role =
        (Object.values(CHROME_TYPES) as string[]).includes(fileType)
          ? (fileType as "header" | "footer")
          : chromeRoleOf({
              schema: r.value.schema as unknown as Record<string, unknown>,
              type: fileType,
              template: parsed.ok ? parsed.value.template.text : undefined,
            })
      if (role) return { ok: false, status: 422, error: chromeRefusal(role) }

      const taken = await sectionNamesInUse(db, installId, path)
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
