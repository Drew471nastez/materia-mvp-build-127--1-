/**
 * ===========================================================================
 *  WHAT THE BUILDER SAYS ABOUT SYNCING, AND WHETHER THERE IS ANYTHING TO PUBLISH
 * ===========================================================================
 * A push from GitHub, or an agent writing through its key, saves into the
 * site's DRAFT: page drafts, the settings draft, and file drafts. The builder
 * only knew about a draft for the page it had open, so a push that changed a
 * section file, a snippet or the settings left Publish saying "Published"
 * with nothing to press. Two answers fix that, both from the server, so they
 * hold after a reload and on any device:
 *
 *   readPending    is the draft ahead of the live site, anywhere: any page,
 *                  the settings, any file. Publish promotes exactly these
 *                  (app/api/website-builder/themes/[installId]/publish).
 *   editorReport   the last sync, in plain words: how many files came in,
 *                  each file that did not and what to do about it, and a
 *                  whole sync that failed with the one button that fixes it.
 *
 * The words are written for someone who has never opened a terminal: no
 * template language names, no platform names, no stack traces, no tokens.
 * The developer's own line for each file stays on the commit comment.
 */
import type { FileProblem, FileProblemKind, GitHubLink, LastSync } from "./sync"
import { tt } from "@/lib/i18n/text"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface PendingChanges {
  /** Anything at all for Publish to make live. */
  any: boolean
  /** Page keys with a draft. */
  pages: string[]
  /** The theme settings have a draft. */
  settings: boolean
  /** How many files have a draft. */
  files: number
}

/**
 * Every draft the site has, the same three Publish promotes. Three small
 * reads of keys only (no file text). A table or column a database does not
 * have yet reads as nothing pending there.
 */
export async function readPending(db: Db, installId: string): Promise<PendingChanges> {
  const quiet = async <T>(q: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const r = await q
      return r.error ? [] : (r.data ?? [])
    } catch {
      return []
    }
  }
  const [pages, settings, files] = await Promise.all([
    quiet<{ page_key: string }>(db.from("store_theme_pages").select("page_key").eq("install_id", installId).not("draft_sections", "is", null).limit(500)),
    quiet<{ install_id: string }>(db.from("store_theme_settings").select("install_id").eq("install_id", installId).not("draft_settings", "is", null).limit(1)),
    quiet<{ path: string }>(db.from("store_theme_custom_files").select("path").eq("install_id", installId).not("draft_content", "is", null).limit(5000)),
  ])
  const keys = pages.map((p) => String(p.page_key))
  return { any: keys.length > 0 || settings.length > 0 || files.length > 0, pages: keys, settings: settings.length > 0, files: files.length }
}

/* ── the report ────────────────────────────────────────────────────────── */

/**
 * The buttons the builder can show. Each maps to one request it already has:
 * retry (Pull for a push from GitHub, Push for a send to it), pull, push
 * (send the site's version), reconnect and repo (Website settings, GitHub),
 * open (the file on GitHub), reset (a built-in back to Storelib's version).
 */
/** `branch`: send the site to a branch of its own, storelib, and follow it. `follow`: follow the branch an agent pushed to, and bring it in. */
export type SyncAction = "retry" | "pull" | "push" | "reconnect" | "repo" | "open" | "reset" | "branch" | "follow"

export interface ReportFile {
  path: string
  title: string
  /** What to do, one sentence. */
  fix: string
  /** The checker's own words, cleaned, when they help. */
  detail: string | null
  line: number | null
  url: string | null
  actions: SyncAction[]
}

export interface EditorSyncReport {
  repo: string | null
  branch: string | null
  at: string | null
  direction: "to_github" | "from_github" | null
  ok: boolean
  /** The commit, short. */
  commit: string | null
  commitUrl: string | null
  /** Files a push or Pull took into the draft. */
  taken: number
  takenNames: string[]
  /** A sync that failed as a whole. */
  problem: { kind: string; title: string; body: string; actions: SyncAction[] } | null
  /** Each file that did not come in. */
  files: ReportFile[]
  moreFiles: number
  /** Good to know, in plain words. */
  notes: string[]
  /** The newest push to another branch, which is not read. */
  ignored: { branch: string; at: string } | null
  /**
   * Sending the site's version back over the files that did not come in is
   * safe: nothing from GitHub is still waiting to be read, so a Push replaces
   * only what was refused (and what the site already took, with itself).
   */
  canSendSite: boolean
  /** Changes when the report does, for "seen" in this browser. */
  key: string
}

