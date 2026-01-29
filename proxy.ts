import { createServerClient } from "@supabase/ssr"
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
    // Could be a custom domain - for now, return null
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

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host") || ""

  // Extract username from subdomain
  const username = extractUsernameFromHost(host)

  // Handle subdomain routing
  let supabaseResponse: NextResponse

  // If we have a username subdomain and it's not a reserved path
  if (username && !isReservedPath(pathname)) {
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

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
