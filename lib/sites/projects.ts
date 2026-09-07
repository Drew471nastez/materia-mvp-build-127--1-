import "server-only"

/**
 * Creating and reading a site's project, server-side.
 *
 * Everything here runs as the signed-in user through the normal Supabase
 * client, so RLS is the access control — not a check in this file that could
 * be forgotten at the next call site. The admin client appears nowhere in this
 * module, deliberately: the only thing that needs it is serving a PUBLISHED
 * site to a stranger, which is a different file with a different filter.
 */

import { createClient } from "@/lib/supabase/server"
import { currentCreatorId } from "@/lib/creators/current"
import { blankProject } from "./starter"
import { siteCountGate, type SitePlan } from "./plan"
import { projectError } from "./file-path"
import { siteSlugError, toSiteSlug } from "./slug"
import type { ProjectFiles, Site } from "./types"

interface SiteRow {
  id: string
  creator_id: string
  name: string
  slug: string | null
  status: string
  template_id: string | null
  settings: unknown
  published_deployment_id: string | null
  created_at: string
  updated_at: string
}

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    creatorId: row.creator_id,
    name: row.name,
    slug: row.slug,
    status: (row.status as Site["status"]) ?? "draft",
    templateId: row.template_id,
    settings: (row.settings as Site["settings"]) ?? {},
    publishedDeploymentId: row.published_deployment_id,
    revision: (row as { revision?: number }).revision ?? 1,
    previewRevision: (row as { preview_revision?: number | null }).preview_revision ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COLUMNS =
  "id, creator_id, name, slug, status, template_id, settings, published_deployment_id, revision, preview_revision, created_at, updated_at"

/**
 * The signed-in user's creator id, or null if they are not one.
 *
 * Defined in lib/creators/current.ts and re-exported here for every existing
 * caller. It is not implemented in this file on purpose: this module never
 * imports the admin client, because RLS is the only thing standing between
 * one creator's project files and another's, and a file that reads and
 * writes actual site content should not be able to route around that even by
 * accident. Resolving "what is my own id" is a narrower question — scoped to
 * the caller's own verified auth id, so there is no other creator's row for
 * it to leak — and it lives in its own small file for exactly that reason.
 */
export { currentCreatorId }

export async function listSites(): Promise<Site[]> {
  const creatorId = await currentCreatorId()
  if (!creatorId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from("sites")
    .select(COLUMNS)
    .eq("creator_id", creatorId)
    .order("updated_at", { ascending: false })
  return ((data as SiteRow[] | null) ?? []).map(toSite)
}

export async function getSite(siteId: string): Promise<Site | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("sites").select(COLUMNS).eq("id", siteId).maybeSingle()
  return data ? toSite(data as SiteRow) : null
}

/** Every file of a project, as the bundler and the agent want it. */
export async function readProject(siteId: string): Promise<ProjectFiles> {
  const supabase = await createClient()
  const { data } = await supabase.from("site_files").select("path, content").eq("site_id", siteId)
  const files: ProjectFiles = {}
  for (const row of (data as Array<{ path: string; content: string }> | null) ?? []) {
    files[row.path] = row.content
  }
  return files
}

export interface CreateSiteInput {
  name: string
  /** Not used yet — recorded so support can tell what a site began as. */
  templateId?: string | null
  files?: ProjectFiles
}

export type CreateSiteResult =
  | { ok: true; site: Site }
  | { ok: false; error: string }

/**
 * A new site and its first commit of files, in that order.
 *
 * THE SLUG IS RESERVED AT CREATION, not at publish. It is the site's address
 * and people say it out loud before they publish — finding out at the last
 * step that `andrew` was taken, after building the whole thing, is the worst
 * possible moment to learn it. A collision here just appends a number.
 *
 * The plan gate is enforced HERE and not only in the UI. A disabled button is
 * a hint; this is the rule.
 */
