import "server-only"

/**
 * ===========================================================================
 *  "ARE PAYMENTS SET UP?", FOR EVERY SCREEN THAT ASKS
 * ===========================================================================
 * Home's setup guide, the in-app notices and the reminder emails all asked
 * the creators row's Stripe columns. A creator on Storelib Payments'
 * Airwallex rollout has none of those, and would be told forever to set up
 * payments they had set up. These answer the other half: is there an
 * Airwallex account that checkout would take money for (lib/payments/model
 * checkoutOpen: ACTIVE, with a payout account)?
 *
 * Costs nothing in production while Airwallex is not configured: no query
 * is made at all. When it is, only creators Stripe does not already count
 * as ready are asked about, in one read.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { readAirwallexConfig } from "./airwallex/config"
import { checkoutOpen, readLifecycle } from "./model"

type Row = { creator_id: string; provider_account_id: string | null; lifecycle_status: string | null; payout_beneficiary_id: string | null }

function ready(r: Row | null | undefined): boolean {
  if (!r) return false
  return checkoutOpen({ hasAccount: !!r.provider_account_id, lifecycle: readLifecycle(r.lifecycle_status), formStatus: null, hasPayoutDestination: !!r.payout_beneficiary_id })
}

/** One creator. `stripeReady` true answers at once. */
export async function providerPaymentsReady(creatorId: string, stripeReady: boolean): Promise<boolean> {
  if (stripeReady) return true
  return (await providerPaymentsReadyMap([creatorId])).get(creatorId) === true
}

/** Several creators, in one read. Creators absent from the map are not ready on Airwallex. */
export async function providerPaymentsReadyMap(creatorIds: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  const ids = [...new Set(creatorIds.filter(Boolean))]
  if (ids.length === 0 || !readAirwallexConfig().ok) return out
  try {
    const { data, error } = await createAdminClient()
      .from("payment_accounts")
      .select("creator_id, provider_account_id, lifecycle_status, payout_beneficiary_id")
      .eq("provider", "airwallex")
      .in("creator_id", ids)
    if (error) return out
    for (const r of (data ?? []) as Row[]) out.set(r.creator_id, ready(r))
  } catch {
    /* unanswered is "not ready here", which is what Stripe's columns already said */
  }
  return out
}

/** Has this creator started on Airwallex at all (an account exists)? For "started but not finished" wording. */
export async function providerPaymentsStarted(creatorId: string): Promise<boolean> {
  if (!readAirwallexConfig().ok) return false
  try {
    const { data } = await createAdminClient().from("payment_accounts").select("provider_account_id").eq("provider", "airwallex").eq("creator_id", creatorId).maybeSingle()
    return !!(data as { provider_account_id: string | null } | null)?.provider_account_id
  } catch {
    return false
  }
}
