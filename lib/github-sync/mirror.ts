/**
 * ===========================================================================
 *  THE BUILDER'S SAVES, COMMITTED TO THE LINKED REPOSITORY
 * ===========================================================================
 * The other half of two-way sync. When a file is saved in the builder (the
 * code editor, Ask AI writing a section, an agent on a direct connection),
 * and the site is linked with "Builder changes go to GitHub" on, the change
 * is committed to the linked branch: a Storelib section or block file as
 * itself (renamed or deleted there too), anything else, an imported theme's
 * files among them, as the whole theme (exportSite), which GitHub turns into
 * nothing when it already matches. A publish sends the whole theme as well
 * (mirrorWholeTheme), so pages and settings reach the repository too.
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
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { COMMIT_MARKER, changesFor, describeChange, type BuilderChange } from "./core"
import { GitHubError, commitFiles, githubConfig, installationToken } from "./github"
import { recordEvent } from "./events"
import { SyncError, exportSite, type GitHubLink } from "./sync"

export { recordEvent }

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

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
  /* An imported theme's file lives in the repository under the theme's own name and folder: the whole theme goes, as one commit. */
  if (changes.length === 0 || (change.kind !== "delete" && isCompatSource(change.content))) {
    await mirrorWholeTheme(installId, describeChange(change))
    return
  }
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

/**
 * The whole theme to the linked repository, if the site sends builder
 * changes: after a publish, and for a change no single file describes.
 * Resolves either way; never rejects.
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
  const [{ data: link, error }, { data: install }] = await Promise.all([
    db.from("theme_github_links").select("*").eq("install_id", installId).maybeSingle(),
    db.from("store_theme_installs").select("name").eq("id", installId).maybeSingle(),
  ])
  if (error || !link || !link.repo_full_name || !link.branch || link.push_on_save === false) return
  try {
    await exportSite(db, cfg, link as GitHubLink, String((install as { name?: string } | null)?.name ?? "Website"))
  } catch (e) {
    const reason = e instanceof GitHubError || e instanceof SyncError ? e.message : "GitHub did not answer"
    await db.from("theme_github_links").update({ last_error: `Sending to GitHub: ${reason}`, updated_at: new Date().toISOString() }).eq("install_id", installId)
    await recordEvent(db, installId, { direction: "to_github", ok: false, summary: `${why}, not sent: ${reason}` })
  }
}
