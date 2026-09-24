/**
 * ===========================================================================
 *  A SITE AND ITS REPOSITORY, BOTH DIRECTIONS
 * ===========================================================================
 *   exportSite   Storelib → GitHub. Every section file the site has, as the
 *                builder would open it, and AGENTS.md and CLAUDE.md, in one
 *                commit. Done when a repository is picked, and again when the
 *                creator presses "Send to GitHub".
 *   applyPush    GitHub → Storelib. A push to the linked branch: each changed
 *                `sections/<type>.storelib` is compiled and saved as a draft
 *                through saveThemeFile, the one save every editor uses, and
 *                logged so an open builder puts it on the page.
 *
 * A push is idempotent by content: a file already saved with the same text is
 * skipped, so GitHub redelivering a webhook changes nothing. No in-memory
 * dedupe, which a serverless function could not keep anyway.
 */
import "server-only"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { publicError, sectionSources } from "@/lib/agent-access/operations"
import { agentMayWrite } from "@/lib/agent-access/protected"
import {
  COMMIT_MARKER,
  MAX_FILES_PER_PUSH,
  branchOf,
  changedFiles,
  changedFromCompare,
  exportPlan,
  isOwnPush,
  pushedBy,
  statusLine,
  SYNCED,
  type PushPayload,
} from "./core"
import {
  commitFiles,
  compareFiles,
  fileAt,
  installationToken,
  listTree,
  setStatus,
  type GitHubConfig,
} from "./github"
import { recordEvent } from "./mirror"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Files one "Pull from GitHub" takes. The site holds more; a pull is not the way to move a whole theme. */
const MAX_FILES_PER_PULL = 120

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com").replace(/\/+$/, "")

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

