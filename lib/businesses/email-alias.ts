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

/**
 * ===========================================================================
 *  THE SAME PERSON UNDER BOTH ADDRESSES
 * ===========================================================================
 * A creator's lists meet a second business's address too: its owner bought
 * from the store signed in as that business, joined a community with it, or
 * answered a form with the address the account carries. Shown, that address
 * is the owner's own (displayEmail), so a list that keys people by the stored
 * string would show "andrew@gmail.com" twice. This is the key a list matches
 * and searches by: lower case, trimmed, the tag taken off. An address with no
 * inbox keeps its own (made up, unique) name, so it never joins anybody.
 *
 * Only for matching and searching what is listed. Stored rows, and whatever
 * is sent, keep the address as it is.
 */
export function emailMatchKey(email: string | null | undefined): string | null {
  if (!email) return null
  const e = email.trim().toLowerCase()
  if (!e) return null
  return e.endsWith(`@${NO_INBOX_DOMAIN}`) ? e : e.replace(BUSINESS_TAG_PATTERN, "")
}

/** The addresses to show, each once, in the order given: tags off, no-inbox names dropped. */
export function displayEmails(emails: Iterable<string | null | undefined>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of emails) {
    const shown = displayEmail(e)
    if (!shown || seen.has(shown.toLowerCase())) continue
    seen.add(shown.toLowerCase())
    out.push(shown)
  }
  return out
}

/**
 * Whether an address, as it is shown, contains the search words. The tag is
 * never on screen, so "slb" alone finds nobody by it; a whole tagged address
 * pasted from somewhere else still finds its person.
 */
export function emailMatches(email: string | null | undefined, words: string): boolean {
  const q = words.trim().toLowerCase()
  if (!q || !email) return false
  if ((displayEmail(email) ?? "").toLowerCase().includes(q)) return true
  return /\+slb-/i.test(q) && email.toLowerCase().includes(q)
}

/**
 * For a search typed as an address ("andrew@gmail.com", or the start of one
 * after the @), the same search for a second business of that address
 * ("andrew+slb-*@gmail.com*", `*` the wildcard PostgREST's ilike reads), so a
 * person stored under the tagged address is found by the address they are
 * shown with. Null when the words are not shaped like an address.
 */
export function taggedSearchPattern(words: string | null | undefined): string | null {
  const parts = searchedAddress(words)
  return parts ? `${parts.local}+slb-*@${parts.domain}*` : null
}

/** The two halves of a search typed as an address (the domain may be cut short), or null. */
export function searchedAddress(words: string | null | undefined): { local: string; domain: string } | null {
  const s = (words ?? "").trim().toLowerCase()
  const at = s.indexOf("@")
  if (at <= 0 || at !== s.lastIndexOf("@")) return null
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  if (!/^[^\s*,()+%]+$/.test(local) || /[\s*,()%]/.test(domain)) return null
  return { local, domain }
}
