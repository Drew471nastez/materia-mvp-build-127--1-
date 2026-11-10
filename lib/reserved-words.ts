import { scoreHandle } from "@/lib/security/spam-signals"
import { RESERVED_ROOT_SEGMENTS, RESERVED_ROOT_EXTRAS } from "@/lib/routes/reserved-segments"
import { isPhishingName } from "@/lib/security/phishing-names"

// Reserved words that cannot be used as usernames/slugs
export const RESERVED_WORDS = [
  // Brand names
  "materia",
  "materiaio",
  "materia-io",

  // Common reserved paths
  "www",
  "admin",
  "api",
  "app",
  "dashboard",
  "login",
  "signup",
  "sign-up",
  "signin",
  "sign-in",
  "logout",
  "register",
  "auth",
  "oauth",

  // Route paths
  "u",
  "p",
  "c",
  "explore",
  "settings",
  // Marketplace routes. A username matching one of these would sit behind a
  // static route it can never win against, leaving that seller's storefront
  // permanently unreachable.
  "profile",
  "member",
  // The platform's own account. Identity is conferred by profiles.is_official,
  // which only an operator can set, so a squatter could never be rendered as
  // Storelib — but they could take the handle first and force the real account
  // onto a different one.
  "storelib",
  "messages",
  "purchases",
  "sales",
  "products",
  "courses",
  "community",
  "orders",
  "analytics",
  "checkout",
  "booking",
  "bookings",
  "onboarding",
  "terms",
  "privacy",
  "help",
  "support",
  "about",
  "contact",
  "blog",
  "pricing",
  /* Round AR: the Instagram bio steps (app/(storelib)/instagram-bio). */
  "instagram-bio",

  // Technical
  "null",
  "undefined",
  "true",
  "false",
  "test",
  "demo",
  "example",
  "static",
  "public",
  "private",
  "assets",
  "images",
  "files",
  "uploads",
  "_next",
  "favicon",
  "robots",
  "sitemap",
]

/**
 * ===========================================================================
 *  EVERY TOP-LEVEL ROUTE IS ALSO A RESERVED WORD
 * ===========================================================================
 * A handle is the first segment of `storelib.com/<handle>`, so a handle that
 * matches a route the platform owns is not a clash to resolve later — Next
 * serves the route, and that creator's page is unreachable for ever while
 * still being shown to them as their address.
 *
 * The list above was maintained by hand and had fallen behind the app:
 * `checkout`, `library`, `dashboard`, `wishlist`, `downloads`, `receipt` and
 * others were all free to take. Rather than copy them in, this unions the one
 * list that tests/reserved-segments checks against the filesystem, so a new
 * route closes the hole by existing.
 */
const RESERVED_SET: ReadonlySet<string> = new Set(
  [...RESERVED_WORDS, ...RESERVED_ROOT_SEGMENTS, ...RESERVED_ROOT_EXTRAS].map((w) => w.toLowerCase()),
)

export function isReservedWord(word: string): boolean {
  return RESERVED_SET.has(word.toLowerCase())
}

export function isValidUsername(username: string): { valid: boolean; error?: string } {
  // Must be at least 3 characters
  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" }
  }

  // Must be at most 30 characters
  if (username.length > 30) {
    return { valid: false, error: "Username must be at most 30 characters" }
  }

  // Must only contain lowercase letters, numbers, and dashes
  if (!/^[a-z0-9-]+$/.test(username)) {
    return { valid: false, error: "Username can only contain lowercase letters, numbers, and dashes" }
  }

  // Cannot start or end with a dash
  if (username.startsWith("-") || username.endsWith("-")) {
    return { valid: false, error: "Username cannot start or end with a dash" }
  }

  // Cannot have consecutive dashes
  if (username.includes("--")) {
    return { valid: false, error: "Username cannot have consecutive dashes" }
  }

  // Cannot be a reserved word
  if (isReservedWord(username)) {
    return { valid: false, error: "This username is not available" }
  }

  /**
   * Cannot be a link-farm handle.
   *
   * This is the choke point every path that sets a username already goes
   * through — the settings forms, the buyer settings, PATCH /api/profile and
   * the availability endpoint — so the gate goes here rather than being
   * repeated at four call sites where one of them would eventually be forgotten.
   *
   * The error is the same "not available" the reserved list returns, and that
   * is deliberate. Naming the token that tripped would hand a spammer a tuning
   * loop: rename, resubmit, read which word to drop. A real person hitting this
   * by accident is vanishingly unlikely — the threshold needs a combination of
   * signals, not one unlucky word — and they are told the same thing they would
   * be told if the handle were simply taken, which is actionable enough.
   *
   * See lib/security/spam-signals.ts for what is being scored and why the
   * weights are set where they are.
   */
  if (scoreHandle(username).blocked) {
    return { valid: false, error: "This username is not available" }
  }

  /* A name for a fake sign in page or support desk (lib/security/phishing-names), refused the same way. */
  if (isPhishingName(username)) {
    return { valid: false, error: "This username is not available" }
  }

  return { valid: true }
}
