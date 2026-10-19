import { NextResponse, after } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { announce, websiteAddresses } from "@/lib/seo/announce"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { takeBackup } from "@/lib/website-builder/backups"
import { recordVersion } from "@/lib/website-builder/theme-file-drafts"
import { revalidatePublishedSite } from "@/lib/website-builder/published-site"
import { isReleaseId } from "@/lib/website-builder/site-releases"
import { pruneReleases, releasesMissing, rollbackRelease } from "@/lib/website-builder/site-releases-server"
import { mirrorWholeTheme } from "@/lib/github-sync/mirror"

type Params = { params: Promise<{ installId: string; releaseId: string }> }

const NOT_SET_UP = "Published versions are not set up yet."

/**
 * POST /api/website-builder/themes/[installId]/releases/[releaseId]/restore
 *
 * ===========================================================================
 *  AN EARLIER PUBLISH, LIVE AGAIN
 * ===========================================================================
 * The release's settings, pages and files are written back into the live
 * rows in one transaction (`rollback_site_release`, SQL part 188), with the
 * drafts cleared, and kept as a new release the website points at. Moving
 * the pointer alone would leave the rows saying something else, and the
 * rows are what the website is drawn from after any edit (part 180's
 * trigger clears the pointer), so the old site would come back by itself.
 *
 * The draft is replaced, so it is backed up first, as a backup restore does
 * (source "restore"): the editor asks before this runs, and the draft it had
 * is the newest row in Backups. No backup, no rollback.
 *
 * The same check as Publish (only the store's owner: the website is not open
 * to team members yet, lib/team/roles.ts OPEN_TO_TEAM), the same rate limit,
 * the same caches cleared and the same record after the answer.
 */
export async function POST(_req: Request, { params }: Params) {
  const { installId, releaseId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle())
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

  /* It changes the live website, so it counts as a publish: LIMITS.sitePublish. */
  const limited = await rateLimit({
    bucket: "site-publish",
    subjects: [`user:${user.id}`],
    windows: LIMITS.sitePublish,
    message: "Too many publishes in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  if (!isReleaseId(releaseId)) return NextResponse.json({ error: "Version not found" }, { status: 404 })

  /* This website's release, before anything is written: a wrong id changes nothing, not even the backups. */
  const { data: release, error: releaseErr } = await admin
    .from("site_releases")
    .select("id")
    .eq("id", releaseId)
    .eq("install_id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (releaseErr) {
    if (releasesMissing(releaseErr)) return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
    console.error("[releases/restore] the release could not be read:", releaseErr.message)
    return NextResponse.json({ error: "Could not load that version. Try again." }, { status: 500 })
  }
  if (!release) return NextResponse.json({ error: "Version not found" }, { status: 404 })

  const safety = await takeBackup(supabase, installId, { label: "Before restoring a published version", source: "restore", verify: true })
  if (safety.error) {
    console.error("[releases/restore] the draft could not be backed up:", safety.error)
    return NextResponse.json({ error: "Could not back up your draft, so nothing changed. Try again." }, { status: 500 })
  }

  const rolled = await rollbackRelease(admin, { installId, creatorId: creator.id, releaseId })
  if (rolled.ok === false) {
    console.error(`[releases/restore] refused (${rolled.reason}): ${rolled.detail}`)
    if (rolled.reason === "missing") return NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
    if (rolled.reason === "not_found") return NextResponse.json({ error: "Version not found" }, { status: 404 })
    if (rolled.reason === "unreadable") return NextResponse.json({ error: "This version cannot be restored. Nothing changed." }, { status: 422 })
    return NextResponse.json({ error: "Could not restore this version. Nothing changed." }, { status: 500 })
  }

  /* The record of it, after the answer, as Publish keeps one. */
  const creatorId = creator.id
  after(async () => {
    for (const file of rolled.files) await recordVersion(admin, installId, file.path, file.content, "restore").catch(() => false)
    const { data: settings } = await admin.from("store_theme_settings").select("settings").eq("install_id", installId).maybeSingle()
    const { error: historyErr } = await admin.from("theme_publish_history").insert({
      install_id: installId,
      creator_id: creatorId,
      action: "published",
      snapshot: settings?.settings ?? {},
    })
    if (historyErr) console.error("[releases/restore] the publish history row was not written:", historyErr.message)
    await pruneReleases(admin, installId)
  })

  /* Not optional, and last, as in Publish: the website is held in a cache until this says otherwise. */
  await revalidatePublishedSite(creator.id)

  after(() => announce(() => websiteAddresses(creatorId)))
  after(() => mirrorWholeTheme(installId, "Restored a published version"))

  return NextResponse.json({ ok: true, releaseId: rolled.releaseId, status: "published" })
}
