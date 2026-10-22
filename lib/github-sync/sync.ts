/**
 * ===========================================================================
 *  A SITE AND ITS REPOSITORY, BOTH DIRECTIONS
 * ===========================================================================
 *   exportSite   Storelib → GitHub. The WHOLE theme (./layout.ts): settings,
 *                pages, every section and block, built-in ones too, and an
 *                imported theme's own files with its fonts and pictures, plus
 *                README.md, AGENTS.md and CLAUDE.md, in one commit that holds
 *                only what GitHub does not already have. Done when a
 *                repository is picked, and again on Push.
 *   applyPush    GitHub → Storelib. A push to the linked branch: every
 *                changed file the theme reads is checked and saved as a draft
 *                through the same saves the builder uses, and logged so an
 *                open builder shows it. One bad file is reported, on the
 *                commit and in the builder, and the others are still taken.
 *   pullNow      the same for every file on the branch, now.
 *
 * NEVER IN A CIRCLE. A push Storelib made (its bot, or every commit carrying
 * COMMIT_MARKER) is not read back; a push whose head is the commit Storelib
 * last wrote is not read back; and a file whose bytes are the ones Storelib
 * last sent or took (sync_state.files) is unchanged by definition.
 *
 * WHEN BOTH CHANGED. A file the builder changed since the last sync and a
 * push also changed: the push wins (it is the newer write), the activity list
 * says so in words, and nothing is lost: a .storelib file's earlier text is
 * in its History, and a backup of the site is taken before pages or settings
 * are written.
 */
