/**
 * ===========================================================================
 *  A HANDLE FOR EVERYBODY, MADE FROM WHAT THEY ALREADY GAVE US
 * ===========================================================================
 * Creators pick a handle when they open a store. Buyers never did, so most
 * accounts had no username: no profile address, nothing to @mention, nothing
 * to follow. A handle is now made the first time one is needed, from the
 * person's name ("Ana Lucía Pérez" -> "ana-lucia-perez") or, when the name
 * gives nothing usable, from the part of their email before the @ (without a
 * +tag). The person can change it in Settings.
 *
 * Pure and browser safe: the account settings field checks a handle with
 * the same rule the server applies (isValidUsername, lib/reserved-words.ts).
 */
import { isValidUsername } from "@/lib/reserved-words"

/** Room left for a suffix under the 30 character ceiling isValidUsername sets. */
export const HANDLE_BASE_MAX = 24

/** Lowercase letters, digits and single dashes, accents folded, at most `max` long. */
/**
 * Join onboarding suggestion: letters and digits only, no hyphens, so
 * "Alex Rivera" becomes alexrivera. Falls back to slugifyHandle when too short.
 */
export function joinHandleFromDisplayName(raw: string | null | undefined, max = HANDLE_BASE_MAX): string {
  const compact = slugifyHandle(raw, max).replace(/-/g, "")
  if (compact.length >= 3 && isValidUsername(compact).valid) return compact
  const slug = slugifyHandle(raw, max)
  return slug.length >= 3 ? slug : compact || slug
}

export function slugifyHandle(raw: string | null | undefined, max = HANDLE_BASE_MAX): string {
  const folded = (raw || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return folded.slice(0, max).replace(/-+$/g, "")
}

/** The part of an address before the @, without a +tag. */
export function emailLocalPart(email: string | null | undefined): string {
  const local = String(email || "").split("@")[0] || ""
  return local.split("+")[0]
}

/**
 * The handle to try first: the name when it makes a usable one, else the
 * email's local part, else "member". Usable means it passes the same rule a
 * typed handle must (length, reserved words, the link farm score).
 */
export function baseHandleFrom(input: { displayName?: string | null; email?: string | null }): string {
  for (const source of [input.displayName, emailLocalPart(input.email)]) {
    const slug = slugifyHandle(source)
    if (slug.length >= 3 && isValidUsername(slug).valid) return slug
    /* A short name ("Al") still makes a good start with a number after it. */
    if (slug.length > 0 && slug.length < 3 && /^[a-z0-9]+$/.test(slug)) return `${slug}-member`
  }
  return "member"
}

/**
 * The handles to try, in order: the base itself, then the base with a
 * number. `random` is injected so tests can pin it. Every candidate passes
 * isValidUsername; one that does not is left out rather than repaired.
 */
export function handleCandidates(base: string, random: () => number = Math.random, count = 8): string[] {
  const root = slugifyHandle(base) || "member"
  const out: string[] = []
  const push = (h: string) => {
    if (!out.includes(h) && isValidUsername(h).valid) out.push(h)
  }
  push(root)
  for (let i = 0; out.length < count && i < count * 3; i++) {
    /* Two digits first (short and friendly), then four, then six as the namespace gets crowded. */
    const digits = i < 3 ? 2 : i < 6 ? 4 : 6
    const n = Math.floor(random() * 10 ** digits)
      .toString()
      .padStart(digits, "0")
    push(`${root}-${n}`)
  }
  return out
}

/** What a typed handle becomes before it is checked: trimmed, lowercase, an @ in front dropped. */
export function normalizeHandle(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/^@+/, "").toLowerCase() : ""
}
