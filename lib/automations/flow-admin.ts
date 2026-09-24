import "server-only"

/**
 * The writes on runs and jobs a creator's action causes. Creators cannot
 * write those tables (supabase/sql/RUN_EMAIL_AUTOMATIONS.sql), so these go
 * through the service role, always for a flow the route has already read
 * through the creator's own session, which is the ownership check.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { isMissing } from "./supabase-store"

/**
 * TURNING OFF STOPS EVERYONE WHERE THEY ARE. People partway through are
 * taken out and their waiting emails are cancelled, so turning it back on
 * later does not send a pile of stale emails at once. Returns how many
 * people were taken out; zero before the engine's SQL has run.
 */
export async function stopFlowRuns(flowId: string, reason: string): Promise<number> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from("email_flow_runs")
    .update({ status: "cancelled", exit_reason: reason, finished_at: now, updated_at: now })
    .eq("flow_id", flowId)
    .eq("status", "active")
    .select("id")
  if (error) {
    if (!isMissing(error)) console.error("[automations] could not stop the flow's runs:", error.code)
    return 0
  }
  await admin.from("email_flow_jobs").update({ state: "cancelled", last_error: reason, finished_at: now, updated_at: now }).eq("flow_id", flowId).eq("state", "queued")
  return Array.isArray(data) ? data.length : 0
}

/** People partway through this flow right now. */
export async function activeRunCount(flowId: string): Promise<number> {
  const admin = createAdminClient()
  const { count, error } = await admin.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", flowId).eq("status", "active")
  return error ? 0 : count ?? 0
}

/**
 * TRY AGAIN, for the creator's button on a failed run. Every failed job of
 * this flow goes back in the queue with its attempts reset, and its run is
 * active again. A job that failed because a send was interrupted is not put
 * back: nobody can know whether that email arrived, and sending it again is
 * the one thing the engine promises not to do.
 */
export async function retryFailedJobs(flowId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: jobs, error } = await admin.from("email_flow_jobs").select("id, run_id, last_error").eq("flow_id", flowId).eq("state", "failed").limit(500)
  if (error || !jobs) return 0
  const retryable = jobs.filter((j: { last_error: string | null }) => !/not sent again/.test(j.last_error ?? ""))
  if (retryable.length === 0) return 0
  const now = new Date().toISOString()
  const runIds = [...new Set(retryable.map((j: { run_id: string }) => j.run_id))]
  await admin.from("email_flow_runs").update({ status: "active", exit_reason: null, finished_at: null, updated_at: now }).in("id", runIds).eq("status", "failed")
  const { data: requeued } = await admin
    .from("email_flow_jobs")
    .update({ state: "queued", attempts: 0, run_at: now, last_error: null, claimed_by: null, claimed_until: null, finished_at: null, updated_at: now })
    .in("id", retryable.map((j: { id: string }) => j.id))
    .eq("state", "failed")
    .select("id")
  return Array.isArray(requeued) ? requeued.length : 0
}
