/**
 * ===========================================================================
 *  WHO GOES ON A MARKETING LIST, AND WHO NEVER DOES
 * ===========================================================================
 * A store's contacts are the `subscribers` table (lib/contacts/checkout-
 * contact.ts): one row per address, and its status says what the person
 * agreed to. The marketing sync reads that status and nothing else:
 *
 *   subscribed     asked for news: the checkout's ticked news box, a sign
 *                  up form on the website or a OnePage, a contact added
 *                  with consent in Emails. Subscribed on the provider's
 *                  list (Klaviyo) or as an email subscriber (Omnisend).
 *   customer       bought and did not ask. A profile or contact with no
 *                  marketing consent, so order emails and segments work,
 *                  never a list.
 *   unsubscribed,  left, bounced, complained or was cleaned. Unsubscribed
 *   bounced, ...   there too, so the provider stops emailing them.
 *   anything else  (a contact form message, a status this file does not
 *                  know, or none) is not sent at all.
 *
 * `is_active` false is an unsubscribe whatever the status says, as the
 * Emails page writes it. Pure: a row in, a decision out.
 */

export type ContactPush = "subscribed" | "customer" | "unsubscribed" | "skip"

const GONE = new Set(["unsubscribed", "bounced", "complained", "cleaned"])

export interface SubscriberRow {
  id: string
  email: string | null
  name?: string | null
  status: string | null
  is_active?: boolean | null
  subscribed_at?: string | null
  consent_timestamp?: string | null
  unsubscribed_at?: string | null
  updated_at?: string | null
}

export function contactPush(row: SubscriberRow): ContactPush {
  const email = String(row.email ?? "").trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "skip"
  const status = row.status ?? null
  if ((status && GONE.has(status)) || (row.is_active === false && status !== "customer" && status !== "wrote")) return "unsubscribed"
  if (status === "subscribed") return "subscribed"
  if (status === "customer") return "customer"
  return "skip"
}

/** When the person said yes: the consent's own time, else when they joined. Never in the future. */
export function consentedAt(row: SubscriberRow, now: number): string {
  const t = Date.parse(row.consent_timestamp ?? row.subscribed_at ?? "")
  return new Date(Number.isFinite(t) && t < now ? t : now - 1000).toISOString()
}

/**
 * A provider says this address is unsubscribed (or bounced, or complained).
 * Storelib's row follows when it is still subscribed there, and the
 * provider's word is newer than the person's last yes on Storelib: someone
 * who ticked the box again after leaving is a new yes, and stays.
 */
export function pulledStatus(reason: string | null | undefined): "unsubscribed" | "bounced" | "complained" {
  const r = String(reason ?? "").toUpperCase()
  if (r === "SPAM_COMPLAINT") return "complained"
  if (r === "HARD_BOUNCE" || r === "INVALID_EMAIL") return "bounced"
  return "unsubscribed"
}

export function pullApplies(row: SubscriberRow, at: string | null | undefined): boolean {
  if (row.status !== "subscribed" || row.is_active === false) return false
  const said = Date.parse(at ?? "")
  const yes = Date.parse(row.consent_timestamp ?? row.subscribed_at ?? "")
  if (Number.isFinite(said) && Number.isFinite(yes) && yes > said) return false
  return true
}
