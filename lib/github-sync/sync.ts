/**
 * ===========================================================================
 *  A SITE AND ITS REPOSITORY, BOTH DIRECTIONS
 * ===========================================================================
 *   exportSite   Storelib → GitHub. The whole theme as the builder has it
 *                (lib/github-sync/snapshot.ts), and AGENTS.md and CLAUDE.md,
 *                in one commit. Done when a repository is picked, when the
 *                creator presses "Send to GitHub", and after a publish.
 *   applyPush    GitHub → Storelib. A push to the linked branch: every
 *                changed theme file is taken in as a draft through the door
 *                the builder uses for it (lib/github-sync/apply.ts), and
 *                logged so an open builder shows it.
 *   pullNow      "Pull from GitHub": every file on the branch that differs
 *                from the site, found by Git's own file ids, so only those
 *                are fetched.
 *
 * A push is idempotent by content: a file already saved with the same text is
 * skipped, so GitHub redelivering a webhook changes nothing. No in-memory
 * dedupe, which a serverless function could not keep anyway.
 */
import "server-only"
import {
  COMMIT_MARKER,
  MAX_FILES_PER_PUSH,
  branchOf,
  changedFiles,
  changedFromCompare,
  exportPlan,
  fileName,
  gitBlobSha,
  isOwnPush,
  pushedBy,
  statusLine,
  trackedFor,
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
import { recordEvent } from "./events"
import { siteSnapshot, type SiteSnapshot } from "./snapshot"
import { applyRepoFiles, type Taken } from "./apply"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Files one "Pull from GitHub" takes: only those that differ from the site are counted. */
const MAX_FILES_PER_PULL = 400

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
  let snap: SiteSnapshot
  try {
    snap = await siteSnapshot(db, link.install_id)
  } catch {
    throw new SyncError("Could not read this website's theme. Try again.")
  }
  const files = exportPlan(
    Object.entries(snap.files).map(([path, source]) => ({ path, source })),
    { siteName, branch: link.branch, root: link.root_path, kind: snap.kind },
  )
  const token = await installationToken(cfg, link.installation_id)
  const sha = await commitFiles(token, link.repo_full_name, link.branch, files, `Storelib: ${siteName}\n\n${COMMIT_MARKER}`)
  await db
    .from("theme_github_links")
    .update({ last_synced_sha: sha ?? link.last_synced_sha, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq("install_id", link.install_id)
  await recordEvent(db, link.install_id, {
    direction: "to_github",
    ok: true,
    summary: sha ? `Sent the whole theme to GitHub, ${files.length - 2} files` : "Sent to GitHub; it already had everything",
    commit_sha: sha,
  })
  return sha
}

/** Read these repository files at `ref`, a few at a time. A file that is not there (deleted since) is left out. */
async function readFiles(token: string, repo: string, root: string, ref: string, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < paths.length; i += 8) {
    const batch = paths.slice(i, i + 8)
    const texts = await Promise.all(batch.map((p) => fileAt(token, repo, `${root}${p}`, ref)))
    batch.forEach((p, j) => {
      if (texts[j] !== null) out.set(p, texts[j] as string)
    })
  }
  return out
}

function takenSummary(r: Taken, how: string): string {
  if (r.failed.length) return `${how}: ${r.saved.length} saved, ${r.failed.length} not saved. ${r.failed[0].error}`
  if (r.saved.length === 0) return `${how}: already up to date`
  const names = r.saved.map(fileName)
  return `${how}: ${names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`}`
}

/** "Pull from GitHub": every theme file on the linked branch that differs from the site, now. */
export async function pullNow(db: Db, cfg: GitHubConfig, link: GitHubLink): Promise<{ saved: number; unchanged: number; failed: { path: string; error: string }[] }> {
  if (!link.repo_full_name || !link.branch) throw new SyncError("Pick a repository first")
  const token = await installationToken(cfg, link.installation_id)
  const [tree, snap] = await Promise.all([listTree(token, link.repo_full_name, link.branch), siteSnapshot(db, link.install_id)])
  const theme = tree.paths
    .map((p) => (p.startsWith(link.root_path) ? p.slice(link.root_path.length) : null))
    .filter((p): p is string => p !== null && trackedFor(snap.kind, p))
  const differ = theme.filter((p) => snap.files[p] === undefined || gitBlobSha(snap.files[p]) !== tree.blobs.get(`${link.root_path}${p}`))
  if (differ.length > MAX_FILES_PER_PULL) throw new SyncError(`${differ.length} files differ from the site; at most ${MAX_FILES_PER_PULL} are pulled at once`)
  const incoming = await readFiles(token, link.repo_full_name, link.root_path, tree.sha, differ)
  const r = await applyRepoFiles(db, link.install_id, snap, incoming, "GitHub")
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
  return { saved: r.saved.length, unchanged: r.unchanged.length + theme.length - differ.length, failed: r.failed }
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
    const { changed: all, removed } = compared
      ? changedFromCompare(compared, link.root_path)
      : changedFiles(payload.commits ?? [], link.root_path)
    const out: PushOutcome = { site: link.install_id, saved: [], unchanged: [], failed: [], removed }
    let snap: SiteSnapshot
    try {
      snap = await siteSnapshot(db, link.install_id)
    } catch {
      out.skipped = "Could not read the site's theme to take this push. Use Pull from GitHub."
      await recordEvent(db, link.install_id, { direction: "from_github", ok: false, summary: `${who} pushed: ${out.skipped}`, commit_sha: after })
      outcomes.push(out)
      continue
    }
    const changed = all.filter((p) => trackedFor(snap.kind, p))
    if (changed.length > MAX_FILES_PER_PUSH) {
      out.skipped = `${changed.length} theme files in one push; at most ${MAX_FILES_PER_PUSH} are synced at once`
      await recordEvent(db, link.install_id, { direction: "from_github", ok: false, summary: `${who} pushed ${out.skipped}. Use Pull from GitHub.`, commit_sha: after })
      outcomes.push(out)
      continue
    }
    const incoming = await readFiles(token, repo, link.root_path, after, changed)
    const r = await applyRepoFiles(db, link.install_id, snap, incoming, who)
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
      ? statusLine(failed.length === 1 ? failed[0].error : `${failed.length} files were not saved. ${failed[0].error}`)
      : skipped
        ? statusLine(skipped)
        : statusLine(saved === 0 ? "Already up to date" : `${saved} file${saved === 1 ? "" : "s"} saved as a draft`)
    try {
      await setStatus(token, repo, after, { state, description, target_url: editorUrl(links[0].install_id) })
    } catch {
      /* the app may not have been given commit statuses; the sync stands */
    }
  }
  return outcomes
}
