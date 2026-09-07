/**
 * Is something already running for this site, and stopping it.
 *
 * ---------------------------------------------------------------------------
 *  WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * An agent run used to live and die with the browser connection that opened
 * it. It does not any more, which raises a question the editor could not
 * previously ask: a creator who locks their phone mid-edit and comes back two
 * minutes later needs to know whether their run is still going, already
 * finished, or never started.
 *
 * GET answers that. The editor asks on load, on returning to the tab, on
 * regaining the network, and on a slow poll while a run is in flight — so the
 * answer is cheap and says nothing the creator does not already know.
 *
 * DELETE is Stop. It writes a flag the run reads between turns rather than
 * aborting a socket, because the process serving this request is almost never
 * the process running the agent.
 */

import { type NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getSite } from "@/lib/sites/projects"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ActiveRun = { id: string; prompt: string; model: string; created_at: string }

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  // RLS decides. A site somebody else owns reads as absent, so there is no
  // separate ownership check here to forget.
  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  const admin = createAdminClient()
  const { data } = await admin.rpc("site_active_run", { p_site_id: siteId })
  const run = (data as ActiveRun[] | null)?.[0]

  if (!run) return NextResponse.json({ running: false }, { headers: { "Cache-Control": "no-store" } })

  return NextResponse.json(
    { running: true, runId: run.id, prompt: run.prompt, startedAt: run.created_at },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  const admin = createAdminClient()

  /**
   * Scoped to THIS site's running rows.
   *
   * Ownership was proved by the read above; this update goes through the
   * admin client because a creator must not be able to write run rows
   * directly, and `status = 'running'` keeps a late Stop from touching a run
   * that already finished and rewriting history.
   */
  await admin
    .from("site_agent_runs")
    .update({ cancel_requested: true })
    .eq("site_id", siteId)
    .eq("status", "running")

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