import "server-only"
import { validateSection } from "@/lib/storelib-ai/validate"
import { refreshCompatSettingsPanel, saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { publicError } from "@/lib/agent-access/operations"
import { repoMayWrite } from "@/lib/agent-access/protected"
import { fitToThemeFormat, folderExamples } from "./format"
import { SETTINGS_PANEL_FILE, SETTINGS_SCHEMA_FILE } from "@/lib/storelib-theme/compat/schema-sync"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { parseCompat } from "@/lib/storelib-theme/compat/parser"
import { CompatSyntaxError } from "@/lib/storelib-theme/compat/lexer"
import { sanitizeSections, sanitizeThemeSettings, readOwnSectionFields } from "@/lib/website-builder/sanitize-sections"
import { blockTreeProblem } from "@/lib/website-builder/block-tree"
import { isPageKey } from "@/lib/website-builder/site-pages"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { takeBackup } from "@/lib/website-builder/backups"
import { LIMITS } from "@/lib/storelib-theme/types"
import type { SectionInstance } from "@/lib/website-builder/types"
import {
  CLAUDE_MD,
  COMMIT_MARKER,
  MAX_FILES_PER_PUSH,
  agentsGuide,
  branchOf,
  changedFiles,
  changedFromCompare,
  isOwnPush,
  pushedBy,
  statusLine,
  type PushPayload,
} from "./core"
import { GitHubError, blobAt, commentOnCommit, commitChanges, compareFiles, compareStatus, installationToken, listTree, noteOnCommit, setStatus, treeAt, type FileChange, type GitHubConfig } from "./github"
import { GENERATED, PLATFORM_SETTINGS_PATH, SETTINGS_DATA_PATH, SETTINGS_PATH, gitBlobSha, jsonError, mergePages, platformContext, readsBack, repoReadme, roleOf, themeFiles, type RepoFile, type ThemeSnapshot } from "./layout"
import { checkPlatformValues, withoutPlatformDefaults } from "@/lib/storelib-theme/platform-settings"
import { writeStoreMenus } from "@/lib/website-builder/store-menus-server"
import { cleanMenus } from "@/lib/storelib-theme/values"
import { explainFailure, failureLine } from "./errors"
import { readSnapshot, SnapshotError } from "./snapshot"
import { recordEvent } from "./events"
import { fillSchemaDefaults, readThemeSchemaText, saveSettingsData } from "@/lib/website-builder/theme-config-store"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Files one Pull takes, at most; it carries on where it stopped when pressed again. */
const MAX_FILES_PER_PULL = 3000
/** Work stops taking new files after this, inside the function's minute; the rest is said, and Pull finishes it. */
const TIME_BUDGET_MS = 45_000

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com").replace(/\/+$/, "")

/**
 * What kind of problem a file had, so the builder can say it in plain words
 * and offer the one button that fixes it (lib/github-sync/editor-status.ts).
 * `error` stays the developer's line, for the commit comment.
 */
export type FileProblemKind = "invalid" | "wrong-kind" | "built-in" | "theme-settings" | "binary" | "too-large" | "not-saved" | "unreadable" | "page"

export interface FileProblem {
  path: string
  error: string
  kind?: FileProblemKind
  line?: number
}

export interface FileNote {
  path: string
  note: string
}

/** What the last sync did, kept on the link so the builder can show it file by file. */
export interface LastSync {
  at: string
  direction: "to_github" | "from_github"
  commit: string | null
  ok: boolean
  saved: string[]
  failed: FileProblem[]
  notes: FileNote[]
  skipped?: { path: string; reason: string }[]
  /** For a sync that failed as a whole: which kind (./errors.ts). */
  problem?: string
  /** When the commit this sync applied was made: a push whose head is older is not applied. */
  head_at?: string | null
  /** Theme files a push changed that were not read (too many in one push, or out of time): Pull takes them. */
  unread?: number
}

export interface SyncState {
  /** Path in the theme to the blob GitHub and Storelib last agreed on. */
  files?: Record<string, string>
  last?: LastSync
  /** The newest push to another branch of the linked repository, which Storelib does not read. */
  ignored?: { branch: string; at: string; commit: string | null }
}

export interface GitHubLink {
  install_id: string
  creator_id: string
  installation_id: number
  account_login: string
  repo_id: number | null
  repo_full_name: string | null
  branch: string | null
  root_path: string
  last_synced_sha: string | null
  last_synced_at: string | null
  last_error: string | null
  push_on_save?: boolean
  pull_on_push?: boolean
  sync_state?: SyncState | null
}

/**
 * A failure written for the creator to read. Anything else thrown in here
 * (a network error, a database's own message) is not shown to them as it
 * is: see `explain` in the GitHub route.
 */
export class SyncError extends Error {}

export function editorUrl(installId: string) {
  return `${APP_URL}/website-builder/editor/${installId}`
}

/** Writes to the link, and without sync_state on a database that has not run part 131 yet. */
async function saveLink(db: Db, installId: string, patch: Record<string, unknown>) {
  const now = new Date().toISOString()
  const r = await db.from("theme_github_links").update({ ...patch, updated_at: now }).eq("install_id", installId)
  if (r?.error && "sync_state" in patch && /sync_state/.test(r.error.message ?? "")) {
    const { sync_state: _s, ...rest } = patch
    void _s
    await db.from("theme_github_links").update({ ...rest, updated_at: now }).eq("install_id", installId)
  }
}

/* ── Storelib → GitHub ─────────────────────────────────────────────────── */

async function storageMedia(url: string, maxBytes: number): Promise<Uint8Array | null> {
  const { fetchPublic } = await import("@/lib/api/public-fetch")
  let trust: string[] = []
  try {
    trust = process.env.NEXT_PUBLIC_SUPABASE_URL ? [new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin] : []
  } catch {
    trust = []
  }
  const res = await fetchPublic(url, { maxBytes, timeoutMs: 20_000, trustOrigins: trust })
  if (!res.ok) return null
  const buf = new Uint8Array(await res.arrayBuffer())
  return buf.byteLength > maxBytes ? null : buf
}

/** The theme as the repository holds it, guides included. Pure past the read. */
export function repoFilesFor(snap: ThemeSnapshot, link: Pick<GitHubLink, "branch" | "root_path">) {
  /* Each folder's format shown with one of this theme's own files (./format.ts). */
  /*
    A Storelib theme's examples are Storelib's own built-ins, which do not
    change with a push, so a new section in the repository does not rewrite
    AGENTS.md (and send a commit back) by being the shortest file. An
    imported theme has no built-ins: its own files are the examples.
  */
  const source = !snap.compat && Object.keys(snap.defaults).length ? snap.defaults : { ...snap.defaults, ...snap.files }
  /* A page changes with every edit in the builder, so the page example is a fixed one (core.ts formatGuide), not this site's. */
  const examples = folderExamples(source, snap.compat)
  return themeFiles(snap, ({ overrides, skipped }) => ({
    readme: repoReadme({ siteName: snap.name, branch: link.branch ?? "main", root: link.root_path, compat: snap.compat, overrides, skipped }),
    agents: agentsGuide({ siteName: snap.name, branch: link.branch ?? "main", root: link.root_path, kind: snap.compat ? "shopify" : "storelib", examples }),
    claude: CLAUDE_MD,
  }))
}

function changeOf(root: string, f: RepoFile): FileChange {
  return f.bytes ? { path: `${root}${f.path}`, bytes: f.bytes } : { path: `${root}${f.path}`, content: f.text ?? "" }
}

/** Storelib → GitHub, in one commit. Returns the commit, or null when the repository already matched. */
export async function exportSite(
  db: Db,
  cfg: GitHubConfig,
  link: GitHubLink,
  siteName: string,
  /* fetchMedia null: pictures are not fetched (an export after Publish; the repository keeps the ones it has). reason: what started it, for the activity list. */
  deps: { fetchMedia?: ((url: string, maxBytes: number) => Promise<Uint8Array | null>) | null; reason?: string } = {},
): Promise<string | null> {
  if (!link.repo_full_name || !link.branch) throw new SyncError("Pick a repository first")
  let snap: ThemeSnapshot
  try {
    snap = await readSnapshot(db, link.install_id, { name: siteName, creatorId: link.creator_id, fetchMedia: deps.fetchMedia === null ? undefined : (deps.fetchMedia ?? storageMedia) })
  } catch (e) {
    const line = e instanceof SnapshotError ? e.message : "Could not read this website. Try again."
    await saveLink(db, link.install_id, { last_error: `Sending to GitHub: ${line}` })
    await recordEvent(db, link.install_id, { direction: "to_github", ok: false, summary: `${deps.reason ? `${deps.reason}, not sent` : "Not sent"}: ${line}` })
    throw new SyncError(line)
  }
  const { files, skipped, overrides } = repoFilesFor(snap, link)
  const at = new Date().toISOString()
  try {
    const token = await installationToken(cfg, link.installation_id)
    const r = await commitChanges(
      token,
      link.repo_full_name,
      link.branch,
      files.map((f) => changeOf(link.root_path, f)),
      `Storelib: ${siteName}, the whole theme\n\n${COMMIT_MARKER}`,
    )
    const shas: Record<string, string> = {}
    for (const f of files) shas[f.path] = gitBlobSha(f.bytes ?? f.text ?? "")
    const last: LastSync = { at, direction: "to_github", commit: r.sha, ok: true, saved: [], failed: [], notes: [], skipped, head_at: r.sha ? at : (link.sync_state?.last?.head_at ?? null) }
    await saveLink(db, link.install_id, {
      last_synced_sha: r.sha ?? link.last_synced_sha,
      last_synced_at: at,
      last_error: null,
      sync_state: { files: shas, last },
    })
    const theme = `${files.length} files${overrides.length ? `, ${overrides.length} built-in edited here` : ""}`
    await recordEvent(db, link.install_id, {
      direction: "to_github",
      ok: true,
      summary: (deps.reason ? `${deps.reason}. ` : "") + (r.sha
        ? `Sent the whole theme to GitHub (${theme}): ${r.written} changed${r.removed ? `, ${r.removed} removed` : ""}${skipped.length ? `. ${skipped.length} left out, listed in storelib.json` : ""}`
        : `GitHub already had the whole theme (${theme})`),
      commit_sha: r.sha,
    })
    return r.sha
  } catch (e) {
    const x = e instanceof GitHubError ? explainFailure(e, { repo: link.repo_full_name, branch: link.branch }) : null
    const line = x ? failureLine(x) : "Something went wrong sending the theme to GitHub. Press Push again."
    const last: LastSync = { at, direction: "to_github", commit: null, ok: false, saved: [], failed: [], notes: [], problem: x?.problem ?? "unknown", head_at: link.sync_state?.last?.head_at ?? null }
    await saveLink(db, link.install_id, { last_error: line, sync_state: { ...(link.sync_state ?? {}), last } })
    await recordEvent(db, link.install_id, { direction: "to_github", ok: false, summary: `${deps.reason ? `${deps.reason}, not sent` : "Not sent"}: ${line}` })
    throw new SyncError(line)
  }
}

/* ── GitHub → Storelib ─────────────────────────────────────────────────── */

export interface Incoming {
  path: string
  bytes: Uint8Array
  sha: string
}

export interface ApplyResult {
  saved: string[]
  unchanged: string[]
  failed: FileProblem[]
  notes: FileNote[]
  /** The blobs now agreed on, for sync_state.files. */
  shas: Record<string, string>
  /** Files not reached before the time ran out: Pull takes them. */
  unread?: number
}

const looksBinary = (b: Uint8Array) => b.subarray(0, 8000).includes(0)

/** "line 12" in a checker's message, as a number. */
function lineOf(message: string): number | undefined {
  const m = /\bline (\d{1,6})\b/.exec(message)
  return m ? Number(m[1]) : undefined
}

/**
 * A schema in the repository that Storelib writes for reading, changed: why
 * it is not taken, and what to change instead. Said as a refusal, with the
 * commit red, because a quiet note under a green status read as "done" to
 * the agent that pushed it, and the builder's panel never changed.
 *
 * config/settings_schema.json is not one of them any more: it is the theme's
 * own Theme settings (lib/storelib-theme/theme-config.ts), taken like any
 * theme file and refused only when it does not read.
 */
export function readOnlySchemaRefusal(path: string): string | null {
  const m = /^sections\/([a-z0-9_-]{1,64})\.json$/.exec(path)
  if (m) {
    return `${path}: this section is drawn by Storelib itself, so its schema here is for reading and a change to it is not taken. Write sections/${m[1]}.storelib with the same setting ids instead: this site then draws that file, with the settings its <schema> declares`
  }
  return null
}

const COVERAGE_ADVICE = /^(?:setting-unread|block-setting-unread|setting-missing)\b/

/** The quality findings a built-in already has are not the edit's fault: only new ones refuse a copy of it. */
function newQualityErrors(source: string, original: string | undefined, path: string, type: string) {
  const checked = validateSection(source, { path, expectType: type, strict: true })
  if (checked.ok !== false || checked.reason !== "quality") return null
  /* Settings coverage (lib/storelib-ai/settings-coverage.ts) is advice on a push, not a refusal: someone working in their own repository adds a setting and uses it a commit later. Storelib AI and MCP agents are still held to it. */
  const errors = checked.findings.filter((f) => f.severity === "error" && !COVERAGE_ADVICE.test(f.id))
  if (original === undefined) return errors[0] ?? null
  const before = validateSection(original, { path, expectType: type, strict: true })
  const had = new Set(before.ok === false && before.reason === "quality" ? before.findings.filter((f) => f.severity === "error").map((f) => f.id) : [])
  return errors.find((f) => !had.has(f.id)) ?? null
}

/**
 * One line in the activity log an open builder follows (the one agents
 * write). A file as itself; a page or the settings, rewritten whole, as a
 * page change that carries `replaced` and no operations, so the builder reads
 * it again from the draft (or keeps an edit not saved yet, and says so).
 */
async function logActivity(db: Db, installId: string, who: string, row: { path: string; action: "created" | "updated" | "page" | "page_created"; detail?: { page?: string; replaced: true } }) {
  try {
    await db.from("theme_agent_activity").insert({ install_id: installId, token_id: null, agent_name: who, path: row.path, action: row.action, ...(row.detail ? { detail: row.detail } : {}) })
  } catch {
    /* the builder hears about it on its next load instead */
  }
}

/**
 * Take files from the repository into the site, as drafts. The one loop a
 * push and a Pull both run. Sources first (a page may use a section the same
 * push added), then pages, then settings.
 */
export async function applyFiles(
  db: Db,
  link: GitHubLink,
  snap: ThemeSnapshot,
  incoming: Incoming[],
  who: string,
  opts: { commit: string; deadline?: number } = { commit: "" },
): Promise<ApplyResult> {
  const out: ApplyResult = { saved: [], unchanged: [], failed: [], notes: [], shas: {} }
  const agreed = link.sync_state?.files ?? {}
  const compat = { compat: snap.compat }
  const current = repoFilesFor(snap, link).files
  const currentSha = new Map(current.map((f) => [f.path, gitBlobSha(f.bytes ?? f.text ?? "")]))
  const conflictNote = (path: string) => {
    const base = agreed[path]
    const now = currentSha.get(path)
    if (base && now && base !== now) out.notes.push({ path, note: `${path} was also changed in the builder since the last sync. GitHub's version was used; the builder's is in History.` })
  }
  const order = (p: string) => (roleOf(p, compat) === "source" || roleOf(p, compat) === "shopify" || roleOf(p, compat) === "font" || roleOf(p, compat) === "theme-file" ? 0 : roleOf(p, compat) === "settings" ? 2 : 1)
  const files = [...incoming].sort((a, b) => order(a.path) - order(b.path) || (a.path < b.path ? -1 : 1))
  const pageFiles: Record<string, string> = {}
  const savedTypes = new Set<string>()
  let backedUp = false
  const backup = async (): Promise<string | null> => {
    if (backedUp) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = await takeBackup(db as any, link.install_id, { label: `Before GitHub ${opts.commit.slice(0, 7)}`, source: "ai" })
    if (b.error && !/store_theme_backups|does not exist|schema cache/i.test(b.error)) return "Storelib could not take a backup first, so this was not changed. Push again."
    backedUp = true
    return null
  }

  for (const f of files) {
    if (opts.deadline && Date.now() > opts.deadline) {
      out.notes.push({ path: f.path, note: `${f.path} was not reached in time. Press Pull to finish.` })
      out.unread = (out.unread ?? 0) + 1
      continue
    }
    const role = roleOf(f.path, compat)
    if (!readsBack(role)) {
      const refused = role === "reference" && !snap.compat && agreed[f.path] !== f.sha && currentSha.get(f.path) !== f.sha ? readOnlySchemaRefusal(f.path) : null
      if (refused) out.failed.push({ path: f.path, error: refused, kind: "theme-settings" })
      else if (role === "media") out.notes.push({ path: f.path, note: `${f.path}: pictures are not taken from GitHub. Upload it in Files in the builder.` })
      else if (f.path === SETTINGS_PANEL_FILE) out.notes.push({ path: f.path, note: `${f.path} is made by Storelib from ${SETTINGS_SCHEMA_FILE}, which is the file to change. Theme settings in the builder follow it.` })
      /* Storelib's own settings: their definitions are Storelib's, their values are config/settings.json's. Said, never refused. */
      else if (f.path === PLATFORM_SETTINGS_PATH) out.notes.push({ path: f.path, note: platformDefinitionNote(snap.compat) })
      else if (role === "reference") out.notes.push({ path: f.path, note: `${f.path} is there to read. Storelib does not take changes to it.` })
      else if (role === "generated") out.notes.push({ path: f.path, note: `${f.path} is written by Storelib, so this change is replaced on the next Push.` })
      continue
    }
    /* Storelib's own bytes coming back: nothing to do. */
    if (agreed[f.path] === f.sha || currentSha.get(f.path) === f.sha) {
      out.unchanged.push(f.path)
      out.shas[f.path] = f.sha
      continue
    }
    if (role === "template" || role === "group") {
      if (looksBinary(f.bytes)) {
        out.failed.push({ path: f.path, error: `${f.path}: not a text file`, kind: "binary" })
        continue
      }
      pageFiles[f.path] = Buffer.from(f.bytes).toString("utf8")
      continue
    }

    let text: string
    if (role === "font") {
      text = `base64:${Buffer.from(f.bytes).toString("base64")}`
    } else {
      if (looksBinary(f.bytes)) {
        out.failed.push({ path: f.path, error: `${f.path}: a binary file here is not read. Only text files and fonts are.`, kind: "binary" })
        continue
      }
      text = Buffer.from(f.bytes).toString("utf8")
    }

    /* Shopify's values file: what it sets is set, what it leaves out stays (lib/website-builder/theme-config-store.ts). */
    if (role === "settings" && f.path === SETTINGS_DATA_PATH) {
      const stop = await backup()
      if (stop) {
        out.failed.push({ path: f.path, error: `${f.path}: ${stop}`, kind: "not-saved" })
        continue
      }
      const data = await saveSettingsData(db, link.install_id, text)
      if (data.ok === false) {
        const refused = data as { status: number; error: string; errors?: { line?: number; message: string }[] }
        const first = refused.errors?.[0]
        out.failed.push({ path: f.path, error: `${f.path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? publicError(refused.status, refused.error)}`, kind: refused.status === 422 ? "invalid" : "not-saved", line: first?.line })
        continue
      }
      conflictNote(f.path)
      out.saved.push(f.path)
      out.shas[f.path] = f.sha
      await logActivity(db, link.install_id, who, { path: "settings", action: "page", detail: { replaced: true } })
      continue
    }

    if (role === "settings") {
      const bad = jsonError(f.path, text)
      if (bad) {
        out.failed.push({ path: f.path, error: bad, kind: "invalid", line: lineOf(bad) })
        continue
      }
      const v = JSON.parse(text) as unknown
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        out.failed.push({ path: f.path, error: `${f.path}: must be one JSON object of settings`, kind: "invalid" })
        continue
      }
      let next = { ...(v as Record<string, unknown>) }
      /*
        Storelib's own settings (lib/storelib-theme/platform-settings.ts): a
        value its control cannot take is kept as it was and said, and a
        default the export wrote out and the push left alone stays unset.
      */
      const platform = platformContext(snap)
      const checkedPlatform = checkPlatformValues(next, snap.settings, platform.kind, platform)
      for (const n of checkedPlatform.notes) out.notes.push({ path: f.path, note: `${f.path}: ${n}.` })
      next = withoutPlatformDefaults(checkedPlatform.settings, snap.settings, platform.kind, platform)
      /* What kind of theme this is, is not the repository's to change. */
      if (snap.compat) {
        if (JSON.stringify(next.compat) !== JSON.stringify((snap.settings as Record<string, unknown>).compat)) {
          out.notes.push({ path: f.path, note: `${f.path}: "compat" says this is an imported theme and was kept as it was.` })
        }
        next.compat = (snap.settings as Record<string, unknown>).compat
      } else if (compatOf(next)) {
        delete next.compat
        out.notes.push({ path: f.path, note: `${f.path}: "compat" was left out; a Storelib theme cannot become an imported one.` })
      }
      next = sanitizeThemeSettings(next)
      const stop = await backup()
      if (stop) {
        out.failed.push({ path: f.path, error: `${f.path}: ${stop}`, kind: "not-saved" })
        continue
      }
      const upd = await db.from("store_theme_settings").update({ draft_settings: next }).eq("install_id", link.install_id).select("install_id")
      const wrote = !upd.error && Array.isArray(upd.data) && upd.data.length > 0
      if (!wrote) {
        const ins = upd.error ? upd : await db.from("store_theme_settings").insert({ install_id: link.install_id, settings: {}, draft_settings: next })
        if (ins.error) {
          out.failed.push({ path: f.path, error: `${f.path}: could not be saved just now. Push again.`, kind: "not-saved" })
          continue
        }
      }
      conflictNote(f.path)
      out.saved.push(f.path)
      out.shas[f.path] = f.sha
      /* Menus are the store's, on every theme, once it keeps them: a change here is written there, as the builder's Navigation writes it. */
      if (snap.storeMenus && "menus" in next && JSON.stringify(cleanMenus(next.menus)) !== JSON.stringify(cleanMenus(snap.settings.menus))) {
        const menus = await writeStoreMenus(db, link.creator_id, next.menus)
        if (menus.ok === false) out.notes.push({ path: f.path, note: `${f.path}: the menus were saved with this theme, and the store's menus could not be changed just now. Push again.` })
      }
      /* An imported theme's Theme settings list its colour schemes from these values: made again with them. */
      if (snap.compat) await refreshCompatSettingsPanel(db, link.install_id)
      /* The defaults the theme's own settings_schema.json gives, under any value the push left out. */
      else await fillSchemaDefaults(db, link.install_id, await readThemeSchemaText(db, link.install_id))
      await logActivity(db, link.install_id, who, { path: "settings", action: "page", detail: { replaced: true } })
      continue
    }

    /* A theme's own file: a .storelib source, an imported theme's file, a font, an asset. */
    /* A copy of one of Storelib's own sections or blocks: a refusal of it offers Storelib's version back. */
    let builtIn = false
    if (role === "source") {
      /*
        The format this theme keeps (./format.ts): a Storelib section in an
        imported theme is taken as it is, the theme's original file is
        converted when nothing in it has to be guessed, and only a file that
        cannot be read either way is refused. A converted file goes back to
        the repository in the theme's format on the next Push.
      */
      const fitted = fitToThemeFormat(f.path, text, compat)
      if (fitted.ok === false) {
        out.failed.push({ path: f.path, error: (fitted as { error: string }).error, kind: "wrong-kind" })
        continue
      }
      if (fitted.converted) {
        text = fitted.text
        if (fitted.note) out.notes.push({ path: f.path, note: fitted.note })
      }
      const allowed = repoMayWrite(f.path, compat)
      if (allowed.ok === false) {
        out.failed.push({ path: f.path, error: allowed.error, kind: "invalid" })
        continue
      }
      builtIn = allowed.override
      /*
        An imported theme's section or block takes its <schema> too: the
        theme's own (under "shopify") is what the page draws, and the save
        makes the builder's panel from it again (lib/storelib-theme/compat/
        schema-sync.ts), so a setting, block or preset changed here is in
        the builder's sidebar as soon as the push is.
      */
      /* A section or block of a Storelib theme is held to every rule a creator's own section is, scripts included. */
      if (!snap.compat && /^(sections|blocks)\//.test(f.path)) {
        const type = f.path.replace(/^(sections|blocks)\//, "").replace(/\.storelib$/, "")
        const problem = newQualityErrors(text, allowed.override ? snap.defaults[f.path] : undefined, f.path, type)
        if (problem) {
          out.failed.push({ path: f.path, error: `${f.path}: ${problem.message}`, kind: allowed.override ? "built-in" : "invalid" })
          continue
        }
      }
    } else if (role === "shopify" && /\.liquid$/.test(f.path)) {
      try {
        parseCompat(text)
      } catch (e) {
        const line = e instanceof CompatSyntaxError ? e.line : undefined
        out.failed.push({ path: f.path, error: `${f.path}${line ? ` line ${line}` : ""}: ${(e as Error).message}`, kind: "invalid", line })
        continue
      }
    } else if (/\.json$/.test(f.path)) {
      const bad = jsonError(f.path, text)
      if (bad) {
        out.failed.push({ path: f.path, error: bad, kind: "invalid", line: lineOf(bad) })
        continue
      }
    }
    const saved = await saveThemeFile(db, link.install_id, f.path, text)
    if (saved.ok === false) {
      const first = saved.errors?.[0]
      /* This line becomes a commit comment, which a public repository shows
         to everyone: a database's own words never go into it. */
      out.failed.push({
        path: f.path,
        error: `${f.path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? publicError(saved.status, saved.error)}`,
        kind: saved.status === 422 || first ? (builtIn ? "built-in" : "invalid") : "not-saved",
        line: first?.line,
      })
      continue
    }
    conflictNote(f.path)
    out.saved.push(f.path)
    out.shas[f.path] = f.sha
    /* What the builder cannot show of a schema it took (a setting with no control): said on the commit and in the builder. */
    for (const note of saved.notes ?? []) out.notes.push({ path: f.path, note })
    const m = /^sections\/([a-z0-9_-]+)\.storelib$/.exec(f.path)
    if (m) savedTypes.add(m[1])
    if (role === "source" && !snap.compat && repoMayWrite(f.path, compat).ok && (f.path in snap.defaults || (m && SECTION_SCHEMAS[m[1]]))) {
      out.notes.push({ path: f.path, note: `${f.path} is a built-in. This site now uses its own copy; reset it in the builder to go back to Storelib's.` })
    }
    await logActivity(db, link.install_id, who, { path: f.path, action: saved.created ? "created" : "updated" })
  }

  /* Pages: the changed templates and groups, merged into what each page has. */
  if (Object.keys(pageFiles).length) {
    const has = (type: string) =>
      !!SECTION_SCHEMAS[type] || `sections/${type}.storelib` in snap.defaults || `sections/${type}.storelib` in snap.files || savedTypes.has(type)
    const merged = mergePages(snap.pages, pageFiles, { knownTypes: has, maxSections: LIMITS.sectionsPerTemplate, newPageKey: isPageKey })
    for (const e of merged.errors) out.failed.push({ path: e.path, error: e.reason, kind: "page", line: lineOf(e.reason) })
    const failedPaths = new Set(merged.errors.map((e) => e.path))
    const types = new Set(merged.pages.flatMap((p) => p.sections.map((s) => s.type)))
    const own = await readOwnSectionFields(db, link.install_id, types)
    const stop = merged.pages.length ? await backup() : null
    for (const page of merged.pages) {
      const file = `templates/${page.page_key}.json`
      if (stop) {
        out.failed.push({ path: file, error: `${file}: ${stop}`, kind: "not-saved" })
        continue
      }
      const sections = sanitizeSections(page.sections as unknown as SectionInstance[], own)
      const tooBig = sections.map((s) => blockTreeProblem(s)).find((p) => p !== null)
      if (tooBig) {
        out.failed.push({ path: file, error: `${file}: ${tooBig}`, kind: "page" })
        continue
      }
      const exists = snap.pages.some((p) => p.page_key === page.page_key)
      const w = exists
        ? await db.from("store_theme_pages").update({ draft_sections: sections }).eq("install_id", link.install_id).eq("page_key", page.page_key)
        : await db.from("store_theme_pages").insert({ install_id: link.install_id, page_key: page.page_key, sections: [], draft_sections: sections })
      if (w.error) {
        out.failed.push({ path: file, error: `${file}: could not be saved just now. Push again.`, kind: "not-saved" })
        continue
      }
      await logActivity(db, link.install_id, who, { path: `pages/${page.page_key}`, action: exists ? "page" : "page_created", detail: { page: page.page_key, replaced: true } })
    }
    for (const path of Object.keys(pageFiles)) {
      if (failedPaths.has(path) || out.failed.some((x) => x.path === path)) continue
      conflictNote(path)
      out.saved.push(path)
      out.shas[path] = incoming.find((f) => f.path === path)!.sha
    }
  }
  return out
}

/** What a push that changed config/storelib_settings_schema.json is told: where the values are, and how a theme places one itself. */
export function platformDefinitionNote(compat: boolean): string {
  return compat
    ? `${PLATFORM_SETTINGS_PATH} describes the settings Storelib adds, and Storelib rewrites it, so this change is not taken. Change their values in ${SETTINGS_PATH} under "shopify". To draw one where the theme wants it, declare its id in shopify/config/settings_schema.json.`
    : `${PLATFORM_SETTINGS_PATH} describes Storelib's own Theme settings, and Storelib rewrites it, so this change is not taken. Change their values in ${SETTINGS_PATH}, and their order, labels or defaults in config/settings_schema.json.`
}

/** "faq, hero and 3 more" from the saved paths, for a line in the activity list. */
function fileNames(paths: string[]): string {
  const names = paths.map((p) => p.replace(/^(sections|blocks|templates|snippets|layout)\//, "").replace(/\.(storelib|json)$/, ""))
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
}

export function takenSummary(r: { saved: string[]; failed: FileProblem[]; notes?: FileNote[] }, how: string): string {
  /* Files Storelib put in this theme's format on the way in (./format.ts) are said, so a changed file in the next Push is no surprise. */
  const converted = new Set((r.notes ?? []).filter((n) => /converted to this theme's format/.test(n.note)).map((n) => n.path))
  const tail = converted.size ? ` ${fileNames([...converted])} converted to this theme's format.` : ""
  if (r.failed.length) return `${how}: ${r.saved.length} taken, ${r.failed.length} not. ${r.failed[0].error}${tail}`
  if (r.saved.length === 0) return `${how}: already up to date`
  return `${how}: ${fileNames(r.saved)}${tail}`
}

/** The comment on a commit that lists every file a push could not bring in. */
export function commitComment(r: { saved: string[]; failed: FileProblem[]; notes: FileNote[]; skipped?: string }, editor: string): string {
  const lines = ["**Storelib** read this push."]
  lines.push("", `${r.saved.length} file${r.saved.length === 1 ? "" : "s"} taken into the site as a draft.`)
  if (r.saved.length && r.saved.length <= 30) lines.push("", ...r.saved.map((p) => `- \`${p}\``))
  if (r.skipped) lines.push("", r.skipped)
  if (r.failed.length) {
    lines.push("", `${r.failed.length} not taken. Fix each and push again; the files above are already in:`, "")
    for (const f of r.failed.slice(0, 50)) lines.push(`- ${f.error.replace(/\n+/g, " ")}`)
    if (r.failed.length > 50) lines.push(`- and ${r.failed.length - 50} more`)
  }
  if (r.notes.length) {
    lines.push("", "Notes:", "")
    for (const n of r.notes.slice(0, 30)) lines.push(`- ${n.note}`)
  }
  lines.push("", "Nothing is live until the creator presses Publish.", "", `Open the builder: ${editor}`)
  return lines.join("\n")
}

/**
 * Each theme path to the Git id of its bytes as the site has it now, and as
 * GitHub and Storelib last agreed: a file GitHub has with one of these ids is
 * already the site's, so it is never downloaded (round Z: Pull fetches only
 * what differs, by Git's own file ids, even on a link that agreed on nothing yet).
 */
function currentShas(snap: ThemeSnapshot, link: GitHubLink): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of repoFilesFor(snap, link).files) out[f.path] = gitBlobSha(f.bytes ?? f.text ?? "")
  return out
}

async function readIncoming(token: string, repo: string, files: Map<string, { sha: string; size: number }>, root: string, paths: string[], agreed: Record<string, string>, current: Record<string, string> = {}): Promise<{ incoming: Incoming[]; failed: FileProblem[] }> {
  const incoming: Incoming[] = []
  const failed: FileProblem[] = []
  const known: Record<string, string> = { ...current }
  for (const [p, sha] of Object.entries(agreed)) if (files.get(`${root}${p}`)?.sha === sha) known[p] = sha
  const queue = [...paths]
  const work = async () => {
    while (queue.length) {
      const path = queue.shift()!
      const entry = files.get(`${root}${path}`)
      if (!entry) continue
      if (entry.size > 20 * 1024 * 1024) {
        failed.push({ path, error: `${path}: over 20 MB, which Storelib does not take`, kind: "too-large" })
        continue
      }
      /* Already agreed on, or already the site's own bytes: no need to download it to know. */
      if (known[path] === entry.sha) {
        incoming.push({ path, bytes: new Uint8Array(), sha: entry.sha })
        continue
      }
      try {
        incoming.push({ path, bytes: await blobAt(token, repo, entry.sha), sha: entry.sha })
      } catch (e) {
        failed.push({ path, error: `${path}: ${e instanceof GitHubError ? failureLine(explainFailure(e, { repo })) : "could not be read from GitHub"}`, kind: "unreadable" })
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, work))
  return { incoming, failed }
}

async function finish(db: Db, link: GitHubLink, r: ApplyResult & { removed?: string[] }, commit: string, direction: "from_github", how: string, headAt: string | null = null) {
  const at = new Date().toISOString()
  const last: LastSync = { at, direction, commit, ok: r.failed.length === 0, saved: r.saved, failed: r.failed, notes: r.notes, head_at: headAt ?? at, ...(r.unread ? { unread: r.unread } : {}) }
  const files = { ...(link.sync_state?.files ?? {}), ...r.shas }
  await saveLink(db, link.install_id, {
    last_synced_sha: commit,
    last_synced_at: at,
    last_error: r.failed.length ? `${r.failed.length} file${r.failed.length === 1 ? " was" : "s were"} not taken. ${r.failed[0].error}` : null,
    sync_state: { ...(link.sync_state ?? {}), files, last },
  })
  if (r.saved.length || r.failed.length) {
    await recordEvent(db, link.install_id, { direction, ok: r.failed.length === 0, summary: takenSummary(r, how), commit_sha: commit })
  }
}

/**
 * A push that could not be taken at all (GitHub would not answer, the site
 * could not be read, too many files, the branch was deleted), kept on the
 * link as the last sync so the builder shows it, with its fix, after a
 * reload and on any device. What was applied before (the agreed files, the
 * last commit, its time) is left exactly as it was.
 */
async function failWhole(db: Db, link: GitHubLink, e: { problem: string; line: string; commit: string | null; unread?: number }) {
  const prev = link.sync_state ?? {}
  const last: LastSync = {
    at: new Date().toISOString(),
    direction: "from_github",
    commit: e.commit,
    ok: false,
    saved: [],
    failed: [],
    notes: [],
    problem: e.problem,
    head_at: prev.last?.head_at ?? null,
    ...(e.unread ? { unread: e.unread } : {}),
  }
  await saveLink(db, link.install_id, { last_error: e.line, sync_state: { ...prev, last } })
}

/** "Pull from GitHub": every theme file on the linked branch, now. */
export async function pullNow(db: Db, cfg: GitHubConfig, link: GitHubLink, siteName = "Site"): Promise<{ saved: number; unchanged: number; failed: FileProblem[]; notes: FileNote[] }> {
  if (!link.repo_full_name || !link.branch) throw new SyncError("Pick a repository first")
  const deadline = Date.now() + TIME_BUDGET_MS
  let token: string
  let tree: Awaited<ReturnType<typeof listTree>>
  try {
    token = await installationToken(cfg, link.installation_id)
    tree = await listTree(token, link.repo_full_name, link.branch)
  } catch (e) {
    if (e instanceof GitHubError) throw new SyncError(failureLine(explainFailure(e, { repo: link.repo_full_name, branch: link.branch })))
    throw e
  }
  let snap: ThemeSnapshot
  try {
    snap = await readSnapshot(db, link.install_id, { name: siteName, creatorId: link.creator_id })
  } catch (e) {
    throw new SyncError(e instanceof SnapshotError ? e.message : "Could not read this website. Try again.")
  }
  const compat = { compat: snap.compat }
  const paths = tree.paths
    .map((p) => (p.startsWith(link.root_path) ? p.slice(link.root_path.length) : null))
    .filter((p): p is string => p !== null && readsBack(roleOf(p, compat)) && !GENERATED.has(p))
  if (paths.length > MAX_FILES_PER_PULL) throw new SyncError(`The branch has ${paths.length} theme files; Pull takes ${MAX_FILES_PER_PULL} at once`)
  const read = await readIncoming(token, link.repo_full_name, tree.files, link.root_path, paths, link.sync_state?.files ?? {}, currentShas(snap, link))
  const r = await applyFiles(db, link, snap, read.incoming, "GitHub", { commit: tree.sha, deadline })
  r.failed.unshift(...read.failed)
  await finish(db, link, r, tree.sha, "from_github", "Pulled from GitHub")
  return { saved: r.saved.length, unchanged: r.unchanged.length, failed: r.failed, notes: r.notes }
}

export interface PushOutcome {
  site: string
  saved: string[]
  unchanged: string[]
  failed: FileProblem[]
  notes: FileNote[]
  removed: string[]
  skipped?: string
}

/**
 * Whether a push's head is older than what this site last applied, so it
 * must not be applied: a validly signed old push replayed, or one GitHub
 * delivered late. Asked of GitHub's history first (the head is behind or the
 * same as the last applied commit); for a rewritten branch, or when GitHub
 * cannot say, by the commits' own times.
 */
export async function olderThanApplied(token: string, repo: string, link: GitHubLink, after: string, headAt: string | null): Promise<boolean> {
  if (link.last_synced_sha) {
    try {
      const status = await compareStatus(token, repo, link.last_synced_sha, after)
      if (status === "behind" || status === "identical") return true
      if (status === "ahead") return false
    } catch {
      /* a base GitHub no longer has: fall back to the times */
    }
  }
  const lastAt = link.sync_state?.last?.head_at
  const a = headAt ? Date.parse(headAt) : NaN
  const b = lastAt ? Date.parse(lastAt) : NaN
  return Number.isFinite(a) && Number.isFinite(b) && a < b
}

/** GitHub → Storelib, for every site linked to this repository and branch. */
export async function applyPush(db: Db, cfg: GitHubConfig, payload: PushPayload): Promise<PushOutcome[]> {
  const branch = branchOf(payload.ref)
  const repoId = payload.repository?.id
  const repo = payload.repository?.full_name
  const after = payload.after
  if (!branch || !repoId || !repo || !after) return []
  if (!payload.deleted && isOwnPush(payload, cfg.slug)) return []
  const deadline = Date.now() + TIME_BUDGET_MS

  /* Every site linked to this repository, on any branch: the others are told their push was not read. */
  const { data } = await db.from("theme_github_links").select("*").eq("repo_id", repoId).limit(200)
  /* A link made through another installation than the one GitHub says sent
     this is not this push's: its token is not the one that can read this
     repository, and a push it did not send must not write on its link. */
  const from = Number(payload.installation?.id)
  const reachable = ((data ?? []) as GitHubLink[]).filter((l) => !Number.isSafeInteger(from) || Number(l.installation_id) === from)

  /* The linked branch was deleted on GitHub: nothing to take, and the builder says what to do. */
  if (payload.deleted) {
    for (const l of reachable.filter((x) => x.branch === branch)) {
      const line = `The ${branch} branch was deleted on GitHub. Press Push to make it again, or pick another branch under Change repository.`
      await failWhole(db, l, { problem: "branch-deleted", line, commit: null })
      await recordEvent(db, l.install_id, { direction: "from_github", ok: false, summary: line })
    }
    return []
  }

  /* A push to another branch is not read. Said once on the link, so the builder can say why nothing changed. */
  for (const l of reachable) {
    if (!l.branch || l.branch === branch || l.pull_on_push === false) continue
    const prev = l.sync_state ?? {}
    const sameBranch = prev.ignored?.branch === branch
    await saveLink(db, l.install_id, { sync_state: { ...prev, ignored: { branch, at: new Date().toISOString(), commit: after } } })
    if (!sameBranch) {
      await recordEvent(db, l.install_id, { direction: "from_github", ok: true, summary: `A push to ${branch} was not read: this site follows ${l.branch}. Merge it into ${l.branch} to bring it in.`, commit_sha: after })
    }
  }

  /* A site whose creator switched incoming changes off is left alone. And a
     push whose head is the commit Storelib itself last wrote is its own. */
  const links = reachable.filter((l) => l.branch === branch && l.pull_on_push !== false && l.last_synced_sha !== after)
  if (links.length === 0) return []

  let token: string
  try {
    token = await installationToken(cfg, links[0].installation_id)
  } catch (e) {
    const x = e instanceof GitHubError ? explainFailure(e, { repo, branch }) : null
    const line = x ? failureLine(x) : "GitHub could not be reached."
    for (const l of links) {
      await failWhole(db, l, { problem: x?.problem ?? "unreachable", line, commit: after })
      await recordEvent(db, l.install_id, { direction: "from_github", ok: false, summary: `A push to ${branch} was not read: ${line}`, commit_sha: after })
    }
    return []
  }
  const who = pushedBy(payload)
  const zero = /^0+$/.test(payload.before ?? "")
  let compared: { filename?: string; status?: string; previous_filename?: string }[] | null = null
  if (!zero && payload.before) {
    try {
      compared = await compareFiles(token, repo, payload.before, after)
    } catch {
      compared = null
    }
  }
  let tree: Map<string, { sha: string; size: number }> | null = null

  const headAt = typeof payload.head_commit?.timestamp === "string" ? payload.head_commit.timestamp : null
  const outcomes: PushOutcome[] = []
  for (const link of links) {
    /* An old push, replayed or delivered late, is not applied over a newer one. */
    if (await olderThanApplied(token, repo, link, after, headAt)) continue
    let snap: ThemeSnapshot
    try {
      const { data: install } = await db.from("store_theme_installs").select("name").eq("id", link.install_id).maybeSingle()
      snap = await readSnapshot(db, link.install_id, { name: (install?.name as string) || "Site", creatorId: link.creator_id })
    } catch {
      await failWhole(db, link, { problem: "site-unreadable", line: "Storelib could not read this website to take a push. Press Pull to try again.", commit: after })
      continue
    }
    const accept = (p: string) => readsBack(roleOf(p, { compat: snap.compat })) || ["media", "reference", "generated"].includes(roleOf(p, { compat: snap.compat }))
    const { changed, removed } = compared ? changedFromCompare(compared, link.root_path, accept) : changedFiles(payload.commits ?? [], link.root_path, accept)
    const out: PushOutcome = { site: link.install_id, saved: [], unchanged: [], failed: [], notes: [], removed }
    for (const p of removed) {
      if (readsBack(roleOf(p, { compat: snap.compat })) && !GENERATED.has(p)) out.notes.push({ path: p, note: `${p} was deleted on GitHub. The site keeps it, since a page may use it; delete it in the builder's code editor if it should go.` })
    }
    if (changed.length > MAX_FILES_PER_PUSH) {
      out.skipped = `${changed.length} theme files in one push; at most ${MAX_FILES_PER_PUSH} are read from a push. Press Pull in the builder to take them all.`
      await failWhole(db, link, { problem: "too-many", line: out.skipped, commit: after, unread: changed.length })
      await recordEvent(db, link.install_id, { direction: "from_github", ok: false, summary: `${who} pushed ${out.skipped}`, commit_sha: after })
      outcomes.push(out)
      continue
    }
    if (changed.length === 0 && out.notes.length === 0) {
      outcomes.push(out)
      continue
    }
    try {
      tree ??= (await treeAt(token, repo, after)).files
    } catch (e) {
      const x = e instanceof GitHubError ? explainFailure(e, { repo, branch }) : null
      const line = x ? failureLine(x) : "GitHub could not be reached."
      await failWhole(db, link, { problem: x?.problem ?? "unreachable", line, commit: after })
      outcomes.push({ ...out, failed: [{ path: "", error: line }] })
      continue
    }
    const read = await readIncoming(token, repo, tree, link.root_path, changed, link.sync_state?.files ?? {}, currentShas(snap, link))
    const r = await applyFiles(db, link, snap, read.incoming, who, { commit: after, deadline })
    r.failed.unshift(...read.failed)
    r.notes.push(...out.notes)
    out.saved = r.saved
    out.unchanged = r.unchanged
    out.failed = r.failed
    out.notes = r.notes
    await finish(db, link, r, after, "from_github", `${who} pushed`, headAt)
    outcomes.push(out)
  }

  /*
    One status on the commit for everything this push did, a comment saying
    what was taken and listing each file that was not, and the same words as
    a git note. The status's Details link is the comment, on GitHub, so
    whoever can read the repository can read why: the builder's address
    needs a Storelib login, and an agent working in the repository has none.
  */
  const touched = outcomes.some((o) => o.saved.length || o.failed.length || o.skipped || o.unchanged.length || o.notes.length)
  if (touched) {
    const failed = outcomes.flatMap((o) => o.failed)
    const skipped = outcomes.find((o) => o.skipped)?.skipped
    const saved = new Set(outcomes.flatMap((o) => o.saved)).size
    const state = failed.length || skipped ? "failure" : "success"
    const description = failed.length
      ? statusLine(failed.length === 1 ? failed[0].error : `${failed.length} files not taken, ${saved} taken. ${failed[0].error}`)
      : skipped
        ? statusLine(skipped)
        : statusLine(saved === 0 ? "Already up to date" : `${saved} file${saved === 1 ? "" : "s"} saved as a draft`)
    const notes = outcomes.flatMap((o) => o.notes)
    let details: string | null = null
    if (saved || failed.length || notes.length || skipped) {
      const body = commitComment({ saved: [...new Set(outcomes.flatMap((o) => o.saved))], failed, notes, skipped }, editorUrl(links[0].install_id))
      try {
        details = (await commentOnCommit(token, repo, after, body)).html_url
      } catch {
        /* the status says the first problem; the builder lists them all */
      }
      try {
        await noteOnCommit(token, repo, after, body)
      } catch {
        /* the comment and the status say it */
      }
    }
    try {
      await setStatus(token, repo, after, { state, description, target_url: details ?? editorUrl(links[0].install_id) })
    } catch {
      /* the app may not have been given commit statuses; the comment and the note say it */
    }
  }
  return outcomes
}
