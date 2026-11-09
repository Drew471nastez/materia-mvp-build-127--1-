import { after, NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { editorContent } from "@/lib/website-builder/theme-file-drafts"
import { versionOf } from "@/lib/ai-builder/agent/version"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { ownOrigin } from "@/lib/website-builder/ai-site/own-origin"
import { kickJob } from "@/lib/website-builder/ai-site/runner"
import { agentEngineEnabled } from "@/lib/website-builder/ai-site/agent-engine"
import { MAX_RUNNING_JOBS } from "@/lib/website-builder/ai-site/start"
import { editJobOptions, editJobPrompt, parseEditRequest } from "@/lib/website-builder/ai-site/edit-job"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

/**
 * POST /api/website-builder/themes/[installId]/ai-edit   body ComponentEditRequest
 *
 * The editor's Edit with AI on one component, as an agent job in edit mode
 * (lib/website-builder/ai-site/edit-job.ts): the loop may change only that
 * file, everything else stays byte for byte; it writes drafts only. Answers
 * 202 { job: { id } } and the editor follows the job like any other
 * (GET /api/website-builder/ai-jobs/<id>, Cancel, Continue).
 *
 *   501  the agent engine is off (AI_BUILDER_AGENT): the editor uses its
 *        one-section writer instead.
 *   409  the file changed since the editor read it, or another AI build is
 *        running on this website.
 *   429  too many tries, or another AI build of this creator is running.
 *
 * The owner's only (it spends the store's AI), for this creator's website.
 */
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can do this." }, { status: 403 })
  if (!agentEngineEnabled()) return NextResponse.json({ error: "Not available" }, { status: 501 })
  const limited = await rateLimit({ bucket: "site-ai-edit", subjects: [`user:${site.userId}`], windows: LIMITS.siteAi, message: "Too many tries in a short time. Wait a minute, then try again." })
  if (limited) return limited
  const parsed = parseEditRequest(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const edit = parsed.edit

  const { data: install } = await site.supabase.from("store_theme_installs").select("id").eq("id", installId).eq("creator_id", site.creatorId).maybeSingle()
  if (!install) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const admin = createAdminClient()
  const { data: file, error: fileError } = await admin.from("store_theme_custom_files").select("content, draft_content").eq("install_id", installId).eq("path", edit.path).maybeSingle()
  if (fileError) return NextResponse.json({ error: "Could not read the file. Try again." }, { status: 500 })
  if (!file) return NextResponse.json({ error: "That file is not part of this website.", code: "no_file" }, { status: 409 })
  const current = versionOf(editorContent(file as { content: string; draft_content: string | null }))
  if (edit.expectedVersion !== null && edit.expectedVersion !== current) return NextResponse.json({ error: "This section changed since you opened it. Reload it, then ask again.", code: "conflict" }, { status: 409 })

  /* One AI build per creator at a time, as Start with AI. */
  const since = new Date(Date.now() - 20 * 60_000).toISOString()
  const { count } = await admin.from(JOBS_TABLE).select("id", { count: "exact", head: true }).eq("creator_id", site.creatorId).in("status", ["queued", "running"]).gte("updated_at", since)
  if ((count ?? 0) >= MAX_RUNNING_JOBS) return NextResponse.json({ error: "Another AI build is running. Wait for it to finish, then try again.", code: "ai_busy" }, { status: 429 })

  const { data: made, error } = await admin
    .from(JOBS_TABLE)
    .insert({
      creator_id: site.creatorId,
      owner_user_id: site.ownerUserId,
      install_id: installId,
      prompt: editJobPrompt(edit),
      idempotency_key: `edit-${randomUUID()}`,
      status: "queued",
      step: "agent",
      engine: "agent",
      mode: "theme",
      options: editJobOptions(edit),
      progress: 0,
      state: {},
    })
    .select("id")
    .single()
  if (error?.code === "23505") return NextResponse.json({ error: "Another AI build is running on this website. Wait for it, or cancel it first.", code: "ai_busy_site" }, { status: 409 })
  if (error || !made) return NextResponse.json({ error: "Could not start. Try again." }, { status: 500 })
  const id = (made as { id: string }).id
  const origin = ownOrigin(req.url) /* storelib.com itself: a deployment address sits behind Vercel protection */
  after(() => kickJob(origin, id))
  return NextResponse.json({ job: { id } }, { status: 202 })
}
