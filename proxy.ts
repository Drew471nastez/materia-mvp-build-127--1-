import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

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
            // Set domain to root domain for subdomain sharing (e.g., .storelib.com)
            domain: isLocalhost ? undefined : `.${MAIN_DOMAIN}`,
            // Ensure secure in production
            secure: !isLocalhost,
            // Allow cookies to be sent with same-site requests
            sameSite: "lax",
          })
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect creator dashboard routes
  if (request.nextUrl.pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Protect customer dashboard routes
  if (request.nextUrl.pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
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

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
