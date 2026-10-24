import "server-only"

/**
 * The ten minute sweep's part in follow-ups (./followups.ts): orders whose
 * steps began and never finished, read again through their own checkout,
 * which finds the order written and finishes only what is missing. Light: a
 * few orders a run, inside a time budget, and nothing at all before run-now
 * part 300 (the read fails and answers none).
 */

import { countSweepAttempt, unfinishedFollowups } from "./followups"

type Db = Parameters<typeof unfinishedFollowups>[0]

export async function runFollowupSweep(db: Db, opts: { baseUrl: string; budgetMs?: number; limit?: number }): Promise<{ resumed: number; failed: number }> {
  const started = Date.now()
  const budget = opts.budgetMs ?? 15_000
  const out = { resumed: 0, failed: 0 }
  const due = await unfinishedFollowups(db, opts.limit ?? 8)
  for (const d of due) {
    if (Date.now() - started > budget) break
    await countSweepAttempt(db, d.orderId)
    try {
      let ok = true
      if (d.kind === "payment") {
        const { fulfilPaymentIntent } = await import("./fulfil-payment")
        ok = (await fulfilPaymentIntent(db as never, d.ref, { baseUrl: opts.baseUrl })).ok
      } else if (d.kind === "cart_session") {
        const { fulfilCartSession } = await import("./fulfil-cart-session")
        ok = (await fulfilCartSession(db as never, d.ref, { baseUrl: opts.baseUrl })).ok
      } else if (d.kind === "cart_payment") {
        const { fulfilCartPayment } = await import("./fulfil-cart-session")
        ok = (await fulfilCartPayment(db as never, d.ref, { baseUrl: opts.baseUrl })).ok
      } else if (d.kind === "physical") {
        const { resumePhysicalCheckout } = await import("@/lib/physical/checkout-server")
        ok = (await resumePhysicalCheckout(db as never, d.ref, d.orderId, opts.baseUrl))?.ok ?? false
      }
      if (ok) out.resumed++
      else out.failed++
    } catch (e) {
      out.failed++
      console.error("[followups] sweep could not resume order", d.orderId, e instanceof Error ? e.message : e)
    }
  }
  return out
}
