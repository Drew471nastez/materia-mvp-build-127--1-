import "server-only"

/**
 * ===========================================================================
 *  AN AGENT JOB IN THE DATABASE (round L, L2)
 * ===========================================================================
 * The AgentStore the runner (./agent-runner.ts) works through, on the
 * service role: ai_site_jobs (SQL parts 380 and 401) and
 * ai_site_job_events. Every write after the claim is fenced on `attempts`
 * (the claim raised it), so a runner that lost its lease changes nothing.
 * The runner's own bookkeeping lives in state.agent; the rest of `state`
 * (the classic pipeline's) is left as it was.
 *
 * Cheap on purpose: a cancel check reads one column, the live count is a
 * head count on the partial index idx_ai_site_jobs_live, events go in one
 * call per batch (public.ai_site_job_add_events numbers them under the job's
 * row lock, so the editor's preview error reports never clash with them).
 */
import type { AgentJobPatch, AgentStore, EventRow } from "./agent-runner"
import { JOBS_TABLE } from "./server"
import { EVENTS_TABLE, PREVIEW_ERRORS_READ, previewErrorsFromEvents, recordFromRow, type AgentJobRow } from "./agent-view"

export { EVENTS_TABLE }

type Db = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The Supabase AgentStore, on the service role. */
export function agentStore(admin: Db): AgentStore {
  /* The classic half of `state`, kept as loaded so a save of state.agent never drops it. */
  const states = new Map<string, Record<string, unknown>>()
  return {
    async load(id) {
      const { data, error } = await admin.from(JOBS_TABLE).select("*").eq("id", id).maybeSingle()
      if (error || !data) return null
      const row = data as AgentJobRow
      states.set(id, row.state && typeof row.state === "object" ? (row.state as Record<string, unknown>) : {})
      return recordFromRow(row)
    },
    async claim(job, now, leaseMs) {
      const { data, error } = await admin
        .from(JOBS_TABLE)
        .update({ lease_until: new Date(now + leaseMs).toISOString(), attempts: job.attempts + 1, status: "running", updated_at: new Date(now).toISOString() })
        .eq("id", job.id)
        .eq("attempts", job.attempts)
        .in("status", ["queued", "running"])
        .or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
        .select("id")
      return !error && Array.isArray(data) && data.length === 1
    },
    async save(id, fence, patch: AgentJobPatch, now) {
      const at = new Date(now).toISOString()
      const row: Record<string, unknown> = { updated_at: at }
      if (patch.status !== undefined) row.status = patch.status
      if (patch.step !== undefined) row.step = patch.step
      if (patch.phase !== undefined) row.phase = patch.phase
      if (patch.iteration !== undefined) row.iteration = patch.iteration
      if (patch.checkpoint !== undefined) row.checkpoint = patch.checkpoint
      if (patch.run !== undefined) {
        const state = { ...(states.get(id) ?? {}), agent: patch.run }
        states.set(id, state)
        row.state = state
      }
      if (patch.costUsd !== undefined) row.cost_usd = Math.round(patch.costUsd * 1e6) / 1e6
      if (patch.error !== undefined) row.error = patch.error
      if (patch.lastEventSeq !== undefined) row.last_event_seq = patch.lastEventSeq
      if (patch.leaseUntil !== undefined) row.lease_until = patch.leaseUntil
      if (patch.finished) row.finished_at = at
      const { data, error } = await admin.from(JOBS_TABLE).update(row).eq("id", id).eq("attempts", fence).select("id")
      if (error) console.error("[ai-agent] could not save the job", { job: id, code: error.code })
      return !error && Array.isArray(data) && data.length === 1
    },
    async appendEvents(jobId, creatorId, rows: EventRow[]) {
      if (!rows.length) return { ok: true, last: 0 }
      const { data, error } = await admin.rpc("ai_site_job_add_events", { p_job_id: jobId, p_creator_id: creatorId, p_events: rows })
      if (error) {
        console.error("[ai-agent] could not write events", { job: jobId, code: error.code })
        return { ok: false, last: 0 }
      }
      return { ok: true, last: Number(data) || 0 }
    },
    async flags(jobId) {
      const { data } = await admin.from(JOBS_TABLE).select("cancel_requested_at").eq("id", jobId).maybeSingle()
      return { cancelRequested: !!(data as { cancel_requested_at?: string | null } | null)?.cancel_requested_at }
    },
    async previewErrors(jobId) {
      /* By the (job_id, seq) index, newest first: the canvas's reports (part 405, source "preview"). */
      const { data } = await admin.from(EVENTS_TABLE).select("payload, created_at").eq("job_id", jobId).eq("kind", "error").eq("payload->>source", "preview").order("seq", { ascending: false }).limit(PREVIEW_ERRORS_READ)
      return previewErrorsFromEvents((data ?? []) as { payload: unknown; created_at: string }[]).reverse()
    },
    async liveCount(now) {
      const { count } = await admin.from(JOBS_TABLE).select("id", { count: "exact", head: true }).eq("status", "running").gt("lease_until", new Date(now).toISOString())
      return count ?? 0
    },
    async park(id, until) {
      await admin.from(JOBS_TABLE).update({ status: "queued", lease_until: new Date(until).toISOString() }).eq("id", id).in("status", ["queued", "running"]).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`)
    },
  }
}

