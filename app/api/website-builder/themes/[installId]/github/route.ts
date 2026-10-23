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
 *           { action: "pull" }     take every section file on the branch now
 *           { action: "settings", pushOnSave?, pullOnPush? }  the two switches
 *           { action: "change-repo" }  back to the repository picker
 *           { action: "use-branch", branch, then: "push" | "pull" }  follow
 *           another branch of the same repository, and send or take it
 *           { action: "reset-override", path }  a built-in section or block
 *           this site has its own copy of goes back to Storelib's version
 *
 * GET also says what the last sync did, file by file (each one a push could
 * not bring in, with its fix), and which built-in files this site has its own
 * copy of, so the builder can mark them Edited in GitHub.
 *   DELETE  unlink. The repository and its files are left as they are.
 *
 * Signed in, and only for a site that is this creator's. A repository is
 * accepted only if the app's installation can reach it; nothing the browser
 * sends is taken on its word.
 */
import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { githubConfig, installationRepos, installationToken, GitHubError } from "@/lib/github-sync/github"
import { normalizeRoot, validBranch, validRepoName } from "@/lib/github-sync/core"
import { SyncError, exportSiteReport, pullNow, type GitHubLink, type LastSync } from "@/lib/github-sync/sync"
import { explainFailure, failureLine } from "@/lib/github-sync/errors"
import { overridesOf } from "@/lib/github-sync/layout"
import { referenceSchemas } from "@/lib/github-sync/snapshot"
import { mirrorToGitHub } from "@/lib/github-sync/mirror"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { DEFAULT_THEME_SOURCES } from "../../../../../../themes/default/sources.generated"
import { linksNotSetUp, ownInstall } from "@/lib/github-sync/own-install"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

const BASE_SELECT = "install_id, creator_id, installation_id, account_login, repo_id, repo_full_name, branch, root_path, last_synced_sha, last_synced_at, last_error"
const SELECT = `${BASE_SELECT}, push_on_save, pull_on_push`

type Db = ReturnType<typeof createAdminClient>

/** The link, read with the two switches and the sync state, or without them on a database that ran older SQL. */
async function readLink(db: Db, installId: string) {
  const newest = await db.from("theme_github_links").select(`${SELECT}, sync_state`).eq("install_id", installId).maybeSingle()
  if (!newest.error || !/sync_state/.test(newest.error.message)) return newest
  const full = await db.from("theme_github_links").select(SELECT).eq("install_id", installId).maybeSingle()
  if (!full.error || !/push_on_save|pull_on_push/.test(full.error.message)) return full
  return db.from("theme_github_links").select(BASE_SELECT).eq("install_id", installId).maybeSingle()
}

/**
 * The built-in files this site has its own copy of, and where each came
 * from: a push from GitHub, or the builder's code editor. Small reads: the
 * install's settings for whether it is imported, and its rows at built-in
 * paths. An imported theme has no Storelib built-ins.
 */
