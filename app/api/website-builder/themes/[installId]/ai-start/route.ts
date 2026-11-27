import { NextResponse } from "next/server"
import { websiteInstallCaller } from "@/lib/team/website"
import { isUuid } from "@/lib/site-blog/http"
import { isMissingTable, JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { isMissingColumn } from "@/lib/website-builder/ai-site/start"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

/**
 * GET /api/website-builder/themes/[installId]/ai-start
 *
 * The Start with AI job of this website, from the server's own record: its
 * id, status, the prompt exactly as it was sent, and the options chosen with
 * it (ai_site_jobs, SQL parts 380 and 401). The editor asks this when it
 * opens a website without `job=` in its address and without the job in this
 * tab's storage: a reload in another tab, the app's web view that dropped
 * sessionStorage, a link opened later. The progress view then follows the
 * job instead of the website opening as if nothing were being made.
 *
 * The newest job of this website only, read through the caller's own client
 * (owner select policy) and filtered by their store: another store's
 * website is "Theme not found", as every install route answers.
 */
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  if (!isUuid(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteInstallCaller(installId)
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ job: null }, { headers: { "cache-control": "no-store" } })
  const read = (columns: string) => site.supabase.from(JOBS_TABLE).select(columns).eq("install_id", installId).eq("creator_id", site.creatorId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  let { data, error } = await read("id, status, prompt, options, created_at")
  if (error && isMissingColumn(error)) ({ data, error } = await read("id, status, prompt, created_at"))
  if (error && !isMissingTable(error)) return NextResponse.json({ error: "Could not read the AI job" }, { status: 503 })
  /* r69: read through unknown; the select string is built at run time, so the client types it as a string error. */
  const row = (data ?? null) as unknown as { id: string; status: string; prompt: string; options?: unknown } | null
  return NextResponse.json(
    { job: row ? { id: row.id, status: row.status, prompt: row.prompt, options: row.options ?? null } : null },
    { headers: { "cache-control": "no-store" } },
  )
}
