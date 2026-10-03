/**
 * ===========================================================================
 *  WHAT A CONNECTED AGENT CAN DO TO A SITE
 * ===========================================================================
 * Five things, and the same five whether the agent arrives over MCP
 * (app/api/mcp) or plain HTTP (app/api/agent/v1):
 *
 *   site      what the website is: brand, look, pages, published products
 *             (./site-brief.ts, what a visitor could already see)
 *   list      the theme's files, marking which are the creator's own
 *   read      one file, the draft where there is one
 *   compile   check a file without saving it, for the agent's own loop
 *   write     save a section file: compiled, checked and saved as a DRAFT
 *
 * WHAT IT CANNOT DO, on purpose:
 *   - write anywhere but `sections/<type>.storelib`. Templates, config and
 *     layout decide what every page is and are the creator's to change;
 *   - change a built-in section. Those are the library every Storelib site
 *     stands on; an agent writes its own version as a new section instead
 *     (./protected.ts);
 *   - delete or rename anything;
 *   - publish. Every write is a draft, exactly as a save in the code editor
 *     is, and nothing reaches a visitor until the creator presses Publish;
 *   - reach another site, or anything private: orders, buyers, subscribers
 *     and the account are not on this list at all. Products appear only as
 *     the published cards a visitor sees.
 */
import { compileThemeFile } from "@/lib/storelib-theme/storelib/compile"
import { validateSection } from "@/lib/storelib-ai/validate"
import { ENGINE_VERSION, SECTION_SCHEMA_VERSION, type ThemeError } from "@/lib/storelib-theme/types"
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { safeThemePath, saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import type { AgentIdentity } from "./tokens"
import { AGENT_WRITABLE, agentMayWrite } from "./protected"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export const DOCS_URL = "https://storelib.com/developers/ai"
export const FULL_TEXT_URL = "https://storelib.com/llms-full.txt"

/** The shape of a section file. Which ones an agent may write is ./protected.ts. */
export const WRITABLE = AGENT_WRITABLE

export function canWrite(path: string): boolean {
  return agentMayWrite(path).ok
}

export type OpResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; errors?: ThemeError[] }

export interface FileEntry {
  path: string
  /** "yours" when the creator (or an agent) saved it; "theme" when it is the shipped file. */
  origin: "yours" | "theme"
  /** Whether an agent may write it. Built-in sections are read-only to agents. */
  writable: boolean
  /** Saved and not yet published. */
  unpublished: boolean
}

export async function listFiles(db: Db, installId: string): Promise<OpResult<{
  framework: { engine: number; schema: number }
  docs: string
  writable: string
  files: FileEntry[]
}>> {
  const { data, error } = await db
    .from("store_theme_custom_files")
    .select("path, content, draft_content")
    .eq("install_id", installId)
  if (error) return { ok: false, status: 500, error: "Could not read the theme's files" }

  const files = new Map<string, FileEntry>()
  for (const path of Object.keys(DEFAULT_THEME_SOURCES)) files.set(path, { path, origin: "theme", writable: false, unpublished: false })
  for (const row of (data ?? []) as { path: string; content: string; draft_content?: string | null }[]) {
    const source = editorContent(row)
    if (typeof source !== "string" || source.trim() === "") continue
    files.set(row.path, {
      path: row.path,
      origin: "yours",
      writable: agentMayWrite(row.path).ok,
      unpublished: typeof row.draft_content === "string" && row.draft_content !== row.content,
    })
  }
  return {
    ok: true,
    value: {
      framework: { engine: ENGINE_VERSION, schema: SECTION_SCHEMA_VERSION },
      docs: DOCS_URL,
      writable: "sections/<type>.storelib, except the built-in sections (writable: false); write a new section instead",
      files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    },
  }
}

export async function readFile(db: Db, installId: string, path: string): Promise<OpResult<{
  path: string
  source: string
  origin: "yours" | "theme"
  updated_at: string | null
}>> {
  if (!safeThemePath(path)) return { ok: false, status: 400, error: "Invalid path" }
  const { data, error } = await db
    .from("store_theme_custom_files")
    .select("path, content, draft_content, updated_at")
    .eq("install_id", installId)
    .eq("path", path)
    .maybeSingle()
  if (error) return { ok: false, status: 500, error: "Could not read the file" }
  if (data) {
    const source = editorContent(data)
    if (typeof source === "string" && source.trim() !== "") {
      return { ok: true, value: { path, source, origin: "yours", updated_at: data.updated_at ?? null } }
    }
  }
  const shipped = (DEFAULT_THEME_SOURCES as Record<string, string>)[path]
  if (typeof shipped === "string") return { ok: true, value: { path, source: shipped, origin: "theme", updated_at: null } }
  return { ok: false, status: 404, error: `There is no ${path} in this theme` }
}

