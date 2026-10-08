/**
 * ===========================================================================
 *  HOW THE STORELIB AI HAS BEEN DOING, FROM ITS RUN LOG
 * ===========================================================================
 * storelib_ai_runs (supabase/sql/RUN_STORELIB_AI_BUILDER.sql) holds one row of
 * facts per run of the website builder's AI. This turns a window of those rows
 * into what /admin/ai-runs shows: how many, how many finished, by kind of
 * request, how many pages a whole site build made, how long, the checks still
 * failing when runs ended, and the likeness to a reference picture when one
 * was measured. Pure, so the arithmetic has a test.
 */

export interface AiRunRow {
  id: number
  created_at: string
  install_id: string
  creator_id: string
  page_key: string
  status: string
  intent_kind: string | null
  intent_flags: Record<string, unknown> | null
  ops_count: number
  wrote_code: boolean
  pages_built: string[] | null
  unresolved: string[] | null
  duration_ms: number
  model: string | null
  provider: string | null
  input_tokens: number
  output_tokens: number
}

export interface AiRunSummary {
  runs: number
  succeeded: number
  failed: number
  successRate: number | null
  medianSeconds: number | null
  p90Seconds: number | null
  sitesBuilt: number
  pagesPerSiteBuild: number | null
  withOpenChecks: number
  tokens: { input: number; output: number }
  byKind: { kind: string; runs: number; successRate: number; medianSeconds: number }[]
  openChecks: { text: string; count: number }[]
  models: { model: string; runs: number }[]
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[at]
}

const seconds = (ms: number) => Math.round(ms / 100) / 10

/** A check's text without the parts that differ run to run (names, numbers, ids), so the same failure counts once. */
export function checkKey(text: string): string {
  return text
    /* "Pricing [pricing-1] has..." and "Hero [hero-9] has..." are one failure on two sections. */
    .replace(/^[^[\n]{0,60}\[[^\]]*\]/, "A section")
    .replace(/\[[^\]]*\]/g, "[…]")
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\d+/g, "n")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160)
}

export function summariseRuns(rows: AiRunRow[]): AiRunSummary {
  const runs = rows.length
  const succeeded = rows.filter((r) => r.status === "succeeded").length
  const failed = rows.filter((r) => r.status === "failed").length
  const ms = rows.map((r) => r.duration_ms).sort((a, b) => a - b)
  const sites = rows.filter((r) => r.intent_kind === "NEW_SITE_GENERATION" || r.intent_kind === "FULL_SITE_REDESIGN")
  const kinds = new Map<string, AiRunRow[]>()
  for (const r of rows) {
    const k = r.intent_kind ?? "unknown"
    kinds.set(k, [...(kinds.get(k) ?? []), r])
  }
  const checks = new Map<string, { text: string; count: number }>()
  for (const r of rows) {
    for (const u of r.unresolved ?? []) {
      const key = checkKey(u)
      const hit = checks.get(key)
      if (hit) hit.count++
      else checks.set(key, { text: u.slice(0, 200), count: 1 })
    }
  }
  const models = new Map<string, number>()
  for (const r of rows) models.set(r.model ?? "unknown", (models.get(r.model ?? "unknown") ?? 0) + 1)
  return {
    runs,
    succeeded,
    failed,
    successRate: runs ? Math.round((succeeded / runs) * 1000) / 10 : null,
    medianSeconds: quantile(ms, 0.5) === null ? null : seconds(quantile(ms, 0.5)!),
    p90Seconds: quantile(ms, 0.9) === null ? null : seconds(quantile(ms, 0.9)!),
    sitesBuilt: sites.length,
    pagesPerSiteBuild: sites.length ? Math.round((sites.reduce((n, r) => n + (r.pages_built?.length ?? 0), 0) / sites.length) * 10) / 10 : null,
    withOpenChecks: rows.filter((r) => (r.unresolved?.length ?? 0) > 0).length,
    tokens: { input: rows.reduce((n, r) => n + (r.input_tokens || 0), 0), output: rows.reduce((n, r) => n + (r.output_tokens || 0), 0) },
    byKind: [...kinds.entries()]
      .map(([kind, list]) => {
        const s = list.map((r) => r.duration_ms).sort((a, b) => a - b)
        return {
          kind,
          runs: list.length,
          successRate: Math.round((list.filter((r) => r.status === "succeeded").length / list.length) * 1000) / 10,
          medianSeconds: seconds(quantile(s, 0.5) ?? 0),
        }
      })
      .sort((a, b) => b.runs - a.runs),
    openChecks: [...checks.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    models: [...models.entries()].map(([model, n]) => ({ model, runs: n })).sort((a, b) => b.runs - a.runs),
  }
}

/** The request kinds in words, for the owner. */
export const KIND_LABELS: Record<string, string> = {
  NEW_SITE_GENERATION: "New site",
  FULL_SITE_REDESIGN: "Whole site redesign",
  PAGE_REDESIGN: "Page redesign",
  SECTION_REDESIGN: "Section rebuild",
  FUNCTIONAL_CHANGE: "Behaviour",
  STYLE_CHANGE: "Style",
  CONTENT_CHANGE: "Content",
  LOCAL_EDIT: "Small edit",
  QUESTION: "Question",
  unknown: "Not classified",
}
