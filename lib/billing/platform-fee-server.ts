import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { calculatePlatformFee, type FeeCalculation, type FeeKindSplit } from "@/lib/billing/fee-calculator"
import { loadActiveFeeConfig } from "@/lib/payments/fees/active"

/**
 * Checkout/membership fee with DB-backed active fee rules when migrated.
 *
 * `split` is REQUIRED so every checkout says what it sells: "digital" (a
 * download, course, membership, community, tip), "physical" (a product that
 * ships) or, for a basket with both, `{ physicalCents }`, the part of the
 * amount that is physical goods and what ships with them. Physical sales
 * have their own card rates (lib/payments/fees/defaults.ts).
 */
export async function calculatePlatformFeeForCheckout(
  amountCents: number,
  creatorId: string,
  admin: SupabaseClient,
  currency: string | undefined,
  split: FeeKindSplit,
): Promise<FeeCalculation> {
  const { config } = await loadActiveFeeConfig(admin)
  return calculatePlatformFee(amountCents, creatorId, admin, currency, config, split)
}
