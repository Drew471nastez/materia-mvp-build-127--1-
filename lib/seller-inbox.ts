/**
 * ===========================================================================
 *  WHERE A MESSAGE FOR A SELLER GOES
 * ===========================================================================
 * A buyer's Contact seller on the receipt (app/api/receipt/contact) and a
 * visitor's message from a creator's website form (lib/site-contact) are
 * written to a person, and must reach that person's inbox today, not an
 * address they had once. In order:
 *
 *   1. the support address the seller set (creators.support_email): the
 *      address they chose to be written to
 *   2. the login's address as it is now (auth.users, read with the service
 *      role). For a second business (lib/businesses/email-alias) that is the
 *      address of the login that owns it (public.business_links owner_id),
 *      so a message reaches the owner even after they changed their email,
 *      when the business's own tagged address still names the old one
 *   3. profiles.email, the same address as the app last saw it, when the
 *      login cannot be read
 *
 * Every address goes through ownerAddress, so a "+slb-" tag never leaves in a
 * To, and a business with no owner address is nobody rather than an address
 * with no inbox. When nothing is found the answer is null, and the caller
 * says so: a message is never quietly sent to Storelib's own support inbox
 * instead of the seller's.
 *
 * Pure apart from what it is handed: tests/contact-seller.test.ts runs it on
 * the fake database with a fake login reader.
 */
import { ownerAddress } from "@/lib/businesses/email-alias"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The login's current address, or null. The real one reads auth.users with the service role. */
export type LoginEmail = (userId: string) => Promise<string | null>

export interface SellerInbox {
  to: string
  /** Which of the three it was, for the route's own record. Never the address itself in a log. */
  via: "support" | "login" | "profile"
}

const EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/

/** A deliverable address as the mailer takes it: trimmed, lower case, untagged. */
export function inboxAddress(value: unknown): string | null {
  if (typeof value !== "string") return null
  const own = ownerAddress(value.trim())
  if (!own) return null
  const v = own.toLowerCase()
  return v.length <= 254 && EMAIL.test(v) ? v : null
}

/** The admin client's reader of auth.users, as a LoginEmail. Anything it cannot read is null. */
export function loginEmailFrom(admin: unknown): LoginEmail {
  return async (userId) => {
    try {
      const auth = (admin as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string | null } | null } | null }> } } })?.auth?.admin
      if (!auth?.getUserById) return null
      const { data } = await auth.getUserById(userId)
      return data?.user?.email ?? null
    } catch {
      return null
    }
  }
}

async function one<T>(query: PromiseLike<{ data: T | null; error?: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await query
    return error ? null : data
  } catch {
    return null
  }
}

export async function sellerInbox(db: Db, creatorId: string, loginEmail: LoginEmail): Promise<SellerInbox | null> {
  if (!creatorId) return null
  const creator = await one<{ support_email?: string | null; user_id?: string | null }>(
    db.from("creators").select("support_email, user_id").eq("id", creatorId).maybeSingle(),
  )
  if (!creator) return null
  const support = inboxAddress(creator.support_email)
  if (support) return { to: support, via: "support" }

  const userId = creator.user_id
  if (!userId) return null
  /* A second business answers to the login that owns it. Before the businesses SQL there is no table: every account is its own owner. */
  const link = await one<{ owner_id?: string | null }>(db.from("business_links").select("owner_id").eq("member_id", userId).maybeSingle())
  const people = link?.owner_id && link.owner_id !== userId ? [link.owner_id, userId] : [userId]

  for (const id of people) {
    const current = inboxAddress(await loginEmail(id))
    if (current) return { to: current, via: "login" }
  }
  for (const id of people) {
    const profile = await one<{ email?: string | null }>(db.from("profiles").select("email").eq("id", id).maybeSingle())
    const saved = inboxAddress(profile?.email)
    if (saved) return { to: saved, via: "profile" }
  }
  return null
}
