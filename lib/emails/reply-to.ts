/**
 * ===========================================================================
 *  WHERE A REPLY GOES, PURE
 * ===========================================================================
 * The rule Shopify, Kajabi, Stan and Klaviyo all follow: an email a store
 * sends to its customers (a receipt, a campaign, an automation, a course or
 * community email) is answered by the STORE, never by the platform. So its
 * Reply-To is, in order:
 *
 *   1. the store's contact email   Settings › Store details (store_settings.contact_email)
 *   2. the store's support email   creators.support_email (older stores set it here)
 *   3. the owner's account email   the login that owns the store, as it is now
 *
 * Storelib's own support inbox (EMAIL_REPLY_TO) is only ever the Reply-To
 * of Storelib's own emails to the creator (sign in, billing, a new sale).
 * A store with none of the three gets no Reply-To at all rather than
 * Storelib's inbox, which is what used to happen.
 *
 * An address that cannot take a reply is never chosen: a noreply@ one, one
 * on Storelib's sending domain (mg.storelib.com), one on the store's own
 * sending domain (mail.yourshop.com sends; it has no inbox), a Storelib
 * relay (+slb-), or Storelib's support inbox itself.
 *
 * Browser safe. The lookup is lib/emails/reply-to-server.ts storeReplyTo,
 * and lib/mailgun.ts applies it to every send made with `store`.
 */

export type ReplySource = "contact" | "support" | "account"

export interface StoreReply {
  address: string
  via: ReplySource
}

/** The addresses Storelib answers from: support@storelib.com and whatever EMAIL_REPLY_TO says. */
export function platformReplyAddresses(env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): string[] {
  const set = new Set<string>(["support@storelib.com"])
  const configured = bareAddress(env.EMAIL_REPLY_TO)
  if (configured) set.add(configured)
  return [...set]
}

/** "Name <a@b.c>" or "a@b.c" → "a@b.c", lower case; "" when there is no address. */
export function bareAddress(value: unknown): string {
  if (typeof value !== "string") return ""
  const m = value.match(/<([^<>\s]+@[^<>\s]+)>/)
  const v = (m ? m[1] : value).trim().toLowerCase()
  return /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(v) && v.length <= 254 ? v : ""
}

/** Local parts that never read their mail. */
const NO_INBOX = /^(no-?reply|do-?not-?reply|donotreply|noresponse|no-?response|mailer-daemon|bounces?|postmaster)([+._-].*)?$/

export interface ReplyBlock {
  /** The store's own sending domain (mail.yourshop.com): it sends, it does not receive. */
  sendingDomain?: string | null
  /** Storelib's Mailgun domain (MAILGUN_DOMAIN). */
  platformDomain?: string | null
  /** Storelib's own support inbox, and any other platform address. */
  platform?: string[]
}

/** Can a buyer's answer to a store's email go here? */
export function canTakeReply(value: unknown, block: ReplyBlock = {}): boolean {
  const a = bareAddress(value)
  if (!a) return false
  const [local, domain] = a.split("@")
  if (NO_INBOX.test(local)) return false
  if (/\+slb-/i.test(a)) return false
  const sending = (block.sendingDomain || "").toLowerCase()
  if (sending && (domain === sending || domain.endsWith(`.${sending}`))) return false
  const own = (block.platformDomain || "").toLowerCase()
  if (own && own !== "storelib.com" && (domain === own || domain.endsWith(`.${own}`))) return false
  if (/(^|\.)mg\.storelib\.com$/.test(domain)) return false
  if ((block.platform ?? platformReplyAddresses()).includes(a)) return false
  return true
}

/** Is this one of Storelib's own reply addresses (a platform fallback that slipped into a store's email)? */
export function isPlatformReply(value: unknown, platform: string[] = platformReplyAddresses()): boolean {
  const a = bareAddress(value)
  return !!a && platform.includes(a)
}

/** The first of the store's addresses, in the order above, that can take a reply. */
export function pickStoreReply(candidates: { contact?: unknown; support?: unknown; account?: unknown[] }, block: ReplyBlock = {}): StoreReply | null {
  if (canTakeReply(candidates.contact, block)) return { address: bareAddress(candidates.contact), via: "contact" }
  if (canTakeReply(candidates.support, block)) return { address: bareAddress(candidates.support), via: "support" }
  for (const a of candidates.account ?? []) if (canTakeReply(a, block)) return { address: bareAddress(a), via: "account" }
  return null
}

/**
 * THE REPLY-TO A SEND CARRIES. A store's email (`store` set) keeps the
 * Reply-To it was given when that can take a reply; otherwise it gets the
 * store's own address (`resolved`), and with none, no header at all. Only
 * Storelib's own emails fall back to Storelib's support inbox.
 */
export function replyToFor(input: { store?: string | null; replyTo?: string | null; resolved?: string | null }, platformReply: string, block: ReplyBlock = {}): string | null {
  if (!input.store) return input.replyTo || platformReply
  if (input.replyTo && canTakeReply(input.replyTo, block)) return input.replyTo
  return input.resolved && canTakeReply(input.resolved, block) ? input.resolved : null
}
