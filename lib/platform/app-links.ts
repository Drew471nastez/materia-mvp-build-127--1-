/**
 * ===========================================================================
 *  "OPEN IN THE APP": UNIVERSAL LINKS (iOS) AND APP LINKS (ANDROID)
 * ===========================================================================
 * The owner: a link to a community, a profile, a creator page or a product
 * opens in the Storelib app when it is installed. Both phones decide that
 * from a file on storelib.com, fetched by the system, not by the app:
 *
 *   /.well-known/apple-app-site-association   iOS: which app (team id and
 *                                             bundle id) and which paths
 *   /.well-known/assetlinks.json              Android: which app (package
 *                                             and signing certificate);
 *                                             the paths are the app's own
 *                                             intent filters
 *
 * Both are built here from env vars (next.config.mjs rewrites the two
 * addresses to app/api/app-links/*), so a new team, bundle or signing key is
 * a setting, not a deploy of a hand edited file. Without the vars they are
 * exactly what public/.well-known held before.
 *
 *   APPLE_TEAM_ID                     10 letters and digits (Apple Developer,
 *                                     Membership)
 *   IOS_BUNDLE_ID                     com.storelib.app
 *   ANDROID_PACKAGE_NAME              com.storelib.app
 *   ANDROID_SHA256_CERT_FINGERPRINTS  the Play App Signing key's SHA-256 (Play
 *                                     Console, App integrity), and the upload
 *                                     key's for side loaded builds, comma
 *                                     separated
 *
 * WHICH PATHS OPEN THE APP ON AN iPHONE. A creator page is storelib.com/
 * <handle> and its products /<handle>/<product>, so "every path but the
 * platform's own" is the rule: the platform's first segments are listed
 * (and excluded) before the catch all. tests/profile-display-name.test.ts
 * walks app/ and fails when a top level route is in neither list, so a new
 * page of the platform can never be mistaken for a creator's.
 *
 * Checkout, the receipt, sign in and /app stay in the browser: a buyer who
 * started paying in Safari finishes in Safari, with the session they have
 * there. The OAuth and password reset returns open the app, as before.
 *
 * Pure: the routes and the tests read the same function.
 *
 * ---------------------------------------------------------------------------
 *  THE NATIVE CHECKLIST (round 14). What is in the repo today, and what a
 *  build still has to carry. Everything here ships with an App Store and
 *  Play release, not with a deploy.
 * ---------------------------------------------------------------------------
 *   WORKS THE MOMENT THIS DEPLOYS, no native release:
 *     - the hand off card inside Instagram's, WhatsApp's and the other
 *       in-app browsers (components/platform/open-in-app-card.tsx)
 *     - the scheme hand off on an iPhone: com.storelib.app is already
 *       registered in ios/App/App/Info.plist (CFBundleURLSchemes), and
 *       components/platform/app-link-opener.tsx already routes it
 *     - the Play Store and App Store fallbacks, and the Play `referrer`
 *       carrying the path
 *
 *   NEEDS THE NEXT BUILD:
 *     - iOS Associated Domains. There is no .entitlements file in ios/ and
 *       no Xcode project in the repo, so Universal Links are not on: add the
 *       Associated Domains capability with `applinks:storelib.com` and
 *       `applinks:www.storelib.com`, and the matching App ID capability in
 *       the Apple Developer portal. Until then an iPhone opens a
 *       storelib.com link in Safari, and only the card hands it over.
 *     - the Android scheme filters for com.storelib.app://open and
 *       storelib://open (added to android/app/src/main/AndroidManifest.xml
 *       in this round, so this is a release away, not a change away).
 *     - the Android Install Referrer read on first launch, for a link that
 *       sent somebody to Play: Play passes `referrer=utm_content=<path>`
 *       through (lib/platform/open-in-app storeLink), and the app has to
 *       read it with com.android.installreferrer once, on the first run, and
 *       hand the path to openTarget. iOS has no equivalent without a paid
 *       service, so the card says to tap the link again there instead.
 *     - `npx cap sync` after any of the above, then a release on both stores.
 *
 *   ENV VARS: APPLE_TEAM_ID, IOS_BUNDLE_ID, ANDROID_PACKAGE_NAME,
 *   ANDROID_SHA256_CERT_FINGERPRINTS (above), and
 *   NEXT_PUBLIC_IOS_APP_STORE_ID, the numeric App Store id. Without that
 *   last one an iPhone has no App Store address to fall back to, and the
 *   card says to search the App Store rather than following a broken one.
 */

export const DEFAULT_TEAM_ID = "A746FHGY53"
export const DEFAULT_BUNDLE_ID = "com.storelib.app"
export const DEFAULT_ANDROID_PACKAGE = "com.storelib.app"
export const DEFAULT_ANDROID_FINGERPRINTS = ["AC:CA:91:0D:49:41:8C:CC:B5:AA:56:26:B0:87:28:4C:C0:30:BC:74:E4:3F:A8:BF:F1:8C:B5:07:EA:94:B5:BF"]

