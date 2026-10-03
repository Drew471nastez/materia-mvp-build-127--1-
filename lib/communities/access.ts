/**
 * ===========================================================================
 *  WHO MAY SEE A SPACE, A COURSE OR AN EVENT
 * ===========================================================================
 * A space, an attached course and an event each carry an access rule (a
 * jsonb column). The rule is decided here, and the same rule is encoded in
 * public.community_can_read_space for the realtime chat stream
 * (supabase/sql/run-now/81_communities.sql), so the two agree.
 *
 *   - Not an active member: never.
 *   - Owner, admin, moderator: always.
 *   - An empty rule: every active member.
 *   - tierIds, productIds and roles are alternatives: being on one of the
 *     tiers, OR owning one of the products, OR holding one of the roles.
 *   - minLevel is on top of that: the member must also have reached it.
 *
 * Pure and browser safe.
 */
import { ROLES, isOneOf, type AccessRuleJson, type Role } from "./types"

export type AccessRule = { tierIds?: string[]; productIds?: string[]; minLevel?: number; roles?: Role[] }

export type AccessDenial = "not_member" | "tier" | "level" | "role" | "product"

export type AccessResult = { ok: true } | { ok: false; reason: AccessDenial; need?: string }

export interface AccessViewer {
  role: Role | null
  active: boolean
  tierId: string | null
  ownedProductIds: readonly string[]
  level: number
}

const STAFF: readonly Role[] = ["owner", "admin", "moderator"]

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 64))]
}

/** A rule as stored (any jsonb) made safe to evaluate: unknown keys and bad values are dropped. */
export function parseAccessRule(value: unknown): AccessRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const rule: AccessRule = {}
  const tierIds = strings(raw.tierIds)
  const productIds = strings(raw.productIds)
  const roles = strings(raw.roles).filter((r): r is Role => isOneOf(ROLES, r))
  if (tierIds.length) rule.tierIds = tierIds
  if (productIds.length) rule.productIds = productIds
  if (roles.length) rule.roles = roles
  if (typeof raw.minLevel === "number" && Number.isFinite(raw.minLevel) && raw.minLevel > 1) rule.minLevel = Math.min(20, Math.floor(raw.minLevel))
  return rule
}

/** Whether a rule lets every active member in. */
export function isOpenRule(rule: AccessRule | AccessRuleJson | null | undefined): boolean {
  const r = parseAccessRule(rule)
  return !r.tierIds && !r.productIds && !r.roles && !r.minLevel
}

/** Whether this viewer passes this rule, and if not, what they lack. */
export function evaluateAccess(rule: AccessRule | AccessRuleJson | null | undefined, v: AccessViewer): AccessResult {
  if (!v.active || !v.role) return { ok: false, reason: "not_member" }
  if (STAFF.includes(v.role)) return { ok: true }
  const r = parseAccessRule(rule)
  const tierIds = r.tierIds ?? []
  const productIds = r.productIds ?? []
  const roles = r.roles ?? []
  if (tierIds.length || productIds.length || roles.length) {
    const viaTier = v.tierId !== null && tierIds.includes(v.tierId)
    const viaProduct = productIds.some((id) => v.ownedProductIds.includes(id))
    const viaRole = roles.includes(v.role)
    if (!viaTier && !viaProduct && !viaRole) {
      if (tierIds.length) return { ok: false, reason: "tier", need: tierIds[0] }
      if (productIds.length) return { ok: false, reason: "product", need: productIds[0] }
      return { ok: false, reason: "role", need: roles[0] }
    }
  }
  if (r.minLevel && (v.level || 1) < r.minLevel) return { ok: false, reason: "level", need: String(r.minLevel) }
  return { ok: true }
}
