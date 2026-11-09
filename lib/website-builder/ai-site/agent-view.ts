/**
 * ===========================================================================
 *  AN AGENT JOB'S ROW, READ (round L, L2)
 * ===========================================================================
 * Pure helpers shared by the store (./agent-store.ts, server only), the
 * routes and the tests: a row of ai_site_jobs as the runner's record, the
 * poll's view, a preview error checked. No database here.
 */
import type { AgentCheckpoint, AgentJobStatus, AgentPhase, GenerationMode, JobBudget, RuntimePreviewError, StartOptions } from "@/lib/ai-builder/types"
import { emptyRunState, type AgentJobRecord, type AgentRunState } from "./agent-runner"
import { eventFromRow, stopReason, type AgentJobView } from "./agent-progress"

/** The same table as server.ts JOBS_TABLE (that module is server only). */
export const JOBS_TABLE = "ai_site_jobs"
export const EVENTS_TABLE = "ai_site_job_events"

export interface AgentJobRow {
  id: string
  creator_id: string
  owner_user_id: string | null
  install_id: string
  engine?: string | null
  mode?: string | null
  options?: unknown
  status: string
  step?: string
  phase?: string | null
  iteration?: number | null
  checkpoint?: unknown
  budget?: unknown
  cancel_requested_at?: string | null
  last_event_seq?: number | null
  attempts: number
  lease_until: string | null
  created_at: string
  prompt: string
  state?: Record<string, unknown> | null
  runtime_errors?: unknown
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

export function runStateOf(state: unknown): AgentRunState {
  const raw = obj(obj(state).agent)
  const base = emptyRunState()
  return { ...base, ...(raw as Partial<AgentRunState>), usage: { ...base.usage, ...obj(raw.usage) }, counts: { ...obj(raw.counts) }, notes: Array.isArray(raw.notes) ? (raw.notes as string[]) : [] }
}

export function recordFromRow(r: AgentJobRow): AgentJobRecord {
  return {
    id: r.id,
    creatorId: r.creator_id,
    ownerUserId: r.owner_user_id,
    installId: r.install_id,
    prompt: r.prompt,
    mode: r.mode === "blank" || r.mode === "theme" ? (r.mode as GenerationMode) : null,
    options: obj(r.options) as Partial<StartOptions>,
    status: r.status as AgentJobStatus,
    phase: (r.phase ?? null) as AgentPhase | null,
    iteration: Number(r.iteration) || 0,
    checkpoint: r.checkpoint && typeof r.checkpoint === "object" ? (r.checkpoint as AgentCheckpoint) : null,
    budget: r.budget && typeof r.budget === "object" ? (r.budget as Partial<JobBudget>) : null,
    cancelRequestedAt: r.cancel_requested_at ?? null,
    lastEventSeq: Number(r.last_event_seq) || 0,
    attempts: Number(r.attempts) || 0,
    leaseUntil: r.lease_until,
    createdAt: r.created_at,
    run: runStateOf(r.state),
  }
}

export function previewErrorsOf(v: unknown): RuntimePreviewError[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as RuntimePreviewError[]).slice(-20) : []
}

/** Preview errors kept on a job, newest last. */
export const PREVIEW_ERRORS_KEPT = 20

/** One error the editor's canvas reports, checked and cut to size. Null when it is not one. */
export function readPreviewError(v: unknown, installId: string): RuntimePreviewError | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const s = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "")
  const page = s(o.page, 60)
  const sectionId = s(o.sectionId, 120)
  const type = s(o.type, 80)
  const message = s(o.message, 300)
  if (!page || !sectionId || !message || s(o.installId, 60) !== installId) return null
  return { installId, page, sectionId, type, message, at: new Date().toISOString() }
}

/* ── what the editor polls ─────────────────────────────────────────────── */

/** Columns the poll reads for an agent job: light, no checkpoint. */
export const AGENT_VIEW_COLUMNS = "id, creator_id, install_id, engine, status, step, phase, error, attempts, lease_until, cancel_requested_at, last_event_seq, created_at, run:state->agent"
/** Events one poll answers with at most. */
export const EVENTS_PAGE = 200

export interface AgentViewRow {
  id: string
  install_id: string
  status: string
  phase: string | null
  last_event_seq: number | null
  cancel_requested_at: string | null
  run?: unknown
}

/** The poll's answer for an agent job. Pure. */
export function agentView(row: AgentViewRow, events: { seq: number; kind: string; payload: unknown; created_at: string }[], maxContinues: number): AgentJobView {
  const run = runStateOf({ agent: row.run })
  const list = events.map(eventFromRow).sort((a, b) => a.seq - b.seq)
  const last = list.length ? list[list.length - 1].seq : 0
  const status = row.status as AgentJobView["status"]
  const code = run.errorCode
  const reason = code ? stopReason(code) : null
  const actions = reason ? reason.actions.filter((a) => a !== "continue" || run.continues < maxContinues) : []
  return {
    id: row.id,
    installId: row.install_id,
    engine: "agent",
    status,
    phase: (row.phase ?? null) as AgentJobView["phase"],
    seq: Math.max(Number(row.last_event_seq) || 0, last),
    events: list,
    more: list.length >= EVENTS_PAGE,
    counts: run.counts,
    error: code && reason && (status === "failed" || status === "partial") ? { code, message: `${reason.title}. ${reason.message}`, actions: actions.length ? actions : ["start_over"] } : null,
    cancelRequested: !!row.cancel_requested_at,
    summary: run.summary,
    notes: run.notes,
    continues: { used: run.continues, max: maxContinues },
  }
}