/** Storelib → GitHub, in one commit. Returns the commit, or null when the repository already matched. */
export async function exportSite(db: Db, cfg: GitHubConfig, link: GitHubLink, siteName: string): Promise<string | null> {
  if (!link.repo_full_name || !link.branch) throw new SyncError("Pick a repository first")
  /* Every section's text in one read, not a list and then a read per file. */
  let all: Map<string, string>
  try {
    all = await sectionSources(db, link.install_id)
  } catch {
    throw new SyncError("Could not read this website's sections. Try again.")
  }
  const sections = [...all].filter(([path]) => SYNCED.test(path)).map(([path, source]) => ({ path, source }))
  const files = exportPlan(sections, { siteName, branch: link.branch, root: link.root_path })
  const token = await installationToken(cfg, link.installation_id)
  const sha = await commitFiles(
    token,
    link.repo_full_name,
    link.branch,
    files,
    `Storelib: ${siteName} sections\n\n${COMMIT_MARKER}`,
  )
  await db
    .from("theme_github_links")
    .update({ last_synced_sha: sha ?? link.last_synced_sha, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("install_id", link.install_id)
  await recordEvent(db, link.install_id, {
    direction: "to_github",
    ok: true,
    summary: sha ? `Sent ${files.length - 2} sections to GitHub` : "Sent to GitHub; it already had everything",
    commit_sha: sha,
  })
  return sha
}

/**
 * Take section files from the repository at `ref` into the site, as drafts.
 * The one loop both a push and "Pull from GitHub" run: a file whose text the
 * site already has is left alone, and a file that does not compile is
 * reported with its first error and not saved.
 */
async function takeFiles(
  db: Db,
  token: string,
  link: GitHubLink,
  repo: string,
  ref: string,
  paths: string[],
  who: string,
): Promise<{ saved: string[]; unchanged: string[]; failed: { path: string; error: string }[] }> {
  const out = { saved: [] as string[], unchanged: [] as string[], failed: [] as { path: string; error: string }[] }
  /* What the site has now for every one of these, in one read. A redelivered
     webhook finds them all unchanged and writes nothing. */
  let current: Map<string, string>
  try {
    current = await sectionSources(db, link.install_id, paths)
  } catch {
    current = new Map()
  }
  for (const path of paths) {
    const source = await fileAt(token, repo, `${link.root_path}${path}`, ref)
    if (source === null) continue
    if (current.get(path) === source) {
      out.unchanged.push(path)
      continue
    }
    /* A built-in section in the repository is there to read. A change to one
       is refused and said so on the commit, and the site keeps its own. */
    const allowed = agentMayWrite(path)
    if (allowed.ok === false) {
      out.failed.push({ path, error: allowed.error })
      continue
    }
    const saved = await saveThemeFile(db, link.install_id, path, source)
    if (saved.ok === false) {
      const first = saved.errors?.[0]
      /* This line becomes a commit status, which a public repository shows
         to everyone: a database's own words never go into it. */
      out.failed.push({ path, error: `${path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? publicError(saved.status, saved.error)}` })
      continue
    }
    out.saved.push(path)
    try {
      await db.from("theme_agent_activity").insert({
        install_id: link.install_id,
        token_id: null,
        agent_name: who,
        path,
        action: saved.created ? "created" : "updated",
      })
    } catch {
      /* the builder hears about it on its next load instead */
    }
  }
  return out
}

function sectionNames(paths: string[]): string {
  const names = paths.map((p) => p.replace(/^sections\//, "").replace(/\.storelib$/, ""))
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
}

function takenSummary(r: { saved: string[]; failed: { error: string }[] }, how: string): string {
  if (r.failed.length) return `${how}: ${r.saved.length} saved, ${r.failed.length} not saved. ${r.failed[0].error}`
  if (r.saved.length === 0) return `${how}: already up to date`
  return `${how}: ${sectionNames(r.saved)}`
}

/** "Pull from GitHub": every section file on the linked branch, now. */
export async function pullNow(db: Db, cfg: GitHubConfig, link: GitHubLink): Promise<{ saved: number; unchanged: number; failed: { path: string; error: string }[] }> {
  if (!link.repo_full_name || !link.branch) throw new SyncError("Pick a repository first")
  const token = await installationToken(cfg, link.installation_id)
  const tree = await listTree(token, link.repo_full_name, link.branch)
  const paths = tree.paths
    .map((p) => (p.startsWith(link.root_path) ? p.slice(link.root_path.length) : null))
    .filter((p): p is string => p !== null && SYNCED.test(p))
  if (paths.length > MAX_FILES_PER_PULL) throw new SyncError(`${paths.length} section files; at most ${MAX_FILES_PER_PULL} are pulled at once`)
  const r = await takeFiles(db, token, link, link.repo_full_name, tree.sha, paths, "GitHub")
  await db
    .from("theme_github_links")
    .update({ last_synced_sha: tree.sha, last_synced_at: new Date().toISOString(), last_error: r.failed[0]?.error ?? null, updated_at: new Date().toISOString() })
    .eq("install_id", link.install_id)
  await recordEvent(db, link.install_id, {
    direction: "from_github",
    ok: r.failed.length === 0,
    summary: takenSummary(r, "Pulled from GitHub"),
    commit_sha: tree.sha,
  })
  return { saved: r.saved.length, unchanged: r.unchanged.length, failed: r.failed }
}

export interface PushOutcome {
  site: string
  saved: string[]
  unchanged: string[]
  failed: { path: string; error: string }[]
  removed: string[]
  skipped?: string
}

/** GitHub → Storelib, for every site linked to this repository and branch. */
export async function applyPush(db: Db, cfg: GitHubConfig, payload: PushPayload): Promise<PushOutcome[]> {
  const branch = branchOf(payload.ref)
  const repoId = payload.repository?.id
  const repo = payload.repository?.full_name
  const after = payload.after
  if (!branch || !repoId || !repo || !after || payload.deleted) return []
  if (isOwnPush(payload, cfg.slug)) return []

  const { data } = await db.from("theme_github_links").select("*").eq("repo_id", repoId).eq("branch", branch).limit(100)
  /* A site whose creator switched incoming changes off is left alone, and so
     is a link made through another installation than the one GitHub says
     sent this: its token is not the one that can read this repository. */
  const from = Number(payload.installation?.id)
  const links = ((data ?? []) as GitHubLink[]).filter(
    (l) => l.pull_on_push !== false && (!Number.isSafeInteger(from) || Number(l.installation_id) === from),
  )
  if (links.length === 0) return []

  const token = await installationToken(cfg, links[0].installation_id)
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

  const outcomes: PushOutcome[] = []
  for (const link of links) {
    const { changed, removed } = compared
      ? changedFromCompare(compared, link.root_path)
      : changedFiles(payload.commits ?? [], link.root_path)
    const out: PushOutcome = { site: link.install_id, saved: [], unchanged: [], failed: [], removed }
    if (changed.length > MAX_FILES_PER_PUSH) {
      out.skipped = `${changed.length} section files in one push; at most ${MAX_FILES_PER_PUSH} are synced at once`
      await recordEvent(db, link.install_id, { direction: "from_github", ok: false, summary: `${who} pushed ${out.skipped}. Use Pull from GitHub.`, commit_sha: after })
      outcomes.push(out)
      continue
    }
    const r = await takeFiles(db, token, link, repo, after, changed, who)
    out.saved = r.saved
    out.unchanged = r.unchanged
    out.failed = r.failed
    if (r.saved.length || r.failed.length) {
      await recordEvent(db, link.install_id, {
        direction: "from_github",
        ok: r.failed.length === 0,
        summary: takenSummary(r, `${who} pushed`),
        commit_sha: after,
      })
    }
    await db
      .from("theme_github_links")
      .update({
        last_synced_sha: after,
        last_synced_at: new Date().toISOString(),
        last_error: out.failed[0]?.error ?? out.skipped ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("install_id", link.install_id)
    outcomes.push(out)
  }

  /* One status on the commit, for everything this push did. */
  const touched = outcomes.some((o) => o.saved.length || o.failed.length || o.skipped || o.unchanged.length)
  if (touched) {
    const failed = outcomes.flatMap((o) => o.failed)
    const skipped = outcomes.find((o) => o.skipped)?.skipped
    const saved = new Set(outcomes.flatMap((o) => o.saved)).size
    const state = failed.length || skipped ? "failure" : "success"
    const description = failed.length
      ? statusLine(failed.length === 1 ? failed[0].error : `${failed.length} files did not compile. ${failed[0].error}`)
      : skipped
        ? statusLine(skipped)
        : statusLine(saved === 0 ? "Already up to date" : `${saved} section${saved === 1 ? "" : "s"} saved as a draft`)
    try {
      await setStatus(token, repo, after, { state, description, target_url: editorUrl(links[0].install_id) })
    } catch {
      /* the app may not have been given commit statuses; the sync stands */
    }
  }
  return outcomes
}
