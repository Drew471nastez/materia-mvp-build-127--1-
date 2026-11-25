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
import { agentEnabledFor } from "@/lib/website-builder/ai-site/agent-access"
import { parseStartOptions } from "@/lib/website-builder/ai-site/start-options"
import { chooseMateriaTemplate } from "@/lib/storelib-ai/materia/reference"
import { installCodeTemplate } from "@/lib/themes/template-install"

export const runtime = "nodejs"
/** The website is made at once, and photographed within QUICK_COVER_MS when a browser is that quick, as Add does. */
export const maxDuration = 60

/**
 * POST /api/website-builder/themes/create
 *   body: { mode: "ai" | "blank", name?: string, prompt?: string, key?: string,
 *           options?: { generation: "blank" | "theme", category?, preset?, preferences? } }
 *
 * The Website page's Start with AI and Start from blank: a new Storelib
 * Default website, as a draft, whose home page is only its header and
 * footer; or, for Start with AI inside a theme on the agent engine (round
 * 26), the closest of Storelib's Materia templates, imported whole. See lib/website-builder/create-website.ts for what is written and
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
 * ROUND L (L-architecture D4, D7). With AI, the prompt, a key and the
 * options are REQUIRED and checked before anything is made: an AI press
 * without a description or a key used to make an ordinary website with no
 * job, and the editor then opened with nothing to build, so the person's
 * words were lost without a word. The prompt is stored exactly as sent
 * (never trimmed, never cut: one longer than START_PROMPT_MAX is refused).
 * `options.generation: "blank"` makes the website without the theme's
 * header, footer and sections (create-website.ts chrome "none"). The job
 * row, with the prompt and options, exists before the answer; a job that
 * could not be written takes its website back with it and says so, instead
 * of the old silent fallback to this tab's storage.
 *
 * ROUND N (N1, "I cannot see it"). With AI, the answer no longer waits for
 * a photograph of the new website (up to QUICK_COVER_MS, 8 s): the site is
 * empty and about to be designed, so that picture was of nothing, and the
 * person stared at a spinner for it before the editor could open. The
 * Website page takes the cover later, as it does for any site without one.
 * And From scratch needs the new AI builder: for an account where it is not
 * on, a "blank" press is refused (409 agent_off) before anything is made,
 * never run by the older builder on the theme's sections as if it were the
 * same thing. The Website page already says so beside the choice.
 *
 * The same people as Add: the owner, or a team member with Website working
 * in the store (lib/team/website); Start with AI is the owner's, since it
 * spends the store's AI. The same library limit and refusal.
 */
/** Round N: the words a From scratch press gets when the new AI builder is not on for the account. */
const AGENT_OFF_MESSAGE = "The new AI builder isn't on for your account yet. Pick From a Storelib template to start with AI now."

/** An AI start's picture: none yet, and none waited for. The Website page asks for one later, as for any site without one. */
const AI_START_COVER = { cover: null, cover_pending: false } as const

