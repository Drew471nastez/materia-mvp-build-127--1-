import "server-only"

/**
 * ===========================================================================
 *  PUBLISH A WEBSITE THE ADMIN BUILT, AND PUT THE OLD ONE BACK (round 63)
 * ===========================================================================
 * The owner cannot sign in as a creator, so a website made by Build website
 * (./build.ts) is put live from the admin console. Only such a website: the
 * install must be in that creator's library and carry the mark the build
 * writes (ADMIN_BUILT_KEY in its settings). Undo puts back the website that
 * was live before, which the publish wrote into the same mark; it is never
 * deleted, only unpublished, so it stays in their library.
 *
 * THE SAME STEPS AS THE CREATOR'S PUBLISH
 * (app/api/website-builder/themes/[installId]/publish/route.ts), with the
 * same shared pieces, in the same order:
 *
 *   1. the store's menus written down before the switch (ensureStoreMenus)
 *   2. the drafts and the switch of which website is live in one
 *      transaction (publish_theme_install, SQL part 130, asked once more on
 *      a cancelled call); before part 130, the route's step by step
 *      fallback: settings, pages, files, the old one down, this one up, and
 *      the old one put back up when this one will not go
 *   3. revalidatePublishedSite, last of the writes, so the cached site follows
 *   4. after the answer: the history row and a backup, the pages drawn
 *      ahead (warmAfterPublish), the release kept and pointed at, the
 *      search engines told
 *
 * It is a second caller of those pieces, not a copy of the route: the
 * route's handler mixes them with the signed-in person (rate limit per
 * user, the publish job of one editor press, the team record), and its
 * text is held in place by many suites, so it is left exactly as it is.
 * What the route does for a person and an editor, this does not need: no
 * job id (one admin press, answered in the same request) and no team row
 * (the admin audit log records it, ../../app/api/admin/creators/site/publish).
 */
import { after } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"

