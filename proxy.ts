import { createServerClient } from "@supabase/ssr"
import { readCurrentUser, shouldSendToLogin } from "@/lib/auth/current-user"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { previewTokenFrom } from "@/lib/website-builder/preview-token"

// Main domain - customize this based on environment
const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

/**
 * Where AI-built sites are published: <slug>.storelib.com.
 *
 * Creator pages are PATHS (storelib.com/andrewrullz) and AI-built sites are
 * SUBDOMAINS (andrewrullz.storelib.com). One address space each, so neither
 * can claim the other's.
 *
 * A subdomain is not a security boundary on its own — cookies scoped to
 * `.storelib.com` reach every host under it. What makes this safe is that the
 * session cookie is HOST-ONLY (see lib/supabase/server.ts and the cookie
 * writer at the bottom of this file). Published pages carry model-written
 * JavaScript and the Supabase cookie is readable from JavaScript by design,
 * so a domain-scoped session would be readable by every site we host.
 */
const SITES_DOMAIN = process.env.NEXT_PUBLIC_SITES_HOST || MAIN_DOMAIN

// Domains that should NOT be treated as seller subdomains
const EXCLUDED_SUBDOMAINS = ["www", "app", "api", "admin", "dashboard", "localhost"]

/**
 * Platform flows that belong to the apex, wherever they are asked for. These
 * need the session, and the session is host-only on storelib.com, so a
 * checkout begun on a creator's own address is sent home to finish.
 */
const PLATFORM_APEX_PATHS = ["/checkout", "/purchase", "/receipt", "/access"]

// Reserved paths that should not be rewritten on subdomains
const RESERVED_PATHS = [
  "/api",
  "/app",
  "/dashboard",
  "/login",
  "/signup",
  "/logout",
  "/onboarding",
  "/checkout",
  "/feed",
  "/explore",
  "/creators",
  "/wishlist",
  "/marketplace",
  "/library",
  "/native-start",
  "/receipt",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
]

/**
 * Extract username from subdomain
 * Examples:
 * - username.storelib.com -> username
 * - www.storelib.com -> null (excluded)
 * - storelib.com -> null (main domain)
 * - localhost:3000 -> null (development)
 */
