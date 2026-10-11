/**
 * ===========================================================================
 *  THE BUILDER'S SAVES, COMMITTED TO THE LINKED REPOSITORY
 * ===========================================================================
 * The other half of two-way sync. When a theme file is saved in the builder
 * (the code editor, Ask AI writing a section, an agent on a direct
 * connection), and the site is linked with "Builder changes go to GitHub" on,
 * the same change is committed to the linked branch. A file renamed or
 * deleted in the builder is renamed or deleted there too. Every theme file
 * the repository holds travels this way: sections, blocks, snippets, layout,
 * an imported theme's own files (a font as its bytes). Pages and settings
 * are written whole on Push and on Publish.
 *
 * Called from the routes through `after()`: the save answers the person at
 * once and the commit follows. It never fails the save it follows; a commit
 * that does not land is written to the Connections activity list instead,
 * with what to do about it (./errors.ts).
 *
 * NOT called for a save that came FROM GitHub (lib/github-sync/sync.ts), and
 * every commit carries COMMIT_MARKER and is made by the app's bot, so a
 * change never goes round in a circle. The blob it sent is remembered
 * (sync_state.files), so even a push that carried it back changes nothing.
 */
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { COMMIT_MARKER, changesFor, describeChange, type BuilderChange } from "./core"
import { GitHubError, commitChanges, githubConfig, installationToken, type FileChange } from "./github"
import { explainFailure, failureLine } from "./errors"
import { fontBytes, gitBlobSha, readsBack, roleOf } from "./layout"
import { recordEvent } from "./events"
import { exportSite, type GitHubLink, type LastSync, type SyncState } from "./sync"

/* Written in ./events.ts, so the sync and this file both write it without importing each other for it. */
export { recordEvent }

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Whether a file saved in the builder belongs in the repository. A shopify/ path exists only on an imported theme. */
export function travels(path: string): boolean {
  const role = roleOf(path, { compat: path.startsWith("shopify/") })
  return readsBack(role) && role !== "settings" && role !== "template" && role !== "group"
}

/**
 * Commit one builder change to the site's repository, if the site is linked
 * and sends changes. Resolves either way; never rejects.
 */
export async function mirrorToGitHub(installId: string, change: BuilderChange): Promise<void> {
  const cfg = githubConfig()
  if (!cfg) return
  let db: Db
  try {
    db = createAdminClient()
  } catch {
    return
  }
  const { data: link, error } = await db
    .from("theme_github_links")
    .select("installation_id, repo_full_name, branch, root_path, push_on_save")
    .eq("install_id", installId)
    .maybeSingle()
  if (error || !link || !link.repo_full_name || !link.branch || link.push_on_save === false) return

  const root = link.root_path ?? ""
  const changes: FileChange[] = changesFor(root, change, travels).map((c) => {
    if ("delete" in c) return c
    const bytes = c.content.startsWith("base64:") ? fontBytes(c.content) : null
    return bytes ? { path: c.path, bytes } : c
  })
  if (changes.length === 0) return
  const summary = describeChange(change)
  try {
    const token = await installationToken(cfg, Number(link.installation_id))
    const r = await commitChanges(token, link.repo_full_name, link.branch, changes, `Storelib: ${summary.toLowerCase()}\n\n${COMMIT_MARKER}`)
    if (r.sha) {
      await db
        .from("theme_github_links")
        .update({ last_synced_sha: r.sha, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("install_id", installId)
      await remember(db, installId, root, changes)
    }
    await keepLast(db, installId, { ok: true })
    await recordEvent(db, installId, { direction: "to_github", ok: true, summary: r.sha ? summary : `${summary}; GitHub already had it`, commit_sha: r.sha })
  } catch (e) {
    /* Said in words, with what to do; GitHub's own message is not shown as it is. */
    const why = e instanceof GitHubError ? failureLine(explainFailure(e, { repo: link.repo_full_name, branch: link.branch })) : "GitHub did not answer. Press Push in a minute."
    await db.from("theme_github_links").update({ last_error: `Sending to GitHub: ${why}`, updated_at: new Date().toISOString() }).eq("install_id", installId)
    await keepLast(db, installId, { ok: false, problem: e instanceof GitHubError ? explainFailure(e, {}).problem : "unreachable" })
    await recordEvent(db, installId, { direction: "to_github", ok: false, summary: `${summary}, not sent: ${why}` })
  }
}

/** The blobs just sent, as agreed, so the push that carries them back is known to be Storelib's own. */
async function remember(db: Db, installId: string, root: string, changes: FileChange[]) {
  try {
    const { data, error } = await db.from("theme_github_links").select("sync_state").eq("install_id", installId).maybeSingle()
    if (error) return
    const state = ((data?.sync_state as { files?: Record<string, string> } | null) ?? {}) as { files?: Record<string, string> } & Record<string, unknown>
    const files = { ...(state.files ?? {}) }
    for (const c of changes) {
      const path = c.path.slice(root.length)
      if ("delete" in c) delete files[path]
      else files[path] = gitBlobSha("bytes" in c ? c.bytes : c.content)
    }
    await db.from("theme_github_links").update({ sync_state: { ...state, files } }).eq("install_id", installId)
  } catch {
    /* without part 131 there is no sync_state; the marker and the bot still stop the loop */
  }
}

/**
 * A save that did not reach GitHub is the last sync, so the builder shows it
 * with its fix after a reload; the next one that does reach it clears it.
 * Only a send's own failure is cleared that way: what a push from GitHub
 * could not bring in stays until the next push or Pull.
 */
async function keepLast(db: Db, installId: string, outcome: { ok: true } | { ok: false; problem: string }) {
  try {
    const { data, error } = await db.from("theme_github_links").select("sync_state").eq("install_id", installId).maybeSingle()
    if (error) return
    const state = ((data?.sync_state as SyncState | null) ?? {}) as SyncState & Record<string, unknown>
    const prev = state.last
    if (outcome.ok && (!prev || prev.direction !== "to_github" || prev.ok !== false)) return
    const last: LastSync = {
      at: new Date().toISOString(),
      direction: "to_github",
      commit: null,
      ok: outcome.ok,
      saved: [],
      failed: [],
      notes: [],
      head_at: prev?.head_at ?? null,
      ...(outcome.ok ? {} : { problem: outcome.problem }),
    }
    await db.from("theme_github_links").update({ sync_state: { ...state, last } }).eq("install_id", installId)
  } catch {
    /* without part 131 there is no sync_state; last_error still says it */
  }
}

/**
 * The whole theme to the linked repository, if the site sends builder
 * changes: after a Publish, so the pages and settings an agent reads there
 * are the ones the site has now, not the ones from the last Push. Pictures
 * are not fetched again; the repository keeps the ones it has. Resolves
 * either way, never rejects: exportSite writes a failure to the link and the
 * activity list, with what to do.
 */
export async function mirrorWholeTheme(installId: string, why: string): Promise<void> {
  const cfg = githubConfig()
  if (!cfg) return
  let db: Db
  try {
    db = createAdminClient()
  } catch {
    return
  }
  try {
    const [{ data: link, error }, { data: install }] = await Promise.all([
      db.from("theme_github_links").select("*").eq("install_id", installId).maybeSingle(),
      db.from("store_theme_installs").select("name").eq("id", installId).maybeSingle(),
    ])
    if (error || !link || !link.repo_full_name || !link.branch || link.push_on_save === false) return
    await exportSite(db, cfg, link as GitHubLink, String((install as { name?: string } | null)?.name || "Site"), { fetchMedia: null, reason: why })
  } catch {
    /* exportSite wrote why to the link and the activity list */
  }
}
