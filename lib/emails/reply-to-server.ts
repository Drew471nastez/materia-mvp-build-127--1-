import "server-only"

/**
 * ===========================================================================
 *  WHERE A REPLY TO A STORE'S EMAIL GOES, READ
 * ===========================================================================
 * The one read behind every store email's Reply-To (lib/emails/reply-to.ts
 * has the rule): the contact email from Settings › Store details, else the
 * store's support email, else the owner's account email as the login has
 * it now (a second business answers to the login that owns it,
 * lib/seller-inbox.ts). Never Storelib's own inbox, never a noreply or
 * sending-only address. Kept a minute, as the sender is
 * (lib/emails/sending-domain-server.ts verifiedSender); every read is
 * allowed to fail on its own, and a failure is "none", never Storelib's.
 */
import { loginEmailFrom, type LoginEmail } from "@/lib/seller-inbox"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { pickStoreReply, platformReplyAddresses, type StoreReply } from "./reply-to"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const cache = new Map<string, { at: number; value: StoreReply | null }>()
const CACHE_MS = 60_000

export function forgetStoreReply(creatorId: string): void {
  cache.delete(creatorId)
}

async function one<T>(query: PromiseLike<{ data: T | null; error?: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await query
    return error ? null : data
  } catch {
    return null
  }
}

/**
 * The owner's addresses, best first: the login's as it is now, then the
 * profile's. A second business answers to the login that owns it
 * (public.business_links, lib/seller-inbox.ts), so its owner's come first.
 */
async function accountEmails(db: Db, userId: string, loginEmail: LoginEmail): Promise<string[]> {
  const link = await one<{ owner_id?: string | null }>(db.from("business_links").select("owner_id").eq("member_id", userId).maybeSingle())
  const people = link?.owner_id && link.owner_id !== userId ? [link.owner_id, userId] : [userId]
  const out: string[] = []
  for (const id of people) {
    /* A business's tagged address (+slb-) is its owner's real one (lib/businesses/email-alias). */
    const login = ownerAddress(await loginEmail(id).catch(() => null))
    if (login) out.push(login)
  }
  for (const id of people) {
    const profile = await one<{ email?: string | null }>(db.from("profiles").select("email").eq("id", id).maybeSingle())
    const saved = ownerAddress(profile?.email ?? null)
    if (saved) out.push(saved)
  }
  return out
}

export async function storeReplyTo(db: Db, creatorId: string | null | undefined, opts: { now?: number; fresh?: boolean; loginEmail?: LoginEmail } = {}): Promise<StoreReply | null> {
  if (!creatorId) return null
  const now = opts.now ?? Date.now()
  const hit = cache.get(creatorId)
  if (!opts.fresh && hit && now - hit.at < CACHE_MS) return hit.value
  let value: StoreReply | null = null
  try {
    const [settings, creator, sending] = await Promise.all([
      one<{ contact_email?: string | null }>(db.from("store_settings").select("contact_email").eq("creator_id", creatorId).maybeSingle()),
      one<{ support_email?: string | null; user_id?: string | null }>(db.from("creators").select("support_email, user_id").eq("id", creatorId).maybeSingle()),
      one<{ domain?: string | null }>(db.from("email_sending_domains").select("domain").eq("creator_id", creatorId).maybeSingle()),
    ])
    const block = { sendingDomain: sending?.domain ?? null, platformDomain: process.env.MAILGUN_DOMAIN || null, platform: platformReplyAddresses() }
    value = pickStoreReply({ contact: settings?.contact_email, support: creator?.support_email }, block)
    if (!value && creator?.user_id) value = pickStoreReply({ account: await accountEmails(db, creator.user_id, opts.loginEmail ?? loginEmailFrom(db)) }, block)
  } catch {
    value = null
  }
  cache.set(creatorId, { at: now, value })
  if (cache.size > 5000) cache.clear()
  return value
}
