/**
 * ===========================================================================
 *  GOOGLE'S ANSWERS, GROUPED BY COVERAGE STATE
 * ===========================================================================
 * Pure. Only an answer Google gave counts: a row whose URL Inspection came
 * back with a verdict (google_status indexed or not_indexed) and a time it
 * was asked. A row never asked, one Google gave no verdict for, one whose
 * inspection failed, and one outside Storelib's Search Console are not in
 * any group, so no group can say "indexed" without Google having said so.
 * The database does the same in seo_coverage_groups (part 346).
 */

export interface CoverageInput {
  google_status: string | null
  coverage_state: string | null
  inspected_at: string | null
}

export interface CoverageGroup {
  googleStatus: "indexed" | "not_indexed"
  coverageState: string
  addresses: number
  newestAnswer: string | null
}

export const NO_COVERAGE_STATE = "Google gave no coverage state"

export function isGoogleAnswer(r: Pick<CoverageInput, "google_status" | "inspected_at">): r is { google_status: "indexed" | "not_indexed"; inspected_at: string } {
  return (r.google_status === "indexed" || r.google_status === "not_indexed") && !!r.inspected_at
}

export function groupCoverage(rows: CoverageInput[]): CoverageGroup[] {
  const by = new Map<string, CoverageGroup>()
  for (const r of rows) {
    if (!isGoogleAnswer(r)) continue
    const state = r.coverage_state?.trim() || NO_COVERAGE_STATE
    const key = `${r.google_status}|${state}`
    const g = by.get(key) ?? { googleStatus: r.google_status, coverageState: state, addresses: 0, newestAnswer: null }
    g.addresses++
    if (!g.newestAnswer || Date.parse(r.inspected_at) > Date.parse(g.newestAnswer)) g.newestAnswer = r.inspected_at
    by.set(key, g)
  }
  return [...by.values()].sort((a, b) => b.addresses - a.addresses || a.coverageState.localeCompare(b.coverageState))
}

/** The rows the database function answers, read back as groups, with anything that is not an answer dropped. */
export function coverageFromRpc(data: unknown): CoverageGroup[] {
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  return rows
    .filter((r) => r.google_status === "indexed" || r.google_status === "not_indexed")
    .map((r) => ({
      googleStatus: r.google_status as "indexed" | "not_indexed",
      coverageState: typeof r.coverage_state === "string" && r.coverage_state ? r.coverage_state : NO_COVERAGE_STATE,
      addresses: Number(r.addresses) || 0,
      newestAnswer: typeof r.newest_answer === "string" ? r.newest_answer : null,
    }))
    .filter((g) => g.addresses > 0)
}

/* ── Sitemap conflicts ─────────────────────────────────────────────────── */

export type ConflictKind = "not_200" | "noindex" | "canonical"

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  not_200: "Does not answer 200",
  noindex: "Says noindex",
  canonical: "Canonical is not this address",
}

export interface ConflictRow {
  url: string
  kind: ConflictKind
  found: string
  scoredAt: string | null
}

/** What the live check found, from a row's saved checks (score.ts ids). */
export function conflictOf(row: { url: string; http_status: number | null; checks: { id: string; state: string; found: string }[] | null; score_error?: string | null; scored_at: string | null }): ConflictRow | null {
  const check = (id: string) => row.checks?.find((c) => c.id === id)
  if (row.http_status !== 200) {
    return { url: row.url, kind: "not_200", found: check("http")?.found || row.score_error || (row.http_status ? `HTTP ${row.http_status}` : "No answer"), scoredAt: row.scored_at }
  }
  const indexable = check("indexable")
  if (indexable?.state === "fail") return { url: row.url, kind: "noindex", found: indexable.found, scoredAt: row.scored_at }
  const canonical = check("canonical")
  if (canonical?.state === "fail") return { url: row.url, kind: "canonical", found: canonical.found, scoredAt: row.scored_at }
  return null
}
