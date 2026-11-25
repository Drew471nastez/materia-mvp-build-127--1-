import "server-only"

/**
 * ===========================================================================
 *  BUILD A WEBSITE FOR A CREATOR FROM THE STORELIB DEFAULT TEMPLATE (round 63)
 * ===========================================================================
 * The admin console's Build website, for one creator:
 *
 *   1. their own content is read from the database (readCreatorRows) and
 *      sorted into what is theirs (./content.ts);
 *   2. the library limit is asked first: a full library is refused and
 *      nothing is made (the owner, or the creator, removes one first);
 *   3. the current Storelib Default template is composed the way Browse
 *      themes adds it, at its newest published release when there is one
 *      (lib/themes/releases-server.ts), else from theme-packages/;
 *   4. its sample shop is replaced with their content (./tailor.ts);
 *   5. it is imported by the template install every template goes through
 *      (lib/themes/template-install.ts installCodeTemplate, then
 *      imported-theme-store.ts): a NEW install, status "draft", first in
 *      their library, within the limit, its rows all or nothing;
 *   6. it remembers the listing and release it came from, as Add marks it,
 *      so the library says In library and offers later releases.
 *
 * NEVER THEIR CURRENT WEBSITE. Nothing here updates or deletes an existing
 * install; the only writes are the new install's own rows. It is not
 * published: the creator (or the owner signed in as them) reviews it in the
 * website builder and presses Publish, which runs the publish route's own
 * checks, backups and history.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { composeTemplateFiles } from "@/lib/themes/template-packages"
import { installCodeTemplate } from "@/lib/themes/template-install"
import { DEFAULT_LISTING_SLUG, LISTING_SETTINGS_KEY } from "@/lib/themes/marketplace-shared"
import { withInstalledRelease } from "@/lib/themes/releases-shared"
import { readReleaseRows, releasedFiles, zipOf } from "@/lib/themes/releases-server"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, librarySlotsLeft } from "@/lib/website-builder/library-limit"
import { readStoreMenus } from "@/lib/website-builder/store-menus-server"
import { creatorSiteContent, type CreatorRows, type CreatorSiteContent } from "./content"
import { templateSampleText } from "./samples"
import { tailorTemplate } from "./tailor"
import { ADMIN_BUILT_KEY, adminBuiltMark, type AdminBuiltMark } from "./publish"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/** The Materia template Browse themes lists as Storelib Default. */
export const DEFAULT_TEMPLATE = "default"
export const BUILT_SITE_NAME = "Storelib Default with your content"

export type ReadFailure = { ok: false; status: number; error: string; code?: string }

/** The header fields of the creator page this reads; the contact address and anything else private never leave here. */
const HEADER_FIELDS = ["bio", "avatarUrl", "coverImageUrl", "socialLinks", "logoUrl"] as const

