import { after, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { takeBackup, backupLabel } from "@/lib/website-builder/backups"
import { isMissingTable, JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { kickJob } from "@/lib/website-builder/ai-site/runner"
import { agentEnabledFor } from "@/lib/website-builder/ai-site/agent-access"
import { isStartKey, MAX_RUNNING_JOBS } from "@/lib/website-builder/ai-site/start"
import { parseRedesignRequest, redesignJobOptions, redesignState } from "@/lib/website-builder/ai-site/redesign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Params = { params: Promise<{ installId: string }> }

/**
 * ===========================================================================
 *  REDESIGN WITH AI: A WHOLE-SITE AGENT JOB ON AN EXISTING WEBSITE (round M)
 * ===========================================================================
 * Architecture D4 "theme mode": generate inside a website that already
 * exists. Until now no route started one; Start with AI always made a new
 * website, Edit with AI changed one file.
 *
 * POST body { prompt, key, scope?: "changes" | "full" }
 *   1. owner only (it spends the store's AI), this creator's website, the
 *      agent engine on for this account (agent-access.ts) or 501;
 *   2. the same press twice (creator, key) answers the first job;
 *   3. rate limited (LIMITS.siteAi per person, LIMITS.siteGenerate per store)
 *      and one live AI job per creator (MAX_RUNNING_JOBS) and per website
 *      (409, also the database's one-live-job-per-install index);
 *   4. a BACKUP FIRST, through the Backups mechanism (takeBackup, read back
 *      to prove it is there), before the job exists: no backup, no job;
 *   5. the job row: engine agent, step agent, mode theme, options.redesign
 *      { scope, backupId }; the runner (L2) drives it like any agent job and
 *      the editor follows it with the same progress panel;
 *   6. "Undo this AI job" (POST ai-jobs/<id>/undo) restores that backup.
 *
 * GET: { agent: boolean, job: the newest redesign job of this website or
 * null }. `agent` is how the editor learns whether to offer Redesign with AI
 * and the agent's Edit with AI: from the server, never from an env variable
 * of its own.
 */
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const headers = { "cache-control": "no-store" }
  /* A team member's AI is the owner's: nothing to offer. */
  if (!site.isOwner) return NextResponse.json({ agent: false, job: null }, { headers })
  const { data: install } = await site.supabase.from("store_theme_installs").select("id").eq("id", installId).eq("creator_id", site.creatorId).maybeSingle()
  if (!install) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const admin = createAdminClient()
  const agent = await agentEnabledFor(admin, { ownerUserId: site.ownerUserId, creatorId: site.creatorId })
  const job = agent ? await newestRedesign(site.supabase as unknown as SupabaseClient, installId, site.creatorId) : null
  return NextResponse.json({ agent, job }, { headers })
}

async function newestRedesign(db: SupabaseClient, installId: string, creatorId: string) {
  const { data, error } = await db
    .from(JOBS_TABLE)
    .select("id, status, prompt, options, undo:state->undo, created_at")
    .eq("install_id", installId)
    .eq("creator_id", creatorId)
    .eq("engine", "agent")
    .order("created_at", { ascending: false })
    .limit(10)
  if (error) return null
  for (const row of (data ?? []) as { id: string; status: string; prompt: string; options: unknown; undo: unknown; created_at: string }[]) {
    const r = redesignState(row.options, row.undo)
    if (r) return { id: row.id, status: row.status, prompt: row.prompt, created_at: row.created_at, ...r }
  }
  return null
}

export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can do this." }, { status: 403 })
  /* Another store's website is "Not found" before anything else is said about it. */
  const { data: install } = await site.supabase.from("store_theme_installs").select("id").eq("id", installId).eq("creator_id", site.creatorId).maybeSingle()
  if (!install) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const admin = createAdminClient()
  if (!(await agentEnabledFor(admin, { ownerUserId: site.ownerUserId, creatorId: site.creatorId }))) return NextResponse.json({ error: "Not available", code: "not_available" }, { status: 501 })

  const parsed = parseRedesignRequest(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: 400 })
  const { prompt, key, scope } = parsed.request
  if (!isStartKey(key)) return NextResponse.json({ error: "key is required", code: "key_required" }, { status: 400 })

  /* The same press again: its job, not a second one (and not a second backup). */
  const { data: same, error: sameErr } = await admin.from(JOBS_TABLE).select("id, install_id, options").eq("creator_id", site.creatorId).eq("idempotency_key", key).maybeSingle()
  if (isMissingTable(sameErr)) return NextResponse.json({ error: "Not available", code: "not_available" }, { status: 501 })
  if (same) {
    const s = same as { id: string; install_id: string; options: unknown }
    if (s.install_id !== installId) return NextResponse.json({ error: "That key was used for another website.", code: "key_used" }, { status: 409 })
    return NextResponse.json({ job: { id: s.id }, backup: { id: redesignState(s.options, null)?.backupId ?? null }, replay: true })
  }

  const limited = await rateLimit({ bucket: "site-redesign", subjects: [`user:${site.userId}`], windows: LIMITS.siteAi, message: "Too many tries in a short time. Wait a minute, then try again." })
  if (limited) return limited
  const busy = await rateLimit({ bucket: "site-generate", subjects: [`creator:${site.creatorId}`], windows: LIMITS.siteGenerate, message: "You have started several AI builds in a short time. Wait a few minutes, then try again." })
  if (busy) return busy

  /* One live AI job per creator, and one per website: checked before the backup, so a refused press leaves nothing behind. */
  const since = new Date(Date.now() - 20 * 60_000).toISOString()
  const { data: live } = await admin.from(JOBS_TABLE).select("id, install_id").eq("creator_id", site.creatorId).in("status", ["queued", "running"]).gte("updated_at", since).limit(5)
  const liveRows = (live ?? []) as { id: string; install_id: string }[]
  if (liveRows.some((r) => r.install_id === installId)) return NextResponse.json({ error: "Another AI build is running on this website. Wait for it, or cancel it first.", code: "ai_busy_site" }, { status: 409 })
  if (liveRows.length >= MAX_RUNNING_JOBS) return NextResponse.json({ error: "Another AI build is running. Wait for it to finish, then try again.", code: "ai_busy" }, { status: 429 })

  /* THE BACKUP FIRST, the Backups route's own mechanism, read back before anything else happens. */
  const backup = await takeBackup(site.supabase as unknown as SupabaseClient, installId, { label: backupLabel(`Before AI: ${prompt}`), source: "ai", verify: true })
  if (backup.error || !backup.backup) {
    console.error("[redesign] the backup could not be taken", { installId })
    return NextResponse.json({ error: "A backup of your website could not be saved, so the AI did not start. Try again.", code: "backup_failed" }, { status: 500 })
  }
  const backupId = backup.backup.id

  const { data: made, error } = await admin
    .from(JOBS_TABLE)
    .insert({
      creator_id: site.creatorId,
      owner_user_id: site.ownerUserId,
      install_id: installId,
      prompt,
      idempotency_key: key,
      status: "queued",
      step: "agent",
      engine: "agent",
      mode: "theme",
      options: redesignJobOptions(scope, backupId),
      progress: 0,
      state: {},
    })
    .select("id")
    .single()
  if (error?.code === "23505") {
    /* The same key from a press racing this one, or a job that started on this website a moment ago. */
    const { data: again } = await admin.from(JOBS_TABLE).select("id").eq("creator_id", site.creatorId).eq("idempotency_key", key).maybeSingle()
    if (again) return NextResponse.json({ job: { id: (again as { id: string }).id }, backup: { id: backupId }, replay: true })
    return NextResponse.json({ error: "Another AI build is running on this website. Wait for it, or cancel it first.", code: "ai_busy_site" }, { status: 409 })
  }
  if (error || !made) {
    console.error("[redesign] the job could not be started", { code: error?.code })
    return NextResponse.json({ error: "Could not start. Your website was not changed. Try again." }, { status: 500 })
  }
  const id = (made as { id: string }).id
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => kickJob(origin, id))
  return NextResponse.json({ job: { id }, backup: { id: backupId } }, { status: 202 })
}
