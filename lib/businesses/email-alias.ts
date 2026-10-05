/**
 * ===========================================================================
 *  A SECOND BUSINESS'S ADDRESS, AND THE PERSON BEHIND IT
 * ===========================================================================
 * A second business is its own account (supabase/migrations/
 * 20261001_business_accounts.sql), and an account needs an email address
 * nobody else has. It gets the owner's own address with a tag:
 *
 *     andrew@gmail.com   ->   andrew+slb-1a2b3c4d@gmail.com
 *
 * Unique, so every lookup by email (a buyer matched to a profile at checkout)
 * still finds one row. Deliverable to the owner on Gmail, Outlook, iCloud and
 * most other providers, so Stripe's own emails for that business's payouts
 * reach them. And reversible without a database: `ownerAddress` takes the tag
 * off, which is what Storelib does wherever it writes to a seller, so a sale,
 * a refund or a reply to a receipt reaches the owner's real inbox even on a
 * provider that does not understand the "+".
 *
 * An owner with no email (a phone sign in) gets an address on a name that has
 * no inbox; nothing is sent to it, and `ownerAddress` returns null for it so
 * the caller falls back to its own default.
 *
 * Free of anything server-only, so the tests and the browser can use it.
 */

/** Eight hex characters, from the server's random bytes. */
export const BUSINESS_TAG_PATTERN = /\+slb-[0-9a-f]{8}(?=@)/i

const NO_INBOX_DOMAIN = "businesses.invalid"

export function businessAlias(ownerEmail: string | null | undefined, token: string): string {
  if (!/^[0-9a-f]{8}$/i.test(token)) throw new Error("A business tag is eight hex characters")
  /* Any tag already there comes off first (the pattern needs the @ after it), so a tag is never stacked. */
  const email = (ownerEmail ?? "").trim().toLowerCase().replace(BUSINESS_TAG_PATTERN, "")
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) return `slb-${token}@${NO_INBOX_DOMAIN}`
  return `${email.slice(0, at)}+slb-${token}${email.slice(at)}`
}

export function isBusinessAlias(email: string | null | undefined): boolean {
  if (!email) return false
  return BUSINESS_TAG_PATTERN.test(email) || email.toLowerCase().endsWith(`@${NO_INBOX_DOMAIN}`)
}

/**
 * The address to write to for the person behind an account: the same address
 * for an ordinary account, the owner's for a second business, and null when a
 * second business has no owner address to fall back on.
 */
export function ownerAddress(email: string | null | undefined): string | null {
  if (!email) return null
  const trimmed = email.trim()
  if (trimmed.toLowerCase().endsWith(`@${NO_INBOX_DOMAIN}`)) return null
  return trimmed.replace(BUSINESS_TAG_PATTERN, "")
}

/**
 * ===========================================================================
 *  THE ADDRESS A PERSON IS SHOWN
 * ===========================================================================
 * The tag is Storelib's bookkeeping, not something anybody typed, and the
 * owner saw it on their own screen: "sometimes across Storelib there could be
 * this kind of format for emails, SLB, ADB, 21, CFC, whatever. Make sure
 * those are never actually showing, because it is bad."
 *
 * So every place that PRINTS an address puts it through here first. It is the
 * reading of `ownerAddress` with one difference: an account made for a person
 * who signed in by phone has no inbox at all, and the name invented for it
 * ("slb-1a2b3c4d@businesses.invalid") is not an address to show anybody, so
 * this answers null and the caller shows whatever it shows for no address.
 *
 * Sending still goes through `ownerAddress`: what is written to and what is
 * shown are the same string for every account that has one.
 */
export function displayEmail(email: string | null | undefined): string | null {
  const own = ownerAddress(email)
  return own && own.includes("@") ? own : null
}

/** The part before the @, for a name made out of an address. Never the tag. */
export function emailLocalPart(email: string | null | undefined): string | null {
  const shown = displayEmail(email)
  if (!shown) return null
  return shown.slice(0, shown.lastIndexOf("@")) || null
}
