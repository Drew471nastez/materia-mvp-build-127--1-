import { CURRENCY_FEE_RULES } from "./currency-rules"
import type { StorelibFeeConfig } from "./types"

/** Code fallback — matches production until an admin activates a DB version. */
export const CODE_FEE_RULE_VERSION = "2026-03-storelib-v2-per-currency"

export function codeDefaultFeeConfig(): StorelibFeeConfig {
  return {
    versionKey: CODE_FEE_RULE_VERSION,
    freeStandardRate: 0.06,
    freeMicroRate: 0.1225,
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
