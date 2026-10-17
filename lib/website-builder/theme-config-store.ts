/**
 * ===========================================================================
 *  THE THEME SETTINGS FILES, AGAINST WHAT IS STORED
 * ===========================================================================
 * lib/storelib-theme/theme-config.ts reads the two files; this is where they
 * meet the install's rows. Every door a file comes through uses it: the code
 * editor's save, an agent's write over MCP or the agent API, Storelib AI's
 * run and a GitHub push all go through saveThemeFile
 * (./save-theme-file.ts), and the code editor's read of
 * config/settings_data.json comes here.
 *
 *   config/settings_schema.json   a theme file like any other, kept as a
 *                                 draft with its history. Once kept, the
 *                                 defaults it adds or moves are written
 *                                 under the values nobody set yet, so the
 *                                 live site, which reads only the values,
 *                                 draws them too.
 *   config/settings_data.json     the install's draft theme settings. What
 *                                 the file sets is set, what it clears goes
 *                                 back to its default, what it leaves out
 *                                 stays as it is. The values before and after
 *                                 are kept in the file's history, so a write
 *                                 can be undone.
 */
import { recordVersion, type FileRow } from "./theme-file-drafts"
import {
  THEME_DATA_FILE,
  THEME_SCHEMA_FILE,
  mergeSettingsData,
  readSettingsData,
  schemaDefaults,
  settingsDataText,
  themeSettingsGroupsFor,
} from "@/lib/storelib-theme/theme-config"
import type { ThemeError } from "@/lib/storelib-theme/types"
import { sanitizeThemeSettings } from "./sanitize-sections"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The theme's config/settings_schema.json as the builder has it (its draft first), or null when the theme has none. */
export async function readThemeSchemaText(db: Db, installId: string): Promise<string | null> {
  try {
    const r = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).eq("path", THEME_SCHEMA_FILE).maybeSingle()
    if (r.error || !r.data) return null
    const text = (r.data as { draft_content?: string | null; content?: string | null }).draft_content ?? (r.data as { content?: string | null }).content
    return typeof text === "string" && text.trim() !== "" ? text : null
  } catch {
    return null
  }
}

type SettingsRow = { settings?: Record<string, unknown> | null; draft_settings?: Record<string, unknown> | null; updated_at?: string | null }

/** The values as the builder has them: the draft where there is one. */
export async function readThemeValues(db: Db, installId: string): Promise<{ ok: boolean; values: Record<string, unknown>; row: SettingsRow | null }> {
  const r = await db.from("store_theme_settings").select("settings, draft_settings, updated_at").eq("install_id", installId).maybeSingle()
  if (r.error) {
    /* Without updated_at on an older database, the two columns alone. */
    const plain = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
    if (plain.error) return { ok: false, values: {}, row: null }
    const row = (plain.data ?? null) as SettingsRow | null
    return { ok: true, row, values: { ...(row?.draft_settings ?? row?.settings ?? {}) } }
  }
  const row = (r.data ?? null) as SettingsRow | null
  return { ok: true, row, values: { ...(row?.draft_settings ?? row?.settings ?? {}) } }
}

/** Into the draft half, so the live site keeps what was published until Publish. */
export async function writeDraftValues(db: Db, installId: string, values: Record<string, unknown>): Promise<boolean> {
  const next = sanitizeThemeSettings(values)
  const upd = await db.from("store_theme_settings").update({ draft_settings: next }).eq("install_id", installId).select("install_id")
  if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) return true
  if (upd.error) return false
  const ins = await db.from("store_theme_settings").insert({ install_id: installId, settings: {}, draft_settings: next })
  return !ins.error
}

/** config/settings_data.json as the code editor and an agent read it: the values, now. */
export async function settingsDataFor(db: Db, installId: string): Promise<{ text: string; updated_at: string | null } | null> {
  const read = await readThemeValues(db, installId)
  if (!read.ok) return null
  return { text: settingsDataText(read.values), updated_at: read.row?.updated_at ?? null }
}

/**
 * The defaults a theme's schema file adds or moves, written under the values
 * nobody set. Never over a value somebody chose. Says how many it wrote.
 */
export async function fillSchemaDefaults(db: Db, installId: string, schemaText: string | null): Promise<number> {
  const groups = themeSettingsGroupsFor(schemaText)
  const read = await readThemeValues(db, installId)
  if (!read.ok) return 0
  const extra = schemaDefaults(groups, read.values)
  const n = Object.keys(extra).length
  if (n === 0) return 0
  return (await writeDraftValues(db, installId, { ...read.values, ...extra })) ? n : 0
}

export type DataSave =
  | { ok: true; row: FileRow; text: string; set: string[]; cleared: string[] }
  | { ok: false; status: number; error: string; errors?: ThemeError[] }

/** A config/settings_data.json written by someone, into the install's draft values. */
export async function saveSettingsData(db: Db, installId: string, text: string): Promise<DataSave> {
  const schemaText = await readThemeSchemaText(db, installId)
  const read = readSettingsData(text, themeSettingsGroupsFor(schemaText))
  if (read.ok === false) return { ok: false, status: 422, error: `${THEME_DATA_FILE} did not read`, errors: (read as { errors: ThemeError[] }).errors }
  const taken = read as { values: Record<string, unknown>; cleared: string[] }
  const before = await readThemeValues(db, installId)
  if (!before.ok) return { ok: false, status: 503, error: "The theme settings could not be read just now. Save again." }
  const next = mergeSettingsData(before.values, taken)
  const beforeText = settingsDataText(before.values)
  const afterText = settingsDataText(sanitizeThemeSettings(next))
  if (beforeText !== afterText) {
    /* What it was, then what it is: either can be put back from History. */
    await recordVersion(db, installId, THEME_DATA_FILE, beforeText, "save")
    if (!(await writeDraftValues(db, installId, next))) return { ok: false, status: 500, error: "The theme settings could not be saved just now. Save again." }
    await recordVersion(db, installId, THEME_DATA_FILE, afterText, "save")
  }
  const changed = Object.keys(taken.values).filter((k) => JSON.stringify(before.values[k]) !== JSON.stringify(taken.values[k]))
  return {
    ok: true,
    text: afterText,
    row: { path: THEME_DATA_FILE, content: afterText, draft_content: afterText, updated_at: new Date().toISOString() },
    set: changed,
    cleared: taken.cleared.filter((k) => before.values[k] !== undefined),
  }
}
