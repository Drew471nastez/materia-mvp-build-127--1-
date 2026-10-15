/**
 * ===========================================================================
 *  THE FIRST SEGMENT OF A PATH IS A CREATOR'S HANDLE, UNLESS THE PLATFORM
 *  ALREADY OWNS IT
 * ===========================================================================
 * `storelib.com/<handle>` is a creator's page and `storelib.com/<handle>/<slug>`
 * is one of their products, so every top-level route the platform has is a
 * word no creator may hold. A handle that collides does not produce an error:
 * Next prefers the real route, and that creator's page becomes permanently
 * unreachable while still being advertised to them as their address.
 *
 * THIS LIST WAS THREE LISTS AND THEY HAD ALREADY DRIFTED. The two route
 * guards disagreed about `creator-page`, and neither agreed with
 * lib/reserved-words, which is what signup and the username field actually
 * check — so `checkout`, `library`, `dashboard`, `wishlist` and a dozen more
 * were free to claim. One list now, with tests/reserved-segments walking
 * `app/` and failing if a route exists that is not named here.
 *
 * ADDING A TOP-LEVEL ROUTE MEANS ADDING A WORD HERE. That is the whole cost,
 * and the test will tell you.
 */

/** Every first path segment with a route of its own, from `app/`. */
export const RESERVED_ROOT_SEGMENTS: readonly string[] = [
  "access",
  "account",
  "account-deletion",
  "admin",
  "api",
  "app",
  "auth",
  "blog",
  "c",
  "checkout",
  /* Storelib Communities: a community's public page and its member area
     (/community/<slug>). Moved here from the extras when it got a route. */
  "community",
  /* The page a website cover's screenshot is taken of. A username of this
     would put a creator's profile at the same address. */
  "cover-render",
  /* Profiles of people without a store: /@handle is rewritten to
     /member/<handle> (next.config). Moved here from the extras. */
  "member",
  "creator-page",
  "dashboard",
  // The Storelib Developer Hub. A creator called "developers" would have
  // their page shadowed by it for ever.
  "developers",
  "downloads",
  "editions",
  "explore",
  "faq",
  "features",
  "help",
  "l",
  "legal",
  "library",
  // The machine-readable map of the Developer Hub, and its full text.
  "llms-full.txt",
  "llms.txt",
  "login",
  "native-start",
  "onboarding",
  /* The OnePage editor's preview frame (components/onepage/live-preview). */
  "onepage-preview",
  /* A buyer's case on an order: /order-help/<id>. */
  "order-help",
  "p",
  /* Where Stripe's wallet page lands in the app's browser: /pay/wallet-return. */
  "pay",
  /* Payout setup opened on its own in the app's browser. */
  "payouts-sheet",
  "pricing",
  "privacy",
  "products",
  "purchase",
  "receipt",
  "request",
  /* A Storelib Reviews request link: /review/<token>. */
  "review",
  "reset-password",
  /* Sell on Storelib and Become a seller: the one door into seller onboarding. */
  "sell",
  "signup",
  "site",
  // storelib.com's sitemap index, and the files it names (/sitemap/<name>.xml).
  "sitemap",
  "sitemap.xml",
  "sites",
  "store",
  "store-builder",
  /* Where Stripe sends the app's browser back once its own page is done. */
  "stripe-done",
  /* A team invite opened: /team/join (app/team/join). */
  "team",
  "terms",
  "u",
  "unsubscribe",
  "upgrade",
  "verify-email",
  "w",
  "website-builder",
  "welcome",
  "wishlist",
]

/**
 * Names with no route of their own that a creator still must not hold: files
 * served from the root, the platform's own identity, and the spellings people
 * type at a domain expecting the platform rather than a person.
 */
export const RESERVED_ROOT_EXTRAS: readonly string[] = [
  "_next",
  "about",
  "analytics",
  "assets",
  "contact",
  "courses",
  "favicon",
  "files",
  "images",
  "messages",
  "orders",
  "profile",
  "public",
  "private",
  "purchases",
  "robots",
  "sales",
  "settings",
  "signin",
  "sign-in",
  "sign-up",
  "static",
  "storelib",
  "support",
  "uploads",
  "www",
]

const SET: ReadonlySet<string> = new Set(
  [...RESERVED_ROOT_SEGMENTS, ...RESERVED_ROOT_EXTRAS].map((s) => s.toLowerCase()),
)

/** Is this first path segment the platform's rather than a creator's? */
export function isReservedRootSegment(segment: string): boolean {
  return SET.has(segment.trim().toLowerCase())
}
