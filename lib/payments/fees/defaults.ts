import { CURRENCY_FEE_RULES } from "./currency-rules"
import type { StorelibFeeConfig } from "./types"

/**
 * The code's own fee rules: what checkout uses when no version is active in
 * storelib_fee_rule_versions. Run-now part 80 activates the same rules in the
 * database, so the two agree either way.
 *
 * THE FREE PLAN IS 5%. It was 6%. The small-order rate moves with it, from
 * 12.25% to 11.25%, because it is not a separate price: under the
 * currency's threshold the fixed fee is dropped and the percentage carries
 * it instead, so the small-order rate is the standard rate plus whatever
 * makes the two meet at the threshold (6.25% in USD: $4.00 x 6.25% = the
 * $0.25 fixed fee). Moving only the standard rate would have made the fee
 * FALL as a price rose past the threshold: $3.99 would pay 49c and $4.00
 * would pay 45c. With both moved, $3.99 and $4.00 both pay 45c.
 *
 * Paid plans are unchanged. Stripe's own processing fee is a separate thing
 * and is not set here.
 */
export const CODE_FEE_RULE_VERSION = "2026-10-storelib-v3-free-5pct"

export function codeDefaultFeeConfig(): StorelibFeeConfig {
  return {
    versionKey: CODE_FEE_RULE_VERSION,
    freeStandardRate: 0.05,
    freeMicroRate: 0.1125,
    paidStandardRate: 0.03,
    paidMicroRate: 0.0925,
    currencies: Object.values(CURRENCY_FEE_RULES).map((r) => ({
      currency: r.currency,
      microThresholdMinor: r.microThresholdMinor,
      fixedFeeMinor: r.fixedFeeMinor,
      enabled: true,
    })),
  }
}
