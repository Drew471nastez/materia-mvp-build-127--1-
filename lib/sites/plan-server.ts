import "server-only"

/**
 * Which plan a creator is on, for Sites.
 *
 * Split from `lib/sites/plan.ts` so that file stays pure and importable from a
 * client component — the limits table is needed in the dashboard to render
 * "Upgrade to build more" without a round trip, and it must not drag a
 * database client into the browser bundle to get there.
 *
 * The tier itself is NOT re-derived here. `resolveSellerPlan` in
 * lib/billing/fee-calculator is already the single source of truth for what
 * plan a seller is on — it is what decides their fee percentage — and a second
 * reading of the same column would eventually disagree with the one that takes
 * money.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { dataOrThrow } from "@/lib/net/service-error"
import type { SitePlan } from "./plan"

/**
 * Mirrors `resolveSellerPlan`'s normalisation. Kept to the same three names on
 * purpose: a fourth would silently fall through to Free and quietly refuse a
 * paying customer.
 */
function normalise(planId: string | null | undefined): SitePlan {
  if (!planId) return "free"
  const value = planId.toLowerCase().trim()
  if (value === "growth") return "growth"
  if (value === "pro" || value === "professional") return "pro"
  return "free"
}

/**
 * The plan behind a site, read from the creator that owns it.
 *
 * Used on the PUBLIC route to decide whether the Storelib badge renders, so it
 * runs for anonymous visitors and therefore needs the admin client — the
 * creator row is not readable by a stranger, and it should not become so.
 *
 * Round rel2-auth: A READ THAT FAILED IS NOT FREE. This used to answer Free
 * for anything unreadable, and every caller is a gate: a custom domain, the
 * site count, a Pro theme, a community's room. A paying store was refused as
 * if it had stopped paying whenever the database had a slow moment, and a
 * community it had just made was taken back. Now a failed read throws a
 * ServiceUnavailable (lib/net/service-error) and the routes answer 503 Try
 * again. Only a creator with no row, or no plan, is Free.
 */
export async function creatorSitePlan(creatorId: string): Promise<SitePlan> {
  if (!creatorId) return "free"
  const admin = createAdminClient()
  const read = await Promise.resolve(admin.from("creators").select("subscription_plan_id, subscription_status").eq("id", creatorId).maybeSingle()).catch((e: unknown) => ({
    data: null,
    error: { message: e instanceof Error ? `${e.name}: ${e.message}` : String(e) },
  }))
  const data = dataOrThrow("site plan", read as { data: unknown; error: unknown; status?: number })

  const row = data as { subscription_plan_id?: string | null; subscription_status?: string | null } | null
  if (!row) return "free"

  /**
   * THE COLUMN IS `subscription_plan_id`, not `plan_id`.
   *
   * The first version of this read `plan_id`, which does not exist —
   * PostgREST answers with an error, the row comes back null, and every
   * creator on the platform silently resolves to Free. Nothing would have
   * thrown; every paid site would just have grown a Storelib badge.
   *
   * AND THE STATUS MATTERS. A cancelled or past-due subscription leaves the
   * plan id in place — the Stripe webhook writes the status separately — so
   * reading the plan alone hands Pro to somebody whose card stopped working
   * three months ago. `active` and `trialing` are the two that entitle.
   */
  const status = (row.subscription_status || "active").toLowerCase()
  if (status !== "active" && status !== "trialing") return "free"

  return normalise(row.subscription_plan_id)
}

