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

/* ─── Mail somebody else wrote, only to an address the store has proven ── */

/**
 * ROUND AX: AN OPEN RELAY THROUGH A SELLER'S ADDRESS.
 *
 * A website's Contact Form took any "Recipient Email", unchecked, and every
 * visitor's message went there from Storelib's sending domain: 30 an hour
 * and 200 a day per store, and anybody can open many stores. The support
 * email in Settings is the same (creators.support_email is saved as typed,
 * never confirmed), and so is a community's contact email. That is text a
 * stranger wrote, sent by Storelib to whatever inbox a store named: the
 * complaints land on Storelib's domain, and receipts, sign in codes and
 * password resets stop arriving for every seller.
 *
 * So mail whose words a visitor or buyer wrote goes to an address the store
 * has PROVEN it owns, the way a hosted shop's contact form goes to the
 * store's own account email:
 *
 *   - the sign in address of the account (and, for a second business, of
 *     the login that owns it), read from Supabase Auth as it is now
 *   - the sign in address of someone active on the store's team
 *
 * A chosen address (the section's Recipient Email, the support email, a
 * community's contact email) is used when it is one of those. Any other is
 * held, and the message goes to the account's own sign in address instead,
 * so a seller who typed some other address keeps getting every message. The
 * editor says so where the address is set. Storelib has no confirmation
 * link for these addresses; building one is a later job.
 *
 * profiles.email is NOT proof (the account can write that row), but stays
 * the last place to send when Auth cannot be read at all, as sellerInbox
 * has always done, so an Auth hiccup does not lose a seller's message.
 *
 * Mail Storelib writes itself (a sale, a refund) still follows sellerInbox
 * and the support email: there is nothing in it for a stranger to write.
 */
export interface ProvenInbox {
  to: string
  /** "chosen": a chosen address, proven. "account": the account's own address. "profile": Auth could not be read. */
  via: "chosen" | "account" | "profile"
  /** The first chosen address is set and is not proven, so it was passed over. Never the address itself in a log. */
  held: boolean
}

/** Active team members' sign in addresses. A database without the team table has none. At most 25 people read. */
async function teamAddresses(db: Db, creatorId: string, loginEmail: LoginEmail): Promise<string[]> {
  const rows = await one<{ user_id?: string | null }[]>(
    db.from("store_team_members").select("user_id").eq("creator_id", creatorId).eq("status", "active").limit(25),
  )
  const out: string[] = []
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.user_id) continue
    const a = inboxAddress(await loginEmail(r.user_id))
    if (a) out.push(a)
  }
  return out
}

/**
 * Where a message somebody else wrote goes, for one store (creators.id).
 * `chosen` in order of preference; the store's support email is always
 * offered after them. Null only when the store has no address at all.
 */
export async function provenInbox(db: Db, creatorId: string, loginEmail: LoginEmail, chosen: unknown[] = []): Promise<ProvenInbox | null> {
  if (!creatorId) return null
  const creator = await one<{ support_email?: string | null; user_id?: string | null }>(
    db.from("creators").select("support_email, user_id").eq("id", creatorId).maybeSingle(),
  )
  if (!creator) return null
  const wanted = [...chosen, creator.support_email].map(inboxAddress).filter((a): a is string => !!a)

  const userId = creator.user_id
  const owned: string[] = []
  if (userId) {
    const link = await one<{ owner_id?: string | null }>(db.from("business_links").select("owner_id").eq("member_id", userId).maybeSingle())
    const people = link?.owner_id && link.owner_id !== userId ? [link.owner_id, userId] : [userId]
    for (const id of people) {
      const a = inboxAddress(await loginEmail(id))
      if (a) owned.push(a)
    }
  }
  const account = owned[0] ?? null
  /* The team is read only when a chosen address is not already the account's own. */
  if (wanted.some((a) => !owned.includes(a))) owned.push(...(await teamAddresses(db, creatorId, loginEmail)))

  const held = wanted.length > 0 && !owned.includes(wanted[0])
  const proven = wanted.find((a) => owned.includes(a))
  if (proven) return { to: proven, via: proven === account ? "account" : "chosen", held }
  if (account) return { to: account, via: "account", held }

  if (!userId) return null
  const profile = await one<{ email?: string | null }>(db.from("profiles").select("email").eq("id", userId).maybeSingle())
  const saved = inboxAddress(profile?.email)
  return saved ? { to: saved, via: "profile", held } : null
}

/** The same, for a store named by its owner's user id (native forms and bookings keep the user, not the store). */
export async function provenInboxForUser(db: Db, userId: string, loginEmail: LoginEmail): Promise<ProvenInbox | null> {
  if (!userId) return null
  const store = await one<{ id?: string | null }>(db.from("creators").select("id").eq("user_id", userId).maybeSingle())
  if (store?.id) return provenInbox(db, store.id, loginEmail)
  const own = inboxAddress(await loginEmail(userId))
  return own ? { to: own, via: "account", held: false } : null
}
