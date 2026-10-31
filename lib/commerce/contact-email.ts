/**
 * ===========================================================================
 *  A CREATOR'S CONTACT ADDRESS, ASKED FOR ON THE CLICK (round 45 leftovers)
 * ===========================================================================
 * The creator page said Contact and showed the address when pressed, but
 * the address was already in the page: the whole header settings object,
 * contactEmail included, went to the header's client component, so the
 * RSC payload of storelib.com/<name> carried it in plain text for anybody
 * reading the HTML (live: curl storelib.com/andrewrullz, grep "@").
 *
 * Now the page carries no address at all. It carries whether there is one
 * for this viewer, and the button asks /api/public/contact-email?handle=
 * for it, which answers with this, rate limited and never cached.
 *
 * THE SAME RULE AS THE PAGE'S, ASKED AGAIN ON THE SERVER. Who gets an answer
 * is exactly who the page offered the button to, because a route anybody
 * can call must not be a wider door than the page was:
 *
 *   - a creator page that is up: a finished storefront (the page itself
 *     redirects anyone else to /@handle), not banned;
 *   - an address to give: the one the creator typed, else the account's,
 *     which is the owner's explicit call (app/(marketing)/u/[username]);
 *   - a viewer who has bought from them (lib/commerce/has-bought-from-creator,
 *     tests/contact-gate.test.ts). Signed out, or never bought: nothing.
 *
 * Anything that fails is "no address", never an error that says which part
 * failed: a stranger probing handles learns nothing from the answer.
 */

export interface ContactLookup {
  /** The profile at this handle: its id (the account) and nothing private. */
  profile(handle: string): Promise<{ id: string } | null>
  /** The creator row for that account, read whole so a missing column is absent. */
  creator(userId: string): Promise<{ id: string; onboarding_completed?: boolean | null } | null>
  /** Whether Storelib banned this creator (lib/seo/bans.ts). */
  banned(creatorId: string): Promise<boolean>
  /** The address the creator typed in About (the published header settings' contactEmail). */
  typedEmail(creatorId: string): Promise<string | null | undefined>
  /** The account's own address, which stands in when none was typed. */
  accountEmail(userId: string): Promise<string | null | undefined>
  /** Whether this viewer has bought anything from this creator. */
  viewerBought(viewerId: string, creatorId: string): Promise<boolean>
}

/** A handle as an address can carry it: letters, digits, dot, dash, underscore. */
export function contactHandle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const h = value.trim().replace(/^@/, "").toLowerCase()
  return /^[a-z0-9._-]{1,64}$/.test(h) ? h : null
}

/** One @, something either side, a dot in the domain: the creator-profile route's own rule. */
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim())
}

/** The address this viewer may be given for this handle, or null. */
export async function contactEmailFor(handle: unknown, viewerId: string | null | undefined, look: ContactLookup): Promise<string | null> {
  const name = contactHandle(handle)
  if (!name || !viewerId) return null
  try {
    const profile = await look.profile(name)
    if (!profile?.id) return null
    const creator = await look.creator(profile.id)
    if (!creator?.id || !creator.onboarding_completed) return null
    const [banned, bought] = await Promise.all([look.banned(creator.id), look.viewerBought(viewerId, creator.id)])
    if (banned || !bought) return null
    /* The typed address wins; the account's stands in, as on the page. */
    const typed = await look.typedEmail(creator.id)
    const email = (typeof typed === "string" && typed.trim()) || (await look.accountEmail(profile.id)) || null
    return isAddress(email) ? email.trim() : null
  } catch {
    return null
  }
}

/** The headers every answer of the route carries: not for search, not for any cache. */
export const CONTACT_EMAIL_HEADERS = {
  "X-Robots-Tag": "noindex",
  "Cache-Control": "private, no-store",
} as const

/**
 * The header settings as the page may hand them to a client component: the
 * same object without its contactEmail, which only the route above gives
 * out. Every other field is drawn by the header and stays.
 */
export function withoutContactEmail<T extends { contactEmail?: unknown } | null | undefined>(settings: T): T {
  if (!settings || typeof settings !== "object" || !("contactEmail" in settings)) return settings
  const { contactEmail: _drop, ...rest } = settings as { contactEmail?: unknown } & Record<string, unknown>
  void _drop
  return rest as T
}
