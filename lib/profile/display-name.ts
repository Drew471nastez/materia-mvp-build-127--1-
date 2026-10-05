/**
 * ===========================================================================
 *  THE NAME A PERSON GOES BY, NEVER A PLACEHOLDER
 * ===========================================================================
 * The owner: "nobody is ever 'Your profile', 'Creator' or 'Unknown'". Those
 * words came from a dozen screens that each wrote their own
 * `display_name || "Creator"`, and from accounts whose name was never kept:
 * the database's new user trigger read a `display_name` Google never sends
 * (Google sends `full_name` and `name`), so a Google account got the part of
 * its email before the @, and Apple's hidden addresses got a string of
 * letters and digits.
 *
 * Four questions, answered once, here:
 *
 *   personName()      what to SHOW for somebody, from whatever the screen has
 *                     (their name, their handle, their email, their store's
 *                     address). A placeholder word is never a name.
 *   providerNameOf()  the name Google or Apple put on the account.
 *   nameRepair()      what a sign in should WRITE into a profile: the
 *                     provider's name over an empty or made up one, else a
 *                     name made from the handle or the email, else nothing.
 *   needsNameStep()   whether a new account should be asked "What should we
 *                     call you?" (it has no name of its own yet).
 *
 * Pure and browser safe: the server, the onboarding and the tests all read
 * the same rules (tests/profile-display-name.test.ts).
 */

/** Words a screen used to put where a name goes. None of them is anybody's name. */
const PLACEHOLDERS = new Set([
  "your profile",
  "creator",
  "unknown",
  "user",
  "member",
  "anonymous",
  "someone",
  "null",
  "undefined",
  "new user",
  "storelib user",
  /* NAMELESS below: what a screen shows, never what a row keeps. */
  "storelib member",
])

/** The longest name kept, the same ceiling Settings puts on the field. */
export const NAME_MAX = 60

/** The shortest name kept: a single letter is an initial, not a name. */
export const NAME_MIN = 2

/** What every screen shows when it knows nothing at all about a person (no name, no handle, no email). */
export const NAMELESS = "Storelib member"

/** Apple's "Hide my email" addresses: their local part is random letters, never a name. */
const RELAY_DOMAINS = /@(privaterelay\.appleid\.com|icloud-relay\.com)$/i

/** Spaces collapsed, control characters out, at most NAME_MAX; null when nothing is left or it is a placeholder word. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  // eslint-disable-next-line no-control-regex
  const flat = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g, " ").replace(/\s+/g, " ").trim()
  if (flat.length < NAME_MIN) return null
  if (PLACEHOLDERS.has(flat.toLowerCase())) return null
  if (flat.length <= NAME_MAX) return flat
  /* Cut at a word where there is one close to the ceiling, so a long name does not end mid word. */
  const cut = flat.slice(0, NAME_MAX)
  const space = cut.lastIndexOf(" ")
  return (space >= NAME_MAX - 15 ? cut.slice(0, space) : cut).trim()
}

/** The part of an address before the @, without a +tag, as typed. */
function localPartOf(email: unknown): string {
  if (typeof email !== "string") return ""
  return (email.split("@")[0] || "").split("+")[0].trim()
}

/** "ana" -> "Ana", "o'neil" -> "O'neil": the first letter up, the rest as typed. */
function capital(word: string): string {
  return word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word
}

/** Mostly digits, a run of letters with no vowel, or letters and digits taking turns ("x7h2k9qz"): not a name. */
function looksMachineMade(part: string): boolean {
  const letters = part.replace(/[^a-z]/gi, "")
  const digits = part.replace(/[^0-9]/g, "")
  if (letters.length < NAME_MIN) return true
  if (digits.length > letters.length) return true
  if (letters.length >= 6 && !/[aeiouy]/i.test(letters)) return true
  /* Letters and digits taking turns ("q8x2kz7v") is a generated string; a name with a year after it changes once. */
  const turns = part.match(/[a-z][0-9]|[0-9][a-z]/gi)?.length ?? 0
  if (turns >= 3) return true
  return false
}

/**
 * A name made from an email's local part: "ana.lucia92@x.com" -> "Ana Lucia",
 * "jsmith@x.com" -> "Jsmith". Null for Apple's hidden addresses and for a
 * local part that reads as a code rather than a name.
 */
export function nameFromEmail(email: unknown): string | null {
  if (typeof email === "string" && RELAY_DOMAINS.test(email.trim())) return null
  const local = localPartOf(email)
  if (!local || looksMachineMade(local)) return null
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._\-\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
  if (words.length === 0) return null
  return cleanName(words.map(capital).join(" "))
}

/**
 * A name made from a handle: "ana-lucia" -> "Ana Lucia". Handles made for
 * buyers (lib/profile/username-rules) come from their name or email, so this
 * gives the same words back; a handle that is only "member" with a number
 * gives nothing.
 */