async function editedBuiltIns(db: Db, installId: string, fromGitHub: Set<string>) {
  const { data: settingsRow } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const settings = (settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) as Record<string, unknown>
  if (compatOf(settings)) return []
  const refs = referenceSchemas()
  const paths = [...Object.keys(DEFAULT_THEME_SOURCES).filter((p) => /^(sections|blocks)\//.test(p)), ...Object.keys(refs).map((t) => `sections/${t}.storelib`)]
  const { data } = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).in("path", paths)
  const files: Record<string, string> = {}
  for (const r of (data ?? []) as { path: string; content: string | null; draft_content?: string | null }[]) {
    const text = r.draft_content ?? r.content
    if (typeof text === "string" && text.trim() !== "") files[r.path] = text
  }
  return overridesOf({ files, defaults: DEFAULT_THEME_SOURCES as Record<string, string>, referenceSchemas: refs, compat: false }).map((o) => ({
    ...o,
    from: fromGitHub.has(o.path) ? ("github" as const) : ("builder" as const),
  }))
}

function publicLink(link: GitHubLink | null) {
  if (!link) return null
  const last = (link.sync_state?.last ?? null) as LastSync | null
  return {
    last: last ? { at: last.at, direction: last.direction, ok: last.ok, commit: last.commit, saved: last.saved.length, failed: last.failed.slice(0, 50), notes: last.notes.slice(0, 30), skipped: (last.skipped ?? []).slice(0, 30), pending: last.pending ?? 0, total: last.total ?? null, sent: last.sent ?? null } : null,
    account: link.account_login,
    repo: link.repo_full_name,
    branch: link.branch,
    folder: link.root_path,
    lastSyncedAt: link.last_synced_at,
    lastSyncedSha: link.last_synced_sha,
    lastError: link.last_error,
    pushOnSave: link.push_on_save !== false,
    pullOnPush: link.pull_on_push !== false,
    /* The newest push to a branch this site does not follow, so the panel can offer to follow it. */
    ignored: link.sync_state?.ignored && typeof link.sync_state.ignored.branch === "string" && link.sync_state.ignored.branch !== link.branch ? { branch: link.sync_state.ignored.branch, at: link.sync_state.ignored.at } : null,
    /* What the last whole sync ran into (lib/github-sync/errors.ts), so the panel offers the one fix for it. */
    problem: last && last.ok === false && typeof last.problem === "string" ? last.problem : null,
  }
}

function explain(e: unknown, link?: Pick<GitHubLink, "repo_full_name" | "branch"> | null): string {
  /* What happened and what to do, never GitHub's own words as they are (lib/github-sync/errors.ts). */
  if (e instanceof GitHubError) return failureLine(explainFailure(e, { repo: link?.repo_full_name, branch: link?.branch }))
  /* Only messages written for the creator. A network or database error's
     own words name internals and are not shown. */
  if (e instanceof SyncError) return e.message
  return "Something went wrong talking to GitHub. Try again."
}

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = githubConfig()
  const db = createAdminClient()

  const { data, error } = await readLink(db, own.installId)
  if (error) {
    return NextResponse.json({ configured: Boolean(cfg), ready: !linksNotSetUp(error.message), link: null, repos: [], accounts: [], events: [] })
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
      reposError = explain(e, link)
    }
  }
  /* What went each way lately, newest first. */
  let events: { id: number; direction: string; ok: boolean; summary: string; commit_sha: string | null; created_at: string }[] = []
  if (link?.repo_full_name) {
    const { data: rows } = await db
      .from("theme_github_events")
      .select("id, direction, ok, summary, commit_sha, created_at")
      .eq("install_id", own.installId)
      .order("id", { ascending: false })
      .limit(8)
    events = (rows ?? []) as typeof events
  }
  /* Built-in files this site has its own copy of, for Edited in GitHub and Reset. Only once a repository is linked. */
  let overrides: { path: string; type: string; kind: string; from: "github" | "builder" }[] = []
  if (link?.repo_full_name) {
    try {
      const fromGitHub = new Set(Object.keys(link.sync_state?.files ?? {}))
      overrides = await editedBuiltIns(db, own.installId, fromGitHub)
    } catch {
      overrides = []
    }
  }
  return NextResponse.json({ configured: Boolean(cfg), ready: true, link: publicLink(link), repos, reposError, accounts, events, overrides })
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const cfg = githubConfig()
  if (!cfg) return NextResponse.json({ error: "GitHub is not set up on this server yet." }, { status: 503 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  /*
    Per site. Pull, Push and linking each spend GitHub calls from the app's
    hourly allowance, which every site on the installation shares; a button
    held down, or a script, must not spend it for all of them.
  */
  const limited = await rateLimit({
    bucket: "github-sync",
    subjects: [`install:${own.installId}`],
    windows: [{ limit: 12, seconds: 60 }, { limit: 150, seconds: 3600 }],
    message: "That is a lot of GitHub syncs in a row. Wait a minute and try again.",
  })
  if (limited) return limited

  const db = createAdminClient()
  const { data, error } = await readLink(db, own.installId)
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

  if (body.action === "settings") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.pushOnSave === "boolean") patch.push_on_save = body.pushOnSave
    if (typeof body.pullOnPush === "boolean") patch.pull_on_push = body.pullOnPush
    const { error: upErr } = await db.from("theme_github_links").update(patch).eq("install_id", own.installId)
    if (upErr) {
      const old = /push_on_save|pull_on_push/.test(upErr.message)
      return NextResponse.json({ error: old ? "Run supabase/sql/RUN_GITHUB_SYNC.sql again to turn these on." : "Could not save" }, { status: old ? 503 : 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.action === "change-repo") {
    await db
      .from("theme_github_links")
      .update({ repo_id: null, repo_full_name: null, branch: null, last_error: null, updated_at: new Date().toISOString() })
      .eq("install_id", own.installId)
    return NextResponse.json({ ok: true })
  }

  /*
    RESET TO STORELIB'S VERSION. The site's own copy of a built-in section or
    block is deleted, so the built-in draws again here as on every other site,
    and the repository gets Storelib's text back (or the file removed, for a
    section Storelib draws itself). Only a built-in path: a section of the
    creator's own is never deleted from here.
  */
  if (body.action === "reset-override") {
    const path = typeof body.path === "string" ? body.path : ""
    const fromGitHub = new Set(Object.keys(link.sync_state?.files ?? {}))
    const edited = await editedBuiltIns(db, own.installId, fromGitHub)
    if (!edited.some((o) => o.path === path)) return NextResponse.json({ error: "That file is not an edited built-in on this site" }, { status: 404 })
    const { error: delErr } = await db.from("store_theme_custom_files").delete().eq("install_id", own.installId).eq("path", path)
    if (delErr) return NextResponse.json({ error: "Could not reset it just now. Try again." }, { status: 500 })
    const shipped = (DEFAULT_THEME_SOURCES as Record<string, string>)[path]
    after(() => mirrorToGitHub(own.installId, typeof shipped === "string" ? { kind: "save", path, content: shipped } : { kind: "delete", path }))
    return NextResponse.json({ ok: true })
  }

  if (body.action === "pull") {
    if (!link.repo_full_name) return NextResponse.json({ error: "Pick a repository first" }, { status: 409 })
    try {
      const r = await pullNow(db, cfg, link, own.name)
      return NextResponse.json({ ok: true, ...r })
    } catch (e) {
      return NextResponse.json({ error: explain(e, link) }, { status: 502 })
    }
  }

  /*
    THE ONE FIX FOR TWO DEAD ENDS. A protected branch Storelib may not write
    to, and an agent that therefore pushed to a branch of its own which this
    site does not follow: both end with the site and the repository on
    different branches. `use-branch` moves the link to the branch named (the
    same repository and folder), then sends the site there (`then: "push"`,
    which makes the branch when it is new) or brings that branch in
    (`then: "pull"`). Nothing is deleted on either side.
  */
  if (body.action === "use-branch") {
    if (!link.repo_full_name) return NextResponse.json({ error: "Pick a repository first" }, { status: 409 })
    const next = typeof body.branch === "string" ? body.branch.trim() : ""
    if (!validBranch(next)) return NextResponse.json({ error: "That branch name is not valid" }, { status: 400 })
    const then = body.then === "pull" ? "pull" : "push"
    const { ignored: _ignored, ...state } = (link.sync_state ?? {}) as NonNullable<GitHubLink["sync_state"]>
    void _ignored
    const { error: upErr } = await db
      .from("theme_github_links")
      .update({ branch: next, last_error: null, updated_at: new Date().toISOString(), ...(link.sync_state ? { sync_state: state } : {}) })
      .eq("install_id", own.installId)
    if (upErr) return NextResponse.json({ error: "Could not save the link" }, { status: 500 })
    link = { ...link, branch: next, last_error: null, sync_state: link.sync_state ? state : link.sync_state }
    if (then === "pull") {
      try {
        const r = await pullNow(db, cfg, link, own.name)
        return NextResponse.json({ ok: true, branch: next, ...r, link: publicLink(link) })
      } catch (e) {
        return NextResponse.json({ error: explain(e, link) }, { status: 502 })
      }
    }
  } else if (body.action === "select") {
    if (!validRepoName(body.repo)) return NextResponse.json({ error: "Pick a repository" }, { status: 400 })
    let token: string
    let repo
    try {
      token = await installationToken(cfg, link.installation_id)
      repo = (await installationRepos(token)).find((r) => r.full_name.toLowerCase() === String(body.repo).toLowerCase())
    } catch (e) {
      return NextResponse.json({ error: explain(e, link) }, { status: 502 })
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
    const r = await exportSiteReport(db, cfg, link, own.name)
    /* The link as the send left it: its status is what GitHub now holds, not a guess. */
    const { data: fresh } = await readLink(db, own.installId)
    return NextResponse.json({
      ok: true,
      commit: r.sha,
      upToDate: r.sha === null && r.pending === 0 && r.failed.length === 0,
      /* Files still to send: the panel asks again, and each send takes only what GitHub does not have yet. */
      more: r.pending > 0,
      pending: r.pending,
      sent: r.sent,
      total: r.total,
      failed: r.failed.slice(0, 50),
      link: publicLink((fresh as GitHubLink | null) ?? { ...link, last_synced_sha: r.sha ?? link.last_synced_sha, last_synced_at: new Date().toISOString(), last_error: null }),
    })
  } catch (e) {
    /* exportSite has written the reason to the link and the activity list already. */
    const message = explain(e, link)
    if (!(e instanceof SyncError)) await db.from("theme_github_links").update({ last_error: message, updated_at: new Date().toISOString() }).eq("install_id", own.installId)
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
