import "server-only"

/**
 * The checkout reminder sweep (lib/automations/abandoned.ts) on the real
 * database, for the hourly cron. It runs before the engine's own work in
 * the same cron, so a reminder entered here is sent in the same run.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { sweepAbandoned, type SweepResult } from "./abandoned"
import { supabaseStarts, supabaseStore } from "./supabase-store"

export async function runAbandonedSweep(limit = 50): Promise<SweepResult> {
  const db = createAdminClient()
  return sweepAbandoned({ store: supabaseStore(db), starts: supabaseStarts(db), now: Date.now(), limit })
}
