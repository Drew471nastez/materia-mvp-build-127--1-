import "server-only"

/**
 * ===========================================================================
 *  ADDRESSES THAT MUST NOT BE EMAILED
 * ===========================================================================
 * email_suppressions, one row per address and scope:
 *
 *   all        a hard bounce or an invalid address. Nothing goes, not even
 *              required email: it would bounce again and cost the sending
 *              domain its reputation.
 *   optional   a spam complaint or an unsubscribe. Required service email
 *              (security, payments, receipts) still goes; lifecycle, tips,
 *              marketing and other optional email does not.
 */
import { storeOf, type DbLike, type SuppressionScope } from "./store"
import type { Requirement } from "./types"

export type { SuppressionScope }

export async function suppress(db: DbLike, email: string, scope: SuppressionScope, reason: string, source: string): Promise<void> {
  if (!email || !email.includes("@")) return
  await storeOf(db).suppress(email, scope, reason, source)
}

export function blocks(scopes: readonly SuppressionScope[], requirement: Requirement): boolean {
  if (scopes.includes("all")) return true
  return requirement !== "required_service" && scopes.includes("optional")
}

export async function isSuppressed(db: DbLike, email: string, requirement: Requirement): Promise<boolean> {
  if (!email) return false
  return blocks(await storeOf(db).suppressions(email), requirement)
}