import { announce, websiteAddresses } from "@/lib/seo/announce"
import { takeBackup } from "@/lib/website-builder/backups"
import { promoteFileDrafts } from "@/lib/website-builder/theme-file-drafts"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { pruneReleases, recordRelease, releasePointed } from "@/lib/website-builder/site-releases-server"
import { warmAfterPublish } from "@/lib/website-builder/warm-sites"
import { readOwnSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { ensureStoreMenus } from "@/lib/website-builder/store-menus-server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { publishWithOneRetry } from "@/lib/website-builder/publish-retry"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

/** The mark Build website writes in a website's settings: who made it, and once published, which website it replaced. */
export const ADMIN_BUILT_KEY = "storelib_admin_built"

export type AdminBuiltMark = { by: "admin"; at: string; previous_install?: string | null; published_at?: string }

export function adminBuiltMark(settings: unknown): AdminBuiltMark | null {
  const m = settings && typeof settings === "object" ? (settings as Record<string, unknown>)[ADMIN_BUILT_KEY] : null
  return m && typeof m === "object" && (m as { by?: unknown }).by === "admin" ? (m as AdminBuiltMark) : null
}

export type PublishFailure = { ok: false; status: number; error: string; code?: string }

export interface PublishDeps {
  revalidate?: (creatorId: string) => Promise<void>
  /** Work after the answer (next/server after); tests run it at once. */
  later?: (work: () => unknown) => void
  menus?: typeof ensureStoreMenus
}

export interface PublishOptions {
  /**
   * false for Undo: the website goes back up as it was live, its unpublished
   * settings and page drafts left as drafts. (The publish function still
   * moves saved section file drafts, as it does for every publish.)
   */
  promoteDrafts?: boolean
}

function publishStepMissing(error: { code?: string; message?: string }): boolean {
  return ["PGRST202", "42883", "42703", "42P01"].includes(error.code ?? "") || /could not find the function/i.test(error.message ?? "")
}

/** Puts one install of this creator live, as the creator's own Publish does. The install's ownership is checked by the caller. */
export async function publishInstallAsCreator(admin: Admin, creatorId: string, installId: string, deps: PublishDeps = {}, options: PublishOptions = {}): Promise<{ ok: true; previous: string[] } | PublishFailure> {
  const revalidate = deps.revalidate ?? revalidatePublishedSite
  const later = deps.later ?? ((work: () => unknown) => after(async () => void (await work())))
  let touchedLive = false
  const failed = async (error: string, detail: string): Promise<PublishFailure> => {
    console.error(`[admin publish] ${error} (${detail})`)
    if (touchedLive) await revalidate(creatorId)
    return { ok: false, status: 500, error }
  }

  /* Which website is live now: Undo puts it back. */
  const { data: liveRows, error: liveErr } = await admin.from("store_theme_installs").select("id").eq("creator_id", creatorId).eq("status", "published")
  if (liveErr) return { ok: false, status: 503, error: "Could not read which website is live. Nothing was published." }
  const previous = ((liveRows ?? []) as { id: string }[]).map((r) => r.id).filter((id) => id !== installId)

  const { data: settingsRow, error: settingsReadErr } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  if (settingsReadErr) return failed("Could not read the website's settings. Nothing was published.", settingsReadErr.message)
  const { data: pagesRows, error: pagesReadErr } = await admin.from("store_theme_pages").select("id, sections, draft_sections").eq("install_id", installId)
  if (pagesReadErr) return failed("Could not read the website's pages. Nothing was published.", pagesReadErr.message)

  const promote = options.promoteDrafts !== false
  const drafts = promote ? ((pagesRows ?? []) as { id: string; draft_sections: unknown }[]).filter((p) => p.draft_sections) : []
  const own = await readOwnSectionFields(admin, installId, drafts.flatMap((p) => (p.draft_sections as SectionInstance[]).map((s) => s.type)))
  await (deps.menus ?? ensureStoreMenus)(admin, creatorId, { names: false, preferInstallId: installId })

  const row = promote ? (settingsRow as { settings?: unknown; draft_settings?: unknown } | null) : null
  const pages = drafts.map((p) => ({ id: p.id, sections: sanitizeSections(p.draft_sections as SectionInstance[], own), draft: p.draft_sections }))
  const oneStep = await publishWithOneRetry(
    () =>
      admin.rpc("publish_theme_install", {
        p_install: installId,
        p_creator: creatorId,
        p_settings: row?.draft_settings ? sanitizeThemeSettings(row.draft_settings as Record<string, unknown>) : null,
        p_settings_draft: row?.draft_settings ?? null,
        p_pages: pages,
      }) as unknown as PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
    (error) => console.warn("[admin publish] asked once more", { installId, code: error.code }),
  )
  if (oneStep.error && !publishStepMissing(oneStep.error)) return failed("Could not publish. Nothing changed: the website that was live still is.", oneStep.error.message ?? "")
  if (!oneStep.error) touchedLive = true
  else {
    /* Before SQL part 130: the route's own steps, one write at a time. */
    if (row?.draft_settings) {
      const { error } = await admin.from("store_theme_settings").update({ settings: sanitizeThemeSettings(row.draft_settings as Record<string, unknown>), draft_settings: null }).eq("install_id", installId)
      if (error) return failed("Could not publish the website's settings. Nothing was published.", error.message)
      touchedLive = true
    }
    for (const p of pages) {
      const { error } = await admin.from("store_theme_pages").update({ sections: p.sections, draft_sections: null }).eq("id", p.id)
      if (error) return failed("Could not publish every page. Publish again to finish.", error.message)
      touchedLive = true
    }
    if (promote) await promoteFileDrafts(admin, installId)
    const { data: down, error: downErr } = await admin.from("store_theme_installs").update({ status: "unpublished" }).eq("creator_id", creatorId).eq("status", "published").neq("id", installId).select("id")
    if (downErr) return failed("Could not switch the live website. The one that was live still is.", downErr.message)
    const wasLive = ((down ?? []) as { id: string }[]).map((r) => r.id)
    if (wasLive.length) touchedLive = true
    let { error } = await admin.from("store_theme_installs").update({ status: "published", published_at: new Date().toISOString() }).eq("id", installId).eq("creator_id", creatorId)
    if (error && /published_at/.test(error.message)) ({ error } = await admin.from("store_theme_installs").update({ status: "published" }).eq("id", installId).eq("creator_id", creatorId))
    if (error) {
      if (wasLive.length) {
        const { error: backErr } = await admin.from("store_theme_installs").update({ status: "published" }).in("id", wasLive)
        if (backErr) return failed("Could not publish, and the website that was live is now offline. Publish again.", error.message)
        return failed("Could not publish. The website that was live still is.", error.message)
      }
      return failed("Could not publish. Try again.", error.message)
    }
  }

  later(async () => {
    const { data: s } = await admin.from("store_theme_settings").select("settings").eq("install_id", installId).maybeSingle()
    const { error } = await admin.from("theme_publish_history").insert({ install_id: installId, creator_id: creatorId, action: "published", snapshot: (s as { settings?: unknown } | null)?.settings ?? {} })
    if (error) console.error("[admin publish] the publish history row was not written:", error.message)
    try {
      await takeBackup(admin, installId, { label: "Published", source: "publish" })
    } catch {
      /* As the route: nothing sensitive, nothing actionable. */
    }
  })

  /* Last of the writes and not optional: the published site is cached until this says otherwise. */
  await revalidate(creatorId)

  later(() => warmAfterPublish(creatorId))
  later(async () => {
    const kept = await recordRelease(admin, { installId, creatorId })
    if (kept.ok === false) {
      if (kept.reason === "failed") console.error("[admin publish] the release was not written:", kept.detail)
    } else {
      await pruneReleases(admin, installId)
      if ((kept as { live?: boolean }).live) releasePointed(creatorId)
    }
  })
  later(() => announce(() => websiteAddresses(creatorId)))
  return { ok: true, previous }
}

/** The built website's mark, with what it replaced, written once it is live. Never fails the publish. */
async function remember(admin: Admin, installId: string, previous: string | null): Promise<void> {
  try {
    const { data } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
    if (!data) return
    const at = new Date().toISOString()
    const add = (s: unknown) => {
      const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {}
      const m = adminBuiltMark(o)
      return m ? { ...o, [ADMIN_BUILT_KEY]: { ...m, previous_install: previous, published_at: at } } : o
    }
    const r = data as { settings: unknown; draft_settings: unknown }
    await admin.from("store_theme_settings").update({ settings: add(r.settings), ...(r.draft_settings ? { draft_settings: add(r.draft_settings) } : {}) }).eq("install_id", installId)
  } catch {
    /* Undo then says it has nothing to put back, which is true enough to be safe. */
  }
}

async function builtInstall(admin: Admin, creatorId: string, installId: string): Promise<({ ok: true; status: string; mark: AdminBuiltMark }) | PublishFailure> {
  const { data, error } = await admin.from("store_theme_installs").select("id, status, creator_id").eq("id", installId).eq("creator_id", creatorId).maybeSingle()
  if (error) return { ok: false, status: 503, error: "Could not read the website. Nothing was published." }
  if (!data) return { ok: false, status: 404, error: "That website is not in this creator's library." }
  const { data: s, error: sErr } = await admin.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  if (sErr) return { ok: false, status: 503, error: "Could not read the website. Nothing was published." }
  const row = s as { settings?: unknown; draft_settings?: unknown } | null
  const mark = adminBuiltMark(row?.settings) ?? adminBuiltMark(row?.draft_settings)
  if (!mark) return { ok: false, status: 403, error: "Only a website made with Build website can be published from here.", code: "not_admin_built" }
  return { ok: true, status: String((data as { status?: unknown }).status ?? ""), mark }
}

/** Publish a website Build website made. The one live before stays in the library, unpublished, and is remembered for Undo. */
export async function publishBuiltSite(admin: Admin, creatorId: string, installId: string, deps: PublishDeps = {}): Promise<({ ok: true; previous: string | null }) | PublishFailure> {
  const built = await builtInstall(admin, creatorId, installId)
  if (built.ok === false) return built
  if (built.status === "published") return { ok: false, status: 409, error: "That website is already live.", code: "already_live" }
  const done = await publishInstallAsCreator(admin, creatorId, installId, deps)
  if (done.ok === false) return done
  const previous = done.previous[0] ?? null
  await remember(admin, installId, previous)
  return { ok: true, previous }
}

/** Undo: the website that was live before the built one, live again. The built one stays in the library. */
export async function undoBuiltSite(admin: Admin, creatorId: string, installId: string, deps: PublishDeps = {}): Promise<({ ok: true; restored: string }) | PublishFailure> {
  const built = await builtInstall(admin, creatorId, installId)
  if (built.ok === false) return built
  const back = built.mark.previous_install
  if (!back) return { ok: false, status: 409, error: "There is no earlier website to put back.", code: "nothing_to_undo" }
  if (built.status !== "published") return { ok: false, status: 409, error: "The built website is not live, so there is nothing to undo.", code: "not_live" }
  const { data: prev, error } = await admin.from("store_theme_installs").select("id").eq("id", back).eq("creator_id", creatorId).maybeSingle()
  if (error) return { ok: false, status: 503, error: "Could not read the earlier website. Nothing changed." }
  if (!prev) return { ok: false, status: 404, error: "The earlier website is no longer in their library.", code: "previous_gone" }
  const done = await publishInstallAsCreator(admin, creatorId, back, deps, { promoteDrafts: false })
  if (done.ok === false) return done
  return { ok: true, restored: back }
}
