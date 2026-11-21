import { codeDefaultFeeConfig } from "./defaults"
import { calculateStorelibFeeWithConfig } from "./engine"
import type { StorelibFeeConfig, StorelibFeeInput, StorelibFeeResult } from "./types"

export { UnsupportedFeeCurrencyError } from "./engine"
export type { StorelibFeeInput, StorelibFeeResult, StorelibProductKind } from "./types"
export { percentageRateFor } from "./engine"

/** Production fee calculation. Pass `config` when loaded from DB (checkout/admin). */
export function calculateStorelibFee(input: StorelibFeeInput, config?: StorelibFeeConfig): StorelibFeeResult {
  return calculateStorelibFeeWithConfig(input, config ?? codeDefaultFeeConfig())
}