/**
 * What a refusal may say outside Storelib. A 4xx is written for the person
 * reading it (a path, a size, a name clash) and goes out as it is. A 5xx
 * carries the database's own words, which name tables and constraints, and
 * those stay in here.
 */
export function publicError(status: number, error: string): string {
  return status >= 500 ? "Could not save the file just now. Try again." : error
}

/**
 * Every section file's source, as the builder would open it, for the paths
 * asked (or all of them), in ONE read. Syncing a site to GitHub used to list
 * the files and then read each one again on its own, a query per section.
 */
export async function sectionSources(db: Db, installId: string, paths?: string[]): Promise<Map<string, string>> {
  const wanted = paths ? paths.filter((p) => WRITABLE.test(p)) : null
  const out = new Map<string, string>()
  for (const [path, source] of Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)) {
    if (WRITABLE.test(path) && (!wanted || wanted.includes(path))) out.set(path, source)
  }
  if (wanted && wanted.length === 0) return out
  let q = db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId)
  q = wanted ? q.in("path", wanted) : q.like("path", "sections/%")
  const { data, error } = await q
  if (error) throw new Error("Could not read the theme's files")
  for (const row of (data ?? []) as { path: string; content: string; draft_content?: string | null }[]) {
    if (!WRITABLE.test(row.path)) continue
    const source = editorContent(row)
    if (typeof source === "string" && source.trim() !== "") out.set(row.path, source)
  }
  return out
}

/** Compile without saving: what the code editor's save would say, and nothing stored. */
export function compileOnly(path: string, source: string): OpResult<{ path: string; warnings: ThemeError[] }> {
  if (!safeThemePath(path) || !path.endsWith(".storelib")) {
    return { ok: false, status: 400, error: "Compile takes a .storelib path, such as sections/price_table.storelib" }
  }
  const r = compileThemeFile(source, { file: path })
  if (r.ok === false) return { ok: false, status: 422, error: `${path} did not compile`, errors: r.errors }
  return { ok: true, value: { path, warnings: r.warnings ?? [] } }
}

/**
 * Save a section file for this connection. Compiled first, held to every
 * rule the code editor's save is held to, saved as a draft, and written to
 * the activity log so an open builder can put a new section on the page.
 */
export async function writeSection(
  db: Db,
  who: AgentIdentity,
  path: string,
  source: string,
  baseUpdatedAt?: string,
  /** placed: the agent put it on a page itself, so an open builder must not place it again. */
  log: { placed?: boolean } = {},
): Promise<OpResult<{ path: string; type: string; created: boolean; drafted: boolean; updated_at: string | null }>> {
  const allowed = agentMayWrite(path)
  if (allowed.ok === false) return { ok: false, status: allowed.status, error: allowed.error }
  /* Every agent write, over MCP or HTTP, meets the same gate: it compiles,
     passes the quality checks, and plugs into the theme like a native section
     (lib/storelib-ai/integration.ts). A file that fails is not saved. */
  const checked = validateSection(source, { path, expectType: path.replace(/^(sections|blocks)\//, "").replace(/\.storelib$/, ""), strict: true })
  if (checked.ok === false && checked.reason === "quality") return { ok: false, status: 422, error: `${path} was not saved.\n${checked.feedback}` }
  const saved = await saveThemeFile(db, who.installId, path, source, { baseUpdatedAt })
  if (saved.ok === false) return { ok: false, status: saved.status, error: publicError(saved.status, saved.error), errors: saved.errors }

  /* The log is how an open builder hears about it. Never allowed to fail the
     write it records: the file is saved either way. */
  try {
    const row = {
      install_id: who.installId,
      token_id: who.tokenId,
      agent_name: who.name,
      path,
      action: saved.created ? "created" : "updated",
    }
    /* `detail` arrived with RUN_AGENT_MCP.sql; without it the row is written as it always was. */
    const first = log.placed ? await db.from("theme_agent_activity").insert({ ...row, detail: { placed: true } }) : await db.from("theme_agent_activity").insert(row)
    if (first?.error && log.placed) await db.from("theme_agent_activity").insert(row)
  } catch {
    /* the table may not exist yet; the save stands */
  }

  const type = path.replace(/^(sections|blocks)\//, "").replace(/\.storelib$/, "")
  return {
    ok: true,
    value: { path, type, created: saved.created, drafted: saved.drafted, updated_at: saved.row.updated_at ?? null },
  }
}
