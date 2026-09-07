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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const COLUMNS =
  "id, creator_id, name, slug, status, template_id, settings, published_deployment_id, created_at, updated_at"

/** The signed-in user's creator row, or null if they are not one. */
export async function currentCreatorId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function listSites(): Promise<Site[]> {
  const supabase = await createClient()
  const { data } = await supabase.from("sites").select(COLUMNS).order("updated_at", { ascending: false })
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

export type SaveFilesResult = { ok: true; savedAt: string } | { ok: false; error: string }

/**
 * Write changed files back.
 *
 * Takes only what changed, not the project. A whole-project write would make
 * two people editing the same site — or the author and the agent, which is the
 * normal case here — clobber each other's untouched files on every save.
 *
 * RLS is the access control: the upsert runs as the signed-in user, and a site
 * they do not own has no rows they can reach. There is deliberately no
 * ownership check written into this function for a later caller to forget.
 */
export async function saveFiles(siteId: string, changed: ProjectFiles): Promise<SaveFilesResult> {
  const paths = Object.keys(changed)
  if (paths.length === 0) return { ok: true, savedAt: new Date().toISOString() }

  const invalid = projectError(changed)
  if (invalid) return { ok: false, error: invalid }

  const supabase = await createClient()

  /**
   * The site row is touched too, so `updated_at` means "when this site last
   * changed" rather than "when its row was last rewritten" — the dashboard
   * sorts on it, and a site edited an hour ago sitting below one created last
   * week is the kind of wrongness nobody reports and everybody notices.
   *
   * It also proves ownership. Under RLS this update affects zero rows for a
   * site the caller does not own, which is what the count is read for — and it
   * happens BEFORE the file write, so a stranger's save never lands.
   */
  const { count } = await supabase
    .from("sites")
    .update({ updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", siteId)

  if ((count ?? 0) === 0) return { ok: false, error: "That site is not yours to edit." }

  const rows = paths.map((path) => ({ site_id: siteId, path, content: changed[path] }))
  const { error } = await supabase.from("site_files").upsert(rows, { onConflict: "site_id,path" })
  if (error) return { ok: false, error: "Could not save. Your changes are still here — try again." }

  return { ok: true, savedAt: new Date().toISOString() }
}
