import { statementDescriptorSuffix } from "./platform-descriptor"

/** Pure: which name a statement uses. */
export function pickStatementName(v: { custom?: string | null; storeName?: string | null; displayName?: string | null; slug?: string | null }): string {
  const n = (x: string | null | undefined) => statementDescriptorSuffix(x)
  const custom = n(v.custom)
  const store = n(v.storeName)
  const auto = new Set([n(v.displayName), n(v.slug)].filter(Boolean))
  if (custom && /[A-Z]/.test(custom) && !(store && auto.has(custom))) return custom
  return store || custom || n(v.displayName) || n(v.slug)
}

/** True when the statement follows the store's name (nothing of the seller's own typed). */
export function followsStoreName(v: { custom?: string | null; storeName?: string | null; displayName?: string | null; slug?: string | null }): boolean {
  const custom = statementDescriptorSuffix(v.custom)
  if (!custom) return true
  return [v.displayName, v.slug, v.storeName].some((x) => statementDescriptorSuffix(x) === custom)
}
