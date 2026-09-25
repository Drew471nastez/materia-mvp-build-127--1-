import "server-only"

/**
 * The checkout reminder sweep (lib/automations/abandoned.ts) on the real
 * database, for the hourly cron. It runs before the engine's own work in
 * the same cron, so a reminder entered here is sent in the same run.
 *
 * A few batches at most: a busy hour is worked through in the same run,
 * and whatever is left is still in the window for the next one.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { sweepAbandoned, type SweepResult } from "./abandoned"
import { supabaseStarts, supabaseStore } from "./supabase-store"

export async function runAbandonedSweep(batch = 50, batches = 5): Promise<SweepResult> {
  const db = createAdminClient()
  const store = supabaseStore(db)
  const starts = supabaseStarts(db)
  let total: SweepResult | null = null
  for (let i = 0; i < batches; i++) {
    const r = await sweepAbandoned({ store, starts, now: Date.now(), limit: batch })
    if (!total) total = r
    else {
      total.looked += r.looked
      total.entered += r.entered
      for (const k of Object.keys(r.outcomes) as Array<keyof SweepResult["outcomes"]>) total.outcomes[k] += r.outcomes[k]
      total.available = total.available && r.available
    }
    if (!r.available || r.looked < batch) break
  }
  return total!
}
