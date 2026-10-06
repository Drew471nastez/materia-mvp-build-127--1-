export const PLATFORM_STATEMENT_DESCRIPTOR = "STORELIB" as const

export function getValidatedPlatformStatementDescriptor(): string {
  const descriptor = PLATFORM_STATEMENT_DESCRIPTOR.trim().toUpperCase()
  if (!descriptor) throw new Error("Platform statement descriptor is empty")
  if (descriptor.length > 11) {
    throw new Error(`Platform statement descriptor exceeds 11 chars: ${descriptor.length}`)
  }
  return descriptor
}

/** Room left for the seller after "STORELIB* " so the whole line stays within 22. */
export const STATEMENT_SUFFIX_MAX = 22 - PLATFORM_STATEMENT_DESCRIPTOR.length - 2

/** The seller's part of the bank line. Empty when there is nothing usable. */
export function statementDescriptorSuffix(raw: string | null | undefined): string {
  return (raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, STATEMENT_SUFFIX_MAX)
}

/** What a bank app shows: STORELIB* NAME */
export function bankStatementLine(raw: string | null | undefined): string {
  const suffix = statementDescriptorSuffix(raw)
  return suffix ? `${PLATFORM_STATEMENT_DESCRIPTOR}* ${suffix}` : PLATFORM_STATEMENT_DESCRIPTOR
}
