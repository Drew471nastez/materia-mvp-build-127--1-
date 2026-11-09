/**
 * What a run's ledger row and log line call its outcome. Pure, so the shape
 * has a test (tests/aifix-w5.test.ts).
 *
 *   partial   it changed things and ended with checks still failing
 *   stopped   the creator stopped it (Stop, or the tab closed)
 *
 * Never "succeeded" for either: "done" must not stand in front of a check
 * that failed (lib/website-builder/agent/loop.ts `partial`).
 */
export type LedgerStatus = "succeeded" | "partial" | "stopped" | "failed" | "refused"

export function ledgerStatus(result: { status: string; partial?: boolean; stopped?: string | null }): LedgerStatus {
  if (result.status === "refused") return "refused"
  if (result.status !== "succeeded") return "failed"
  if (result.stopped === "cancelled") return "stopped"
  if (result.partial) return "partial"
  return "succeeded"
}

/** What a database that has not run supabase/sql/RUN_STORELIB_AI_RUN_STATUS.sql takes instead. */
export function legacyStatus(status: string): "succeeded" | "failed" | "refused" {
  if (status === "partial") return "succeeded"
  if (status === "stopped") return "failed"
  return status === "succeeded" || status === "refused" ? status : "failed"
}
