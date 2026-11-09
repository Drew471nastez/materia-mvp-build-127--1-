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
import { redesignState } from "./redesign"

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

/** Preview errors the loop is shown per iteration at most. */
export const PREVIEW_ERRORS_READ = 20

/** The canvas's error events (part 405: kind error, payload source "preview") as the loop reads them. Pure. */
export function previewErrorsFromEvents(rows: { payload: unknown; created_at: string }[]): RuntimePreviewError[] {
  const out: RuntimePreviewError[] = []
  for (const r of rows) {
    const p = obj(r.payload)
    if (p.source !== "preview" || typeof p.message !== "string") continue
    out.push({ installId: "", page: String(p.page ?? ""), sectionId: String(p.sectionId ?? ""), type: String(p.type ?? ""), message: p.message, at: r.created_at })
  }
  return out
}

/* ── what the editor polls ─────────────────────────────────────────────── */

/** Columns the poll reads for an agent job: light, no checkpoint. */
export const AGENT_VIEW_COLUMNS = "id, creator_id, install_id, engine, status, step, phase, error, attempts, lease_until, cancel_requested_at, last_event_seq, created_at, run:state->agent, redesign:options->redesign, undo:state->undo"
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
  /** options.redesign and state.undo (round M): a Redesign with AI job and whether it was undone. */
  redesign?: unknown
  undo?: unknown
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
    ...redesignView(row),
  }
}

/** A Redesign with AI job: its scope, and whether Undo can still be pressed. */
function redesignView(row: AgentViewRow): Pick<AgentJobView, "redesign"> {
  const r = redesignState({ redesign: row.redesign }, row.undo)
  return r ? { redesign: { scope: r.scope, undo: !r.backupId ? "none" : r.undone ? "done" : "available" } } : {}
}
