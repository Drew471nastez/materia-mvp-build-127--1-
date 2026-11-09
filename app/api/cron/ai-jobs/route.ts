import { NextResponse } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordCronRun } from "@/lib/observability/report"
import { createAdminClient } from "@/lib/supabase/admin"
import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { kickJob } from "@/lib/website-builder/ai-site/runner"
import { sweepAiJobs } from "@/lib/website-builder/ai-site/agent-sweep"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * CRON, every five minutes (vercel.json): the net under Start with AI's
 * self chaining (lib/website-builder/ai-site/agent-sweep.ts).
 *
 * A job hands itself to the next request at the end of each turn; when
 * that hand over is lost (a deploy, a cold start that timed out) and no
 * editor is open to notice, the job would wait forever. This finds live
 * jobs whose lease ran out a while ago and asks for their next turn, the
 * same signed call the job makes itself, a few at a time. Once an hour it
 * also deletes progress events older than 30 days. Behind the cron secret.
 * One indexed read when there is nothing to do.
 */
async function run(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const origin = ownOrigin(request.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  const result = await sweepAiJobs(createAdminClient(), { now: Date.now(), kick: (id) => kickJob(origin, id) })
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  return recordCronRun("/api/cron/ai-jobs", request, () => run(request), { maxDurationS: maxDuration })
}
