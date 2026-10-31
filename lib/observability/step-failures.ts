/**
 * ===========================================================================
 *  A CRON WHOSE STEPS FAILED SAYS SO IN ITS STATUS
 * ===========================================================================
 * recordCronRun (lib/observability/report.ts) records a run as failed, and
 * reports it, only when the job answers 400 or above. rollup-daily and
 * storage-cleanup used to answer 200 whatever their steps did, so a rollup
 * that failed every night (after a migration, say) or a cleanup that could
 * not remove anything was never seen. They now list what failed and answer
 * 500 when anything did, with the same body as before plus `failed`, so the
 * run is recorded as not ok and an alert goes out. Nothing else changes: the
 * steps that worked keep their work.
 */

/** The status a cron answers for these failures: 200 when none, 500 when any. */
export function statusForFailures(failures: readonly string[]): 200 | 500 {
  return failures.length > 0 ? 500 : 200
}

/** Words a step answers before its SQL part has run: nothing to alert about. */
const NOT_SET_UP = /has not run|PGRST202/

export interface RollupResultLike {
  date: string
  error?: string
  propertiesError?: string
}

/** What failed in a rollup-daily run: each day's rollups, the performance days, the websites' speed. */
export function rollupFailures(
  results: readonly RollupResultLike[],
  perf: readonly { day: string; error?: string }[],
  sites: { error?: string } | null | undefined,
): string[] {
  const out: string[] = []
  for (const r of results) {
    if (r.error) out.push(`rollup ${r.date}: ${r.error}`)
    if (r.propertiesError) out.push(`property rollup ${r.date}: ${r.propertiesError}`)
  }
  for (const p of perf) if (p.error && !NOT_SET_UP.test(p.error)) out.push(`performance ${p.day}: ${p.error}`)
  if (sites?.error && !NOT_SET_UP.test(sites.error)) out.push(`website speed: ${sites.error}`)
  return out
}

/** What failed in a storage-cleanup run, from each sweep's own `errors` and the purges' messages. */
export function cleanupFailures(parts: Record<string, readonly string[] | string | null | undefined>): string[] {
  const out: string[] = []
  for (const [name, v] of Object.entries(parts)) {
    if (Array.isArray(v)) for (const e of v) out.push(`${name}: ${e}`)
    else if (typeof v === "string" && v) out.push(`${name}: ${v}`)
  }
  return out
}
