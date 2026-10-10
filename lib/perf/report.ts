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

export type WindowId = "24h" | "7d"

export const WINDOWS: { id: WindowId; label: string; hours: number }[] = [
  { id: "24h", label: "Last 24 hours", hours: 24 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7 },
]

export function windowOf(raw: string | null | undefined): WindowId {
  return raw === "24h" ? "24h" : "7d"
}

export interface ScoreDay {
  day: string
  score: number | null
  subs: { id: string; score: number | null }[]
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
