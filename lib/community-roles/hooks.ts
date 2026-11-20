import "server-only"

/**
 * THE PAYMENT CODE TELLS DISCORD AND TELEGRAM, AND CAN NEVER BE BROKEN BY
 * THEM. Called from lib/communities/server/payment-hooks.ts beside the
 * communities' own hooks, so every place access changes reaches here: a
 * membership synced from Stripe (created, updated, deleted, past due, paid),
 * a library row written by a checkout or a free claim, taken away by a full
 * refund, or closed and reopened by a dispute.
 *
 * Both return at once: with no Discord or Telegram set up, nothing at all;
 * otherwise the work is handed to after() (./engine later), so a Stripe
 * webhook answers as fast as it did. Nothing here throws.
 */
import { anyProviderEnabled } from "./config"
import { later, realDeps, runDue, settleAccess, type Db, type Deps } from "./engine"

async function settleAndRun(deps: Deps, userId: string, productIds: string[]): Promise<void> {
  const queued = await settleAccess(deps, { userId }, productIds)
  if (queued.discord.length || queued.telegram.length) await runDue(deps, { ids: queued })
}

export function communityRolesAfterEntitlement(db: Db, e: { userId: string | null | undefined; productId: string | null | undefined }, deps?: Deps): Promise<void> {
  if (!e.userId || !e.productId || !anyProviderEnabled(deps?.env)) return Promise.resolve()
  const d = deps ?? realDeps(db)
  const userId = e.userId
  const productId = e.productId
  return later(() => settleAndRun(d, userId, [productId]))
}

/** A membership and the products it includes: their access follows the membership. */
export function communityRolesAfterMembership(db: Db, row: { product_id: string | null; buyer_id: string | null } | null, deps?: Deps): Promise<void> {
  if (!row?.product_id || !row.buyer_id || !anyProviderEnabled(deps?.env)) return Promise.resolve()
  const d = deps ?? realDeps(db)
  const productId = row.product_id
  const userId = row.buyer_id
  return later(async () => {
    let included: string[] = []
    try {
      const { data } = await d.db.from("membership_plans").select("included_product_ids").eq("product_id", productId).maybeSingle()
      included = Array.isArray(data?.included_product_ids) ? data.included_product_ids.filter((x: unknown): x is string => typeof x === "string") : []
    } catch {
      included = []
    }
    await settleAndRun(d, userId, [productId, ...included])
  })
}
