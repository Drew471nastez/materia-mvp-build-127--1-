import "server-only"

/**
 * CANCELLATIONS AND REFUNDS OF A PAID COMMUNITY, FOR ITS ANALYTICS.
 *
 * CONTRACT STAND-IN (round 13). Worker M owns this file (run-now part 101:
 * why members cancelled, refunds through the connected account). This copy
 * holds only the two readers the round's contract fixes, answering null
 * ("not set up here"), which the Analytics screen reads as "use what the
 * memberships and orders say" (lib/communities/server/stats.ts). On merge,
 * M's file is the one to keep.
 */
import type { Db } from "./db"

export interface CancellationsSummary {
  total: number
  counts: { reason: string; count: number }[]
  latest: { reason: string; note: string | null; endsAt: string | null; createdAt: string }[]
}

export interface RefundsSummary {
  count: number
  totalCents: number
  currency: string
  items: { orderId: string; amountCents: number; currency: string; refundedAt: string; full: boolean; reason: string | null }[]
}

export async function cancellationsWithReasons(_db: Db, _communityId: string, _opts: { since?: string; limit?: number } = {}): Promise<CancellationsSummary | null> {
  return null
}

export async function refundsFor(_db: Db, _communityId: string, _opts: { since?: string; limit?: number } = {}): Promise<RefundsSummary | null> {
  return null
}
