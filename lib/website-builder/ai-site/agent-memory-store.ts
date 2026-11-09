/**
 * ===========================================================================
 *  THE AGENT JOB TABLE, IN MEMORY (round M)
 * ===========================================================================
 * An AgentStore (./agent-runner.ts) with the database's rules and none of the
 * database: one runner holds the lease, every write is fenced on `attempts`,
 * events are numbered after the job's newest under one lock, a finished job
 * takes no more events. The checkpoint and the run state go through JSON on
 * every save and load, as a jsonb column does, so a value that only survived
 * because it was the same object in memory (the bug a direct runAgentSlice
 * loop could never see) is lost here too.
 *
 * Used by the live smoke (scripts/ai-builder/smoke-run.ts) and its test.
 * Pure: no network, no clock of its own.
 */
import { emptyRunState, type AgentJobPatch, type AgentJobRecord, type AgentStore, type EventRow } from "./agent-runner"
import { previewErrorsFromEvents } from "./agent-view"

const viaJson = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T))

export interface MemoryEventRow extends EventRow {
  jobId: string
  seq: number
  at: string
}

export class MemoryAgentStore implements AgentStore {
  jobs = new Map<string, AgentJobRecord>()
  events: MemoryEventRow[] = []
  /** How many times a checkpoint was written (each one through JSON). */
  checkpointSaves = 0

  constructor(private now: () => number = Date.now) {}

  add(job: Partial<AgentJobRecord> & { id: string; prompt: string }): AgentJobRecord {
    const j: AgentJobRecord = {
      creatorId: "smoke-creator",
      ownerUserId: null,
      installId: "smoke-install",
      mode: "blank",
      options: { generation: "blank" },
      status: "queued",
      phase: null,
      iteration: 0,
      checkpoint: null,
      budget: null,
      cancelRequestedAt: null,
      lastEventSeq: 0,
      attempts: 0,
      leaseUntil: null,
      createdAt: new Date(this.now()).toISOString(),
      run: emptyRunState(),
      ...job,
    }
    this.jobs.set(j.id, viaJson(j))
    return viaJson(j)
  }

  async load(id: string) {
    const j = this.jobs.get(id)
    return j ? viaJson(j) : null
  }

  async claim(job: AgentJobRecord, now: number, leaseMs: number) {
    const j = this.jobs.get(job.id)
    if (!j || j.attempts !== job.attempts || !["queued", "running"].includes(j.status) || (j.leaseUntil && Date.parse(j.leaseUntil) >= now)) return false
    j.leaseUntil = new Date(now + leaseMs).toISOString()
    j.attempts += 1
    j.status = "running"
    return true
  }

  async save(id: string, fence: number, p: AgentJobPatch) {
    const j = this.jobs.get(id)
    if (!j || j.attempts !== fence) return false
    if (p.status !== undefined) j.status = p.status
    if (p.phase !== undefined) j.phase = p.phase
    if (p.iteration !== undefined) j.iteration = p.iteration
    if (p.checkpoint !== undefined) {
      j.checkpoint = viaJson(p.checkpoint)
      this.checkpointSaves += 1
    }
    if (p.run !== undefined) j.run = viaJson(p.run)
    if (p.leaseUntil !== undefined) j.leaseUntil = p.leaseUntil
    return true
  }

  async appendEvents(jobId: string, _creatorId: string, rows: EventRow[]) {
    const j = this.jobs.get(jobId)
    if (!j || !["queued", "running"].includes(j.status)) return { ok: true, last: 0 }
    let seq = j.lastEventSeq
    for (const r of rows) this.events.push({ kind: r.kind, payload: viaJson(r.payload), jobId, seq: ++seq, at: new Date(this.now()).toISOString() })
    j.lastEventSeq = seq
    return { ok: true, last: seq }
  }

  async flags(jobId: string) {
    return { cancelRequested: !!this.jobs.get(jobId)?.cancelRequestedAt }
  }

  async previewErrors(jobId: string) {
    return previewErrorsFromEvents(this.events.filter((e) => e.jobId === jobId && e.kind === "error").map((e) => ({ payload: e.payload, created_at: e.at })))
  }

  async liveCount() {
    return 0
  }

  async park() {}

  /** Cancel, as the editor's Cancel button does (the runner reads it before the next call). */
  cancel(jobId: string) {
    const j = this.jobs.get(jobId)
    if (j && !j.cancelRequestedAt) j.cancelRequestedAt = new Date(this.now()).toISOString()
  }
}
