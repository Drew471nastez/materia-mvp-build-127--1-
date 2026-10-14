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
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { compatOf, compatValues } from "@/lib/storelib-theme/compat/install"
import {
  SETTINGS_PANEL_FILE,
  SETTINGS_SCHEMA_FILE,
  buildSettingsPanel,
  compatBlockTypes,
  compatFileErrors,
  compatSchemaWords,
  rebuildsSettingsPanel,
  settingsSchemaErrors,
  syncCompatFile,
  type SchemaWords,
} from "@/lib/storelib-theme/compat/schema-sync"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

type TextRow = { path: string; content: string | null; draft_content?: string | null }
const textOf = (r: TextRow | null | undefined) => (r ? (r.draft_content ?? r.content ?? null) : null)

/** The file as the builder has it now (its draft first), or null. */
async function currentText(db: Db, installId: string, path: string): Promise<string | null> {
  const r = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).eq("path", path).maybeSingle()
  return r.error ? null : textOf(r.data as TextRow | null)
}

/**
 * The words of an imported theme's `t:` labels: its default locales, drafts
 * first, with the file being saved in place of its stored copy. Read only
 * when one of its schemas is saved.
 */
async function compatWords(db: Db, installId: string, saving?: { path: string; text: string }): Promise<SchemaWords> {
  const r = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).like("path", "shopify/locales/%default%")
  const files: Record<string, string> = {}
  for (const row of ((r.error ? [] : r.data) ?? []) as TextRow[]) {
    const text = textOf(row)
    if (typeof text === "string") files[row.path] = text
  }
  if (saving) files[saving.path] = saving.text
  return compatSchemaWords(files)
}

/** The theme's block types, so a section that takes them by name keeps them in its panel. */
async function themeBlockTypes(db: Db, installId: string): Promise<string[]> {
  const r = await db.from("store_theme_custom_files").select("path").eq("install_id", installId).like("path", "blocks/%")
  return compatBlockTypes((((r.error ? [] : r.data) ?? []) as { path: string }[]).map((x) => x.path))
}

/**
 * THE THEME SETTINGS PANEL OF AN IMPORTED THEME, MADE AGAIN after its
 * settings_schema.json, or the words its labels are in, was saved: from the
 * drafts, with the theme's own values for its colour schemes, into the
 * panel's own draft, so it is published with the schema it was made from.
 * Nothing for a theme of Storelib's own.
 */
async function rebuildSettingsPanel(db: Db, installId: string, saved: { path: string; text: string }): Promise<string[]> {
  const settingsRow = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const row = settingsRow.data as { settings?: unknown; draft_settings?: unknown } | null
  const settings = row?.draft_settings ?? row?.settings
  if (settingsRow.error || !compatOf(settings)) return []
  const schemaText = saved.path === SETTINGS_SCHEMA_FILE ? saved.text : await currentText(db, installId, SETTINGS_SCHEMA_FILE)
  if (schemaText === null) return []
  const tr = await compatWords(db, installId, saved.path === SETTINGS_SCHEMA_FILE ? undefined : saved)
  const built = buildSettingsPanel(schemaText, compatValues(settings), tr)
  if (built.ok === false) return []
  if ((await currentText(db, installId, SETTINGS_PANEL_FILE)) !== built.panel) {
    const put = await saveDraft(db, installId, SETTINGS_PANEL_FILE, built.panel)
    if (put.ok === false) return [`${SETTINGS_PANEL_FILE}: Theme settings in the builder could not be updated just now. Save the file again.`]
  }
  return built.notes
}

/** The same, after the theme's values changed (a push of config/settings.json): a colour scheme added there gets its colours in the panel. */
export async function refreshCompatSettingsPanel(db: Db, installId: string): Promise<string[]> {
  const schemaText = await currentText(db, installId, SETTINGS_SCHEMA_FILE)
  return schemaText === null ? [] : rebuildSettingsPanel(db, installId, { path: SETTINGS_SCHEMA_FILE, text: schemaText })
}

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
  | {
      ok: true
      row: FileRow
      drafted: boolean
      created: boolean
      /** The text kept, when it is not the text sent: an imported theme's panel made again from its schema (lib/storelib-theme/compat/schema-sync.ts). */
      source?: string
      /** What the builder cannot show of a schema it took: a setting with no control, a block it cannot add. */
      notes?: string[]
    }
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
  sent: string,
  opts: { baseUpdatedAt?: string } = {},
): Promise<SaveResult> {
  let content = sent
  let notes: string[] = []
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

      A section's or block's panel is made again from the theme's own schema
      whenever the schema changed, by the import's own functions, so the
      builder shows the settings the page is drawn with: a new setting gets
      its control, a removed one loses it, blocks and presets follow.
    */
    if (/^(sections|blocks)\//.test(path)) {
      const [previous, tr, blockTypes] = await Promise.all([currentText(db, installId, path), compatWords(db, installId), themeBlockTypes(db, installId)])
      const synced = syncCompatFile(path, content, previous, { tr, blockTypes })
      if (synced.ok === false) return { ok: false, status: 422, error: `${path} did not read`, errors: synced.errors }
      content = synced.source
      notes = synced.notes
    }
    const errors = compatFileErrors(path, content)
    if (errors.length) return { ok: false, status: 422, error: `${path} did not read`, errors }
  } else if (path === SETTINGS_SCHEMA_FILE) {
    /* An imported theme's settings are a list of groups; anything else would take every theme setting off the page. */
    const errors = settingsSchemaErrors(content)
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
  if (rebuildsSettingsPanel(path)) notes = [...notes, ...(await rebuildSettingsPanel(db, installId, { path, text: content }))]
  return {
    ok: true,
    row: saved.row,
    drafted: saved.drafts,
    created: !current,
    ...(content !== sent ? { source: content } : {}),
    ...(notes.length ? { notes } : {}),
  }
}
