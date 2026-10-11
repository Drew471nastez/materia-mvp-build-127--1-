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
import { sendCheckoutReminder } from "./abandoned-reminder"
import { loadCheckoutConfig } from "@/lib/store/settings-server"
import { APP_URL } from "@/lib/email-automation"

export async function runAbandonedSweep(batch = 50, batches = 5): Promise<SweepResult> {
  const db = createAdminClient()
  const store = supabaseStore(db)
  const starts = supabaseStarts(db)
  let total: SweepResult | null = null
  /* Settings › Checkout › Abandoned checkouts, read once per store per run. */
  const settings = new Map<string, Promise<boolean>>()
  const recoveryOn = (creatorId: string) => {
    if (!settings.has(creatorId)) settings.set(creatorId, loadCheckoutConfig(db, creatorId).then((c) => c.abandonedRecovery))
    return settings.get(creatorId)!
  }
  const remind = (start: Parameters<typeof sendCheckoutReminder>[1], token: string) => sendCheckoutReminder(db, start, token).catch(() => false)
  for (let i = 0; i < batches; i++) {
    const r = await sweepAbandoned({ store, starts, now: Date.now(), limit: batch, recoveryOn, remind, appUrl: APP_URL })
    if (!total) total = r
    else {
      total.looked += r.looked
      total.entered += r.entered
      total.reminded = (total.reminded ?? 0) + (r.reminded ?? 0)
      for (const k of Object.keys(r.outcomes) as Array<keyof SweepResult["outcomes"]>) total.outcomes[k] += r.outcomes[k]
      total.available = total.available && r.available
    }
    if (!r.available || r.looked < batch) break
  }
  return total!
}
