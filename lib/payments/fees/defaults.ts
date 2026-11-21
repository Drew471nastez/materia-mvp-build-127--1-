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
 *
 * SCALE IS 1.5% (wave 13, the owner). The $99 plan (id `pro`) had been
 * charged Pro's 3%; it now has its own rate, 1.5% + the fixed fee, and on
 * small orders 7.75% (1.5% plus the 6.25% that carries the fixed fee under
 * the threshold, as for the other plans: $4.00 x 6.25% = $0.25). Free and
 * Pro are unchanged.
 *
 * PHYSICAL SALES HAVE THEIR OWN RATES (v5, the owner). Digital sales are
 * unchanged. A product that ships pays, each plus the fixed fee at the
 * threshold and up ($0.25 at $4.00 in USD):
 *
 *   plan (tier)            digital   physical
 *   Free  (free)           5%        3%
 *   Grow  (paid, growth)   3%        1.5%
 *   Pro   (scale, pro)     1.5%      1.5%
 *
 * Under the threshold (the small-order rate, no fixed part) a physical sale
 * pays the NEXT plan's small-order rate: Free physical pays the paid tier's
 * 9.25% (PAID_MICRO_RATE), Grow physical pays Scale's 7.75%
 * (SCALE_MICRO_RATE), and Pro is unchanged at 7.75%. Each is the physical
 * standard rate plus the 6.25% that carries the fixed fee under the
 * threshold, so the fee still never falls as a price rises past $4.00:
 * Free physical $3.99 and $4.00 both pay 37c, Grow physical both pay 31c.
 * Digital keeps today's small-order rates.
 */
export const CODE_FEE_RULE_VERSION = "2026-11-storelib-v5-physical-rates"

/** Scale's rates, also the fallback for a stored version that has none. */
export const CODE_SCALE_STANDARD_RATE = 0.015
export const CODE_SCALE_MICRO_RATE = 0.0775

/**
 * Physical rates, also the fallback for a stored version that has none.
 * The small-order ones are the next plan's (see above): Free physical is the
 * paid tier's 9.25%, Grow physical is Scale's 7.75%, Pro physical is its own.
 */
export const CODE_FREE_PHYSICAL_STANDARD_RATE = 0.03
export const CODE_FREE_PHYSICAL_MICRO_RATE = 0.0925
export const CODE_PAID_PHYSICAL_STANDARD_RATE = 0.015
export const CODE_PAID_PHYSICAL_MICRO_RATE = CODE_SCALE_MICRO_RATE
export const CODE_SCALE_PHYSICAL_STANDARD_RATE = CODE_SCALE_STANDARD_RATE
export const CODE_SCALE_PHYSICAL_MICRO_RATE = CODE_SCALE_MICRO_RATE

export function codeDefaultFeeConfig(): StorelibFeeConfig {
  return {
    versionKey: CODE_FEE_RULE_VERSION,
    freeStandardRate: 0.05,
    freeMicroRate: 0.1125,
    paidStandardRate: 0.03,
    paidMicroRate: 0.0925,
    scaleStandardRate: CODE_SCALE_STANDARD_RATE,
    scaleMicroRate: CODE_SCALE_MICRO_RATE,
    freePhysicalStandardRate: CODE_FREE_PHYSICAL_STANDARD_RATE,
    freePhysicalMicroRate: CODE_FREE_PHYSICAL_MICRO_RATE,
    paidPhysicalStandardRate: CODE_PAID_PHYSICAL_STANDARD_RATE,
    paidPhysicalMicroRate: CODE_PAID_PHYSICAL_MICRO_RATE,
    scalePhysicalStandardRate: CODE_SCALE_PHYSICAL_STANDARD_RATE,
    scalePhysicalMicroRate: CODE_SCALE_PHYSICAL_MICRO_RATE,
    currencies: Object.values(CURRENCY_FEE_RULES).map((r) => ({
      currency: r.currency,
      microThresholdMinor: r.microThresholdMinor,
      fixedFeeMinor: r.fixedFeeMinor,
      enabled: true,
    })),
  }
}
