/**
 * A COMMUNITY'S ADDRESS, storelib.com/community/<slug>.
 *
 * Lowercase letters, digits and single hyphens, 3 to 48 characters, never
 * starting or ending with a hyphen: the CHECK on public.communities.slug,
 * word for word. A space's slug follows the same shape from one character.
 * A few words are kept back, because an address like /community/admin or
 * /community/storelib reads as Storelib's own. Pure and browser safe.
 */

import { isPhishingName } from "@/lib/security/phishing-names"

export const SLUG_MIN = 3
export const SLUG_MAX = 48
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export const RESERVED_COMMUNITY_SLUGS: readonly string[] = [
  "about",
  "admin",
  "admins",
  "api",
  "app",
  "communities",
  "community",
  "create",
  "dashboard",
  "edit",
  "events",
  "explore",
  "help",
  "join",
  "leaderboard",
  "library",
  "login",
  "manage",
  "members",
  "moderator",
  "moderators",
  "new",
  "notifications",
  "official",
  "settings",
  "signup",
  "staff",
  "storelib",
  "support",
  "team",
]

/** A name made into an address: "Café Makers!" -> "cafe-makers". May come back too short; check with validSlug. */
export function slugify(input: string, max = SLUG_MAX): string {
  const plain = (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return plain.slice(0, max).replace(/-+$/g, "")
}

/** Whether a community may have this address. */
export function validSlug(slug: string): boolean {
  return (
    typeof slug === "string" &&
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    SLUG_PATTERN.test(slug) &&
    !slug.includes("--") &&
    !RESERVED_COMMUNITY_SLUGS.includes(slug)
  )
}

/**
 * Whether a NEW address may be taken (round AW): a valid one that is not a
 * name for a fake sign in page or a bank's support desk
 * (lib/security/phishing-names.ts). A community lives on storelib.com itself,
 * so storelib.com/community/paypal-login put Storelib's own address on a
 * phishing page; usernames, OnePage names and website names were already
 * refused for it. Asked only where an address is chosen (creating one,
 * changing it), so a community keeps the address it has.
 */
export function newSlugAllowed(slug: string): boolean {
  return validSlug(slug) && !isPhishingName(slug)
}

/** Whether a space inside a community may have this address (one character is enough there). */
export function validSpaceSlug(slug: string): boolean {
  return typeof slug === "string" && slug.length >= 1 && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug)
}

/** The next address to try when one is taken: "makers" -> "makers-2", trimmed so it still fits. */
export function slugWithSuffix(base: string, n: number | string): string {
  const tail = `-${n}`
  return `${base.slice(0, SLUG_MAX - tail.length).replace(/-+$/g, "")}${tail}`
}
