/**
 * ===========================================================================
 *  THE NAME IN storelib.me/{name}: WHAT MAY BE CHOSEN, AND WHAT STILL RESOLVES
 * ===========================================================================
 * A OnePage is served at `https://storelib.me/{name}`, and this file is the
 * one place that says what `{name}` may be. Two questions, kept apart on
 * purpose:
 *
 *   checkOnePageName       may somebody PICK this name now? The editor's
 *                          Page address field, its live availability check
 *                          and PUT /api/onepage all ask this.
 *   isResolvableOnePageName  may this name be LOOKED UP? The proxy and the
 *                          page ask this before touching the database.
 *
 * WHY TWO. The rules for a new name are the username rules signup has always
 * applied (lib/reserved-words isValidUsername: 3 to 30 lowercase letters,
 * numbers and single hyphens, no reserved word, no link farm handle), because
 * a OnePage name and a username share one address space: storelib.me/{name}
 * looks the name up as a page address first and as a username second. Pages
 * made before those rules may hold a name they would refuse today (an
 * underscore, a dot, a short one), and those pages must keep answering. So
 * resolution is looser than choice: a shape that can never be a file or a
 * path trick, and nothing more.
 *
 * Pure: no React, no database, safe on the client and the server, and read
 * by tests/onepage-host.test.ts.
 */
import { isReservedWord, isValidUsername } from "@/lib/reserved-words"

export const ONEPAGE_NAME_MIN = 3
export const ONEPAGE_NAME_MAX = 30

/**
 * Names nobody may pick for a OnePage beyond the username list: the host's
 * own files and words, and the basics of pretending to be Storelib or
 * somebody's support desk. Matched whole, and as a whole hyphen part, so
 * `storelib-support` is refused and `supportive` is not.
 */
const ONEPAGE_RESERVED: readonly string[] = [
  "links", "onepage", "one-page", "me", "storelibme", "storelib-me", "linkinbio", "link-in-bio",
  "official", "staff", "team", "security", "billing", "payments", "payment", "abuse", "report",
  "status", "mail", "email", "root", "system", "moderator", "mod", "verify", "verified",
  "administrator", "noreply", "no-reply", "postmaster", "hostmaster", "webmaster", "account",
  "accounts", "password", "reset", "index", "home", "robots-txt", "sitemap-xml", "favicon-ico",
]

/**
 * Parts of a name that impersonate the platform wherever they appear:
 * `storelib-help`, `official-storelib`. Refused as a hyphen part.
 */
const IMPERSONATION_PARTS: readonly string[] = ["storelib", "admin", "support", "official", "staff", "moderator"]

/**
 * The plain offensive basics, matched as a whole name or a whole hyphen part
 * so an innocent word that happens to contain one is never caught. The link
 * farm scoring in lib/security/spam-signals runs as well, through
 * isValidUsername.
 */
const OFFENSIVE_PARTS: readonly string[] = [
  "fuck", "fucker", "fucking", "shit", "cunt", "bitch", "whore", "slut", "rape", "rapist",
  "nazi", "hitler", "porn", "nigger", "nigga", "faggot", "fag", "retard", "kike", "spic",
]

const RESERVED_SET: ReadonlySet<string> = new Set(ONEPAGE_RESERVED)
const PART_SET: ReadonlySet<string> = new Set([...IMPERSONATION_PARTS, ...OFFENSIVE_PARTS])

/**
 * What a person typed, as a name: spaces trimmed, one leading `@` dropped,
 * a pasted `storelib.me/` (or `https://storelib.me/`) in front taken off,
 * lower case. It does not remove characters; a name with the wrong ones is
 * refused with a sentence saying so rather than silently changed.
 */
export function normalizeOnePageName(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?storelib\.me\//i, "")
    .replace(/\/+$/, "")
    .replace(/^@/, "")
    .toLowerCase()
}

/** Is this name one of the words nobody may pick for a OnePage? Lower case in. */
export function isReservedOnePageName(name: string): boolean {
  const n = name.trim().toLowerCase()
  if (!n) return false
  if (RESERVED_SET.has(n) || PART_SET.has(n) || isReservedWord(n)) return true
  return n.split("-").some((part) => PART_SET.has(part))
}

export type OnePageNameProblem = "empty" | "short" | "long" | "characters" | "edges" | "double" | "reserved"
/* Every field on both sides, so a caller reads `error` without narrowing first (the test build is not strict). */
export type OnePageNameVerdict =
  | { ok: true; value: string; problem?: undefined; error?: undefined }
  | { ok: false; value?: undefined; problem: OnePageNameProblem; error: string }

/**
 * May somebody pick this name now? The editor shows `error` as it is, so each
 * one says what to do rather than what went wrong.
 */
export function checkOnePageName(raw: unknown): OnePageNameVerdict {
  const name = normalizeOnePageName(raw)
  if (!name) return { ok: false, problem: "empty", error: "Choose a name for your link" }
  if (!/^[a-z0-9-]+$/.test(name)) return { ok: false, problem: "characters", error: "Use only letters, numbers and hyphens" }
  if (name.length < ONEPAGE_NAME_MIN) return { ok: false, problem: "short", error: `Use at least ${ONEPAGE_NAME_MIN} characters` }
  if (name.length > ONEPAGE_NAME_MAX) return { ok: false, problem: "long", error: `Use ${ONEPAGE_NAME_MAX} characters or fewer` }
  if (name.startsWith("-") || name.endsWith("-")) return { ok: false, problem: "edges", error: "Start and end with a letter or number" }
  if (name.includes("--")) return { ok: false, problem: "double", error: "Use one hyphen at a time" }
  /*
    The same "not available" whether the word is reserved or the link farm
    score refused it, as isValidUsername does: naming the reason would hand a
    spammer the word to drop.
  */
  if (isReservedOnePageName(name) || !isValidUsername(name).valid) {
    return { ok: false, problem: "reserved", error: "That name is not available" }
  }
  return { ok: true, value: name }
}

/**
 * May this name be looked up? Letters, numbers, and `-`, `_` or `.` between
 * them, 1 to 64 characters, lower or upper case (the proxy sends upper case
 * to lower case before this matters). Never a leading dot or anything that
 * could climb a path, so what passes is safe to put in a URL, a redirect
 * or a query as it is.
 */
export function isResolvableOnePageName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i.test(name) && !name.includes("..")
}

/** The pattern for a Postgres ILIKE that means "exactly this, in any case": `_` and `%` are literal. */
export function exactIlike(name: string): string {
  return name.replace(/[\\%_]/g, (c) => `\\${c}`)
}
