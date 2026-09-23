/**
 * ===========================================================================
 *  THE BUILDER'S SAVES, COMMITTED TO THE LINKED REPOSITORY
 * ===========================================================================
 * The other half of two-way sync. When a section file is saved in the
 * builder (the code editor, Ask AI writing a section, an agent on a direct
 * connection), and the site is linked with "Builder changes go to GitHub" on,
 * the same change is committed to the linked branch. A file renamed or
 * deleted in the builder is renamed or deleted there too.
 *
 * Called from the routes through `after()`: the save answers the person at
 * once and the commit follows. It never fails the save it follows; a commit
 * that does not land is written to the Connections activity list instead.
 *
 * NOT called for a save that came FROM GitHub (lib/github-sync/sync.ts), and
 * every commit carries COMMIT_MARKER and is made by the app's bot, so a
 * change never goes round in a circle.
 */
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { COMMIT_MARKER, changesFor, describeChange, statusLine, type BuilderChange } from "./core"
import { GitHubError, commitFiles, githubConfig, installationToken } from "./github"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** Write one line to the Connections activity list. Never throws. */
export async function recordEvent(
  db: Db,
  installId: string,
  e: { direction: "to_github" | "from_github"; ok: boolean; summary: string; commit_sha?: string | null },
) {
  try {
    await db.from("theme_github_events").insert({
      install_id: installId,
      direction: e.direction,
      ok: e.ok,
      summary: statusLine(e.summary).slice(0, 300),
      commit_sha: e.commit_sha ?? null,
    })
  } catch {
    /* the table may not exist yet */
  }
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

  const changes = changesFor(link.root_path ?? "", change)
  if (changes.length === 0) return
  const summary = describeChange(change)
  try {
    const token = await installationToken(cfg, Number(link.installation_id))
    const sha = await commitFiles(token, link.repo_full_name, link.branch, changes, `Storelib: ${summary.toLowerCase()}\n\n${COMMIT_MARKER}`)
    if (sha) {
      await db
        .from("theme_github_links")
        .update({ last_synced_sha: sha, last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
        .eq("install_id", installId)
    }
    await recordEvent(db, installId, { direction: "to_github", ok: true, summary: sha ? summary : `${summary}; GitHub already had it`, commit_sha: sha })
  } catch (e) {
    /* GitHub's own message says what to fix; anything else is not shown as is. */
    const why = e instanceof GitHubError ? e.message : "GitHub did not answer"
    await db.from("theme_github_links").update({ last_error: `Sending to GitHub: ${why}`, updated_at: new Date().toISOString() }).eq("install_id", installId)
    await recordEvent(db, installId, { direction: "to_github", ok: false, summary: `${summary}, not sent: ${why}` })
  }
}
