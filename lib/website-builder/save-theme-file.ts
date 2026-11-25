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
import { latestAuthor, recordVersion, saveDraft, sourceMap, type FileRow, type VersionMeta } from "./theme-file-drafts"
import { fileVersion } from "@/lib/ai-builder/file-version"
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
import { THEME_DATA_FILE, THEME_SCHEMA_FILE, readThemeSettingsSchema } from "@/lib/storelib-theme/theme-config"
import { fillSchemaDefaults, saveSettingsData } from "./theme-config-store"
import { DESIGN_MD_PATH, applyDesignMdToSettings } from "./design-md-sync"
import { parseDesignMd } from "@/lib/storelib-ai/direction/design-md"
import { fileCols, resolveRef, resolveRefs } from "@/lib/website-builder/theme-file-refs"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

type TextRow = { path: string; content: string | null; draft_content?: string | null }
const textOf = (r: TextRow | null | undefined) => (r ? (r.draft_content ?? r.content ?? null) : null)

/** The file as the builder has it now (its draft first), or null. */
async function currentText(db: Db, installId: string, path: string): Promise<string | null> {
  const r = await db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId).eq("path", path).maybeSingle()
  return r.error ? null : textOf(await resolveRef(r.data as TextRow | null))
}

/**
 * The words of an imported theme's `t:` labels: its default locales, drafts
 * first, with the file being saved in place of its stored copy. Read only
 * when one of its schemas is saved.
 */
