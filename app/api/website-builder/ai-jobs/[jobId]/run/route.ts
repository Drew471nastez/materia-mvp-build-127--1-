import { after, NextResponse } from "next/server"
import { isUuid } from "@/lib/site-blog/http"
import { verifyJobToken } from "@/lib/website-builder/ai-site/server"
import { driveJob } from "@/lib/website-builder/ai-site/runner"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/** One runner's turn: steps until its budget (lib/website-builder/ai-site/server.ts RUN_BUDGET_MS), then it hands over. */
export const maxDuration = 300

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/run   header x-ai-job-token
 *
 * Start with AI calling itself: the create route, and every runner whose
 * time is up, ask for the next turn here. Only with a token this server
 * signed for this job and still in date (lib/website-builder/ai-site/server.ts
 * jobToken); nothing a browser can call. Answers at once and runs the job
 * after the answer, so the caller never waits on it.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId) || !verifyJobToken(jobId, req.headers.get("x-ai-job-token"))) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const origin = new URL(req.url).origin
  const started = Date.now()
  after(() => driveJob(jobId, origin, started))
  return NextResponse.json({ ok: true }, { status: 202 })
}