export async function POST(req: Request) {
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const { supabase, creator } = site

  const body = await req.json().catch(() => ({}))
  const mode: unknown = body?.mode
  if (!isStartMode(mode)) return NextResponse.json({ error: "mode must be ai or blank" }, { status: 400 })
  if (body?.name !== undefined && body?.name !== null && typeof body.name !== "string") {
    return NextResponse.json({ error: "name must be text" }, { status: 400 })
  }
  const creatorId = creator.id as string
  const admin = createAdminClient()

  /* ── Start with AI: the description exactly as written, the press's key, the options, and the limits on generating ── */
  const generating = mode === "ai"
  const prompt = typeof body?.prompt === "string" ? (body.prompt as string) : ""
  const key = isStartKey(body?.key) ? (body.key as string) : null
  const parsed = parseStartOptions(body?.options)
  if (generating) {
    if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can start a website with AI." }, { status: 403 })
    if (!prompt.trim()) return NextResponse.json({ error: "Describe your website first.", code: "prompt_required" }, { status: 400 })
    if (prompt.length > START_PROMPT_MAX) return NextResponse.json({ error: `Keep the description under ${START_PROMPT_MAX.toLocaleString("en-US")} characters.`, code: "prompt_too_long" }, { status: 400 })
    if (!key) return NextResponse.json({ error: "key is required", code: "key_required" }, { status: 400 })
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: "bad_options" }, { status: 400 })
  }
  const options = parsed.ok ? parsed.options : { generation: "theme" as const }
  /* Without the jobs table (SQL part 380 not run) there is no replay and no job limit: the editor builds in its own request. */
  let noJobsTable = false
  if (generating) {
    /* The same press again: its website and its job, not a second one. */
    const { data: same, error: sameErr } = await admin.from(JOBS_TABLE).select("id, install_id").eq("creator_id", creatorId).eq("idempotency_key", key).maybeSingle()
    if (!sameErr && same) return NextResponse.json({ install: { id: (same as { install_id: string }).install_id }, job: { id: (same as { id: string }).id }, replay: true })
    noJobsTable = isMissingTable(sameErr)
  }

  /* The agent engine for everyone (AI_BUILDER_AGENT=1) or for this account only (AI_BUILDER_AGENT_ACCOUNTS, round M): lib/website-builder/ai-site/agent-access.ts. */
  const engine = generating ? ((await agentEnabledFor(admin, { ownerUserId: site.ownerUserId, creatorId })) ? "agent" : "classic") : null
  /* Round N: From scratch is the new AI builder's; never the older one in its place. */
  if (generating && options.generation === "blank" && engine !== "agent") {
    return NextResponse.json({ error: AGENT_OFF_MESSAGE, code: "agent_off" }, { status: 409 })
  }

  /* A press each, never a stream: LIMITS.siteAction. After the replay above, so a retry of a press that worked is never refused. */
  const limited = await rateLimit({
    bucket: "site-create",
    subjects: [`user:${site.userId}`],
    windows: LIMITS.siteAction,
    message: "Too many new websites in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  if (generating && !noJobsTable) {
    const busy = await rateLimit({ bucket: "site-generate", subjects: [`creator:${creatorId}`], windows: LIMITS.siteGenerate, message: "You have started several AI websites in a short time. Wait a few minutes, then try again." })
    if (busy) return busy
    const since = new Date(Date.now() - 20 * 60_000).toISOString()
    const { count } = await admin.from(JOBS_TABLE).select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", ["queued", "running"]).gte("updated_at", since)
    if ((count ?? 0) >= MAX_RUNNING_JOBS) return NextResponse.json({ error: "A website is already being made with AI. Wait for it to finish, then start another.", code: "ai_busy" }, { status: 429 })
  }

  /*
    ROUND 26: START WITH AI BUILDS LIKE THE TEMPLATES. Inside a theme, on the agent engine with the jobs table, the
    new website is the closest of Storelib's Materia templates to the description (the example picked and the words),
    imported as Browse themes adds one, BEFORE the job exists, so the agent places and adapts Materia's real sections
    (lib/themes/template-install.ts). From scratch stays a blank page; the classic engine and the in-request path
    (no jobs table) keep Storelib Default, which is what they build with.
  */
  const fromTemplate = generating && engine === "agent" && options.generation === "theme" && !noJobsTable ? chooseMateriaTemplate({ prompt, category: options.category ?? null }).template.template : null
  const made = await createStartWebsite(
    { supabase, admin },
    { creatorId, mode, name: body?.name, chrome: generating && options.generation === "blank" ? "none" : "theme", ...(fromTemplate ? { template: { id: fromTemplate, userId: site.ownerUserId } } : {}) },
    { installTemplate: installCodeTemplate },
  )
  if (!made.ok) {
    return NextResponse.json(made.code ? { error: made.error, code: made.code } : { error: made.error }, { status: made.status })
  }

  /* Its first picture, as Add takes it: a photograph when it is quick, else pending and the page looks for it. Not for an AI start (round N): the editor opens at once. */
  const first = generating ? AI_START_COVER : await coverForNewWebsite({ installId: made.install.id, userId: site.ownerUserId, creatorId }, renderOrigin(req.url), "create", null)

  if (!generating) return NextResponse.json({ install: made.install, ...first })

  const job = await startJobRow(admin, { creatorId, ownerUserId: site.ownerUserId, installId: made.install.id, prompt, key: key!, options: fromTemplate ? { ...options, template: fromTemplate } : options, engine: engine ?? "classic" })
  /* Two of the same press at once: the second website goes, the first press's job answers. */
  if (job.kind === "duplicate") {
    await admin.from("store_theme_installs").delete().eq("id", made.install.id).eq("creator_id", creatorId)
    return NextResponse.json({ install: { id: job.installId }, job: { id: job.id } })
  }
  /* No table yet (SQL part 380 not run): the editor builds the site in its own request, from what the page keeps for it. */
  if (job.kind === "missing") return NextResponse.json({ install: made.install, ...first, job: null, fallback: true, options })
  /* The row would not go in: the website goes too, and the page keeps the words for another press. */
  if (job.kind !== "made") {
    await admin.from("store_theme_installs").delete().eq("id", made.install.id).eq("creator_id", creatorId)
    return NextResponse.json({ error: "Could not start the AI. Your description is still here, try again.", code: "job_failed" }, { status: 500 })
  }
  /* Started on the server now; the editor's progress view polls it, and starts it again itself if this call is lost. */
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => kickJob(origin, job.id))
  return NextResponse.json({ install: made.install, ...first, job: { id: job.id } })
}
