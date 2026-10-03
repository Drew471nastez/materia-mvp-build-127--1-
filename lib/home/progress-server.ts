import "server-only"

import { creatorSalesTotals } from "@/lib/analytics/creator-orders"
import { providerPaymentsReady } from "@/lib/payments/readiness"
import {
  SENT_CAMPAIGN_STATUSES,
  WEBSITE_LIVE_STATUS,
  factsFromRows,
  paymentsReadyFrom,
  type ProgressFacts,
  type ProgressRows,
} from "./progress"

/**
 * ===========================================================================
 *  THE READS BEHIND lib/home/progress
 * ===========================================================================
 * Every read is filtered by the signed in creator's own id, found by their
 * own user id, on whichever client the caller hands in (Home and the API
 * route use the service role, as Home always has; the /app layout its own
 * client). A table or column a database does not have yet reads as nothing
 * done, never as an error on the page: the counts are 0 and the step is
 * open. No database error text leaves this file.
 */

/* The query builder, as much of it as these reads use. Typed loosely on
   purpose: the service role and the caller's client are both handed in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

type Result<T> = { data: T | null; error: unknown; count?: number | null }

async function settle<T>(query: PromiseLike<Result<T>>): Promise<Result<T>> {
  try {
    return await query
  } catch (error) {
    return { data: null, error }
  }
}

/** The creator row's columns the rules read. */
export const PROGRESS_CREATOR_COLUMNS = "id, stripe_onboarding_status, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, stripe_requirements, stripe_connected_at, subscription_plan_id"

export type ChallengeCounts = Pick<ProgressFacts, "subscribers" | "emailsSent" | "automationsOn" | "couponUses">

/**
 * The four numbers only the challenges need, in one parallel batch of head
 * counts (and the creator's few coupons). Each one that cannot be read is 0.
 */
export async function readChallengeCounts(db: Db, creatorId: string): Promise<ChallengeCounts> {
  const [subscribers, emails, flows, coupons] = await Promise.all([
    /* Who can be mailed: subscribed (or from before the column had a value), and not switched off. */
    settle<unknown>(
      db.from("subscribers").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).or("status.eq.subscribed,status.is.null").not("is_active", "is", false),
    ),
    settle<unknown>(db.from("email_campaigns").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).in("status", SENT_CAMPAIGN_STATUSES as string[])),
    settle<unknown>(db.from("email_flows").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "active")),
    settle<{ usage_count?: number | null }[]>(db.from("coupons").select("usage_count").eq("creator_id", creatorId)),
  ])
  const count = (r: Result<unknown>) => (r.error ? 0 : Math.max(0, Number(r.count ?? 0) || 0))
  const uses = coupons.error ? 0 : (coupons.data ?? []).reduce((sum, c) => sum + Math.max(0, Number(c?.usage_count ?? 0) || 0), 0)
  return { subscribers: count(subscribers), emailsSent: count(emails), automationsOn: count(flows), couponUses: uses }
}

/**
 * Every fact for one creator, read in one parallel batch. `withSales: false`
 * leaves the orders unread (sales and revenue 0) for a caller that already
 * holds them, which is Home: it keeps them live over realtime.
 */
export async function readProgressFacts(
  db: Db,
  input: { userId: string; userMetadata?: Record<string, unknown> | null; withSales?: boolean },
): Promise<ProgressFacts | null> {
  const creatorRead = await settle<ProgressRows["creator"] & { id: string }>(
    db.from("creators").select(PROGRESS_CREATOR_COLUMNS).eq("user_id", input.userId).maybeSingle(),
  )
  const creator = creatorRead.data
  if (!creator?.id) return null

  const [products, domains, website, sales, counts, providerReady] = await Promise.all([
    settle<{ status?: string | null }[]>(db.from("products").select("status").eq("creator_id", creator.id)),
    /* Every column, so a database from before purposes answers too. */
    settle<ProgressRows["domains"]>(db.from("custom_domains").select("*").eq("creator_id", creator.id)),
    settle<{ id: string } | null>(db.from("store_theme_installs").select("id").eq("creator_id", creator.id).eq("status", WEBSITE_LIVE_STATUS).limit(1).maybeSingle()),
    /* Counted over every order, by the creator (lib/analytics/creator-orders): a read of the rows stopped at 1,000. */
    input.withSales === false ? Promise.resolve(null) : creatorSalesTotals(db as Parameters<typeof creatorSalesTotals>[0], creator.id),
    readChallengeCounts(db, creator.id),
    /* Storelib Payments on Airwallex, for a creator Stripe does not already count as set up (lib/payments/readiness). */
    providerPaymentsReady(creator.id, paymentsReadyFrom(creator)),
  ])

  return factsFromRows({
    creator: { ...creator, provider_payments_ready: providerReady },
    products: products.data ?? [],
    domains: domains.data ?? [],
    websiteLive: !!website.data,
    sales,
    userMetadata: input.userMetadata ?? null,
    counts,
  })
}
