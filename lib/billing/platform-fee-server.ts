import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { calculatePlatformFee, type FeeCalculation } from "@/lib/billing/fee-calculator"
import { loadActiveFeeConfig } from "@/lib/payments/fees/active"

/** Checkout/membership fee with DB-backed active fee rules when migrated. */
export async function calculatePlatformFeeForCheckout(
  amountCents: number,
  creatorId: string,
  admin: SupabaseClient,
  currency?: string,
): Promise<FeeCalculation> {
  const { config } = await loadActiveFeeConfig(admin)
  return calculatePlatformFee(amountCents, creatorId, admin, currency, config)
}