/** Paths that open the app, first match wins (before the platform's own are excluded). */
export const APP_PATHS = [
  "/community/*",
  "/@*",
  "/member/*",
  "/u/*",
  "/p/*",
  "/auth/callback",
  "/auth/callback/*",
  "/reset-password",
  "/reset-password/*",
] as const

/**
 * The platform's own first segments: never a creator page, so never the
 * app by the catch all. Mirrors the routes under app/ (the test keeps it
 * whole) and the proxy's reserved paths.
 */
export const WEB_ONLY_SEGMENTS = [
  "_next", "access", "account", "account-deletion", "admin", "api", "app", "auth", "blog", "c", "checkout",
  "community", "cover-render", "creator-page", "creators", "dashboard", "developers", "downloads", "editions",
  "explore", "faq", "features", "feed", "help", "l", "legal", "library", "login", "logout", "marketplace", "media",
  "member", "native-start", "onboarding", "onepage-preview", "order-help", "p", "pay", "payouts-sheet", "pricing", "privacy", "products", "purchase",
  "receipt", "register", "request", "reset-password", "sell", "signup", "site", "sitemap", "sites", "store",
  "store-builder", "stripe-done", "terms", "u", "unsubscribe", "upgrade", "verify-email", "w", "website-builder", "welcome",
  "wishlist", ".well-known",
] as const

/** Files at the root (icons, robots, sitemaps, the push worker) are never a page. */
const FILE_PATTERNS = ["/*.png", "/*.jpg", "/*.svg", "/*.ico", "/*.txt", "/*.xml", "/*.js", "/*.json", "/*.webp"]

const TEAM_ID = /^[A-Z0-9]{10}$/
const BUNDLE_ID = /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/

export interface AppLinkConfig {
  teamId: string
  bundleId: string
  androidPackage: string
  fingerprints: string[]
}

type Env = Record<string, string | undefined>

/** The values from the env, each checked; a malformed one is the default, never a broken file. */
export function appLinkConfig(env: Env = process.env): AppLinkConfig {
  const team = (env.APPLE_TEAM_ID || "").trim().toUpperCase()
  const bundle = (env.IOS_BUNDLE_ID || "").trim()
  const pkg = (env.ANDROID_PACKAGE_NAME || "").trim()
  const prints = (env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(/[,\s]+/)
    .map((p) => p.trim().toUpperCase())
    .filter((p) => FINGERPRINT.test(p))
  return {
    teamId: TEAM_ID.test(team) ? team : DEFAULT_TEAM_ID,
    bundleId: BUNDLE_ID.test(bundle) ? bundle : DEFAULT_BUNDLE_ID,
    androidPackage: PACKAGE.test(pkg) ? pkg : DEFAULT_ANDROID_PACKAGE,
    fingerprints: prints.length ? [...new Set(prints)] : DEFAULT_ANDROID_FINGERPRINTS,
  }
}

/** apple-app-site-association: components for iOS 13 and later, the plain list for older phones, and the app's passwords. */
export function appleAppSiteAssociation(config: AppLinkConfig = appLinkConfig()) {
  const appID = `${config.teamId}.${config.bundleId}`
  const components = [
    ...APP_PATHS.map((path) => ({ "/": path })),
    { "/": "/", exclude: true, comment: "Storelib's home page stays on the web" },
    ...WEB_ONLY_SEGMENTS.flatMap((seg) => [
      { "/": `/${seg}`, exclude: true },
      { "/": `/${seg}/*`, exclude: true },
    ]),
    ...FILE_PATTERNS.map((path) => ({ "/": path, exclude: true })),
    { "/": "/*", comment: "a creator page and its products: storelib.com/<handle>, /<handle>/<product>" },
  ]
  return {
    applinks: {
      apps: [] as string[],
      details: [{ appIDs: [appID], appID, paths: [...APP_PATHS], components }],
    },
    webcredentials: { apps: [appID] },
  }
}

/** assetlinks.json: this domain hands its links to the app signed with these keys. */
export function assetLinks(config: AppLinkConfig = appLinkConfig()) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: config.androidPackage, sha256_cert_fingerprints: config.fingerprints },
    },
  ]
}

/**
 * Whether an iPhone opens this path in the app, by the same first match
 * the file gives iOS (for the tests and the Open in app pill).
 */
export function opensInApp(path: string): boolean {
  const clean = (path.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/"
  for (const c of appleAppSiteAssociation().applinks.details[0].components) {
    if (globMatch(c["/"], clean)) return !("exclude" in c && c.exclude)
  }
  return false
}

/** Apple's component patterns: `*` any run of characters, `?` one. */
function globMatch(pattern: string, path: string): boolean {
  const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`)
  return re.test(path)
}
