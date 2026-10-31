import "server-only"

/**
 * ===========================================================================
 *  "PAYOUT AVAILABLE" ON THE SELLER'S DEVICES, AFTER HOLDS ARE RELEASED
 * ===========================================================================
 * The ledger is keyed by creators.id, but a device is registered under the
 * account's user id (push_tokens.user_id). Each creator is turned into its
 * user first, in one read, as lib/orders/sale-events.ts pushPurchase does.
 *
 * The sends are awaited by the cron run, a few at a time and inside a time
 * budget, so a serverless function never returns (and freezes) with pushes
 * still in flight. A push that fails is logged and never fails the run: the
 * money has already moved.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface PayoutPush {
  creatorId: string
  cents: number
}

type Send = (userId: string, cents: number) => Promise<unknown>

const AT_ONCE = 10
export const PAYOUT_PUSH_BUDGET_MS = 30_000

async function defaultSend(userId: string, cents: number): Promise<unknown> {
  const { notifyPayoutAvailable } = await import("@/lib/push/notifications")
  return notifyPayoutAvailable(userId, cents)
}

/** Sends each released creator's push to their user. Answers how many were sent and how many were skipped. */
export async function pushPayoutsAvailable(
  db: Pick<SupabaseClient, "from">,
  pushes: PayoutPush[],
  opts: { send?: Send; budgetMs?: number; now?: () => number } = {},
): Promise<{ sent: number; skipped: number }> {
  const wanted = pushes.filter((p) => p.creatorId && Number(p.cents) > 0)
  if (!wanted.length) return { sent: 0, skipped: 0 }
  const send = opts.send ?? defaultSend
  const now = opts.now ?? Date.now
  const until = now() + (opts.budgetMs ?? PAYOUT_PUSH_BUDGET_MS)

  const ids = [...new Set(wanted.map((p) => p.creatorId))]
  const userOf = new Map<string, string>()
  try {
    const { data, error } = await db.from("creators").select("id, user_id").in("id", ids)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as { id: string; user_id: string | null }[]) if (row.user_id) userOf.set(row.id, row.user_id)
  } catch (e) {
    console.error(`[Release Holds] could not read the sellers' accounts for the payout push: ${e instanceof Error ? e.message : e}`)
    return { sent: 0, skipped: wanted.length }
  }

  let sent = 0
  let skipped = 0
  for (let i = 0; i < wanted.length; i += AT_ONCE) {
    if (now() >= until) {
      skipped += wanted.length - i
      console.warn(`[Release Holds] payout push budget spent; ${wanted.length - i} sellers not pushed this run`)
      break
    }
    const batch = wanted.slice(i, i + AT_ONCE)
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const userId = userOf.get(p.creatorId)
        if (!userId) return false
        await send(userId, Number(p.cents))
        return true
      }),
    )
    for (const [k, r] of results.entries()) {
      if (r.status === "fulfilled" && r.value) sent++
      else {
        skipped++
        if (r.status === "rejected") console.error(`[Release Holds] Push notification failed for ${batch[k].creatorId}:`, r.reason)
      }
    }
  }
  return { sent, skipped }
}