export async function createSite(
  input: CreateSiteInput,
  plan: SitePlan,
): Promise<CreateSiteResult> {
  const name = input.name.trim().slice(0, 60)
  if (!name) return { ok: false, error: "Give your site a name." }

  const creatorId = await currentCreatorId()
  if (!creatorId) return { ok: false, error: "Only creators can build sites." }

  const supabase = await createClient()

  const { count } = await supabase
    .from("sites")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
  const gate = siteCountGate(plan, count ?? 0)
  if (gate) return { ok: false, error: gate }

  const slug = await availableSlug(name)

  const { data, error } = await supabase
    .from("sites")
    .insert({
      creator_id: creatorId,
      name,
      slug,
      status: "draft",
      template_id: input.templateId ?? null,
      settings: {},
    })
    .select(COLUMNS)
    .single()

  if (error || !data) return { ok: false, error: "Could not create the site. Try again." }
  const site = toSite(data as SiteRow)

  const files = input.files ?? blankProject(name)
  const rows = Object.entries(files).map(([path, content]) => ({ site_id: site.id, path, content }))
  const { error: filesError } = await supabase.from("site_files").insert(rows)

  if (filesError) {
    /**
     * A site row with no files is not a site — it is a broken row that will
     * render an empty editor and confuse whoever opens it next. There is no
     * transaction across these two inserts from here, so the compensation is
     * explicit.
     */
    await supabase.from("sites").delete().eq("id", site.id)
    return { ok: false, error: "Could not create the site. Try again." }
  }

  return { ok: true, site }
}

/**
 * A free slug derived from the name.
 *
 * Reads before writing, which races — two people creating "Studio" in the same
 * second can both see it free. The unique index on `lower(slug)` is what
 * actually decides; this is only here so the common case gets a nice address
 * instead of `studio-7`.
 */
async function availableSlug(name: string): Promise<string | null> {
  const base = toSiteSlug(name)
  if (siteSlugError(base)) return null

  const supabase = await createClient()
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`.slice(0, 63)
    if (siteSlugError(candidate)) continue
    const { count } = await supabase
      .from("sites")
      .select("id", { count: "exact", head: true })
      .eq("slug", candidate)
    if ((count ?? 0) === 0) return candidate
  }
  return null
}

export type SaveFilesResult =
  | { ok: true; savedAt: string; revision: number }
  | { ok: false; error: string; conflict?: true }

/**
 * Write changed files back, without losing anybody's work.
 *
 * ---------------------------------------------------------------------------
 *  ONE WRITER PER SITE, AND A TOKEN THAT SAYS WHAT YOU SAW
 * ---------------------------------------------------------------------------
 * This used to be a bare upsert with no revision and no lock. The editor
 * autosaves every 1.2 seconds and an agent run writes its whole changed set at
 * the end, so typing during a run meant one of the two writes silently won —
 * a creator watching their own edit vanish with no error, which is the single
 * bug most likely to make somebody stop trusting a builder.
 *
 * Everything now goes through the `site_commit_files` function, which takes a
 * per-site advisory lock, checks the caller's `expectedRevision` against the
 * stored one, writes every file and bumps the revision — all in one
 * transaction. A stale caller gets NULL and is told to reload rather than
 * having its write applied over newer work.
 *
 * `expectedRevision` may be omitted, and that is not a loophole: the function
 * still serialises on the lock, so a blind write cannot interleave with
 * another. It just accepts whatever revision it finds, which is right for a
 * caller that has only ever read the current state.
 *
 * RLS still decides ownership. The function is SECURITY INVOKER, so a site the
 * caller does not own returns no row and the write is refused — the same
 * answer a stale revision gets, from the same code path.
 */
export async function saveFiles(
  siteId: string,
  changed: ProjectFiles,
  expectedRevision?: number,
): Promise<SaveFilesResult> {
  const paths = Object.keys(changed)
  if (paths.length === 0) {
    return { ok: true, savedAt: new Date().toISOString(), revision: expectedRevision ?? 0 }
  }

  const invalid = projectError(changed)
  if (invalid) return { ok: false, error: invalid }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("site_commit_files", {
    p_site_id: siteId,
    p_expected_revision: expectedRevision ?? null,
    p_files: changed,
  })

  if (error) return { ok: false, error: "Could not save. Your changes are still here — try again." }

  /**
   * NULL means one of two things and the message covers both: the site is not
   * the caller's, or somebody else has written since they last read. Neither
   * is worth distinguishing to the person — the action is the same, and
   * spelling out which site exists would answer a question a stranger should
   * not get answered.
   */
  if (data === null || data === undefined) {
    return {
      ok: false,
      error: "This site changed while you were editing. Reload to see the latest version.",
      conflict: true,
    }
  }

  return { ok: true, savedAt: new Date().toISOString(), revision: data as number }
}

/**
 * The site's current write revision, or null if the caller cannot see it.
 *
 * Read through the user's client so RLS answers the ownership question, and
 * returned alongside the files so a client always holds a revision that
 * matches the content it holds.
 */
export async function siteRevision(siteId: string): Promise<number | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("sites").select("revision").eq("id", siteId).maybeSingle()
  return (data as { revision: number } | null)?.revision ?? null
}
