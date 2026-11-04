import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

import { CONFLICT_LABEL, conflictOf, coverageFromRpc, groupCoverage, type ConflictKind, type ConflictRow, type CoverageGroup } from "./coverage"
import { missingSchema } from "./store"

/**
 * The console's two views over rows it already keeps (part 342):
 *
 *   SITEMAP CONFLICTS  listed addresses whose live page, as the cron last
 *                      fetched it (run.ts scoreBatch: ten at a time, five
 *                      at once, ten seconds each), does not answer 200,
 *                      says noindex, or has a canonical that is not itself.
 *                      A count of each and the newest few.
 *   INDEXING ISSUES    Google's own answers grouped by coverage state
 *                      (coverage.ts), from seo_coverage_groups when part
 *                      346 has run, else from the newest 5,000 answers.
 */

type Admin = ReturnType<typeof createAdminClient>

export interface ConflictGroup {
  kind: ConflictKind
  label: string
  count: number
  sample: ConflictRow[]
}

const SAMPLE = 12

/*
  JSON text, not an array: postgrest-js writes an array given to contains()
  as a Postgres array literal ({[object Object]}), which a jsonb column
  refuses (tests/communities-video13 found it first).
*/
const FAILED_INDEXABLE = JSON.stringify([{ id: "indexable", state: "fail" }])
const FAILED_CANONICAL = JSON.stringify([{ id: "canonical", state: "fail" }])

export async function sitemapConflicts(admin: Admin): Promise<ConflictGroup[]> {
  const base = () => admin.from("seo_index_status").select("url, http_status, checks, score_error, scored_at", { count: "exact" }).eq("in_sitemap", true).not("scored_at", "is", null)
  const reads: Record<ConflictKind, ReturnType<typeof base>> = {
    not_200: base().or("http_status.is.null,http_status.neq.200"),
    noindex: base().eq("http_status", 200).contains("checks", FAILED_INDEXABLE),
    canonical: base().eq("http_status", 200).contains("checks", FAILED_CANONICAL).not("checks", "cs", FAILED_INDEXABLE),
  }
  const kinds = Object.keys(reads) as ConflictKind[]
  const answers = await Promise.all(kinds.map((k) => reads[k].order("scored_at", { ascending: false }).limit(SAMPLE)))
  return kinds.map((kind, i) => {
    const { data, error, count } = answers[i]
    if (error) throw error
    const sample = ((data ?? []) as Parameters<typeof conflictOf>[0][]).map(conflictOf).filter((c): c is ConflictRow => !!c && c.kind === kind)
    return { kind, label: CONFLICT_LABEL[kind], count: count ?? sample.length, sample }
  })
}

export interface CoverageView {
  groups: CoverageGroup[]
  /** "database": every answer, counted by seo_coverage_groups. "sample": the newest 5,000 answers, before part 346. */
  basis: "database" | "sample"
}

export async function coverageGroups(admin: Admin): Promise<CoverageView> {
  const { data, error } = await admin.rpc("seo_coverage_groups")
  if (!error) return { groups: coverageFromRpc(data), basis: "database" }
  if (!missingSchema(error)) throw error
  const rows = await admin
    .from("seo_index_status")
    .select("google_status, coverage_state, inspected_at")
    .eq("in_sitemap", true)
    .in("google_status", ["indexed", "not_indexed"])
    .not("inspected_at", "is", null)
    .order("inspected_at", { ascending: false })
    .limit(5000)
  if (rows.error) throw rows.error
  return { groups: groupCoverage((rows.data ?? []) as { google_status: string | null; coverage_state: string | null; inspected_at: string | null }[]), basis: "sample" }
}

/** When Google last answered for any address, and when Storelib's own check last scored one. */
export async function newestReads(admin: Admin): Promise<{ google: string | null; scored: string | null }> {
  const newest = async (column: "inspected_at" | "scored_at") => {
    let q = admin.from("seo_index_status").select(column).not(column, "is", null)
    /* A failed inspection has a time too, but it is not an answer from Google. */
    if (column === "inspected_at") q = q.in("google_status", ["indexed", "not_indexed", "unknown"])
    const { data, error } = await q.order(column, { ascending: false }).limit(1)
    if (error) throw error
    return ((data ?? []) as Record<string, string>[])[0]?.[column] ?? null
  }
  const [google, scored] = await Promise.all([newest("inspected_at"), newest("scored_at")])
  return { google, scored }
}
