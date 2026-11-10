/**
 * ===========================================================================
 *  DESIGN.md AND THEME SETTINGS, KEPT AS ONE (round O, O2)
 * ===========================================================================
 * A website's DESIGN.md (lib/ai-builder/design-contract.ts) and its Theme
 * settings describe the same tokens, so neither may drift:
 *
 *   a save of DESIGN.md      (the code editor, the agent API, a GitHub push)
 *                            writes the tokens it changed into the draft
 *                            Theme settings: `applyDesignMdToSettings`, from
 *                            saveThemeFile. A file that does not read is
 *                            refused with its lines, like a section that
 *                            does not compile.
 *   a save of Theme settings (the panel) writes the DESIGN.md's front matter
 *                            again from them, keeping its Markdown:
 *                            `syncDesignMdFromSettings`, from the settings
 *                            route. Only a site that has a DESIGN.md.
 *
 * Both write the DRAFT halves, so Publish ships them together. A creator's
 * change on either side differs from what the AI last set and is therefore
 * an override the next AI job keeps (design-contract.ts userOverrides).
 */
import type { ThemeError } from "@/lib/storelib-theme/types"
import { DESIGN_CONTRACT_SETTING, DESIGN_MD_PATH, designMdFromSettings, readContractMeta, recordAiTokens, settingsPatchFromDesignMd } from "@/lib/ai-builder/design-contract"
import { recordVersion, saveDraft, type VersionMeta } from "./theme-file-drafts"
import { sanitizeThemeSettings } from "./sanitize-sections"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export { DESIGN_MD_PATH }

async function draftSettings(db: Db, installId: string): Promise<{ exists: boolean; settings: Record<string, unknown> } | null> {
  const { data, error } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  if (error) return null
  const row = (data ?? null) as { settings?: unknown; draft_settings?: unknown } | null
  return { exists: !!row, settings: ((row?.draft_settings ?? row?.settings ?? {}) as Record<string, unknown>) || {} }
}

/**
 * The Theme settings a saved DESIGN.md asks for, written into the draft.
 * Refused (nothing written) when the file does not read.
 */
export async function applyDesignMdToSettings(db: Db, installId: string, text: string, author: VersionMeta["author"] = "creator"): Promise<{ ok: true; notes: string[] } | { ok: false; errors: ThemeError[] }> {
  const read = await draftSettings(db, installId)
  if (!read) return { ok: true, notes: ["Theme settings could not be read just now, so they were not updated from DESIGN.md. Save it again."] }
  const r = settingsPatchFromDesignMd(text, read.settings)
  if (r.ok === false) return { ok: false, errors: r.errors.map((e) => ({ stage: "parse" as const, message: e.message, file: DESIGN_MD_PATH, ...(e.line ? { line: e.line } : {}) })) }
  const notes = [...r.notes]
  if (!Object.keys(r.patch).length) return { ok: true, notes }
  const next: Record<string, unknown> = sanitizeThemeSettings({ ...read.settings, ...r.patch })
  /* The AI's own contract is the AI's values; a creator's file edit stays an override. */
  if (author === "ai") next[DESIGN_CONTRACT_SETTING] = recordAiTokens(next, readContractMeta(read.settings))
  const { error } = read.exists
    ? await db.from("store_theme_settings").update({ draft_settings: next }).eq("install_id", installId)
    : await db.from("store_theme_settings").insert({ install_id: installId, settings: {}, draft_settings: next })
  if (error) return { ok: true, notes: [...notes, "Theme settings could not be updated from DESIGN.md just now. Save it again."] }
  notes.unshift(`Theme settings changed from DESIGN.md: ${r.changed.join(", ")}`)
  return { ok: true, notes }
}

/**
 * DESIGN.md's front matter written again from these Theme settings, when the
 * site has one and it changed. Never fails the settings save that called it.
 */
export async function syncDesignMdFromSettings(db: Db, installId: string, settings: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).eq("path", DESIGN_MD_PATH).maybeSingle()
    if (error || !data) return false
    const row = data as { content: string | null; draft_content: string | null }
    const text = row.draft_content ?? row.content ?? ""
    const next = designMdFromSettings(text, settings)
    if (next === null || next === text) return false
    const saved = await saveDraft(db, installId, DESIGN_MD_PATH, next)
    if (saved.ok === false) return false
    await recordVersion(db, installId, DESIGN_MD_PATH, next, "save", { author: "creator" })
    return true
  } catch {
    return false
  }
}
