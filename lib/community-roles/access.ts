import "server-only"

/**
 * WHO MAY BE IN THE DISCORD ROLE OR THE TELEGRAM CHAT, NOW.
 *
 * The same answer the library and communities give (lib/communities/server/
 * membership.ts ownership): a library row for the product (an entitlement:
 * a purchase, a free claim, or a product a membership includes while it
 * grants access), or a membership of the product that grants access now
 * (lib/memberships/state grantsAccess: active, trialing, cancelled with the
 * paid period still running, past due within its seven day grace).
 *
 * So access follows the exact signals those already follow: a refund in full
 * or a lost dispute removes the library row (lib/stripe/refund-sync), a
 * membership that ends (customer.subscription.deleted, unpaid after Stripe's
 * retries, cancelled at period end once the period is over) stops granting,
 * and past due stops after its grace.
 *
 * A read that fails THROWS: never "no access" on a guess, which would take a
 * paying member's role away. The caller retries later.
 */
import { grantsAccess } from "@/lib/memberships/state"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const missing = (e: { code?: string; message?: string } | null | undefined) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""))

export async function hasAccess(db: Db, who: { userId: string; email?: string | null }, productId: string, now: number = Date.now()): Promise<boolean> {
  const ents = await db.from("entitlements").select("product_id").eq("buyer_id", who.userId).eq("product_id", productId).limit(1)
  if (ents.error && !missing(ents.error)) throw new Error(`entitlements read: ${ents.error.code ?? ""} ${ents.error.message ?? ""}`)
  if (Array.isArray(ents.data) && ents.data.length > 0) return true
  const subs = await db.from("memberships").select("id, buyer_id, buyer_email, status, current_period_end, past_due_since").eq("product_id", productId).eq("buyer_id", who.userId).limit(20)
  if (subs.error && !missing(subs.error)) throw new Error(`memberships read: ${subs.error.code ?? ""} ${subs.error.message ?? ""}`)
  if (((subs.data as AccessRow[] | null) ?? []).some((m) => grantsAccess(m, now))) return true
  /* A guest's membership, paid with this confirmed address before the account existed and not claimed yet. */
  if (who.email) {
    const byEmail = await db.from("memberships").select("id, buyer_id, buyer_email, status, current_period_end, past_due_since").eq("product_id", productId).eq("buyer_email", who.email.trim().toLowerCase()).is("buyer_id", null).limit(20)
    if (byEmail.error && !missing(byEmail.error)) throw new Error(`memberships read: ${byEmail.error.code ?? ""} ${byEmail.error.message ?? ""}`)
    if (((byEmail.data as AccessRow[] | null) ?? []).some((m) => grantsAccess(m, now))) return true
  }
  return false
}

interface AccessRow {
  status: string
  current_period_end: string | null
  past_due_since: string | null
}