const TOKEN = /\b(gh[pousr]_[A-Za-z0-9_]{6,}|github_pat_[A-Za-z0-9_]{6,}|slk_[A-Za-z0-9_]{6,}|sk_(live|test)_[A-Za-z0-9]{6,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.?[A-Za-z0-9_-]*)/g

/**
 * A line fit for the builder: one line, short, no em dash, no template
 * language or platform name, nothing that looks like a key or a trace.
 */
export function plainWords(text: string, max = 220): string {
  let t = String(text ?? "")
    .split(/\n|\s+at\s+\S+\s*\(/)[0]
    .replace(TOKEN, "[hidden]")
    .replace(/<template compat="shopify">/gi, "the same first line as the theme's other files")
    /* The schema key the engine reads, said as what it is. */
    .replace(/\b(?:in its|its|the)\s+"shopify"\s+object/gi, "the theme's own schema")
    .replace(/\bunder\s+"shopify"/gi, "in the theme's own schema")
    .replace(/\bimported Shopify theme\b/gi, "imported theme")
    .replace(/\bShopify(?:'s)?\s+theme\b/gi, "theme")
    .replace(/\bShopify\b/gi, "the theme")
    .replace(/\bLiquid\b/gi, "template")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
  if (t.length > max) t = `${t.slice(0, max - 1).trimEnd()}…`
  return t
}

/** "sections/hero.storelib line 4: Unknown tag" to "Unknown tag". */
function checkerWords(path: string, error: string): string | null {
  let t = error
  if (t.startsWith(path)) t = t.slice(path.length)
  t = t.replace(/^\s*line \d+/, "").replace(/^\s*:\s*/, "")
  t = plainWords(t, 200)
  return t ? t : null
}

function fileCopy(kind: FileProblemKind, line: number | null): { title: string; fix: string; showDetail: boolean } {
  switch (kind) {
    case "invalid":
      return { title: line ? tt("Has a mistake on line {line}", { line }) : tt("Has a mistake"), fix: tt("Fix it on GitHub and push again."), showDetail: true }
    case "page":
      return { title: tt("This page file has a mistake"), fix: tt("The page kept its last version. Fix the file on GitHub and push again."), showDetail: true }
    case "wrong-kind":
      /* What the file needs is in the detail: Storelib converts every file it can (lib/github-sync/format.ts), so one refused here needs a person or an agent to say what it is. */
      return { title: tt("Not in this theme's format"), fix: tt("Storelib converts a file when it can tell what it is. Change this one as the line below says, then push again."), showDetail: true }
    case "built-in":
      return { title: line ? tt("Has a mistake on line {line}", { line }) : tt("Changes one of Storelib's sections in a way it can't use"), fix: tt("Fix it on GitHub, or put back Storelib's version."), showDetail: true }
    case "theme-settings":
      /* A schema Storelib writes for reading (config/settings_schema.json, sections/<type>.json): what to change instead is in the detail. */
      return { title: tt("Storelib doesn't take changes to this file"), fix: tt("Change values in config/settings.json, or add the setting to a section's own schema, then push again."), showDetail: true }
    case "binary":
      return { title: tt("This kind of file isn't read from GitHub"), fix: tt("Upload pictures and videos in Files in the builder."), showDetail: false }
    case "too-large":
      return { title: tt("Over 20 MB, too big to bring in"), fix: tt("Make it smaller, or keep it out of the theme folders."), showDetail: false }
    case "unreadable":
      return { title: tt("Couldn't be read from GitHub"), fix: tt("Try again in a minute."), showDetail: false }
    case "not-saved":
    default:
      return { title: tt("Couldn't be saved just now"), fix: tt("Try again. Nothing else was lost."), showDetail: false }
  }
}

/** A problem saved before problems had kinds: told apart by its words. */
function kindOf(p: FileProblem): FileProblemKind {
  if (p.kind) return p.kind
  const e = p.error ?? ""
  if (/could not be saved just now|backup/i.test(e)) return "not-saved"
  if (/over 20 MB/i.test(e)) return "too-large"
  if (/not a text file|binary file/i.test(e)) return "binary"
  if (/could not be read from GitHub/i.test(e)) return "unreadable"
  if (/compat="shopify"|Write it as a Storelib section|imported theme's format|could not tell which format/i.test(e)) return "wrong-kind"
  if (/<schema> block\) changed|is for reading and a change to it is not taken/i.test(e)) return "theme-settings"
  if (/^templates\/|^sections\/(header|footer|overlay)-group\.json/.test(p.path)) return "page"
  return "invalid"
}

/** A path under the repository's folder on its branch, on github.com, or null for anything that is not a plain path. */
export function fileOnGitHub(repo: string | null, branch: string | null, root: string, path: string): string | null {
  if (!repo || !branch || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null
  const full = `${root ?? ""}${path}`
  if (!full || full.includes("..") || full.startsWith("/")) return null
  const enc = (s: string) => s.split("/").map(encodeURIComponent).join("/")
  return `https://github.com/${repo}/blob/${enc(branch)}/${enc(full)}`
}

function commitOnGitHub(repo: string | null, sha: string | null): string | null {
  if (!repo || !sha || !/^[0-9a-f]{7,40}$/i.test(sha) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) return null
  return `https://github.com/${repo}/commit/${sha}`
}

/** A name a person recognises: "hero" for sections/hero.storelib, "Home page" for templates/index.json. */
export function friendlyName(path: string): string {
  if (path === "config/settings.json" || path === "config/settings_data.json") return tt("Theme settings")
  const page = /^templates\/([^/]+)\.json$/.exec(path)
  if (page) return tt("{value} page", { value: page[1] === "index" ? tt("Home") : page[1].charAt(0).toUpperCase() + page[1].slice(1).replace(/[-_]/g, " ") })
  if (/^sections\/header-group\.json$/.test(path)) return tt("Header")
  if (/^sections\/footer-group\.json$/.test(path)) return tt("Footer")
  const base = path.split("/").pop() ?? path
  return base.replace(/\.(storelib|liquid|json|css|js|scss)$/i, "").replace(/[-_]/g, " ")
}

function wholeProblem(kind: string, ctx: { repo: string; branch: string; direction: "to_github" | "from_github"; unread: number }): { title: string; body: string; actions: SyncAction[] } {
  const { repo, branch } = ctx
  switch (kind) {
    case "app-key":
      return { title: tt("GitHub needs you to reconnect"), body: tt("Storelib couldn't sign in to your repository. Reconnect GitHub and try again. Nothing on your site was lost."), actions: ["reconnect", "retry"] }
    case "installation-gone":
      return { title: tt("GitHub is disconnected"), body: tt("The Storelib app was removed from your GitHub account. Reconnect GitHub to keep syncing."), actions: ["reconnect"] }
    case "no-access":
      return { title: tt("Storelib can't reach your repository"), body: tt("Give the Storelib app access to {repo} on GitHub, then try again.", { repo }), actions: ["reconnect", "retry"] }
    case "repo-missing":
      return { title: tt("Repository not found"), body: tt("{repo} was renamed, deleted, or taken away from Storelib. Pick it again to keep syncing.", { repo }), actions: ["repo"] }
    case "branch-deleted":
      return { title: tt("The {branch} branch was deleted", { branch }), body: tt("Send your site to GitHub to make it again, or pick another branch."), actions: ["push", "repo"] }
    case "branch-protected":
      /* One press: the site goes to a branch of its own and is followed there, so the next push is read too. */
      return { title: tt("{branch} is protected on GitHub", { branch }), body: tt("GitHub won't let Storelib write to it. Send your site to a branch called storelib instead, and Storelib follows that one from now on."), actions: ["branch", "repo"] }
    case "moved-on":
      return { title: tt("Someone pushed while Storelib was sending"), body: tt("Try again. Their commit stays and your changes go on top."), actions: ["push"] }
    case "rate-limited":
      return { title: tt("GitHub asked Storelib to slow down"), body: tt("Nothing is lost. Try again in a few minutes."), actions: ["retry"] }
    case "too-many":
      return { title: tt("{value} files changed in one push", { value: ctx.unread || tt("Many") }), body: tt("That's more than Storelib reads from a single push. Bring them all in now."), actions: ["pull"] }
    case "unread":
      return { title: tt("{unread, plural, one {# file} other {# files}} still to bring in", { unread: ctx.unread }), body: tt("The push was large, so Storelib stopped part way. Bring in the rest now."), actions: ["pull"] }
    case "too-large":
      return { title: tt("A file was too big for GitHub"), body: tt("Files over 20 MB stay on Storelib. Try sending again."), actions: ["push"] }
    case "site-unreadable":
      return { title: tt("Storelib couldn't open your site to take the push"), body: tt("Nothing changed. Try again in a moment."), actions: ["pull"] }
    case "github-down":
    case "unreachable":
      return { title: tt("GitHub didn't answer"), body: tt("Nothing is lost. Try again in a minute."), actions: ["retry"] }
    default:
      return {
        title: ctx.direction === "to_github" ? tt("Your changes didn't reach GitHub") : tt("The last push didn't come in"),
        body: tt("Nothing on your site was lost. Try again."),
        actions: ["retry"],
      }
  }
}

type ReportLink = Pick<GitHubLink, "repo_full_name" | "branch" | "root_path" | "last_error" | "sync_state">

/** The last sync, for the builder. Null when nothing has synced and nothing failed. Pure. */
export function editorReport(link: ReportLink | null): EditorSyncReport | null {
  if (!link) return null
  const repo = link.repo_full_name ?? null
  const branch = link.branch ?? null
  const root = link.root_path ?? ""
  const last = (link.sync_state?.last ?? null) as LastSync | null
  const ignoredRaw = link.sync_state?.ignored
  const ignored = ignoredRaw && typeof ignoredRaw.branch === "string" && typeof ignoredRaw.at === "string" ? { branch: ignoredRaw.branch, at: ignoredRaw.at } : null
  if (!last && !link.last_error && !ignored) return null

  const direction = last?.direction ?? null
  const failed = (last?.failed ?? []).filter((f) => f && typeof f.path === "string")
  const files: ReportFile[] = failed.slice(0, 50).map((f) => {
    const kind = kindOf(f)
    const line = typeof f.line === "number" && f.line > 0 ? f.line : (Number(/\bline (\d{1,6})\b/.exec(f.error ?? "")?.[1]) || null)
    const copy = fileCopy(kind, line)
    const url = f.path ? fileOnGitHub(repo, branch, root, f.path) : null
    const actions: SyncAction[] = []
    if (url) actions.push("open")
    if (kind === "built-in") actions.push("reset")
    if (kind === "not-saved" || kind === "unreadable") actions.push("retry")
    return {
      path: f.path || "(the push)",
      title: copy.title,
      fix: copy.fix,
      detail: copy.showDetail ? checkerWords(f.path, f.error ?? "") : null,
      line,
      url,
      actions,
    }
  })

  let problem: EditorSyncReport["problem"] = null
  const unread = typeof last?.unread === "number" ? last.unread : 0
  const kind = last && last.ok === false && last.problem ? last.problem : null
  if (kind) problem = { kind, ...wholeProblem(kind, { repo: repo ?? tt("the repository"), branch: branch ?? tt("the branch"), direction: direction ?? "from_github", unread }) }
  else if (unread > 0) problem = { kind: "unread", ...wholeProblem("unread", { repo: repo ?? "", branch: branch ?? "", direction: "from_github", unread }) }
  else if (!last && link.last_error) {
    /* A failure from before failures were kept whole: its own line, cleaned. */
    problem = { kind: "unknown", title: tt("The last sync didn't finish"), body: plainWords(link.last_error), actions: ["retry"] }
  }

  const notes = (last?.notes ?? [])
    .filter((n) => n && typeof n.note === "string" && !/was not reached in time/.test(n.note))
    .slice(0, 10)
    .map((n) => plainWords(n.note))

  const saved = Array.isArray(last?.saved) ? last!.saved : []
  const commit = last?.commit && /^[0-9a-f]{7,40}$/i.test(last.commit) ? last.commit : null
  return {
    repo,
    branch,
    at: last?.at ?? null,
    direction,
    ok: !!last && last.ok !== false && !problem,
    commit: commit ? commit.slice(0, 7) : null,
    commitUrl: commitOnGitHub(repo, commit),
    taken: direction === "from_github" ? saved.length : 0,
    takenNames: direction === "from_github" ? [...new Set(saved.map(friendlyName))].slice(0, 5) : [],
    problem,
    files,
    moreFiles: Math.max(0, failed.length - files.length),
    notes,
    ignored,
    canSendSite: direction === "from_github" && failed.length > 0 && !problem && unread === 0,
    key: `${last?.at ?? ""}|${last?.commit ?? ""}|${failed.length}|${kind ?? ""}`,
  }
}
