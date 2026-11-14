/**
 * ===========================================================================
 *  THE API CALLS THE PROXY DOES NOT READ A SESSION FOR
 * ===========================================================================
 * proxy.ts builds a Supabase client and verifies (and when it has expired,
 * renews) the session on every request it serves. For a page or a signed in
 * API call that is the point. For the calls below it is work nobody reads:
 * a browser's beacon, a CSP report, a scheduled job, a webhook from Stripe,
 * Mailgun, a video host or a carrier. None of their handlers reads
 * the person's session; each checks its own secret or signature, or takes no
 * one's word at all. Checked handler by handler (tests/vercel-runtime-costs).
 *
 * The proxy still runs for them, and every check that comes before the
 * session (the published site guards, the custom domain lookup) still runs
 * exactly as before. Only the session read at the end is skipped.
 *
 * NOT HERE, ON PURPOSE:
 *   /api/payments/[action]   reads the signed in creator (getUser).
 *   /api/perf/admin          the admin's own figures.
 *   /api/store/ga-check      framed by Settings, and given its frame policy
 *                            after the session read.
 *   anything else            assumed to want the session until read.
 *
 * Pure: no request, no network. tests/vercel-runtime-costs.test.ts reads it.
 */

/** Exact paths whose handler reads no session. */
const EXACT = new Set([
  "/api/csp-report",
  "/api/client-errors",
  "/api/perf/beacon",
  "/api/health",
  "/api/version",
  "/api/metrics",
  "/api/stripe/webhook",
  "/api/stripe/webhook/connect",
])

/** Prefixes whose every handler reads no session. */
const PREFIXES = ["/api/public/", "/api/cron/", "/api/webhooks/", "/api/tracking/webhooks/"]

/*
  A PUBLISHED WEBSITE'S PUBLIC FILES (EVD-3). An imported theme's stylesheets
  and scripts, the cover still the builder photographs, robots.txt, the
  sitemaps, the web manifest and the favicon: the same bytes for everybody,
  and no handler of them reads a session (assets and cover are checked by
  tests/vercel-runtime-costs.test.ts like every exempt /api route; robots,
  sitemaps, manifest and icon are file routes with no request scope). A
  signed in visitor's browser asks for a dozen of them per page, and each
  renewed (or, before Oct 29, verified with Supabase Auth) the session in
  front of a static answer: "auth/v1/user took longer than 10s" on
  robots.txt, assets and cover in production. The page they come with
  still renews it. Nothing under /app, the builder or a preview is here.
*/
const PUBLIC_SITE_PREFIXES = ["/api/site-theme/assets/", "/api/site-theme/cover/"]
const PUBLIC_SITE_FILES = /^\/(?:w\/[^/]+\/)?(?:robots\.txt|sitemap(?:[-_][\w-]+)?\.xml|sitemaps?\/[\w./-]+\.xml|site\.webmanifest|favicon\.ico)$/

/** A payment provider's webhook, such as the removed /api/payments/airwallex/webhook, which now only answers 410. */
const PAYMENT_WEBHOOK = /^\/api\/payments\/[a-z0-9-]+\/webhook\/?$/

/**
 * The visit and event trackers read the session in one case: a signed in
 * creator opening their own page is left out of their visitor count
 * (lib/analytics/own-visit.ts). That read must find a renewed token, so the
 * proxy renews it as before whenever the call carries a sign in. Without one
 * there is nothing to renew, and nothing to skip.
 */
const TRACKERS = new Set(["/api/track-view", "/api/track-event"])

/** The same test own-visit.ts uses for "this request carries a sign in". */
export function carriesSignIn(cookieNames: readonly string[]): boolean {
  /* Under the old name or the `__Host-` one (lib/supabase/host-session.ts, round AX). */
  return cookieNames.some((name) => {
    const bare = name.startsWith("__Host-") ? name.slice(7) : name
    return bare.startsWith("sb-") && bare.includes("auth-token")
  })
}

export function skipsSessionRefresh(pathname: string, cookieNames: readonly string[]): boolean {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  if (EXACT.has(path)) return true
  if (PREFIXES.some((p) => pathname.startsWith(p))) return true
  if (PAYMENT_WEBHOOK.test(pathname)) return true
  if (PUBLIC_SITE_PREFIXES.some((p) => pathname.startsWith(p))) return true
  if (PUBLIC_SITE_FILES.test(path)) return true
  if (TRACKERS.has(path)) return !carriesSignIn(cookieNames)
  return false
}
