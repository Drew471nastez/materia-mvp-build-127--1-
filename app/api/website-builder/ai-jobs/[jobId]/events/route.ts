import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { PREVIEW_ERRORS_KEPT, previewErrorsOf, readPreviewError } from "@/lib/website-builder/ai-site/agent-view"
import type { RuntimePreviewError } from "@/lib/ai-builder/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/events   body { errors: RuntimePreviewError[] }
 *
 * The editor canvas tells a running agent job what broke while it drew the
 * AI's sections in the sandbox (a script error, a section that drew
 * nothing). Kept on the job, newest 20 (ai_site_jobs.runtime_errors, SQL
 * part 401); the loop reads them on its next iteration (agent-step.ts
 * previewErrors) and repairs. Never a progress event: those are the
 * runner's alone, numbered in order. Anyone who may open this website in
 * the editor, for this website's job only, while it runs.
 */
export async function POST(req: Request, { params }: Params) {
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  const limited = await rateLimit({ bucket: "site-generate-preview-errors", subjects: [`user:${site.userId}`], windows: LIMITS.siteAction, message: "Too many reports in a short time." })
  if (limited) return limited
  const body = (await req.json().catch(() => null)) as { errors?: unknown } | null
  const { data } = await site.supabase.from(JOBS_TABLE).select("id, install_id, engine, status, runtime_errors").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = data as { install_id: string; engine?: string; status: string; runtime_errors?: unknown }
  if (row.engine !== "agent" || (row.status !== "queued" && row.status !== "running")) return NextResponse.json({ ok: true, kept: 0 })
  const incoming = (Array.isArray(body?.errors) ? body!.errors : []).slice(0, 10).map((e) => readPreviewError(e, row.install_id)).filter((e): e is RuntimePreviewError => !!e)
  if (!incoming.length) return NextResponse.json({ error: "No errors to report" }, { status: 400 })
  /* The same error again is one entry, the newest last. */
  const key = (e: RuntimePreviewError) => `${e.page}\n${e.sectionId}\n${e.message}`
  const fresh = new Set(incoming.map(key))
  const kept = [...previewErrorsOf(row.runtime_errors).filter((e) => !fresh.has(key(e))), ...incoming].slice(-PREVIEW_ERRORS_KEPT)
  const { error } = await createAdminClient().from(JOBS_TABLE).update({ runtime_errors: kept }).eq("id", jobId).eq("creator_id", site.creatorId)
  if (error) return NextResponse.json({ error: "Could not keep the report." }, { status: 500 })
  return NextResponse.json({ ok: true, kept: incoming.length })
}
