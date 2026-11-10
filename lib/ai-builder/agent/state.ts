/**
 * What the loop carries between iterations and between invocations. It IS an
 * AgentCheckpoint (the contract), with the few things the engine needs on
 * top; everything here is small (no file bodies) and saved to
 * ai_site_jobs.checkpoint after every iteration.
 */
import type { RuntimeCapabilities } from "../runtime-contract"
import type { AgentCheckpoint } from "../types"
import type { VisualConcept } from "./concept"
import type { SitePlan } from "./site-plan"
import type { CreativeBrief } from "@/lib/storelib-ai/direction/brief"
import type { ReferenceHint } from "@/lib/storelib-ai/direction/choose"
import type { CriticScores, CriticStatus } from "../visual-critic/types"

/** The design review's rounds so far (round O, O4): small, no pictures. */
export interface CriticState {
  /** Reviews run (each one draws, measures and looks). Bounded by MAX_CRITIC_ROUNDS in ./loop.ts. */
  rounds: number
  /** The one targeted repair pass a low score or a high defect earns has been used. */
  targeted: boolean
  /** Asked to call finish again once because there was no time left in that invocation. */
  deferred?: boolean
  status?: CriticStatus
  reason?: string
  scores?: CriticScores
  weighted?: number
  /** Hard gates still failing after the last review. */
  gates: string[]
  /** What the last review still found, one line each, for the honest summary. */
  open: string[]
}
import type { SiteFingerprint } from "../novelty"

export interface LoopCheckpoint extends AgentCheckpoint {
  /** The accepted visual concept. Writes wait for it on a new website. */
  concept?: VisualConcept
  /** Round O (O2): the creative brief, read from the request and the store, refined by the plan. */
  brief?: CreativeBrief
  /** Round O (O2): the chosen art direction (ids; directions.ts), and the seed it was chosen with. */
  direction?: { primary: string; secondary: string | null; typeSystem: string; seed: string; refs?: ReferenceHint[] }
  /** Round N (N3): every page and template with its sections. A new website's writes wait for it too. */
  sitePlan?: SitePlan
  /** Round O (spec 8.4): this site's fingerprint at its last verify, read by later jobs for the novelty check. Short words only. */
  fingerprint?: SiteFingerprint
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
  /** Round O (O4): the visual critic's rounds and what it still finds. */
  critic?: CriticState
  /** Round O (O1): the references chosen for this job, and those whose pictures ride with the plan phase's turns (in that order). */
  references?: string[]
  referenceImages?: string[]
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
