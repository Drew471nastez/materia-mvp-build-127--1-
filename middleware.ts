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
    // In the future, you could look up custom domains in the database
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

  // Could have nested subdomains (e.g., a.b.storelib.com)
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host") || ""

  // Extract username from subdomain
  const username = extractUsernameFromHost(host)

  // If we have a username subdomain and it's not a reserved path
  if (username && !isReservedPath(pathname)) {
    // Rewrite URLs:
    // - /links -> /l/{username} (seller onepage)
    // - / -> /u/{username} (seller store homepage)
    // - /p/{slug} -> /p/{slug} (product pages stay the same)
    // - Other paths -> /u/{username}{path} (could be extended later)

    let rewritePath: string

    if (pathname === "/links" || pathname === "/links/") {
      // username.storelib.com/links -> /l/{username}
      rewritePath = `/l/${username}`
    } else if (pathname === "/" || pathname === "") {
      // username.storelib.com -> /u/{username}
      rewritePath = `/u/${username}`
    } else if (pathname.startsWith("/p/")) {
      // Product pages stay as-is: username.storelib.com/p/product-slug -> /p/product-slug
      rewritePath = pathname
    } else {
      // For any other paths on subdomain, redirect to main store page
      // This prevents invalid paths like username.storelib.com/random
      rewritePath = `/u/${username}`
    }

    // Create rewrite URL
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = rewritePath

    // Preserve query parameters
    if (search) {
      rewriteUrl.search = search
    }

    // Add header to indicate this is a subdomain request (useful for components)
    const response = NextResponse.rewrite(rewriteUrl)
    response.headers.set("x-seller-subdomain", username)

    // Continue with Supabase session handling
    return await handleSupabaseSession(request, response)
  }

  // No subdomain - continue with normal processing
  return await handleSupabaseSession(request)
}

/**
 * Handle Supabase session (authentication)
 */
async function handleSupabaseSession(request: NextRequest, existingResponse?: NextResponse) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, just pass through the request
  if (!supabaseUrl || !supabaseAnonKey) {
    return existingResponse || NextResponse.next({ request })
  }

  let supabaseResponse = existingResponse || NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = existingResponse
          ? existingResponse
          : NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protect creator dashboard routes
  if (pathname.startsWith("/app") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Protect customer dashboard routes
  if (pathname.startsWith("/dashboard") && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
