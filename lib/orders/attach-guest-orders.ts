import "server-only"

/**
 * ===========================================================================
 *  A GUEST'S ORDERS JOIN THE ACCOUNT, ONCE THE ADDRESS IS PROVEN
 * ===========================================================================
 * Somebody buys without an account, then makes one (or signs in) with the
 * same email. Before this the order stayed a guest order until they found
 * "Add to library" on the receipt, so the library they had just been sent to
 * was empty, and a sign up through Google from the receipt lost the claim
 * altogether.
 *
 * Now /auth/continue, the end of every way in, attaches them: every order
 * with no account whose buyer address is exactly the account's address.
 *
 * ONLY A PROVEN ADDRESS. /auth/continue calls this after it has checked that
 * the account's email is verified (the code we mailed, or Google and Apple,
 * which verify it themselves). Typing an address proves nothing: an account
 * made with somebody else's email and never confirmed attaches nothing, at
 * sign in or at checkout (verifiedAccountForEmail below, which the checkout's
 * fulfilment uses for the same reason).
 *
 * EXACTLY THAT ADDRESS. An equality read on the lower case address, which
 * is how every checkout writes it and what idx_orders_buyer_email answers
 * (a pattern match would read the whole table on every sign in, and treats
 * "_", common in addresses, as "any character"); every row is compared again
 * here, trimmed and lower case. An order from before checkouts lowered the
 * address still joins through Add to library on its receipt.
 *
 * ONCE, AND NEVER FROM ANOTHER ACCOUNT. The update is filtered on an empty
 * buyer, so two sign ins at once attach each order to one account. The
 * entitlement written carries the order's variant, and only a paid line gets
 * one; a refunded order is attached for the record and grants nothing
 * (lib/receipts/rules canDeliver), the same as /api/purchases/claim.
 */
import { canDeliver } from "@/lib/receipts/rules"
import { authUserById, currentEmailIsVerified, normalisedEmail } from "@/lib/auth/verified-email"

/*
  THE PROVEN ADDRESS MUST BE THE CURRENT ONE (lib/auth/verified-email.ts).
  `email_verified` on the profile says an address was proven once; an
  account could then change its sign in email to somebody else's and collect
  their guest orders. Both functions below read the auth user from Supabase
  Auth itself and join orders only when its current address is the proven
  one. A client that cannot read auth users (a test's plain table fake) joins
  nothing, which is the safe side.
*/
type Db = { from: (table: string) => any; auth?: { admin?: any } }

async function provenAccount(admin: Db, userId: string, email: string): Promise<boolean> {
  if (!admin.auth?.admin?.getUserById) return false
  const authUser = await authUserById(admin as never, userId)
  if (!authUser) return false
  if (normalisedEmail(authUser.email) !== email) return false
  return currentEmailIsVerified(admin, authUser)
}

/** How many guest orders one sign in attaches: far above anyone's real history, a bound on one request's work. */
export const ATTACH_LIMIT = 200

export function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const e = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** The account whose CONFIRMED address this is, or null. An unconfirmed account is nobody's yet. */
export async function verifiedAccountForEmail(admin: Db, email: unknown): Promise<string | null> {
  const e = normaliseEmail(email)
  if (!e) return null
  try {
    const { data, error } = await admin.from("profiles").select("id, email, email_verified").eq("email", e).maybeSingle()
    if (error || !data?.id) return null
    if (data.email_verified !== true) return null
    return (await provenAccount(admin, String(data.id), e)) ? String(data.id) : null
  } catch {
    return null
  }
}

/** The entitlement for one paid line, carrying its variant, and the community it opens. Never throws. */
export async function grantLine(admin: Db, userId: string, line: any): Promise<void> {
  try {
    const product: any = Array.isArray(line.product) ? line.product[0] : line.product
    let creatorId: string | null = product?.creator_id ?? null
    if (!creatorId && line.product_id) {
      const { data } = await admin.from("products").select("creator_id").eq("id", line.product_id).maybeSingle()
      creatorId = data?.creator_id ?? null
    }
    if (!creatorId) return
    let q = admin.from("entitlements").select("id").eq("buyer_id", userId).eq("product_id", line.product_id)
    q = line.variant_id ? q.eq("variant_id", line.variant_id) : q.is("variant_id", null)
    const { data: existing, error: readError } = await q.maybeSingle()
    if (!existing) {
      const row = { buyer_id: userId, creator_id: creatorId, product_id: line.product_id, variant_id: line.variant_id ?? null, community_access: false }
      const { error: insertError } = await admin.from("entitlements").insert(row)
      /* A database from before entitlements had variant_id: the order row, which the download route reads first, still carries the variant. */
      if (insertError && readError) {
        const { variant_id: _drop, ...legacy } = row
        await admin.from("entitlements").insert(legacy)
      }
    }
    try {
      const { communityAccessAfterEntitlement } = await import("@/lib/communities/server/payment-hooks")
      await communityAccessAfterEntitlement(admin as never, { userId, productId: line.product_id, orderId: line.id, granted: true })
    } catch {
      /* A product that opens no community, or communities switched off. */
    }
  } catch (e) {
    console.error("[attach-guest-orders] grant failed:", e instanceof Error ? e.message : e)
  }
}

/** Attach one guest order to this account, if it still has none. True when this call attached it. */
export async function attachLine(admin: Db, userId: string, line: any): Promise<boolean> {
  const { data: won, error } = await admin.from("orders").update({ buyer_id: userId }).eq("id", line.id).is("buyer_id", null).select("id")
  if (error || !won || won.length === 0) return false
  if (canDeliver(line)) await grantLine(admin, userId, line)
  return true
}

/**
 * Every guest order paid with this account's confirmed address, attached.
 * The caller has already established that `user.email` is verified; the
 * address is the account's own, never one typed into a form. Never throws.
 */
export async function attachGuestOrdersByEmail(admin: Db, user: { id: string; email?: string | null }): Promise<{ attached: string[] }> {
  const email = normaliseEmail(user.email)
  if (!email || !user.id) return { attached: [] }
  try {
    if (!(await provenAccount(admin, user.id, email))) return { attached: [] }
    const { data, error } = await admin
      .from("orders")
      .select("*, product:products(creator_id)")
      .eq("buyer_email", email)
      .is("buyer_id", null)
      .limit(ATTACH_LIMIT)
    if (error || !Array.isArray(data)) return { attached: [] }
    const attached: string[] = []
    for (const line of data) {
      if (normaliseEmail(line.buyer_email) !== email || line.buyer_id) continue
      if (await attachLine(admin, user.id, line)) attached.push(String(line.id))
    }
    return { attached }
  } catch (e) {
    console.error("[attach-guest-orders] failed:", e instanceof Error ? e.message : e)
    return { attached: [] }
  }
}