export function nameFromHandle(handle: unknown): string | null {
  if (typeof handle !== "string") return null
  const raw = handle.trim().replace(/^@/, "")
  if (!raw) return null
  const words = raw
    .replace(/[0-9]+/g, " ")
    .split(/[._\-\s]+/)
    .filter((w) => w.length > 0)
  if (words.length === 0) return null
  const name = cleanName(words.map(capital).join(" "))
  if (!name || name.toLowerCase() === "member" || name.toLowerCase().endsWith(" member")) return null
  return name
}

/** The name Google or Apple put on the account (`full_name`, `name`, the given and family names), or null. */
export function providerNameOf(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta) return null
  for (const key of ["full_name", "name", "display_name"] as const) {
    const name = cleanName(meta[key])
    /* Some providers send the email as the name: that is not one. */
    if (name && !name.includes("@")) return name
  }
  const given = typeof meta.given_name === "string" ? meta.given_name : typeof meta.first_name === "string" ? meta.first_name : ""
  const family = typeof meta.family_name === "string" ? meta.family_name : typeof meta.last_name === "string" ? meta.last_name : ""
  return cleanName(`${given} ${family}`)
}

/**
 * Whether a stored name is one we made up rather than one the person has:
 * empty, a placeholder word, or exactly the part of their email before the @
 * (what the new user trigger wrote for every Google and Apple account).
 */
export function isStandInName(stored: unknown, email: unknown): boolean {
  const name = cleanName(stored)
  if (!name) return true
  const local = localPartOf(email)
  if (local && name.toLowerCase() === local.toLowerCase()) return true
  return false
}

export interface NameSources {
  /** profiles.display_name, or a creator's display name. */
  name?: string | null
  /** profiles.username, without the @. */
  username?: string | null
  /** Only ever used to MAKE a name, never shown. */
  email?: string | null
  /** A store's address (creators.slug), for a seller with nothing else. */
  slug?: string | null
  /** The provider's name, when the screen has the account's metadata. */
  meta?: Record<string, unknown> | null
}

/**
 * WHAT A SCREEN SHOWS FOR A PERSON. Their own name; else the provider's;
 * else a name made from their handle; else from their email; else their
 * store's address; else NAMELESS. Never "Your profile", "Creator",
 * "Unknown" or "User", and never an email address.
 */
export function personName(input: NameSources | null | undefined, fallback: string = NAMELESS): string {
  if (!input) return fallback
  const own = cleanName(input.name)
  /* An address is never shown, and the letters before Apple's hidden address are nobody's name. */
  const usable = own && !own.includes("@") && !isCodeName(own, input.email) ? own : null
  if (usable) return usable
  return (
    providerNameOf(input.meta) ??
    nameFromHandle(input.username) ??
    nameFromEmail(input.email) ??
    nameFromHandle(input.slug) ??
    (own && !own.includes("@") ? own : null) ??
    fallback
  )
}

/**
 * A stored name that is the part of the email before the @ AND reads as a
 * code rather than a name ("x7h2k9qz" from an Apple hidden address): what
 * the new user trigger wrote, and worse than a name from the handle.
 */
function isCodeName(name: string, email: unknown): boolean {
  const local = localPartOf(email)
  if (!local || name.toLowerCase() !== local.toLowerCase()) return false
  return nameFromEmail(email) === null
}

/**
 * WHAT A SIGN IN WRITES INTO A PROFILE, or null to leave it as it is.
 *
 *   they have a name of their own          null: never touched
 *   the name is a stand in (empty, a       the provider's name when there is
 *   placeholder word, the email's part     one
 *   before the @)
 *   empty or a placeholder word, and no    a name made from their handle,
 *   provider name                          else from their email
 *   the email's part before the @, and     null: it is already the best there
 *   no provider name                       is, and the onboarding asks them;
 *                                          unless it reads as a code (Apple's
 *                                          hidden address), then the handle's
 */
export function nameRepair(input: { stored: string | null | undefined; username?: string | null; email?: string | null; meta?: Record<string, unknown> | null }): string | null {
  if (!isStandInName(input.stored, input.email)) return null
  const provider = providerNameOf(input.meta)
  const stored = cleanName(input.stored)
  if (provider && provider !== stored) return provider
  /* The email's own letters as a name: kept, unless they read as a code and the handle gives a real one. */
  if (stored) {
    if (!isCodeName(stored, input.email)) return null
    const fromHandle = nameFromHandle(input.username)
    return fromHandle && fromHandle !== stored ? fromHandle : null
  }
  return nameFromHandle(input.username) ?? nameFromEmail(input.email)
}

/**
 * Whether a new account should be asked "What should we call you?": it has
 * no name of its own and its provider sent none. A name made from the email
 * counts as none, since it was never theirs to begin with.
 */
export function needsNameStep(input: { stored: string | null | undefined; email?: string | null; meta?: Record<string, unknown> | null }): boolean {
  if (providerNameOf(input.meta)) return false
  return isStandInName(input.stored, input.email)
}
