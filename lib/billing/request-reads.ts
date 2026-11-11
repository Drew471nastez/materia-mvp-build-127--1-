import "server-only"

/**
 * ===========================================================================
 *  THE BILLING READS, ASKED ONCE PER REQUEST AND NEVER KEPT PAST IT
 * ===========================================================================
 * The billing overview reads the creator, the stored subscription row and the
 * plan override from the database, and the same rows are wanted again by
 * whatever else draws billing in the same request. Each was its own round
 * trip every time.
 *
 * Shared two ways, both per request:
 *
 *   - React's `cache`, in a server component render. It holds nothing
 *     between requests or between people.
 *   - In a route handler React has no request scope (its `cache` calls
 *     straight through there), so a route runs its work inside
 *     withBillingRequest, which gives that one request its own map. The map
 *     is made when the request starts and dropped when it ends.
 *
 * Outside both, every call reads afresh. Nothing here is a cache across
 * users, and the keys are the creator's id, so even inside one request two
 * stores never share an answer.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { readPlanOverride, type PlanOverride } from "@/lib/billing/plan-override"
import { readSubscriptionRow } from "@/lib/billing/subscription-reader"
import type { DbBilling } from "@/lib/billing/subscription-state"
import { perRequest, withRequestMemo } from "@/lib/billing/request-memo"
import { dataOrThrow } from "@/lib/net/service-error"

/** Run a route handler's work with its own per request billing reads. */
export const withBillingRequest = withRequestMemo

/** The creator's whole row by id, or null when there is none. A read that failed throws (round rel2-auth): it was null, and the Billing tab said "Not signed in". */
export const billingCreatorFor = perRequest("creator", async (creatorId: string): Promise<Record<string, any> | null> => {
  const data = dataOrThrow("billing creator", await createAdminClient().from("creators").select("*").eq("id", creatorId).maybeSingle())
  return (data as Record<string, any> | null) ?? null
})

/** The stored subscriptions row (lib/billing/subscription-reader). */
export const billingSubscriptionRowFor = perRequest("subscription-row", (creatorId: string): Promise<DbBilling["row"]> => readSubscriptionRow(createAdminClient(), creatorId))

/** A plan set from /admin, or null (lib/billing/plan-override). */
export const billingPlanOverrideFor = perRequest("plan-override", (creatorId: string): Promise<PlanOverride | null> => readPlanOverride(createAdminClient(), creatorId))