/** Their rows, read with the service role: a read that fails is a refusal, never a website built from half of them. */
export async function readCreatorRows(admin: Admin, creatorId: string): Promise<({ ok: true; rows: CreatorRows; userId: string | null }) | ReadFailure> {
  const failed = (what: string): ReadFailure => ({ ok: false, status: 503, error: `Could not read the creator's ${what}. Nothing was made. Try again.` })

  const { data: creator, error: cErr } = await admin.from("creators").select("id, user_id, slug, username, display_name").eq("id", creatorId).maybeSingle()
  if (cErr) return failed("account")
  if (!creator) return { ok: false, status: 404, error: "No creator has this id." }
  const c = creator as { id: string; user_id: string | null; slug: string | null; username: string | null; display_name: string | null }

  const [profile, config, live, products] = await Promise.all([
    c.user_id ? admin.from("profiles").select("display_name, username, avatar_url").eq("id", c.user_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    admin.from("store_builder_configs").select("published_config").eq("creator_id", c.id).eq("page_type", "shop").maybeSingle(),
    admin.from("store_theme_installs").select("id, store_theme_settings ( settings )").eq("creator_id", c.id).eq("status", "published").order("sort_order", { ascending: true }).limit(1).maybeSingle(),
    admin.from("products").select("id, title, slug").eq("creator_id", c.id).eq("status", "published").order("created_at", { ascending: false }).limit(50),
  ])
  if (profile.error) return failed("profile")
  if (config.error) return failed("creator page")
  if (live.error) return failed("live website")
  if (products.error) return failed("products")

  let liveRows: CreatorRows["live"] = null
  const install = live.data as { id: string; store_theme_settings?: unknown } | null
  if (install) {
    const { data: pages, error } = await admin.from("store_theme_pages").select("page_key, sections").eq("install_id", install.id)
    if (error) return failed("live website")
    const s = Array.isArray(install.store_theme_settings) ? install.store_theme_settings[0] : install.store_theme_settings
    liveRows = { settings: (s as { settings?: unknown } | null)?.settings ?? null, pages: ((pages ?? []) as { page_key: string; sections: unknown }[]) }
  }

  const published = ((config.data as { published_config?: unknown } | null)?.published_config ?? {}) as Record<string, unknown>
  const header = (published.headerSettings ?? {}) as Record<string, unknown>
  const headerSettings = Object.fromEntries(HEADER_FIELDS.filter((k) => k in header).map((k) => [k, header[k]]))

  let menus: unknown = null
  try {
    const read = await readStoreMenus(admin, c.id)
    menus = read.kind === "stored" ? read.menus : null
  } catch {
    /* Menus only name the shop's heading; a website is built without them. */
  }

  return {
    ok: true,
    userId: c.user_id,
    rows: {
      creator: c,
      profile: (profile.data as CreatorRows["profile"]) ?? null,
      shopConfig: { headerSettings },
      live: liveRows,
      menus,
      products: (products.data ?? []) as CreatorRows["products"],
    },
  }
}

export interface BuildDeps {
  /** The template's files and the release they are at (null: as the code has them). */
  files?: () => Promise<{ files: Map<string, Buffer>; version: string | null }>
  install?: typeof installCodeTemplate
  samples?: () => ReadonlySet<string>
}

/** Storelib Default as Browse themes adds it: its newest published release, else the code's. */
async function currentDefaultFiles(): Promise<{ files: Map<string, Buffer>; version: string | null }> {
  try {
    const { rows } = await readReleaseRows({ withFiles: true })
    const at = rows.length ? await releasedFiles(DEFAULT_LISTING_SLUG, rows) : null
    if (at) return { files: at.files, version: at.version }
  } catch (e) {
    console.error("[admin/creator-site] the newest release could not be read:", e instanceof Error ? e.message : e)
  }
  return { files: composeTemplateFiles(`materia/${DEFAULT_TEMPLATE}`), version: null }
}

/** What the admin is shown before building: the content, and whether there is room. */
export async function previewCreatorSite(admin: Admin, creatorId: string, deps: BuildDeps = {}): Promise<({ ok: true; content: CreatorSiteContent; slotsLeft: number; hasLive: boolean; built: BuiltSite[] }) | ReadFailure> {
  const read = await readCreatorRows(admin, creatorId)
  if (read.ok === false) return read
  const content = creatorSiteContent(read.rows, (deps.samples ?? templateSampleText)())
  return { ok: true, content, slotsLeft: await librarySlotsLeft(admin, creatorId), hasLive: !!read.rows.live, built: await builtSites(admin, creatorId) }
}

export type BuiltSite = { id: string; name: string; status: string; previous: string | null }

/** The websites in their library that Build website made, newest first, for Publish and Undo. A read that fails lists none. */
export async function builtSites(admin: Admin, creatorId: string): Promise<BuiltSite[]> {
  const { data: installs, error } = await admin.from("store_theme_installs").select("id, name, status").eq("creator_id", creatorId)
  if (error || !installs?.length) return []
  const rows = installs as { id: string; name: string | null; status: string | null }[]
  const { data: settings, error: sErr } = await admin.from("store_theme_settings").select("install_id, settings, draft_settings").in("install_id", rows.map((r) => r.id))
  if (sErr) return []
  const out: (BuiltSite & { at: string })[] = []
  for (const s of (settings ?? []) as { install_id: string; settings: unknown; draft_settings: unknown }[]) {
    const mark = adminBuiltMark(s.settings) ?? adminBuiltMark(s.draft_settings)
    const install = rows.find((r) => r.id === s.install_id)
    if (mark && install) out.push({ id: install.id, name: install.name ?? BUILT_SITE_NAME, status: install.status ?? "draft", previous: mark.previous_install ?? null, at: mark.at })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).map(({ at: _at, ...rest }) => (void _at, rest))
}

export type Built = { ok: true; installId: string; name: string; content: CreatorSiteContent; release: string | null }

export async function buildCreatorSite(admin: Admin, creatorId: string, deps: BuildDeps = {}): Promise<Built | ReadFailure> {
  const read = await readCreatorRows(admin, creatorId)
  if (read.ok === false) return read
  if (!read.userId) return { ok: false, status: 409, error: "This creator has no account to keep a website under." }

  /* Asked before anything is composed; the install's own insert asks again (library-limit.ts). */
  if ((await librarySlotsLeft(admin, creatorId)) === 0) return { ok: false, status: 409, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }

  const content = creatorSiteContent(read.rows, (deps.samples ?? templateSampleText)())
  let zip: Buffer
  let version: string | null
  try {
    const at = await (deps.files ?? currentDefaultFiles)()
    version = at.version
    zip = await zipOf(tailorTemplate(at.files, content))
  } catch (e) {
    console.error("[admin/creator-site] could not compose the template:", e instanceof Error ? e.message : e)
    return { ok: false, status: 500, error: "Could not make the website from its template. Nothing was made." }
  }

  const made = await (deps.install ?? installCodeTemplate)(admin, { userId: read.userId, creatorId }, DEFAULT_TEMPLATE, {
    name: BUILT_SITE_NAME,
    /* The tailored zip, and no template menus: the store's own menus are the ones it draws. */
    deps: { compose: async () => zip, menus: async () => {} },
  })
  if (made.ok === false) return made

  /*
    Marked as Add marks it: the listing it came from and its release. And
    marked as made here (ADMIN_BUILT_KEY), which is what lets the admin
    console publish it (./publish.ts): no other website can be put live
    from there. Never fails the website; unmarked, it is still a draft the
    creator can publish themselves.
  */
  const builtMark: AdminBuiltMark = { by: "admin", at: new Date().toISOString() }
  try {
    const { data } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", made.installId).maybeSingle()
    if (data) {
      const mark = (s: unknown) => {
        const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {}
        const listed = o.compat && typeof o.compat === "object" ? { ...o, compat: { ...(o.compat as Record<string, unknown>), listing: DEFAULT_LISTING_SLUG } } : { ...o, [LISTING_SETTINGS_KEY]: DEFAULT_LISTING_SLUG }
        const marked = { ...listed, [ADMIN_BUILT_KEY]: builtMark }
        return version ? withInstalledRelease(marked, version) : marked
      }
      const row = data as { settings: unknown; draft_settings: unknown }
      await admin.from("store_theme_settings").update({ settings: mark(row.settings), draft_settings: mark(row.draft_settings ?? row.settings) }).eq("install_id", made.installId)
    }
  } catch {
    /* The website is made whatever happens to this note. */
  }

  return { ok: true, installId: made.installId, name: made.name, content, release: version }
}
