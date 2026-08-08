import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { cookieDomainFor, cookieSecureFor, isNativeUserAgent } from "@/lib/supabase/cookie-domain"

// Main domain - customize this based on environment
const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

// Domains that should NOT be treated as seller subdomains
const EXCLUDED_SUBDOMAINS = ["www", "app", "api", "admin", "dashboard", "localhost"]

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

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host") || ""

  // The native app opens to the marketplace feed at "/" (Depop/Vinted-style).
  // Cold start still loads /native-start via the Capacitor server.url to resolve
  // the session, then redirects here. We intentionally DON'T bounce "/" back to
  // /native-start anymore — that would loop now that /native-start lands on "/".

  // Extract username from subdomain
  let username = extractUsernameFromHost(host)
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

    if (pathname === "/links" || pathname === "/links/") {
      // username.storelib.com/links -> /l/{username}
      // The username is passed as the slug parameter
      rewritePath = `/l/${username}`
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

  /**
   * ─────────────────────────────────────────────────────────────────────────
   *  NATIVE OWNS ITS OWN SESSION — do not refresh it here
   * ─────────────────────────────────────────────────────────────────────────
   * This is one half of the random-logout fix, and it needs the mechanism
   * spelled out because the symptom looks like anything but this.
   *
   * Supabase ROTATES refresh tokens: every successful refresh issues a new one
   * and invalidates the one that was used. So exactly one thing in the system
   * may hold and refresh a given session.
   *
   * On native there were two. The Capacitor client keeps the session in
   * Preferences (it has to — that is what survives the Chrome Custom Tab round
   * trip and holds the PKCE verifier), and /auth/sync-session copies it into
   * cookies ONCE at sign-in so server code can see who is calling. From then on
   * both copies refreshed independently against the same project, and whichever
   * went second was using a token the other had already invalidated. supabase-js
   * treats "Invalid Refresh Token: Already Used" as terminal — SIGNED_OUT,
   * session wiped. No bad network needed, no expiry: only time. That is
   * "randomly it just logs me out of the iOS app".
   *
   * capacitor.config.ts appends "Capacitor" to the native User-Agent, so this
   * is a check rather than a guess. The cookie copy is now a MIRROR, rewritten
   * by the client after every refresh through POST /api/auth/session-sync — so
   * it stays fresh without anything here ever touching it.
   *
   * The route guards below then have no locally-read user, which is handled the
   * way an unreadable session already was: let the request through and let the
   * layout decide. That is not a hole — app/app/layout.tsx and
   * app/dashboard/layout.tsx both re-verify with getUser() before rendering
   * anything, and the comments below are explicit that the check here is a
   * cheap first pass and never the authority.
   */
  const isNative = isNativeUserAgent(request.headers.get("user-agent"))

  // The cookie domain, from the one shared rule — see lib/supabase/cookie-domain.ts.
  //
  // This used to be `.${MAIN_DOMAIN}` for every non-localhost request, which is
  // wrong on any host that is not storelib.com: a browser silently DISCARDS a
  // Set-Cookie naming a domain it is not on. On a seller's custom domain that
  // meant a refresh rotated the token at Supabase and the replacement was
  // thrown away by the browser — leaving the old, now-dead refresh token in
  // place, to fail at some unpredictable point later. Host-aware, it matches
  // what the browser and server clients write, so there is one cookie on one
  // domain rather than two that take turns being stale.
  const cookieDomain = cookieDomainFor(host)
  const cookieSecure = cookieSecureFor(host)

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
            // `.storelib.com` on storelib hosts so subdomains share the session,
            // and UNDEFINED anywhere else so the browser accepts the cookie at
            // all. See the note above cookieDomain.
            domain: cookieDomain,
            secure: cookieSecure,
            // Allow cookies to be sent with same-site requests
            sameSite: "lax",
          })
        })
      },
    },
  })

  // This runs on every request the matcher accepts — every page and every one
  // of the API routes. getUser() would make that a guaranteed round trip to the
  // Supabase Auth server per request, which is the single largest consumer of
  // the project's auth rate limit; getSession() reads the JWT from the cookies
  // we were just handed and only reaches the network when the token is genuinely
  // near expiry, which is the refresh this middleware exists to perform. The
  // refresh — and therefore the Set-Cookie it produces — still happens exactly
  // as before, it just stops happening on requests that never needed one.
  //
  // On native this call is SKIPPED entirely — see the block above. getSession()
  // is what performs the refresh, so calling it here is what invalidated the
  // Capacitor client's token.
  const { data: sessionData, error: sessionError } = isNative
    ? { data: { session: null }, error: null as any }
    : await supabase.auth.getSession()
  const user = sessionData.session?.user ?? null

  // An error here means the session could not be read — a refresh that hit a
  // rate limit, a network fault — which is emphatically not the same as being
  // signed out. Redirecting on it would sign out every user holding a valid
  // session the moment Supabase started returning 429s. Let the request through
  // and let the layout below decide: /app and /dashboard both re-verify with
  // getUser() server-side, so nothing is actually reachable on a bad session.
  //
  // Native counts as unreadable BY DESIGN, not by failure: we deliberately did
  // not read it, so we must not conclude anything from the absence. Both guards
  // below then fall through to the layouts, which re-verify properly.
  const sessionUnreadable = !!sessionError || isNative

  // Protect creator dashboard routes. The check is a cheap first pass over the
  // cookie, not the authority — app/app/layout.tsx re-verifies against the auth
  // server before rendering anything — so a locally-read session is enough to
  // decide whether it is worth routing there at all.
  if (request.nextUrl.pathname.startsWith("/app") && !user && !sessionUnreadable) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Protect customer dashboard routes. Same reasoning: app/dashboard/layout.tsx
  // performs the verified check that actually gates the content.
  if (request.nextUrl.pathname.startsWith("/dashboard") && !user && !sessionUnreadable) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // ── Stripe frame CSP (Capacitor WKWebView only) ─────────────────────────────
  //
  // THIS HEADER USED TO BE THE BUG IT WAS WRITTEN TO PREVENT.
  //
  // It tried to allow only certain Stripe iframes by path, like this:
  //
  //     frame-src https://js.stripe.com/v3/elements-*
  //
  // A `*` in the PATH of a CSP source is not a wildcard. CSP only wildcards the
  // host (`https://*.stripe.com`); in a path it is an ordinary character, and
  // the matching rule is: a source ending in "/" is a path PREFIX, anything
  // else is an EXACT match. So that line permitted exactly one URL — a file
  // literally named "elements-*" — and therefore permitted nothing at all.
  //
  // Every Stripe iframe was blocked. Not just the controller: the card number,
  // expiry and CVC fields are `elements-inner-card-*` frames, so they could
  // never have rendered either.
  //
  // And blocking the controller is what CAUSED the ejection. Stripe.js needs
  // that frame to hold its shared state; with no way to create it, it falls
  // back to handing the whole page off to Stripe — which is precisely the
  //
  //     js.stripe.com/v3/m-outer-<hash>.html#url=…&referrer=…
  //
  // top-level navigation people were being thrown out of the app by. The
  // header meant to keep the checkout inline was the reason it left.
  //
  // So: allow Stripe's frame hosts properly, and let Stripe.js have the frames
  // it needs so it never reaches for the fallback. What is NOT wanted — the
  // advanced-fraud-signals frame — is turned off where it is actually
  // configurable, in lib/stripe-client.ts, and stripe-nav-guard.ts remains as
  // the JS-level net for genuine top-level navigation attempts.
  //
  //   js.stripe.com     Elements, the controller, Link, 3DS challenge frames
  //   hooks.stripe.com  3DS redirect-return host
  //   m.stripe.network  named so a blocked frame cannot trigger the fallback;
  //                     it is not requested at all with fraud signals off
  if ((request.headers.get("user-agent") || "").includes("Capacitor")) {
    supabaseResponse.headers.set(
      "Content-Security-Policy",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network",
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
