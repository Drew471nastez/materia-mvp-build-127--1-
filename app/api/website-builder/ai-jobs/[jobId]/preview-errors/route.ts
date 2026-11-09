import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { PREVIEW_ERROR_LIMITS, acceptPreviewError, previewErrorPayload } from "@/lib/ai-builder/preview-errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/preview-errors   { errors: RuntimePreviewError[] }
 *
 * The editor's canvas saw a section's script throw in its sandbox while an
 * AI job is building this website (lib/ai-builder/preview-errors.ts). Each
 * error is kept as an `error` event of the job with source "preview", which
 * the agent reads on its next iteration and repairs.
 *
 * Whoever can edit the website may report (the canvas is theirs); the job is
 * read with their own session, scoped to their store, so another store's job
 * is a 404. Each error is checked and cleaned again here, never trusted from
 * the browser. Kept by SQL part 405's function under the job's row lock, at
 * most 60 per job, only while the job is queued or running; a store without
 * part 405 answers 204 and keeps nothing.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const limited = await rateLimit({ bucket: "ai-job-preview-errors", subjects: [`user:${site.userId}`], windows: [{ limit: 30, seconds: 60 }], message: "Too many reports in a short time." })
  if (limited) return limited
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > 16_000) return NextResponse.json({ error: "Too large" }, { status: 413 })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const { data: job } = await site.supabase.from(JOBS_TABLE).select("id, install_id, status").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = job as { install_id: string; status: string }
  if (row.status !== "queued" && row.status !== "running") return new NextResponse(null, { status: 204 })
  const raw = Array.isArray((body as { errors?: unknown })?.errors) ? ((body as { errors: unknown[] }).errors) : []
  const errors = raw.slice(0, PREVIEW_ERROR_LIMITS.perPost).map((e) => acceptPreviewError(e, { installId: row.install_id })).filter((e): e is NonNullable<typeof e> => e !== null)
  if (!errors.length) return new NextResponse(null, { status: 204 })
  const admin = createAdminClient()
  let kept = 0
  for (const e of errors) {
    const { data, error } = await admin.rpc("ai_site_job_add_event", { p_job_id: jobId, p_creator_id: site.creatorId, p_kind: "error", p_payload: previewErrorPayload(e) })
    if (error) break
    if (typeof data === "number" && data > 0) kept++
  }
  return NextResponse.json({ kept })
}