function extractUsernameFromHost(host: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0]

  // Handle localhost for development
  if (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1") {
    return null
  }

  // Check if it's a subdomain of the main domain
  if (!hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`) && hostWithoutPort !== MAIN_DOMAIN) {
    // Not a storelib.com domain - could be a custom domain (handled separately)
    return null
  }

  // Extract subdomain
  if (hostWithoutPort === MAIN_DOMAIN) {
    return null // Main domain, no subdomain
  }

  // Get the subdomain part (everything before .storelib.com)
  const subdomain = hostWithoutPort.replace(`.${MAIN_DOMAIN}`, "")

  // Check if it's an excluded subdomain
  if (EXCLUDED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return null
  }

  // Only accept single-level subdomains as usernames
  if (subdomain.includes(".")) {
    return null
  }

  return subdomain.toLowerCase()
}

/**
 * Check if path should be excluded from subdomain rewriting
 */
function isReservedPath(pathname: string): boolean {
  return RESERVED_PATHS.some(
    (reserved) => pathname === reserved || pathname.startsWith(`${reserved}/`)
  )
}

/**
 * Check if a username is an old/changed username and resolve to the current one.
 * Returns the new username if found, null if not an old username.
 */
async function resolveOldUsername(oldUsername: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if this username exists as a current profile
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", oldUsername)
      .limit(1)
      .maybeSingle()

    // If a current profile exists with this username, it's not an old one
    if (currentProfile) return null

    // Check username_history for the most recent redirect
    const { data: historyRecord } = await supabase
      .from("username_history")
      .select("new_username")
      .ilike("old_username", oldUsername)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return historyRecord?.new_username || null
  } catch {
    return null
  }
}

/**
 * Is there a live AI-built site under this name? The same question the /site
 * handler asks before serving one, asked once here so the proxy can send a
 * page request to the right renderer. Any failure reads as "no", which sends
 * the request to /w, which in turn sends an unknown name to a 404.
 */
async function hasLiveAiSite(slug: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return false
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data } = await supabase
      .from("site_deployments")
      .select("storage_prefix")
      .eq("is_live", true)
      .eq("slug", slug.toLowerCase())
      .maybeSingle()
    return !!(data as { storage_prefix: string | null } | null)?.storage_prefix
  } catch {
    return false
  }
}

/**
 * Has this creator published a website in the builder?
 *
 * Only a connected custom domain asks: the subdomain decides the same
 * question the other way round (anything that is not a live AI site is the
 * website, because an unpublished one already has a good answer at the
 * creator page). A domain cannot fall through like that — it has no creator
 * page of its own to fall back to unless it is told to — so it asks.
 *
 * A failed lookup reads as "no website", which lands on the profile, which
 * is where the domain pointed yesterday.
 */
async function hasPublishedWebsite(username: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return false
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const lower = username.toLowerCase()

    // The name is a profile username or a creator slug, the same two places
    // lib/website-builder/published-site.ts looks.
    const { data: profile } = await supabase.from("profiles").select("id").eq("username", lower).maybeSingle()
    let creatorId: string | null = null
    if (profile) {
      const { data: creator } = await supabase
        .from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle()
      creatorId = (creator as { id: string } | null)?.id ?? null
    }
    if (!creatorId) {
      const { data: creator } = await supabase.from("creators").select("id").eq("slug", lower).maybeSingle()
      creatorId = (creator as { id: string } | null)?.id ?? null
    }
    if (!creatorId) return false

    const { data: install } = await supabase
      .from("store_theme_installs")
      .select("id")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .limit(1)
      .maybeSingle()
    return Boolean(install)
  } catch {
    return false
  }
}

/**
 * Resolve a custom domain to a username via Supabase lookup
 * Returns the username if the domain is active, null otherwise
 */
async function resolveCustomDomain(host: string): Promise<string | null> {
  const hostWithoutPort = host.split(":")[0]

  // Skip known storelib domains and localhost
  if (
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort === MAIN_DOMAIN ||
    hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)
  ) {
    return null
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Strip www. prefix for lookup - domains are stored without www in the database
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    // Match active, ssl_provisioning, or pending (if request arrives, DNS is working)
    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id, status")
      .eq("domain", lookupDomain)
      .in("status", ["active", "ssl_provisioning", "pending", "verifying"])
      .single()

    if (!domainRecord) return null

    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    return profile?.username || null
  } catch {
    return null
  }
}

/**
 * Check if a domain has a redirect entry in domain_redirects table.
 * Used for old/removed/changed domains - redirects traffic to new domain or fallback subdomain.
 * Returns the redirect URL and HTTP code if found, null otherwise.
 */
async function checkDomainRedirect(host: string): Promise<{ redirectTo: string; httpCode: number } | null> {
  const hostWithoutPort = host.split(":")[0]

  // Skip known storelib domains and localhost
  if (
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort === MAIN_DOMAIN ||
    hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)
  ) {
    return null
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Strip www. prefix for lookup
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    const { data: redirect } = await supabase
      .from("domain_redirects")
      .select("redirect_to, http_code, keep_until")
      .eq("domain", lookupDomain)
      .gt("keep_until", new Date().toISOString())
      .single()

    if (!redirect) return null

    return {
      redirectTo: redirect.redirect_to,
      httpCode: redirect.http_code || 301,
    }
  } catch {
    return null
  }
}

/**
 * Look up the username of the creator who owns (or owned) a custom domain.
 * Checks custom_domains in ANY status so we can redirect even for removed/pending domains.
 */
async function lookupDomainOwnerUsername(host: string): Promise<string | null> {
  const hostWithoutPort = host.split(":")[0]
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id")
      .eq("domain", lookupDomain)
      .limit(1)
      .maybeSingle()

    if (!domainRecord) return null

    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    return profile?.username || null
  } catch {
    return null
  }
}

/**
 * Retire the old `.storelib.com` session cookies — once.
 *
 * Sessions created before the cookie became host-only still carry
 * Domain=.storelib.com, which means every published site can still read
 * them. Rewriting the app is not enough on its own: the old cookie sits in
 * the browser until something expires it, so this does.
 *
 * IT MUST NOT LOG ANYBODY OUT. The value is written back host-only in the
 * same response, so the browser ends up holding exactly one cookie with the
 * same session in it. Raw `Set-Cookie` headers rather than
 * `response.cookies.set`, because that API is keyed by name and would
 * overwrite the host-only cookie we just wrote instead of adding a second
 * directive beside it.
 *
 * ONCE, and this is the reason for the marker. A request cannot tell which
 * domain an incoming cookie was set for — the browser sends name and value
 * and nothing else — so without a marker this re-issues every auth cookie on
 * every response for the rest of the deployment's life: several hundred
 * wasted bytes on every navigation, and a Set-Cookie on responses that had no
 * business carrying one. The marker is host-only, so it is written on the
 * same host whose cookies were just fixed.
 */
/**
 * A PUBLISHED SITE MAY NOT ACT AS ITS VISITOR.
 *
 * ---------------------------------------------------------------------------
 *  THE HOLE THIS CLOSES, AND WHY IT OPENED
 * ---------------------------------------------------------------------------
 * Sites are published at <slug>.storelib.com, which is the SAME SITE as
 * storelib.com in the cookie sense — same registrable domain. `SameSite=Lax`
 * only blocks requests from a different site, so it does not block these.
 *
 * That means JavaScript on any published page could do
 *
 *     fetch("https://storelib.com/api/…", { method: "POST", credentials: "include" })
 *
 * and the browser would attach the visitor's session cookie. CORS stops the
 * page READING the reply, which is worth nothing here: by then the write has
 * already happened as that person. None of this repository's 122 mutating
 * routes checks where a request came from, so every one of them was reachable
 * this way.
 *
 * While sites lived on a separate registrable domain, SameSite=Lax was the
 * thing that made this impossible. Moving them to a subdomain removed that
 * protection, so it is replaced here rather than assumed.
 *
 * ---------------------------------------------------------------------------
 *  WHY IT IS A DENY-LIST, AND WHY THAT IS THE SAFE SHAPE HERE
 * ---------------------------------------------------------------------------
 * Refusing everything but the apex would break callers that legitimately have
 * no Origin or a different one: Stripe's webhooks send none, the Capacitor
 * app sends capacitor://localhost, and a creator's custom domain sends its
 * own name while serving pages this app rendered. Guessing at that list is
 * how a payment webhook starts failing at 2am.
 *
 * The set being refused is exact and closed instead: a storelib.com
 * subdomain, which since the move is a published site and nothing else. No
 * page this application serves has such an origin.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

function isPublishedSiteOrigin(origin: string | null): boolean {
  if (!origin) return false
  let host: string
  try {
    host = new URL(origin).hostname.toLowerCase()
  } catch {
    // An Origin we cannot parse is not one we can clear, but it is also not
    // the specific thing this guard is for. Left to the routes.
    return false
  }
  if (!host.endsWith(`.${MAIN_DOMAIN}`)) return false

  const subdomain = host.slice(0, -(MAIN_DOMAIN.length + 1))
  // The reserved names are the platform's own surfaces, not published sites.
  return !EXCLUDED_SUBDOMAINS.includes(subdomain)
}

const HOST_ONLY_MARKER = "sb-host-only"

function retireDomainScopedCookies(response: NextResponse, request: NextRequest): void {
  if (MAIN_DOMAIN.includes("localhost")) return
  if (request.cookies.has(HOST_ONLY_MARKER)) return

  // The marker's own name begins with "sb-", so it is excluded explicitly
  // rather than by a prefix that happens to match it.
  const auth = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name !== HOST_ONLY_MARKER)
  if (auth.length === 0) return

  for (const cookie of auth) {
    /**
     * THE RE-ISSUE IS CONDITIONAL, and both conditions are bugs that were
     * caught by watching real response headers rather than reading this.
     *
     * Supabase's own handler runs first and mutates `request.cookies` — so by
     * the time this runs, an invalid or signed-out session reads back as an
     * EMPTY value. Writing that produced `sb-…-auth-token=` with no expiry:
     * an empty cookie sat where the response had just deleted one, which at
     * best is litter and at worst fights a sign-out.
     *
     * And when the response is already setting this cookie, it is setting it
     * host-only (see the writer below), so re-issuing it here would only
     * overwrite a fresher value with a staler one.
     */
    const alreadySet = response.cookies.get(cookie.name) !== undefined
    if (cookie.value && !alreadySet) {
      /**
       * MAX-AGE IS NOT OPTIONAL HERE.
       *
       * A Set-Cookie with no Max-Age and no Expires is a SESSION cookie. The
       * cookie being replaced is persistent, so omitting it quietly downgraded
       * every existing login to "signed out when you close the browser" —
       * once, during the migration, for everybody. Confirmed in Chromium:
       * the re-issued cookie came back with expires = -1.
       *
       * The value carries Supabase's own tokens, and their lifetime is
       * enforced server-side when they are presented — so a long cookie
       * lifetime grants no extra access, it only stops the browser throwing
       * away a session that is still good. Supabase's writer replaces this
       * with its own options on the next refresh anyway; this only has to
       * survive until then.
       *
       * 400 days because that is the ceiling browsers enforce on cookie
       * lifetime; asking for more is silently clamped to it.
       */
      response.headers.append(
        "Set-Cookie",
        `${cookie.name}=${cookie.value}; Path=/; Max-Age=34560000; Secure; SameSite=Lax`,
      )
    }

    // The expiry is UNCONDITIONAL. This is the whole point of the function:
    // the domain-scoped copy is the one every published site can read, and it
    // has to go whether or not the session is still good.
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Domain=.${MAIN_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`,
    )
  }

  // A year, because the migration is finished for this browser once the old
  // cookie is gone and there is nothing left to re-check.
  response.headers.append(
    "Set-Cookie",
    `${HOST_ONLY_MARKER}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,
  )
}

/**
 * First segments that are routes rather than creator handles.
 *
 * Mirrors app/(marketing)/[sellername]/[productSlug]. It is here so the
 * framing rule below cannot be talked into treating /app/settings as a
 * product page — `frame-ancestors 'self'` already limits any of this to our
 * own origin, so the stake is small, but a rule that says "any two segments"
 * is a rule nobody can reason about later.
 */
const FRAME_RESERVED_FIRST_SEGMENT = new Set([
  "account-deletion", "admin", "api", "app", "auth", "blog", "c", "creator-page",
  "explore", "faq", "features", "l", "legal", "library", "login", "p", "pricing",
  "register", "signup", "site", "sites", "store", "store-builder", "u", "w",
  "website-builder", "wishlist",
])

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host") || ""

  const bareHost = host.split(":")[0].toLowerCase()

  /**
   * ── One host holds the session ────────────────────────────────────────────
   *
   * www is redirected to the apex before anything reads a cookie. With
   * host-only cookies, www.storelib.com and storelib.com would otherwise each
   * hold a SEPARATE session — sign in on one and you are a stranger on the
   * other, which reads as a broken login rather than a redirect somebody
   * forgot.
   */
  if (bareHost === `www.${MAIN_DOMAIN}`) {
    const canonical = new URL(`https://${MAIN_DOMAIN}`)
    canonical.pathname = pathname
    canonical.search = search
    return NextResponse.redirect(canonical, { status: 301 })
  }

  /**
   * ── Published sites ───────────────────────────────────────────────────────
   *
   * FIRST, before anything else touches the request. Nothing below this point
   * should ever run for a visitor to somebody's published website: not the
   * Supabase session read, not the native app gate. A stranger reading a
   * static page must not cost a session lookup, and the dashboard's cookie
   * handling must never run on a request serving generated code.
   *
   *   andrewrullz.storelib.com/      → /site/andrewrullz
   *   andrewrullz.storelib.com/about → /site/andrewrullz/about
   *
   * A subdomain that is NOT a published site is not a dead end: the route
   * looks for a creator with that username and sends them to
   * storelib.com/<name>, so links to the old creator subdomains keep working.
   */
  if (bareHost.endsWith(`.${SITES_DOMAIN}`)) {
    const subdomain = bareHost.slice(0, -(SITES_DOMAIN.length + 1))

    // Multi-level (a.b.storelib.com) is nobody's site, and the reserved
    // names below are the platform's own.
    if (!subdomain.includes(".") && !EXCLUDED_SUBDOMAINS.includes(subdomain)) {
      const url = request.nextUrl.clone()
      /**
       * ═══════════════════════════════════════════════════════════════════════
       *  WHICH OF TWO THINGS A SUBDOMAIN IS
       * ═══════════════════════════════════════════════════════════════════════
       * `<name>.storelib.com` is either an AI-built site (files in storage,
       * served by /site) or the website a creator built in the website
       * builder (a theme install, rendered by /w). The name alone cannot say
       * which, so a page request asks: is there a live AI deployment under
       * this name? If not, this is a website-builder address and goes to
       * /w, which serves the published site from its cache — and, for a
       * creator with nothing published, sends the visitor to their creator
       * page at storelib.com/<name> rather than to a "coming soon".
       *
       * PAGES ONLY. An AI site's assets (`/_vendor/…`, its own files) ask
       * every request, and one database read per script tag is not a cost
       * the site handler should carry. A request with a file extension is an
       * asset and goes straight to /site as before; a website-builder site's
       * own assets are Next's, under reserved paths, and never come here.
       */
      /**
       * ═══════════════════════════════════════════════════════════════════════
       *  WHAT ON A SITE IS NOT THE SITE
       * ═══════════════════════════════════════════════════════════════════════
       * Everything under this host was treated as a page of the creator's
       * website, which is wrong for two kinds of path and broke both:
       *
       *   /api/…       the site's own forms post here. The newsletter
       *                section posts to /api/website-builder/subscribe, and
       *                on a published site that was rewritten to
       *                /w/<name>/api/… and answered 404 — so the form that
       *                says "you're subscribed" could not have been.
       *                Served here, on this host, like any other API call.
       *
       *   /checkout…   the Buy button goes to /checkout?productId=…, and a
       *                purchase needs the session, which is host-only and
       *                lives on the apex. Sent there rather than rendered on
       *                a host where the visitor is a stranger.
       *
       * Both lists are short and unambiguous on purpose: every other name is
       * a page a creator may make, and taking "pricing" or "library" away
       * from them to reserve it for the platform is a worse trade than the
       * collision it avoids.
       */
      if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next()
      if (PLATFORM_APEX_PATHS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
        const apex = new URL(`https://${MAIN_DOMAIN}`)
        apex.pathname = pathname
        apex.search = search
        // 307: the method and body survive, which a POST to checkout needs.
        return NextResponse.redirect(apex, { status: 307 })
      }

      const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(pathname)
      const isWebsite = !looksLikeFile && !(await hasLiveAiSite(subdomain))

      /**
       * ═══════════════════════════════════════════════════════════════════
       *  THE OLD `?preview=` LINKS, SENT ON TO THE ADDRESS PREVIEWS HAVE NOW
       * ═══════════════════════════════════════════════════════════════════
       * A preview used to be a query string on the public page, which meant
       * the public page had to read `searchParams` — and a route that reads
       * `searchParams` is rendered again for every visitor, forever. Moving
       * the token into the path is what lets the published page be held at
       * the edge at all.
       *
       * Links already sent out are still in the old shape, so they are sent
       * here rather than broken. A redirect, not a rewrite: the address bar
       * should end up showing the one that will keep working.
       */
      if (isWebsite && !pathname.startsWith("/preview/")) {
        const legacy = previewTokenFrom(url.searchParams)
        if (legacy) {
          const rest = pathname === "/" ? "" : pathname
          const to = new URL(request.url)
          to.pathname = `/preview/${legacy}${rest}`
          to.searchParams.delete("preview")
          return NextResponse.redirect(to, 308)
        }
      }

      url.pathname = isWebsite
        ? `/w/${subdomain}${pathname === "/" ? "" : pathname}`
        : `/site/${subdomain}${pathname === "/" ? "" : pathname}`
      const rewritten = NextResponse.rewrite(url)

      /**
       * THE LANDING PAGE'S CACHE RULE WAS EATING EVERY SITE HOMEPAGE.
       *
       * `headers()` in next.config matches the path the BROWSER asked for, and
       * on drew.storelib.com that path is `/` — which has a rule meant for the
       * marketing site: `public, s-maxage=3600, stale-while-revalidate=7200`.
       * Config headers win over the ones a route handler sets, so every
       * published homepage was edge-cached for an hour and served stale for two
       * more after that. Up to three hours of "I published and nothing
       * changed", and it silently defeated the ten-second window the site route
       * asks for.
       *
       * This is the same trap that already caught storefronts — see the
       * `/u/` rewrite below, which carries the same comment. The rewrite is the
       * only place that knows this request is a site, so the header belongs
       * here.
       *
       * Only the homepage needs it: `/` is the one config source a site path
       * can collide with, and matching the route's own value keeps the two
       * from drifting apart. Assets keep the route's immutable caching, which
       * is what makes a version-stamped bundle worth stamping.
       *
       * SIXTY, to match `revalidate = 60` on the route. It used to say ten,
       * which was harmless while the page was dynamic — Next's own no-store
       * overrode it and nothing here landed at all. Now that the page is
       * cacheable this header is the one the edge obeys on the homepage, so
       * the two numbers have to be the same one or the front page and every
       * page under it go stale on different clocks.
       */
      if (pathname === "/") {
        rewritten.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      }

      return rewritten
    }
  }

  /**
   * Everything below serves the application. A request arriving here from a
   * published site is the forgery described above, and it is refused before
   * any session is read or any route runs.
   *
   * TWO CHECKS, BECAUSE ONE HEADER DOES NOT SEE EVERYTHING.
   *
   * `Origin` is sent on writes — fetch, form posts, sendBeacon — and names
   * the page that made them. It is NOT sent on a plain subresource GET, so a
   * published page could still reach the API with
   *
   *     <img src="https://storelib.com/api/…">
   *
   * which the browser loads with the visitor's cookies attached and which no
   * Origin check can see. That matters because a number of GET handlers in
   * this repository create or update rows — lazy initialisation, tracking
   * pixels, download counters — so "GET does not mutate" is not true here and
   * is not something to assume on somebody else's behalf.
   *
   * `Sec-Fetch-Site: same-site` is what a subdomain-to-apex request looks
   * like, and since sites moved onto subdomains there is no other kind: the
   * dashboard is `same-origin`, a creator's custom domain is `cross-site`,
   * and a typed URL is `none`. Refusing exactly `same-site` on /api therefore
   * refuses published sites and nothing else. Browsers too old to send the
   * header fall through to the Origin check, which is the same posture the
   * rest of this guard takes.
   */
  const secFetchSite = request.headers.get("sec-fetch-site")
  const isApi = pathname.startsWith("/api/")

  /**
   * Where a Site API would live if one is built — a published page calling a
   * deliberately public endpoint with no session behind it. Nothing serves
   * this prefix today; it is named here so that work does not begin by
   * fighting this guard and quietly widening it.
   */
  const isPublicApi = pathname.startsWith("/api/public/")

  if (isApi && !isPublicApi && secFetchSite === "same-site") {
    return new NextResponse(
      JSON.stringify({ error: "Requests from published sites are not allowed." }),
      { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    )
  }

  if (MUTATING.has(request.method) && isPublishedSiteOrigin(request.headers.get("origin"))) {
    return new NextResponse(
      JSON.stringify({ error: "Requests from published sites are not allowed." }),
      { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    )
  }

  // ── The native app never shows the marketing site ──────────────────────────
  //
  // Capacitor WebViews always include "Capacitor" in their User-Agent, so this
  // is decided on the SERVER, before a single byte of a marketing page is sent.
  //
  // This used to guard "/" alone, which stopped the app opening on the homepage
  // but left every other marketing page one link away — a tab bar, a footer or a
  // stray <Link> and the app is showing somebody a pricing table inside an
  // application they have already installed. The gate is the whole marketing
  // site now.
  //
  // NOT gated, deliberately:
  //   · /legal, /terms, /privacy — the App Store requires these be reachable
  //     from inside the app, and gating them is a review rejection.
  //   · /p, /u, /l, /checkout, /library, /app, /wishlist, /receipt and the auth
  //     pages — the app's actual screens.
  // Everything here lands on /native-start, which resolves the session and sends
  // a seller to /app, a buyer to /library, and a stranger to /welcome.
  const NATIVE_BLOCKED = ["/pricing", "/features", "/faq", "/blog"]
  const isCapacitor = (request.headers.get("user-agent") || "").includes("Capacitor")
  if (
    isCapacitor &&
    (pathname === "/" || NATIVE_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/native-start"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Extract username from subdomain
  /**
   * Only custom domains name a creator now.
   *
   * <name>.storelib.com used to rewrite to a creator storefront; it is an
   * AI-built site's address today, handled above. The old links are not
   * dropped — a subdomain with no site behind it redirects to
   * storelib.com/<name>, which is where creator pages live.
   */
  let username: string | null = null
  let isCustomDomain = false

  // If no subdomain match, check if it's a custom domain
  if (!username) {
    const hostWithoutPort = host.split(":")[0]
    const isExternalDomain = hostWithoutPort !== "localhost" &&
      hostWithoutPort !== "127.0.0.1" &&
      hostWithoutPort !== MAIN_DOMAIN &&
      !hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)

    // Canonical redirect: apex custom-domain.com → www.custom-domain.com
    // This prevents mixed apex/www confusion that causes ERR_SSL_PROTOCOL_ERROR
    // by ensuring only ONE host (www) is canonical. Browser caches the redirect permanently (301).
    // www is chosen as canonical because Vercel provisions SSL more reliably for CNAME-based hosts.
    if (isExternalDomain && !hostWithoutPort.startsWith("www.")) {
      const wwwDomain = `www.${hostWithoutPort}`
      const canonicalUrl = new URL(`https://${wwwDomain}`)
      canonicalUrl.pathname = pathname
      canonicalUrl.search = search
      return NextResponse.redirect(canonicalUrl, { status: 301 })
    }

    const customDomainUsername = await resolveCustomDomain(host)
    if (customDomainUsername) {
      username = customDomainUsername
      isCustomDomain = true
    } else if (isExternalDomain && !isReservedPath(pathname)) {
      // Domain not actively connected — check redirect memory table
      // This handles removed/changed domains by redirecting to the new domain or fallback subdomain
      const domainRedirect = await checkDomainRedirect(host)
      if (domainRedirect) {
        const redirectUrl = new URL(domainRedirect.redirectTo)
        // Preserve path: if old domain was accessed at /links, redirect to newdomain/links
        if (pathname && pathname !== "/") {
          redirectUrl.pathname = pathname
        }
        if (search) {
          redirectUrl.search = search
        }
        return NextResponse.redirect(redirectUrl, { status: domainRedirect.httpCode })
      }

      // No redirect entry — try to find the creator who owned this domain and redirect to their subdomain
      const fallbackUsername = await lookupDomainOwnerUsername(host)
      if (fallbackUsername) {
        const fallbackUrl = new URL(`https://${fallbackUsername}.${MAIN_DOMAIN}`)
        fallbackUrl.pathname = pathname
        fallbackUrl.search = search
        return NextResponse.redirect(fallbackUrl, { status: 302 })
      }
      // Truly unknown domain — fallback to main site
      const fallbackUrl = new URL(`https://${MAIN_DOMAIN}`)
      fallbackUrl.pathname = pathname
      fallbackUrl.search = search
      return NextResponse.redirect(fallbackUrl, { status: 302 })
    }
  }

  // Handle subdomain or custom domain routing
  let supabaseResponse: NextResponse

  // If we have a username (from subdomain or custom domain) and it's not a reserved path
  if (username && !isReservedPath(pathname)) {
    // Check if this is an old username that should redirect to a new one
    if (!isCustomDomain) {
      const newUsername = await resolveOldUsername(username)
      if (newUsername && newUsername.toLowerCase() !== username.toLowerCase()) {
        // 301 redirect to the new subdomain (permanent, SEO-safe)
        const redirectUrl = new URL(`https://${newUsername}.${MAIN_DOMAIN}`)
        redirectUrl.pathname = pathname
        redirectUrl.search = search
        return NextResponse.redirect(redirectUrl, { status: 301 })
      }
    }

    // Rewrite URLs:
    // - /links -> /l/{username} (seller onepage - username is used as slug)
    // - / -> /u/{username} (seller store homepage)
    // - /p/{slug} -> /p/{slug} (product pages stay the same)

    let rewritePath: string

    /**
     * ═════════════════════════════════════════════════════════════════════════
     *  A CONNECTED DOMAIN SHOWS THE SITE THEY BUILT
     * ═════════════════════════════════════════════════════════════════════════
     * Only custom domains reach this code now; a storelib.com subdomain is
     * answered above. And every one of them landed on `/u/{username}`, the
     * creator's PROFILE — so somebody who bought a domain, pointed it at
     * Storelib and built a website got the profile page at it, and their
     * website only at the subdomain they were trying to replace. Every path
     * but `/` and `/p/…` was thrown away too, so an About page on a connected
     * domain was the home page.
     *
     * A connected domain is a replacement for the subdomain, so it answers
     * with the same thing the subdomain answers with: the published website,
     * path and all. A creator with no published website keeps the profile
     * exactly as before, so nothing changes for anybody who has not built one.
     */
    // Pages only, like the subdomain branch: an asset request must not cost
    // two database lookups, and a site's assets are Next's own anyway.
    const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(pathname)
    const builtSite = !looksLikeFile && !(await hasLiveAiSite(username)) && (await hasPublishedWebsite(username))

    if (pathname === "/links" || pathname === "/links/") {
      // username.storelib.com/links -> /l/{username}
      // The username is passed as the slug parameter
      rewritePath = `/l/${username}`
    } else if (builtSite) {
      rewritePath = `/w/${username}${pathname === "/" || pathname === "" ? "" : pathname}`
    } else if (pathname === "/" || pathname === "") {
      // username.storelib.com -> /u/{username}
      rewritePath = `/u/${username}`
    } else if (pathname.startsWith("/p/")) {
      // Product pages stay as-is
      rewritePath = pathname
    } else {
      // For any other paths on subdomain, redirect to main store page
      rewritePath = `/u/${username}`
    }

    // Create rewrite URL
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = rewritePath

    // Preserve query parameters
    if (search) {
      rewriteUrl.search = search
    }

    // Create rewrite response
    supabaseResponse = NextResponse.rewrite(rewriteUrl)
    supabaseResponse.headers.set("x-seller-subdomain", username)

    /**
     * THE STOREFRONT IS PER-VIEWER, ON THIS PATH TOO.
     *
     * `next.config.mjs` sets `private, no-cache, must-revalidate` for
     * `/u/:username*`, with a comment explaining why: the page renders an Edit
     * button, owner menus and a follow state that depend on who is asking, and
     * caching it shared serves one visitor's rendering to another. It also
     * made `router.refresh()` after a save a no-op, because the refreshed RSC
     * payload came straight back from the edge unchanged.
     *
     * THAT RULE NEVER APPLIED HERE. `headers()` matches the path the browser
     * asked for, and on `andrew.storelib.com` that path is `/` — which has its
     * own rule, `public, s-maxage=3600, stale-while-revalidate=7200`, meant
     * for the marketing landing page. So every storefront reached by its own
     * subdomain — which is most of them — was edge-cached for an hour, and
     * saving a profile appeared to do nothing until the hour was up.
     *
     * The rewrite is the only place that knows this request is a storefront,
     * so the header belongs here. `/l/` keeps its own caching: a link-in-bio
     * page has no per-viewer content.
     */
    if (rewritePath.startsWith("/u/")) {
      supabaseResponse.headers.set("Cache-Control", "private, no-cache, must-revalidate")
    }
    if (isCustomDomain) {
      supabaseResponse.headers.set("x-custom-domain", host.split(":")[0])
    }
  } else {
    supabaseResponse = NextResponse.next({
      request,
    })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, return the response as-is
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  // Determine if we're on localhost for cookie domain settings
  const isLocalhost = MAIN_DOMAIN.includes("localhost")

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // Preserve the rewrite if we had one
        if (username && !isReservedPath(pathname)) {
          const rewriteUrl = request.nextUrl.clone()
          if (pathname === "/links" || pathname === "/links/") {
            rewriteUrl.pathname = `/l/${username}`
          } else if (pathname === "/" || pathname === "") {
            rewriteUrl.pathname = `/u/${username}`
          } else if (pathname.startsWith("/p/")) {
            rewriteUrl.pathname = pathname
          } else {
            rewriteUrl.pathname = `/u/${username}`
          }
          if (search) {
            rewriteUrl.search = search
          }
          supabaseResponse = NextResponse.rewrite(rewriteUrl)
          supabaseResponse.headers.set("x-seller-subdomain", username)
          if (isCustomDomain) {
            supabaseResponse.headers.set("x-custom-domain", host.split(":")[0])
          }
        } else {
          supabaseResponse = NextResponse.next({
            request,
          })
        }
        // Set cookies with domain for cross-subdomain support
        // This ensures PKCE code verifier cookies work across subdomains
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, {
            ...options,
            // HOST-ONLY. This used to be `.${MAIN_DOMAIN}` for subdomain
            // sharing, which now means every published site at
            // <slug>.storelib.com would be sent the session — and could read
            // it, because this cookie is readable from JavaScript by design.
            domain: undefined,
            secure: !isLocalhost,
            sameSite: "lax",
          })
        })
      },
    },
  })

  /**
   * THE LINE THAT WAS SIGNING PEOPLE OUT AT RANDOM.
   *
   * This used to be `const { data: { user } } = await supabase.auth.getUser()`
   * with the error thrown away, and then `if (!user) redirect("/login")`. That
   * makes a blip between Vercel and Supabase indistinguishable from a
   * signed-out visitor, and this code runs on EVERY matched request, so the
   * dice were rolled all day long. It matches the report exactly: rare,
   * random, correlated with nothing, impossible to reproduce on purpose.
   *
   * readCurrentUser keeps the three outcomes apart and retries a blip once.
   * Only a definite "nobody is signed in" redirects now.
   */
  const current = await readCurrentUser(supabase)

  if (current.state === "indeterminate") {
    console.warn(`[proxy] auth undetermined on ${request.nextUrl.pathname}: ${current.reason}`)
  }

  const guarded =
    request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname.startsWith("/dashboard")

  if (guarded && shouldSendToLogin(current)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    /**
     * THE REDIRECT HAS TO CARRY THE COOKIES.
     *
     * `NextResponse.redirect` builds a BRAND NEW response, and every
     * Set-Cookie the Supabase client just wrote landed on `supabaseResponse`.
     * Returning the new one bare threw away a rotated refresh token: Supabase
     * had already retired the old one, the browser never received its
     * replacement, and the next request had nothing that worked. A sign-out
     * that survives a restart, caused by the redirect itself.
     */
    const redirect = NextResponse.redirect(url)
    for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie)
    retireDomainScopedCookies(redirect, request)
    return redirect
  }


  // ── Stripe controller CSP (Capacitor WKWebView only) ────────────────────────
  // When Stripe.js initialises it creates a hidden controller iframe at
  // js.stripe.com/v3/controller-with-preconnect-*.html. That iframe sends a
  // postMessage; Stripe.js reacts by setting window.location.href = controllerUrl.
  // In WebKit, window.location.href is [LegacyUnforgeable] — no JS patch can
  // intercept it. The WebView navigates away from the checkout page.
  //
  // Fix: inject a Content-Security-Policy frame-src that only allows the Stripe
  // iframe URL patterns actually needed. The controller URL (controller-with-
  // preconnect-*.html) is intentionally absent → the browser engine blocks it
  // before any JS runs → no postMessage is ever sent → window.location.href
  // is never set → checkout stays inline.
  //
  // Allowed patterns (all live under js.stripe.com/v3/):
  //   elements-*        CardNumberElement / CardExpiryElement / CardCvcElement
  //   payment-request-* Apple Pay / Google Pay availability check iframe
  //   three-ds-*        3DS v2 bank-auth challenge iframes
  //   link-*            Stripe Link authentication iframes
  //   hooks.stripe.com  3DS redirect-return host
  //
  // NOT allowed (intentionally blocked):
  //   controller-with-preconnect-*  ← the cause of the top-level navigation
  if ((request.headers.get("user-agent") || "").includes("Capacitor")) {
    supabaseResponse.headers.set(
      "Content-Security-Policy",
      "frame-src 'self'" +
      " https://js.stripe.com/v3/elements-*" +
      " https://js.stripe.com/v3/payment-request-*" +
      " https://js.stripe.com/v3/three-ds-*" +
      " https://js.stripe.com/v3/link-*" +
      " https://hooks.stripe.com",
    )
  }

  /**
   * THE CODE EDITOR MAY BE FRAMED, BY US, WHEN IT ASKS TO BE.
   *
   * vercel.json sends `X-Frame-Options: DENY` on every path, which is the
   * right default and is why nothing in this app can be put in an iframe by
   * anybody. The theme editor now shows /website-builder/code over its own
   * canvas, in a frame, and that page would be a blank rectangle under DENY.
   *
   * CSP `frame-ancestors` takes precedence over X-Frame-Options where both
   * are present — the site cover route relies on exactly this and is proven
   * in production. So the code page gets `frame-ancestors 'self'`, and ONLY
   * when it carries `?embedded=1`: opened at its own address it stays
   * unframeable, and nobody else's page can frame it either way.
   *
   * Appended to an existing CSP rather than replacing it, because the
   * Capacitor block above may already have set one for this response.
   */
  {
    const url = request.nextUrl
    /**
     * THE CREATOR PAGE IS FRAMED BY ITS OWN WORKSPACE.
     *
     * /creator-page holds the real /u/<handle> rather than redrawing it,
     * so the controls a creator uses are the ones a visitor's browser runs and
     * nothing can drift. Same rule as the code editor below: `frame-ancestors
     * 'self'`, and ONLY with ?embedded=1. Opened at its own address the page
     * stays unframeable by anybody, us included.
     */
    /**
     * AND THE PRODUCT PAGES THE CREATOR PAGE LINKS TO.
     *
     * Clicking a product inside the workspace loaded /{handle}/{slug} into
     * the frame and got "storelib.com refused to connect" — X-Frame-Options
     * doing its job on a page nobody had thought about. The canvas holds the
     * real page, and the real page has links out of it; a framed page whose
     * own links are dead ends is a preview, which is the thing this
     * arrangement exists not to be.
     *
     * The condition is unchanged in kind: `frame-ancestors 'self'`, and ONLY
     * with ?embedded=1. A product page at its own address stays unframeable
     * by anybody, us included, and no other site can frame it either way.
     * lib/store-builder/editor-channel adds the flag to links inside the
     * canvas, so the parameter is only ever present on a request the
     * workspace made.
     */
    const productPath = (() => {
      /** /p/{slug}, and /{handle}/{slug} where the handle is not a real route. */
      if (url.pathname.startsWith("/p/")) return true
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length !== 2) return false
      return !FRAME_RESERVED_FIRST_SEGMENT.has(parts[0].toLowerCase())
    })()
    const framableWhenEmbedded =
      url.pathname.startsWith("/website-builder/code/") || url.pathname.startsWith("/u/") || productPath
    const framed = framableWhenEmbedded && url.searchParams.get("embedded") === "1"
    if (framed) {
      const existing = supabaseResponse.headers.get("Content-Security-Policy")
      supabaseResponse.headers.set(
        "Content-Security-Policy",
        existing ? `${existing}; frame-ancestors 'self'` : "frame-ancestors 'self'",
      )
    }
  }

  // Last thing before the response leaves: retire any `.storelib.com` session
  // cookie this browser is still carrying, re-issued host-only so nobody is
  // signed out by the change.
  retireDomainScopedCookies(supabaseResponse, request)

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
