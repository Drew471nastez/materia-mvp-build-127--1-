import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { createStartWebsite, isStartMode } from "@/lib/website-builder/create-website"
import { coverForNewWebsite, renderOrigin } from "@/lib/website-builder/cover-take"
import { START_PROMPT_MAX } from "@/lib/website-builder/start-handoff"
import { isMissingTable, JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { kickJob } from "@/lib/website-builder/ai-site/runner"
import { startJobRow, isStartKey, MAX_RUNNING_JOBS } from "@/lib/website-builder/ai-site/start"

export const runtime = "nodejs"
/** The website is made at once, and photographed within QUICK_COVER_MS when a browser is that quick, as Add does. */
export const maxDuration = 60

/**
 * POST /api/website-builder/themes/create
 *   body: { mode: "ai" | "blank", name?: string, prompt?: string, key?: string }
 *
 * The Website page's Start with AI and Start from blank: a new Storelib
 * Default website, as a draft, whose home page is only its header and
 * footer. See lib/website-builder/create-website.ts for what is written and
 * why Add theme is not used.
 *
 * START WITH AI makes a generation job too (lib/website-builder/ai-site,
 * table ai_site_jobs): the server plans, builds, writes and illustrates the
 * site while the editor shows it filling in, and closing the tab does not
 * stop it. `key` is the Website page's own id for this press, so the same
 * press sent twice is one website and one job. Without the table (SQL part
 * 380 not run yet) the answer says `fallback`, and the editor builds the
 * site inside its own request instead (themes/[installId]/generate).
 *
 * The same people as Add: the owner, or a team member with Website working
 * in the store (lib/team/website); Start with AI is the owner's, since it
 * spends the store's AI. The same library limit and refusal.
 */
export async function POST(req: Request) {
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, creator } = site

  /* A press each, never a stream: LIMITS.siteAction. */
  const limited = await rateLimit({
    bucket: "site-create",
    subjects: [`user:${site.userId}`],
    windows: LIMITS.siteAction,
    message: "Too many new websites in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  const body = await req.json().catch(() => ({}))
  const mode: unknown = body?.mode
  if (!isStartMode(mode)) return NextResponse.json({ error: "mode must be ai or blank" }, { status: 400 })
  if (body?.name !== undefined && body?.name !== null && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be text" }, { status: 400 })
  }
  const creatorId = creator.id as string
  const admin = createAdminClient()

  /* ── Start with AI: the description, the press's key, and the limits on generating ── */
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, START_PROMPT_MAX) : ""
  const key = isStartKey(body?.key) ? (body.key as string) : null
  const generating = mode === "ai" && prompt.length > 0 && key !== null
  if (generating && !site.isOwner) return NextResponse.json({ error: "Only the store owner can start a website with AI." }, { status: 403 })
  if (generating) {
    /* The same press again: its website and its job, not a second one. */
    const { data: same, error: sameErr } = await admin.from(JOBS_TABLE).select("id, install_id").eq("creator_id", creatorId).eq("idempotency_key", key).maybeSingle()
    if (!sameErr && same) return NextResponse.json({ install: { id: (same as { install_id: string }).install_id }, job: { id: (same as { id: string }).id } })
    if (!isMissingTable(sameErr)) {
      const busy = await rateLimit({ bucket: "site-generate", subjects: [`creator:${creatorId}`], windows: LIMITS.siteGenerate, message: "You have started several AI websites in a short time. Wait a few minutes, then try again." })
      if (busy) return busy
      const since = new Date(Date.now() - 20 * 60_000).toISOString()
      const { count } = await admin.from(JOBS_TABLE).select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", ["queued", "running"]).gte("updated_at", since)
      if ((count ?? 0) >= MAX_RUNNING_JOBS) return NextResponse.json({ error: "A website is already being made with AI. Wait for it to finish, then start another.", code: "ai_busy" }, { status: 429 })
    }
  }

  const made = await createStartWebsite({ supabase, admin }, { creatorId, mode, name: body?.name })
  if (!made.ok) {
    return NextResponse.json(made.code ? { error: made.error, code: made.code } : { error: made.error }, { status: made.status })
  }

  /* Its first picture, as Add takes it: a photograph when it is quick, else pending and the page looks for it. */
  const first = await coverForNewWebsite({ installId: made.install.id, userId: site.ownerUserId, creatorId }, renderOrigin(req.url), "create", null)

  if (!generating) return NextResponse.json({ install: made.install, ...first })

  const job = await startJobRow(admin, { creatorId, ownerUserId: site.ownerUserId, installId: made.install.id, prompt, key: key! })
  /* Two of the same press at once: the second website goes, the first press's job answers. */
  if (job.kind === "duplicate") {
    await admin.from("store_theme_installs").delete().eq("id", made.install.id).eq("creator_id", creatorId)
    return NextResponse.json({ install: { id: job.installId }, job: { id: job.id } })
  }
  /* No table yet (or it would not take the row): the editor builds the site in its own request. */
  if (job.kind !== "made") return NextResponse.json({ install: made.install, ...first, job: null, fallback: true })
  /* Started on the server now; the editor's progress view polls it, and starts it again itself if this call is lost. */
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => kickJob(origin, job.id))
  return NextResponse.json({ install: made.install, ...first, job: { id: job.id } })
}
