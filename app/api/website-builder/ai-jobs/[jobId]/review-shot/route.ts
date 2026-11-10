import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { signReviewShot } from "@/lib/ai-builder/visual-critic/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ jobId: string }> }

/**
 * GET /api/website-builder/ai-jobs/[jobId]/review-shot
 *
 * The first screen of the draft the design review last looked at (round O,
 * O4: lib/ai-builder/visual-critic/storage.ts), for the editor's progress
 * panel. The job is read with the caller's own session, scoped to their
 * store, so another store's job is a 404; only then is the private file
 * signed for a few minutes and the browser sent to it. Nothing public.
 */
export async function GET(_req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const limited = await rateLimit({ bucket: "ai-job-review-shot", subjects: [`user:${site.userId}`], windows: [{ limit: 60, seconds: 60 }], message: "Too many requests in a short time." })
  if (limited) return limited
  const { data: job } = await site.supabase.from(JOBS_TABLE).select("id, install_id").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const url = await signReviewShot(createAdminClient() as never, { installId: (job as { install_id: string }).install_id, jobId })
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } })
}
