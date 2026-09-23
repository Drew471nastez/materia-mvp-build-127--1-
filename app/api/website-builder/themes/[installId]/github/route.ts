/**
 * ===========================================================================
 *  ONE SITE'S GITHUB LINK
 * ===========================================================================
 *   GET     whether GitHub is set up, this site's link, and, while no
 *           repository is picked, the repositories the creator gave access to
 *   POST    { action: "select", repo, branch?, folder? }  link a repository
 *           and write the site's section files into it
 *           { action: "export" }   write them again ("Send to GitHub")
 *           { action: "reuse", installationId }  use a GitHub account this
 *           creator already connected for another site
 *   DELETE  unlink. The repository and its files are left as they are.
 *
 * Signed in, and only for a site that is this creator's. A repository is
 * accepted only if the app's installation can reach it; nothing the browser
 * sends is taken on its word.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { githubConfig, installationRepos, installationToken, GitHubError } from "@/lib/github-sync/github"
import { normalizeRoot, validBranch, validRepoName } from "@/lib/github-sync/core"
import { exportSite, type GitHubLink } from "@/lib/github-sync/sync"
import { linksNotSetUp, ownInstall } from "@/lib/github-sync/own-install"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

const SELECT = "install_id, creator_id, installation_id, account_login, repo_id, repo_full_name, branch, root_path, last_synced_sha, last_synced_at, last_error"

function publicLink(link: GitHubLink | null) {
  if (!link) return null
  return {
    account: link.account_login,
    repo: link.repo_full_name,
    branch: link.branch,
    folder: link.root_path,
    lastSyncedAt: link.last_synced_at,
    lastSyncedSha: link.last_synced_sha,
    lastError: link.last_error,
  }
}

function explain(e: unknown): string {
  if (e instanceof GitHubError) {
    if (e.status === 403) return "GitHub refused. The Storelib app needs Contents: read and write on this repository."
    if (e.status === 404) return "GitHub could not find that repository or branch."
    if (e.status === 409) return "GitHub reported a conflict on that branch. Try again in a moment."
    return `GitHub: ${e.message}`
  }
  return e instanceof Error ? e.message : "Something went wrong talking to GitHub"
}

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = githubConfig()
  const db = createAdminClient()
  const { data, error } = await db.from("theme_github_links").select(SELECT).eq("install_id", own.installId).maybeSingle()
  if (error) {
    return NextResponse.json({ configured: Boolean(cfg), ready: !linksNotSetUp(error.message), link: null, repos: [], accounts: [] })
  }
  const link = data as GitHubLink | null

  /* GitHub accounts this creator linked for another site, to reuse in one tap. */
  const { data: others } = await db
    .from("theme_github_links")
    .select("installation_id, account_login")
    .eq("creator_id", own.creatorId)
    .neq("install_id", own.installId)
  const accounts = [...new Map(((others ?? []) as { installation_id: number; account_login: string }[])
    .map((o) => [Number(o.installation_id), { installationId: Number(o.installation_id), account: o.account_login }])).values()]

  let repos: { fullName: string; defaultBranch: string; private: boolean }[] = []
  let reposError: string | null = null
  if (cfg && link && !link.repo_full_name) {
    try {
      const token = await installationToken(cfg, link.installation_id)
      repos = (await installationRepos(token)).map((r) => ({ fullName: r.full_name, defaultBranch: r.default_branch, private: r.private }))
    } catch (e) {
      reposError = explain(e)
    }
  }
  return NextResponse.json({ configured: Boolean(cfg), ready: true, link: publicLink(link), repos, reposError, accounts })
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = githubConfig()
  if (!cfg) return NextResponse.json({ error: "GitHub is not set up on this server yet." }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = createAdminClient()
  const { data, error } = await db.from("theme_github_links").select(SELECT).eq("install_id", own.installId).maybeSingle()
  if (error) {
    return NextResponse.json(
      { error: linksNotSetUp(error.message) ? "GitHub needs a database update first. Run supabase/sql/RUN_GITHUB_SYNC.sql." : "Could not read the link" },
      { status: 503 },
    )
  }
  let link = data as GitHubLink | null

  if (body.action === "reuse") {
    const installationId = Number(body.installationId)
    const { data: mine } = await db
      .from("theme_github_links")
      .select("installation_id, account_login")
      .eq("creator_id", own.creatorId)
      .eq("installation_id", installationId)
      .limit(1)
    /* Only an installation this creator already proved they own, for another site. */
    const found = (mine ?? [])[0] as { installation_id: number; account_login: string } | undefined
    if (!found) return NextResponse.json({ error: "That GitHub account is not connected to your other sites" }, { status: 403 })
    const { error: upErr } = await db.from("theme_github_links").upsert(
      {
        install_id: own.installId,
        creator_id: own.creatorId,
        installation_id: installationId,
        account_login: found.account_login,
        repo_id: null,
        repo_full_name: null,
        branch: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "install_id" },
    )
    if (upErr) return NextResponse.json({ error: "Could not save the link" }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!link) return NextResponse.json({ error: "Connect GitHub first" }, { status: 409 })

  if (body.action === "select") {
    if (!validRepoName(body.repo)) return NextResponse.json({ error: "Pick a repository" }, { status: 400 })
    let token: string
    let repo
    try {
      token = await installationToken(cfg, link.installation_id)
      repo = (await installationRepos(token)).find((r) => r.full_name.toLowerCase() === String(body.repo).toLowerCase())
    } catch (e) {
      return NextResponse.json({ error: explain(e) }, { status: 502 })
    }
    if (!repo) return NextResponse.json({ error: "Storelib cannot reach that repository. Give the app access to it on GitHub." }, { status: 403 })
    const branch = body.branch === undefined || body.branch === "" ? repo.default_branch : body.branch
    if (!validBranch(branch)) return NextResponse.json({ error: "That branch name is not valid" }, { status: 400 })
    const root = normalizeRoot(body.folder)
    const { error: upErr } = await db
      .from("theme_github_links")
      .update({ repo_id: repo.id, repo_full_name: repo.full_name, branch, root_path: root, last_error: null, updated_at: new Date().toISOString() })
      .eq("install_id", own.installId)
    if (upErr) return NextResponse.json({ error: "Could not save the link" }, { status: 500 })
    link = { ...link, repo_id: repo.id, repo_full_name: repo.full_name, branch, root_path: root }
  } else if (body.action !== "export") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  try {
    const sha = await exportSite(db, cfg, link, own.name)
    return NextResponse.json({ ok: true, commit: sha, upToDate: sha === null, link: publicLink({ ...link, last_synced_sha: sha ?? link.last_synced_sha, last_synced_at: new Date().toISOString(), last_error: null }) })
  } catch (e) {
    const message = explain(e)
    await db.from("theme_github_links").update({ last_error: message, updated_at: new Date().toISOString() }).eq("install_id", own.installId)
    return NextResponse.json({ error: message, link: publicLink({ ...link, last_error: message }) }, { status: 502 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const { error } = await createAdminClient().from("theme_github_links").delete().eq("install_id", own.installId)
  if (error && !linksNotSetUp(error.message)) return NextResponse.json({ error: "Could not disconnect" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
