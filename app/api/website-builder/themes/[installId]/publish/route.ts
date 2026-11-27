import { websiteInstallCaller } from "@/lib/team/website"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse, after } from "next/server"
import { announce, websiteAddresses } from "@/lib/seo/announce"
import { indexNowKey } from "@/lib/seo/indexnow"
import { goneAddresses } from "@/lib/website-builder/site-changes"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"
import { snapshotOf, takeBackup } from "@/lib/website-builder/backups"
import { promoteFileDrafts, recordVersion } from "@/lib/website-builder/theme-file-drafts"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { translationsChanged } from "@/lib/markets/translate-queue"
import { pruneReleases, recordRelease, releasePointed } from "@/lib/website-builder/site-releases-server"
import { mirrorWholeTheme } from "@/lib/github-sync/mirror"
import { warmAfterPublish } from "@/lib/website-builder/warm-sites"
import { refreshAfter } from "@/lib/edge/snapshot-capture"
import { BACKUP_WAITS_FOR_RELEASE_MS, publishFollowUp, WARM_WAITS_FOR_RELEASE_MS, quietAfterPublish } from "@/lib/website-builder/after-publish"
import { seenCountry } from "@/lib/markets/visitor-country"
import { readOwnSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import { ensureStoreMenus } from "@/lib/website-builder/store-menus-server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { publishWithOneRetry } from "@/lib/website-builder/publish-retry"
import { beginJob, endJob, isJobId, pruneJobs, readJob } from "@/lib/website-builder/publish-job"

/**
 * Two minutes, stated rather than inherited. The publish itself is one
 * database call (asked at most twice); the history, backup, release, warm-up
 * and mirror run after the answer, inside this same limit, and none of them
 * may hold the function for the platform's five minutes.
 */
export const maxDuration = 120

type Params = { params: Promise<{ installId: string }> }

/** Part 130 not run yet: the function, or a column it writes, is not there. Anything else is a real failure. */
function publishStepMissing(error: { code?: string; message?: string }): boolean {
  return ["PGRST202", "42883", "42703", "42P01"].includes(error.code ?? "") || /could not find the function/i.test(error.message ?? "")
}

/* The press's job, once begun (lib/website-builder/publish-job.ts): POST writes how it ended. */
type JobHolder = { id: string | null }

/*
  POST /api/website-builder/themes/[installId]/publish
  body: { action: "publish" | "unpublish" | "save_draft", job?: uuid }
  A publish sent with `job` is a job (SQL part 360): the same id sent twice is
  one publish, and GET ?job= says how it is going, for an editor whose answer
  was lost or slow.
*/
export async function POST(req: Request, ctx: Params) {
  const holder: JobHolder = { id: null }
  let res: Response
  try {
    res = await handlePost(req, ctx, holder)
  } catch (e) {
    if (holder.id) await endJob(createAdminClient() as never, holder.id, false, "Could not publish. Try again.")
    throw e
  }
  if (holder.id) {
    const said = res.ok ? null : await res.clone().json().then((d: { error?: unknown }) => (typeof d.error === "string" ? d.error : null), () => null)
    await endJob(createAdminClient() as never, holder.id, res.ok, said)
  }
  return res
}

/* GET ?job=<id>: how that press is going (running, done, failed, expired, unknown), or "untracked" before part 360. */
export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const job = new URL(req.url).searchParams.get("job")
  if (!isJobId(job)) return NextResponse.json({ error: "Which publish?" }, { status: 400 })
  const site = await websiteInstallCaller(installId, "id, creator_id", { read: true })
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  try {
    const seen = await readJob(createAdminClient() as never, installId, job)
    return NextResponse.json({ job: seen.state, error: seen.error }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not check the publish just now." }, { status: 503, headers: { "Retry-After": "2", "Cache-Control": "no-store" } })
  }
}

async function handlePost(req: Request, { params }: Params, holder: JobHolder): Promise<Response> {
  const { installId } = await params
  const admin = createAdminClient()
  /* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
  const site = await websiteInstallCaller<{ id: string; creator_id: string; status: string }>(installId, "id, creator_id, status")
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { user, creator, install } = site

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
  const body = (read.invalid ? null : read.json) as { action?: unknown; job?: unknown } | null
  const action = body?.action as "publish" | "unpublish" | "save_draft"

  if (action === "publish") {
    /* The same press sent again (its answer was lost): how the first went, never a second publish (lib/website-builder/publish-job.ts). */
    const jobId = body?.job
    if (isJobId(jobId)) {
      const begun = await beginJob(admin as never, { id: jobId, installId, creatorId: creator.id })
      if (begun.kind === "seen") {
        if (begun.state === "done") return NextResponse.json({ ok: true, status: "published", job: "done" })
        if (begun.state === "running") return NextResponse.json({ ok: false, job: "running" }, { status: 202 })
        return NextResponse.json({ error: begun.error ?? "Could not publish. Try again.", job: begun.state }, { status: 500 })
      }
      if (begun.kind === "new") {
        holder.id = jobId
        after(() => pruneJobs(admin as never, installId))
      }
    }
    /* The addresses live before this publish, so the ones it takes down are announced too (below). Only when IndexNow is on; never waited on here. */
    const liveBefore = indexNowKey() ? websiteAddresses(creator.id).catch(() => [] as string[]) : null
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
    /* Asked once more when the database cancelled it or was reloading (lib/website-builder/publish-retry): nothing changed either time. */
    const oneStep = await publishWithOneRetry(
      () =>
        admin.rpc("publish_theme_install", {
          p_install: installId,
          p_creator: creator.id,
          p_settings: settingsRow?.draft_settings ? sanitizeThemeSettings(settingsRow.draft_settings as Record<string, unknown>) : null,
          p_settings_draft: settingsRow?.draft_settings ?? null,
          p_pages: pages,
        }),
      (error) => console.warn("[theme publish] asked once more", { installId, code: error.code }),
    )
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
      ======================================================================
       AFTER THE ANSWER, IN ORDER, FROM ONE READ (round 66)
      ======================================================================
      The site is live by now. Everything below is housekeeping that runs
      once the answer has gone (`after`), and none of it may make the person
      wait or fail the publish. It used to start all at once: the release,
      the backup, the warm and the sitemap each read the whole theme from
      the database at the same moment (174 MB on a Materia template's first
      publish, lib/website-builder/after-publish.ts). Now one read of the
      rows is shared (`follow`), the release goes first, and the warm and
      the backup start when the website is pointed at it, each waiting a
      stated time at most.
    */
    const creatorId = creator.id
    const follow = publishFollowUp(admin, installId)

    /*
      THE RECORD OF IT: each section file's version, the publish history row
      and the backup to go back to (RUN_THEME_BACKUPS.sql), from the same
      read, once the release is done. Light: the files Storelib already
      holds (the release just made sure it holds every live one) are kept
      by name (lib/website-builder/backups.ts lightSnapshot).
    */
    after(async () => {
      for (const file of movedFiles) await recordVersion(admin, installId, file.path, file.content, "publish").catch(() => false)
      const release = await follow.waitForRelease(BACKUP_WAITS_FOR_RELEASE_MS)
      const rows = await follow.rowsOrNull()
      const liveSettings = rows
        ? rows.settings?.settings
        : (await admin.from("store_theme_settings").select("settings").eq("install_id", installId).maybeSingle()).data?.settings
      const { error: historyErr } = await admin.from("theme_publish_history").insert({
        install_id: installId,
        creator_id: creatorId,
        action: "published",
        snapshot: liveSettings ?? {},
      })
      if (historyErr) console.error("[publish] the publish history row was not written:", historyErr.message)
      /* A publish is a moment worth being able to go back to. */
      try {
        await takeBackup(admin, installId, { label: "Published", source: "publish" }, {
          snapshot: rows?.files ? snapshotOf(rows.settings, rows.pages, rows.files) : undefined,
          knownBlobs: release.blobs,
        })
      } catch {
        /* logged nowhere on purpose: nothing sensitive, nothing actionable */
      }
    })

    /**
     * THE LAST THING, AND NOT OPTIONAL. The published site is held in a
     * cache until this says otherwise, so a publish that does not reach
     * here is a publish that changed the database and not the website.
     * Last, so it can only ever throw away a cache of something already
     * written. The site's stored copies it asks for again wait for the
     * release below (round 66, lib/edge/snapshot-capture.ts refreshAfter).
     */
    refreshAfter(creatorId, quietAfterPublish().then(() => follow.waitForRelease(WARM_WAITS_FOR_RELEASE_MS)))
    await revalidatePublishedSite(creator.id)

    /*
      KEPT AS A RELEASE, FIRST (lib/website-builder/site-releases-server.ts,
      SQL part 180): the live rows as they are now, written once and never
      changed, and the website pointed at it. Best effort: the publish has
      already happened, and until the pointer is set (or when this fails, or
      part 180 has not run) the website is drawn from its rows exactly as
      before. The pointer is held for a minute (POINTER_HOLD_S), so the
      website moves onto the release within one, drawing the same thing
      either way. Then the newest twenty are kept. Its rows are the
      follow-up's one read (`read`), asked after the release's own count.
    */
    after(async () => {
      let seen: { pointed: boolean; blobs: string[] } | null = null
      try {
        /* After the editor's first read (round 67, after-publish.ts quietAfterPublish); still first of the heavy work. */
        await quietAfterPublish()
        const kept = await recordRelease(admin, { installId, creatorId }, follow.liveRows)
        if (kept.ok === false) {
          if (kept.reason === "failed") console.error("[publish] the release was not written:", kept.detail)
        } else {
          await pruneReleases(admin, installId)
          /* Pointed at: every server draws from it now, not from the rows (lib/website-builder/site-releases-server.ts releasePointed). */
          if ((kept as { live?: boolean }).live) releasePointed(creatorId)
          seen = { pointed: !!(kept as { live?: boolean }).live, blobs: (kept as { blobs?: string[] }).blobs ?? [] }
        }
      } finally {
        follow.releaseDone(seen)
      }
    })

    /*
      ITS PAGES DRAWN BEFORE A VISITOR ASKS (round AM, lib/website-builder/
      warm-sites.ts warmAfterPublish): for the country of the person who
      pressed Publish first, who is the one about to open it, then as the
      warm's own connection is seen. Changed on purpose (r66): once the
      website is pointed at its release, for WARM_WAITS_FOR_RELEASE_MS at
      most. Drawn before it, every page read the whole theme from its rows
      on every server it reached, beside the release reading it too; drawn
      after, they read the release's files, which every server keeps by
      what they hold, so a publish that changed one file reads one group.
      The pages are the same either way (lib/website-builder/live-release.ts).
    */
    const publisherCountry = seenCountry(req.headers)
    /*
      AND AN IMPORTED THEME'S FILES READ ONCE WITH TIME TO ANSWER (round 29,
      lib/website-builder/compat-site.ts primeLiveFiles), beside the warm: a
      server whose own read of a new template's thousand files misses its
      bound draws from them instead of from what it had before the Publish.
    */
    after(async () => {
      await quietAfterPublish()
      await (await import("@/lib/website-builder/compat-site")).primeLiveFiles(installId, creatorId)
    })
    after(async () => {
      /* Its wait for the release counts from the same moment the release starts (round 67). */
      await quietAfterPublish()
      await follow.waitForRelease(WARM_WAITS_FOR_RELEASE_MS)
      await warmAfterPublish(creatorId, { countries: [publisherCountry] })
    })

    /* After the answer: every page of the site, to the search engines that
       take IndexNow (lib/seo/indexnow.ts). Never in the way of the publish. */
    const announced = creator.id
    after(() => announce(() => websiteAddresses(announced)))
    /* And the addresses that went with this publish (a page dropped, the last theme's pages), which are 404s now (lib/website-builder/site-changes.ts). */
    if (liveBefore) after(() => announce(async () => goneAddresses(await liveBefore, await websiteAddresses(announced))))
    /* And the whole theme to its linked GitHub repository, pages and settings with it, if it sends builder changes. */
    after(() => mirrorWholeTheme(installId, "Published in the builder"))
    /* Translate changes automatically: its new and edited words, in a few minutes (lib/markets/translate-queue.ts). */
    translationsChanged(creator.id)

    /* A team member's publish is on the record with their name (lib/team/areas). */
    await recordTeamAction(site, user.id, "website", "website_published", { install_id: installId, action: "publish" })
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

    await recordTeamAction(site, user.id, "website", "website_published", { install_id: installId, action: "unpublish" })
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
