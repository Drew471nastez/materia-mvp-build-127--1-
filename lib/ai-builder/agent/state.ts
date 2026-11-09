/**
 * What the loop carries between iterations and between invocations. It IS an
 * AgentCheckpoint (the contract), with the few things the engine needs on
 * top; everything here is small (no file bodies) and saved to
 * ai_site_jobs.checkpoint after every iteration.
 */
import type { RuntimeCapabilities } from "../runtime-contract"
import type { AgentCheckpoint } from "../types"
import type { VisualConcept } from "./concept"

export interface LoopCheckpoint extends AgentCheckpoint {
  /** The accepted visual concept. Writes wait for it on a new website. */
  concept?: VisualConcept
  /** path → sha256 of the text this job last read or wrote: the expectedVersion of its next write. */
  known: Record<string, string>
  /** Files this job created (as opposed to edited). */
  created: string[]
  /** Counter for stable section and block ids. */
  ids: number
  /** The last event number this engine wrote. */
  seq: number
  /** Spend across every invocation, USD. */
  usd: number
  inputTokens: number
  outputTokens: number
  /** Turns that ended without a tool call, in a row. */
  nudges: number
  /** Provider failures in a row. */
  failures: number
  /** What list_capabilities answered, kept so every slice binds against the same facts. */
  caps?: RuntimeCapabilities | null
  /** Set once the job ended: what to tell the creator. */
  final?: { status: "complete" | "partial" | "failed" | "cancelled"; summary: string; failing: string[] }
}

export function newCheckpoint(): LoopCheckpoint {
  return {
    version: 1,
    iteration: 0,
    phase: "brief",
    turns: [],
    summary: "",
    openTasks: [],
    filesTouched: [],
    pagesTouched: [],
    repairs: {},
    verifyCycles: 0,
    known: {},
    created: [],
    ids: 0,
    seq: 0,
    usd: 0,
    inputTokens: 0,
    outputTokens: 0,
    nudges: 0,
    failures: 0,
  }
}

/** A checkpoint read back from the database, filled in where an older one lacks a field. */
export function readCheckpoint(raw: unknown): LoopCheckpoint | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Partial<LoopCheckpoint>
  if (r.version !== 1 || !Array.isArray(r.turns)) return null
  return { ...newCheckpoint(), ...r } as LoopCheckpoint
}

export const addUnique = (list: string[], item: string) => (list.includes(item) ? list : [...list, item])
