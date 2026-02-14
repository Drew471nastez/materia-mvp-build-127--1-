export const PLATFORM_STATEMENT_DESCRIPTOR = "STORELIB" as const

export function getValidatedPlatformStatementDescriptor(): string {
  const descriptor = PLATFORM_STATEMENT_DESCRIPTOR.trim().toUpperCase()
  if (!descriptor) throw new Error("Platform statement descriptor is empty")
  if (descriptor.length > 11) {
    throw new Error(`Platform statement descriptor exceeds 11 chars: ${descriptor.length}`)
  }
  return descriptor
}
