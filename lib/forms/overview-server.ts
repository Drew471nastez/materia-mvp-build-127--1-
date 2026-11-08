import "server-only"

/**
 * ===========================================================================
 *  THE FORMS LIST'S FACTS, READ ON THE SERVER (round 51, Contacts › Forms)
 * ===========================================================================
 * For every form of the signed in owner: how many responses it has and
 * where it is used (which OnePage, which website page, the creator page). A
 * fixed number of reads, whatever the number of forms:
 *
 *   counts   one read of native_forms with the embedded count of its
 *            form_submissions (PostgREST `form_submissions(count)`); if the
 *            database refuses it, one head count per form, at most 100, in
 *            parallel, never one after another.
 *   usages   the owner's OnePage (draft and published blocks, chat buttons'
 *            and booking buttons' questions included), their creator page
 *            configs and their websites' pages, each read once and searched
 *            for the forms' ids. Bounded: 5 OnePages, 10 creator page
 *            configs, 10 websites with their pages.
 *   website  the older website builder's own forms (site_forms, with their
 *            site_form_submissions counted the same way), when that table
 *            is there.
 *
 * Every read is filtered by the owner (owner_id = the signed in user) or by
 * their creator id, which is found from the session, never the request. A
 * table that is not there is an empty answer, never a failure: the list
 * still draws.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { idsIn, type FormUsage } from "./kind"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const quiet = <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> =>
  Promise.resolve(p).then(
    (r) => (r.error ? null : r.data),
    () => null,
  )

/** Responses per form, keyed by form id. */
export async function responseCounts(db: Db, ownerId: string, formIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!formIds.length) return out
  const { data, error } = await Promise.resolve(
    db.from("native_forms").select("id,form_submissions(count)").eq("owner_id", ownerId).in("id", formIds.slice(0, 100)),
  ).catch((e: unknown) => ({ data: null, error: e }))
  if (!error && Array.isArray(data)) {
    for (const row of data as { id: string; form_submissions?: { count?: number }[] | null }[]) out.set(row.id, Number(row.form_submissions?.[0]?.count ?? 0) || 0)
    return out
  }
  /* The embedded count was refused: one head count per form, side by side. */
  await Promise.all(
    formIds.slice(0, 100).map(async (id) => {
      const r = await Promise.resolve(db.from("form_submissions").select("id", { count: "exact", head: true }).eq("owner_id", ownerId).eq("form_id", id)).catch(() => ({ count: 0 }))
      out.set(id, (r as { count?: number | null }).count ?? 0)
    }),
  )
  return out
}

/** Where each form is used, keyed by form id (lower case). */
export async function formUsages(admin: Db, ownerId: string, creatorId: string | null, formIds: string[]): Promise<Map<string, FormUsage[]>> {
  const out = new Map<string, FormUsage[]>()
  const wanted = new Set(formIds.map((id) => id.toLowerCase()))
  if (!wanted.size) return out
  const add = (ids: Set<string>, usage: FormUsage) => {
    for (const id of ids) {
      const list = out.get(id) ?? []
      if (!list.some((u) => u.kind === usage.kind && u.label === usage.label)) list.push(usage)
      out.set(id, list)
    }
  }
  const [onepages, configs, installs] = await Promise.all([
    quiet<{ id: string; title: string | null; slug: string | null; draft_blocks: unknown; published_blocks: unknown }[]>(
      admin.from("onepages").select("id,title,slug,draft_blocks,published_blocks").eq("owner_id", ownerId).limit(5),
    ),
    creatorId
      ? quiet<{ id: string; page_type: string | null; draft_config: unknown; published_config: unknown }[]>(
          admin.from("store_builder_configs").select("id,page_type,draft_config,published_config").eq("creator_id", creatorId).limit(10),
        )
      : Promise.resolve(null),
    creatorId
      ? quiet<{ id: string; name: string | null; status: string | null; pages?: { page_key: string | null; sections: unknown; draft_sections: unknown }[] | null }[]>(
          admin
            .from("store_theme_installs")
            .select("id,name,status,pages:store_theme_pages(page_key,sections,draft_sections)")
            .eq("creator_id", creatorId)
            .order("updated_at", { ascending: false })
            .limit(10),
        )
      : Promise.resolve(null),
  ])
  for (const p of onepages ?? []) {
    const ids = idsIn([p.draft_blocks, p.published_blocks], wanted)
    add(ids, { kind: "onepage", label: p.title?.trim() || (p.slug ? `/${p.slug}` : "OnePage"), href: "/app/onepage" })
  }
  for (const c of configs ?? []) {
    const ids = idsIn([c.draft_config, c.published_config], wanted)
    add(ids, { kind: "creator_page", label: "Creator Page", href: "/creator-page" })
  }
  for (const install of installs ?? []) {
    for (const page of install.pages ?? []) {
      const ids = idsIn([page.sections, page.draft_sections], wanted)
      const name = install.name?.trim() || "Website"
      const pageName = page.page_key && page.page_key !== "index" && page.page_key !== "home" ? ` › ${page.page_key}` : ""
      add(ids, { kind: "website", label: `${name}${pageName}`, href: `/website-builder/editor/${install.id}` })
    }
  }
  return out
}

export interface SiteFormRow {
  id: string
  site_id: string
  name: string
  site_name: string | null
  created_at: string
  responses: number
}

/** The older website builder's forms (site_forms), with their responses counted; empty when the tables are not there. */
export async function siteFormsOf(admin: Db, creatorId: string | null): Promise<SiteFormRow[]> {
  if (!creatorId) return []
  const sites = await quiet<{ id: string; name: string | null }[]>(admin.from("sites").select("id,name").eq("creator_id", creatorId).limit(50))
  if (!sites?.length) return []
  const names = new Map(sites.map((s) => [s.id, s.name]))
  const forms = await quiet<{ id: string; site_id: string; name: string; created_at: string; site_form_submissions?: { count?: number }[] | null }[]>(
    admin.from("site_forms").select("id,site_id,name,created_at,site_form_submissions(count)").in("site_id", [...names.keys()]).order("created_at", { ascending: false }).limit(100),
  )
  return (forms ?? []).map((f) => ({
    id: f.id,
    site_id: f.site_id,
    name: f.name,
    site_name: names.get(f.site_id) ?? null,
    created_at: f.created_at,
    responses: Number(f.site_form_submissions?.[0]?.count ?? 0) || 0,
  }))
}

/** The creator id of the signed in owner, or null. */
export async function creatorIdOf(admin: Db, userId: string): Promise<string | null> {
  const row = await quiet<{ id: string }>(admin.from("creators").select("id").eq("user_id", userId).maybeSingle())
  return row?.id ?? null
}

/** The service role client, filtered by owner or creator in every read above. */
export function overviewAdmin(): Db {
  return createAdminClient()
}
