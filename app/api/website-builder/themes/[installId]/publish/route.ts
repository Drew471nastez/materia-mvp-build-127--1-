import { NextResponse, after } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { announce, websiteAddresses } from "@/lib/seo/announce"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"
import { takeBackup } from "@/lib/website-builder/backups"
import { promoteFileDrafts, recordVersion } from "@/lib/website-builder/theme-file-drafts"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { pruneReleases, recordRelease } from "@/lib/website-builder/site-releases-server"
import { mirrorWholeTheme } from "@/lib/github-sync/mirror"
import { readOwnSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { ensureStoreMenus } from "@/lib/website-builder/store-menus-server"
import type { SectionInstance } from "@/lib/website-builder/types"

type Params = { params: Promise<{ installId: string }> }

/** Part 130 not run yet: the function, or a column it writes, is not there. Anything else is a real failure. */
function publishStepMissing(error: { code?: string; message?: string }): boolean {
  return ["PGRST202", "42883", "42703", "42P01"].includes(error.code ?? "") || /could not find the function/i.test(error.message ?? "")
}

// POST /api/website-builder/themes/[installId]/publish
// body: { action: "publish" | "unpublish" | "save_draft" }
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle())

  if (creatorReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id, creator_id, status")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle())

  if (installReadErr) return NextResponse.json({ error: UNREACHABLE }, { status: 503 })

  if (!install) return NextResponse.json({ error: "Theme not found" }, { status: 404 })

  /* Publishing, taking down and saving as a draft all come through here: LIMITS.sitePublish. */
  const limited = await rateLimit({
    bucket: "site-publish",
    subjects: [`user:${user.id}`],
    windows: LIMITS.sitePublish,
    message: "Too many publishes in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  /* `{ action }` and nothing more, so a small cap: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.small)
  if (read.ok === false) return read.response
  /* A body that is not JSON falls through to "Invalid action", a 400, not a 500. */
  const body = (read.invalid ? null : read.json) as { action?: unknown } | null
  const action = body?.action as "publish" | "unpublish" | "save_draft"

  if (action === "publish") {
    /*
      ======================================================================
       THE NEW SITE IS READY BEFORE THE OLD ONE STOPS
      ======================================================================
      A creator has one published storefront, and the database holds them to
      it (uniq_sti_creator_published), so the old one has to go down before
      this one goes up. This used to do that first, then flip this one live,
      then copy the drafts across, checking almost none of it: a failure
      after the first write left the creator with no website at all, or a
      live one still showing the old pages under a success message.

      So the drafts are promoted first. They are this install's own columns:
      nobody sees them until its status changes, or, when it is already the
      live site, promoting them IS the publish. Every write is checked and
      the first failure stops here. Only then does the status flip, and if
      this one will not go up, the one that was live is put back.
    */
    let touchedLive = false
    const failed = async (message: string, detail: string) => {
      console.error(`[publish] ${message} (${detail})`)
      /* Part of it may already be live, and the cached site has to hear about that part too. */
      if (touchedLive) await revalidatePublishedSite(creator.id)
      return NextResponse.json({ error: message }, { status: 500 })
    }

    // What is about to go live: the settings draft and every page draft
    const { data: settingsRow, error: settingsReadErr } = await admin
      .from("store_theme_settings")
      .select("settings, draft_settings")
      .eq("install_id", installId)
      .maybeSingle()
    if (settingsReadErr) return failed("Could not read the website's settings. Nothing was published.", settingsReadErr.message)

    // (and the pages)
    const { data: pagesRows, error: pagesReadErr } = await admin
      .from("store_theme_pages")
      .select("id, sections, draft_sections")
      .eq("install_id", installId)
    if (pagesReadErr) return failed("Could not read the website's pages. Nothing was published.", pagesReadErr.message)

    /* A section type the install wrote itself is cleaned by its own file: lib/website-builder/sanitize-sections.ts. */
    const drafts = (pagesRows ?? []).filter((page) => page.draft_sections)
    const own = await readOwnSectionFields(admin, installId, drafts.flatMap((page) => (page.draft_sections as SectionInstance[]).map((s) => s.type)))
    /*
      ======================================================================
       PUBLISHING IS THE MOMENT IT STOPS BEING PRIVATE
      ======================================================================
      Every read is cleaned, so what a visitor is served is already safe.
      Cleaning here as well is not the same work twice: this is the one
      write in the system that changes who can see a row, from the creator
      alone to everybody, so it is where the content should be made fit to
      be seen rather than merely rendered carefully.

      It also means the LIVE columns are clean on disk. Anything that reads
      them in future, a feed, an export, a cache warmer, a migration, gets
      safe content without having to know to ask for it.
    */
    /*
      THE MENUS VISITORS SEE STAY. Written down as the store's while the
      website that was live still is (store-menus-server.ts ensureStoreMenus),
      so the one going live draws them, not its own. Once there is a row this
      reads it and does nothing else.
    */
    await ensureStoreMenus(admin, creator.id, { names: false, preferInstallId: installId })
    /*
      ======================================================================
       ALL OF IT OR NONE OF IT
      ======================================================================
      The settings, every page, every saved section file and the switch of
      which website is live, in one transaction (SQL part 130,
      publish_theme_install). Step by step, a failure part way left some
      pages new and some old until Publish was pressed again; in one step it
      changes nothing. A draft saved while this runs stays the draft: only
      the draft that was read here is cleared.

      Until part 130 has been run the function is not there, and the steps
      below do the same work one write at a time, as they always have.
    */
    const pages = drafts.map((page) => ({
      id: page.id,
      sections: sanitizeSections(page.draft_sections as SectionInstance[], own),
      draft: page.draft_sections,
    }))
    const oneStep = await admin.rpc("publish_theme_install", {
      p_install: installId,
      p_creator: creator.id,
      p_settings: settingsRow?.draft_settings ? sanitizeThemeSettings(settingsRow.draft_settings as Record<string, unknown>) : null,
      p_settings_draft: settingsRow?.draft_settings ?? null,
      p_pages: pages,
    })
    let movedFiles: { path: string; content: string }[] = []
    if (oneStep.error && !publishStepMissing(oneStep.error)) {
      return failed("Could not publish. Nothing changed: the website that was live still is.", oneStep.error.message)
    }
    if (!oneStep.error) {
      touchedLive = true
      /* Each section file that went live goes in its history after the answer, below. */
      movedFiles = (oneStep.data as { files?: { path: string; content: string }[] } | null)?.files ?? []
    } else {
      if (settingsRow?.draft_settings) {
        const { error: settingsErr } = await admin
          .from("store_theme_settings")
          .update({
            settings: sanitizeThemeSettings(settingsRow.draft_settings as Record<string, unknown>),
            draft_settings: null,
          })
          .eq("install_id", installId)
        if (settingsErr) return failed("Could not publish the website's settings. Nothing was published.", settingsErr.message)
        touchedLive = true
      }

      for (const page of drafts) {
        const { error: pageErr } = await admin
          .from("store_theme_pages")
          .update({
            sections: sanitizeSections(page.draft_sections as SectionInstance[], own),
            draft_sections: null,
          })
          .eq("id", page.id)
        if (pageErr) return failed("Could not publish every page. Publish again to finish.", pageErr.message)
        touchedLive = true
      }

      /**
       * And every section file somebody has saved since the last publish. Same
       * promotion as draft_sections above, for the same reason: what is on the
       * site changes when a person says so, not when they press Save.
       */
      await promoteFileDrafts(admin, installId)

      /* Now the switch: whatever else was live goes down, and this goes up. */
      const { data: previous, error: downErr } = await admin
        .from("store_theme_installs")
        .update({ status: "unpublished" })
        .eq("creator_id", creator.id)
        .eq("status", "published")
        .neq("id", installId)
        .select("id")
      if (downErr) return failed("Could not switch the live website. The one that was live still is.", downErr.message)
      const wasLive = ((previous ?? []) as { id: string }[]).map((row) => row.id)
      if (wasLive.length > 0) touchedLive = true

      // The moment, as well as the fact. "Changes since published 4 minutes
      // ago" needs to know when, and status alone cannot say. The column is
      // added by RUN_THEME_PUBLISHED_AT.sql; until it has been run the write
      // falls back to status only, so publishing never fails on a timestamp.
      let { error } = await admin
        .from("store_theme_installs")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", installId)
      if (error && /published_at/.test(error.message)) {
        ;({ error } = await admin.from("store_theme_installs").update({ status: "published" }).eq("id", installId))
      }

      if (error) {
        /* This one would not go up, so the one that was live goes back up rather than leaving nothing. */
        if (wasLive.length > 0) {
          const { error: backErr } = await admin.from("store_theme_installs").update({ status: "published" }).in("id", wasLive)
          if (backErr) {
            console.error("[publish] the previous website could not be put back:", backErr.message)
            return failed("Could not publish, and the website that was live is now offline. Publish again.", error.message)
          }
          return failed("Could not publish. The website that was live still is.", error.message)
        }
        return failed("Could not publish. Try again.", error.message)
      }
    }

    /*
      THE RECORD OF IT, AFTER THE ANSWER. The site is live by now: the
      publish history row, the backup to go back to and each section file's
      version are housekeeping, and none of them may make the person wait or
      fail the publish. They run once the answer has gone (`after`), with
      the same failures logged and nothing else.
    */
    const creatorId = creator.id
    after(async () => {
      for (const file of movedFiles) await recordVersion(admin, installId, file.path, file.content, "publish").catch(() => false)
      const { data: settings } = await admin
        .from("store_theme_settings")
        .select("settings")
        .eq("install_id", installId)
        .maybeSingle()
      const { error: historyErr } = await admin.from("theme_publish_history").insert({
        install_id: installId,
        creator_id: creatorId,
        action: "published",
        snapshot: settings?.settings ?? {},
      })
      if (historyErr) console.error("[publish] the publish history row was not written:", historyErr.message)
      /* A publish is a moment worth being able to go back to (RUN_THEME_BACKUPS.sql). */
      try {
        await takeBackup(admin, installId, { label: "Published", source: "publish" })
      } catch {
        /* logged nowhere on purpose: nothing sensitive, nothing actionable */
      }
    })

    /**
     * THE LAST THING, AND NOT OPTIONAL. The published site is held in a
     * cache until this says otherwise, so a publish that does not reach
     * here is a publish that changed the database and not the website.
     * Last, so it can only ever throw away a cache of something already
     * written.
     */
    await revalidatePublishedSite(creator.id)

    /*
      AND KEPT AS A RELEASE, after the answer (lib/website-builder/
      site-releases-server.ts, SQL part 180): the live rows as they are now,
      written once and never changed, and the website pointed at it. Best
      effort: the publish has already happened, and until the pointer is set
      (or when this fails, or part 180 has not run) the website is drawn from
      its rows exactly as before. The pointer is held for a minute
      (POINTER_HOLD_S), so the website moves onto the release within one,
      drawing the same thing either way. Then the newest twenty are kept.
    */
    after(async () => {
      const kept = await recordRelease(admin, { installId, creatorId })
      if (kept.ok === false) {
        if (kept.reason === "failed") console.error("[publish] the release was not written:", kept.detail)
        return
      }
      await pruneReleases(admin, installId)
    })

    /* After the answer: every page of the site, to the search engines that
       take IndexNow (lib/seo/indexnow.ts). Never in the way of the publish. */
    const announced = creator.id
    after(() => announce(() => websiteAddresses(announced)))
    /* And the whole theme to its linked GitHub repository, pages and settings with it, if it sends builder changes. */
    after(() => mirrorWholeTheme(installId, "Published in the builder"))
    /* Translate changes automatically: its new and edited words, in a few minutes (lib/markets/translate-queue.ts). */
    translationsChanged(creator.id)

    return NextResponse.json({ ok: true, status: "published" })
  }

  if (action === "unpublish") {
    if (install.status !== "published") {
      return NextResponse.json({ error: "Theme is not currently published" }, { status: 400 })
    }

    /* A take-down that did not happen must not be reported as one. */
    const { error: downErr } = await admin
      .from("store_theme_installs")
      .update({ status: "unpublished" })
      .eq("id", installId)
    if (downErr) {
      console.error("[publish] could not take the website down:", downErr.message)
      return NextResponse.json({ error: "Could not take the website down. It is still live. Try again." }, { status: 500 })
    }

    const { error: historyErr } = await admin.from("theme_publish_history").insert({
      install_id: installId,
      creator_id: creator.id,
      action: "unpublished",
    })
    if (historyErr) console.error("[publish] the unpublish history row was not written:", historyErr.message)

    // A site taken down that stays in a cache is still up.
    await revalidatePublishedSite(creator.id)
    /* And in a search index, until an engine is told to look again. */
    const announced = creator.id
    after(() => announce(() => websiteAddresses(announced)))

    return NextResponse.json({ ok: true, status: "unpublished" })
  }

  if (action === "save_draft") {
    const { error: draftErr } = await admin
      .from("store_theme_installs")
      .update({ status: "draft" })
      .eq("id", installId)
      .eq("status", "unpublished") // don't downgrade published
    if (draftErr) return NextResponse.json({ error: "Could not save it as a draft. Try again." }, { status: 500 })

    return NextResponse.json({ ok: true, status: "draft" })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