async function compatWords(db: Db, installId: string, saving?: { path: string; text: string }): Promise<SchemaWords> {
  const r = await db.from("store_theme_custom_files").select(await fileCols("path, content, draft_content")).eq("install_id", installId).like("path", "shopify/locales/%default%")
  const files: Record<string, string> = {}
  for (const row of await resolveRefs(((r.error ? [] : r.data) ?? []) as TextRow[])) {
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
      /** What is there now (the draft, which is what the writer would have seen), and who wrote it when that is known. */
      conflict?: { updated_at: string; content: string; version?: string; author?: string | null }
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
    .select(await fileCols("path, content, draft_content"))
    .eq("install_id", installId)
    .like("path", "%.storelib")
  const rows = await resolveRefs(withDraft.error
    ? ((await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).like("path", "%.storelib")).data ?? [])
    : (withDraft.data ?? []))
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
  opts: {
    baseUpdatedAt?: string
    /**
     * sha256 of the draft text the writer read (ProjectFileWrite in
     * lib/ai-builder/types.ts), or null for "a file I believe is new".
     * Undefined skips the check. A mismatch is a 409 with what is there now.
     */
    expectedVersion?: string | null
    /** Who is writing, for the version row: the code editor is "creator", the AI "ai", a GitHub push "import". */
    author?: VersionMeta["author"]
    jobId?: string | null
  } = {},
): Promise<SaveResult> {
  let content = sent
  let notes: string[] = []
  if (!safeThemePath(path)) return { ok: false, status: 400, error: "Invalid path" }
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: `A file is at most ${MAX_FILE_BYTES / 1_000_000} MB` }
  }

  /**
   * THE THEME'S VALUES ARE NOT A FILE. config/settings_data.json is a view of
   * the install's theme settings (lib/storelib-theme/theme-config.ts): a
   * write to it writes them, so the sidebar and the file are one copy.
   */
  if (path === THEME_DATA_FILE) {
    const data = await saveSettingsData(db, installId, content)
    if (data.ok === false) return data as Extract<SaveResult, { ok: false }>
    const kept = data as { row: FileRow; text: string; set: string[]; cleared: string[] }
    return {
      ok: true,
      row: kept.row,
      drafted: true,
      created: false,
      ...(kept.text !== sent ? { source: kept.text } : {}),
      notes: [kept.set.length || kept.cleared.length ? `Theme settings changed: ${[...kept.set, ...kept.cleared.map((k) => `${k} (back to its default)`)].join(", ")}` : "Theme settings already had these values"],
    }
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
  } else if (path === DESIGN_MD_PATH) {
    /* Round O (O2): the site's design contract. Its tokens are Theme settings, so a file that does not read is refused with its lines. */
    const read = parseDesignMd(content)
    if (read.ok === false) return { ok: false, status: 422, error: `${path} did not read`, errors: (read as { errors: { message: string; line?: number }[] }).errors.map((e) => ({ stage: "parse" as const, message: e.message, file: path, ...(e.line ? { line: e.line } : {}) })) }
  } else if (path === THEME_SCHEMA_FILE) {
    /* The theme's own Theme settings, over Storelib's: every problem on its line, nothing half read kept. */
    const read = readThemeSettingsSchema(content)
    if (read.ok === false) return { ok: false, status: 422, error: `${path} did not read`, errors: (read as { errors: ThemeError[] }).errors }
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

  const withDraftRead = await db
    .from("store_theme_custom_files")
    .select(await fileCols("path, content, draft_content, updated_at"))
    .eq("install_id", installId)
    .eq("path", path)
    .maybeSingle()
  const { data: currentRead } = withDraftRead.error
    ? await db.from("store_theme_custom_files").select("path, content, updated_at").eq("install_id", installId).eq("path", path).maybeSingle()
    : withDraftRead
  /* Round 27: a reference's text, so a save compares and records what the file said (theme-file-refs.ts). */
  const current = await resolveRef(currentRead as { path: string; content: string; draft_content?: string | null; updated_at?: string | null } | null)
  /* The text a writer would have read: the draft where there is one (theme-file-drafts.ts editorContent). */
  const draftText: string | null = current ? ((current as { draft_content?: string | null }).draft_content ?? current.content ?? "") : null

  /**
   * HAS IT MOVED SINCE? Checked when the caller said what it loaded: the
   * row's time (the code editor), or the version of the text it read (the
   * agent and the builder, ProjectFileWrite.expectedVersion), and refused
   * only when the file is genuinely different. The answer carries what is
   * there now (the draft, not what is live: it is what the other writer
   * wrote) and who wrote it, so the caller can offer both rather than just no.
   */
  const movedByTime = !!(opts.baseUpdatedAt && current && current.updated_at && current.updated_at !== opts.baseUpdatedAt)
  const movedByVersion =
    opts.expectedVersion !== undefined &&
    (opts.expectedVersion === null ? draftText !== null && draftText !== "" : draftText === null || fileVersion(draftText) !== opts.expectedVersion)
  if ((movedByTime || movedByVersion) && !(draftText !== null && draftText === content)) {
    return {
      ok: false,
      status: 409,
      error: "This file was saved somewhere else while you were editing it.",
      conflict: { updated_at: current?.updated_at ?? "", content: draftText ?? "", version: draftText === null ? undefined : fileVersion(draftText), author: await latestAuthor(db, installId, path) },
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
  await recordVersion(db, installId, path, content, "save", { author: opts.author, jobId: opts.jobId })
  if (rebuildsSettingsPanel(path)) notes = [...notes, ...(await rebuildSettingsPanel(db, installId, { path, text: content }))]
  /* Round O (O2): what DESIGN.md's tokens say, into the draft Theme settings (lib/website-builder/design-md-sync.ts). */
  /* The AI's own writes are the engine's: it sets the settings with set_tokens and writes the file to follow them (lib/ai-builder/agent/direction.ts). */
  if (path === DESIGN_MD_PATH && opts.author !== "ai") {
    const applied = await applyDesignMdToSettings(db, installId, content, opts.author ?? "creator")
    if (applied.ok) notes = [...notes, ...applied.notes]
  }
  /* A setting the file added, or a default it moved, has its default under the values nobody set, so the live site draws it too. */
  if (path === THEME_SCHEMA_FILE) await fillSchemaDefaults(db, installId, content)
  return {
    ok: true,
    row: saved.row,
    drafted: saved.drafts,
    created: !current,
    ...(content !== sent ? { source: content } : {}),
    ...(notes.length ? { notes } : {}),
  }
}
