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
import { listFiles, readFile } from "@/lib/agent-access/operations"
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
  setStatus,
  type GitHubConfig,
} from "./github"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

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
}

export function editorUrl(installId: string) {
  return `${APP_URL}/website-builder/editor/${installId}`
}

/** Storelib → GitHub, in one commit. Returns the commit, or null when the repository already matched. */
export async function exportSite(db: Db, cfg: GitHubConfig, link: GitHubLink, siteName: string): Promise<string | null> {
  if (!link.repo_full_name || !link.branch) throw new Error("Pick a repository first")
  const listed = await listFiles(db, link.install_id)
  if (listed.ok === false) throw new Error(listed.error)
  const sections: { path: string; source: string }[] = []
  for (const f of listed.value.files) {
    if (!SYNCED.test(f.path)) continue
    const r = await readFile(db, link.install_id, f.path)
    if (r.ok === true) sections.push({ path: f.path, source: r.value.source })
  }
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
  return sha
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

  const { data } = await db.from("theme_github_links").select("*").eq("repo_id", repoId).eq("branch", branch)
  const links = (data ?? []) as GitHubLink[]
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
      outcomes.push(out)
      continue
    }
    for (const path of changed) {
      const source = await fileAt(token, repo, `${link.root_path}${path}`, after)
      if (source === null) continue
      const current = await readFile(db, link.install_id, path)
      if (current.ok === true && current.value.origin === "yours" && current.value.source === source) {
        out.unchanged.push(path)
        continue
      }
      const saved = await saveThemeFile(db, link.install_id, path, source)
      if (saved.ok === false) {
        const first = saved.errors?.[0]
        out.failed.push({ path, error: `${path}${first?.line ? ` line ${first.line}` : ""}: ${first?.message ?? saved.error}` })
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
