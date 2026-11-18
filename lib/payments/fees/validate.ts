import type { StorelibFeeConfig } from "./types"

export type FeeValidationIssue = { field: string; message: string }

const MAX_RATE = 0.99

export function validateFeeConfig(config: StorelibFeeConfig): FeeValidationIssue[] {
  const issues: FeeValidationIssue[] = []
  const rates: Array<[string, number]> = [
    ["freeStandardRate", config.freeStandardRate],
    ["freeMicroRate", config.freeMicroRate],
    ["paidStandardRate", config.paidStandardRate],
    ["paidMicroRate", config.paidMicroRate],
    ...(config.scaleStandardRate != null ? [["scaleStandardRate", config.scaleStandardRate] as [string, number]] : []),
    ...(config.scaleMicroRate != null ? [["scaleMicroRate", config.scaleMicroRate] as [string, number]] : []),
  ]
  for (const [field, rate] of rates) {
    if (!Number.isFinite(rate) || rate < 0) issues.push({ field, message: "Rate cannot be negative." })
    else if (rate >= 1) issues.push({ field, message: "Rate cannot be 100% or more." })
    else if (rate > MAX_RATE) issues.push({ field, message: "Rate is unusually high." })
  }
  if (!config.versionKey?.trim()) issues.push({ field: "versionKey", message: "Version key is required." })
  if (!config.currencies?.length) issues.push({ field: "currencies", message: "At least one currency rule is required." })
  const seen = new Set<string>()
  for (const c of config.currencies ?? []) {
    const cur = c.currency?.trim().toUpperCase()
    if (!cur) {
      issues.push({ field: "currency", message: "Currency code is required." })
      continue
    }
    if (seen.has(cur)) issues.push({ field: cur, message: "Duplicate currency." })
    seen.add(cur)
    if (!Number.isInteger(c.microThresholdMinor) || c.microThresholdMinor < 1) {
      issues.push({ field: cur, message: "Micro threshold must be a positive integer (minor units)." })
    }
    if (!Number.isInteger(c.fixedFeeMinor) || c.fixedFeeMinor < 0) {
      issues.push({ field: cur, message: "Fixed fee cannot be negative." })
    }
  }
  return issues
}

export function feeConfigWarnings(config: StorelibFeeConfig): string[] {
  const warnings: string[] = []
  if (config.freeStandardRate > 0.15 || config.paidStandardRate > 0.1) {
    warnings.push("Standard percentage rates are higher than typical Storelib pricing.")
  }
  for (const c of config.currencies) {
    if (c.fixedFeeMinor > c.microThresholdMinor / 4) {
      warnings.push(`${c.currency}: fixed fee is large relative to the micro threshold.`)
    }
  }
  return warnings
}
