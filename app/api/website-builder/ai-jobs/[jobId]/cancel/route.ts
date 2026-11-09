import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { after, NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { driveJob } from "@/lib/website-builder/ai-site/runner"
import { isTerminal } from "@/lib/website-builder/ai-site/agent-runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** A job nobody is running is ended here, in after(). */
export const maxDuration = 60

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/cancel
 *
 * The progress view's Cancel, for an agent job (round L). Sets
 * cancel_requested_at; the runner sees it before its next model call or
 * tool (lib/website-builder/ai-site/agent-runner.ts) and ends the job
 * `cancelled`, keeping every draft it wrote. A job no runner holds right
 * now (waiting for its next turn) is ended at once. Idempotent: a second
 * press, or a press on a job that already ended, changes nothing.
 * The owner's only.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can do this." }, { status: 403 })
  const limited = await rateLimit({ bucket: "site-generate-cancel", subjects: [`user:${site.userId}`], windows: LIMITS.siteAction, message: "Too many tries in a short time. Wait a minute, then try again." })
  if (limited) return limited
  const { data, error } = await site.supabase.from(JOBS_TABLE).select("id, engine, status, lease_until, cancel_requested_at").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = data as { engine?: string; status: string; lease_until: string | null; cancel_requested_at: string | null }
  if (row.engine !== "agent") return NextResponse.json({ error: "This build cannot be stopped part way. It finishes on its own in a few minutes.", code: "not_cancellable" }, { status: 409 })
  if (isTerminal(row.status)) return NextResponse.json({ ok: true, status: row.status })
  const admin = createAdminClient()
  if (!row.cancel_requested_at) {
    await admin.from(JOBS_TABLE).update({ cancel_requested_at: new Date().toISOString() }).eq("id", jobId).eq("creator_id", site.creatorId).in("status", ["queued", "running"]).is("cancel_requested_at", null)
  }
  /* Waiting for a free slot or its next turn: nobody will look soon, so it is ended now. */
  if (row.status === "queued") await admin.from(JOBS_TABLE).update({ lease_until: null }).eq("id", jobId).eq("status", "queued")
  const held = row.status === "running" && !!row.lease_until && Date.parse(row.lease_until) > Date.now()
  if (!held) {
    const origin = ownOrigin(req.url)
    after(() => driveJob(jobId, origin))
  }
  return NextResponse.json({ ok: true, status: row.status, cancelRequested: true }, { status: 202 })
}
