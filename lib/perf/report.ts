/**
 * What /admin/performance is handed: the shape lib/perf/read.ts fills and
 * app/admin/performance/performance-admin.tsx draws. Types and two small
 * helpers only, so the page can import it without any server code.
 *
 * Every figure is either a measured number or null, and null always comes
 * with a reason the page can say. There is no default, sample or placeholder
 * value anywhere in this shape.
 */

import type { Optimization } from "./optimizations"
import type { ErrorGroupRow, Problem } from "./problems"
import type { Aggregate, HealthResult } from "./scoring"
import type { SupabaseInfo, VercelInfo } from "./infra-types"

export type WindowId = "24h" | "7d" | "30d"

/** Every window is worked out from raw samples, which are kept long enough for the longest (RAW_RETENTION_DAYS). */
export const WINDOWS: { id: WindowId; label: string; hours: number }[] = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
  { id: "30d", label: "30 days", hours: 24 * 30 },
]

export function windowOf(raw: string | null | undefined): WindowId {
  return raw === "24h" || raw === "30d" ? raw : "7d"
}

export interface ScoreDay {
  day: string
  score: number | null
  subs: { id: string; score: number | null }[]
  /** The day's provisional score (lib/perf/scoring.ts rule 6), kept beside the official one; null for a day scored before it existed. */
  provisional?: { score: number; confidence: "high" | "medium" | "low" } | null
}

export interface SlowQuery {
  query: string
  calls: number
  mean_ms: number
  total_ms: number
  rows: number
}

export type SlowQueries = { available: true; rows: SlowQuery[]; slow: number } | { available: false; reason: string }

export interface PerfReport {
  generatedAt: string
  window: WindowId
  /** False until run-now part 126 has run: then every telemetry figure is insufficient data. */
  ready: boolean
  readyReason: string | null
  sampling: { client: number; server: number }
  health: HealthResult
  aggs: Aggregate[]
  /** perf_scores, oldest first, at most 30 days. Null when it could not be read. */
  history: ScoreDay[] | null
  errors: ErrorGroupRow[] | null
  slow: SlowQueries | null
  payments: { failed: number; completed: number } | null
  jobs: { late: number; known: number } | null
  supabase: SupabaseInfo
  vercel: VercelInfo
  problems: Problem[]
  optimizations: Optimization[]
}
