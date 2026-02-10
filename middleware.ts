import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

// Domains/paths that should never be treated as custom domains
const EXCLUDED_HOSTS = [
  MAIN_DOMAIN,
  `www.${MAIN_DOMAIN}`,
  `app.${MAIN_DOMAIN}`,
  `api.${MAIN_DOMAIN}`,
  `admin.${MAIN_DOMAIN}`,
  "localhost",
  "127.0.0.1",
]

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""
  const hostWithoutPort = host.split(":")[0]
  const pathname = request.nextUrl.pathname

  // Skip API routes, static files, and internal Next.js routes
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next()
  }

  // Skip if it's a storelib.com subdomain (handled by Vercel rewrites)
  if (hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)) {
    return NextResponse.next()
  }

  // Skip if it's the main domain or excluded host
  if (EXCLUDED_HOSTS.some((h) => hostWithoutPort === h)) {
    return NextResponse.next()
  }

  // This is potentially a custom domain - look it up
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.next()
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id, domain, status")
      .eq("domain", hostWithoutPort)
      .eq("status", "active")
      .single()

    if (!domainRecord) {
      // Not a known custom domain, pass through
      return NextResponse.next()
    }

    // Get the creator's username for routing
    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) {
      return NextResponse.next()
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    if (!profile?.username) {
      return NextResponse.next()
    }

    // Rewrite the URL to the appropriate internal route
    const url = request.nextUrl.clone()

    if (pathname === "/links" || pathname === "/links/") {
      // Custom domain /links → OnePage
      url.pathname = `/l/${profile.username}`
    } else if (pathname.startsWith("/p/")) {
      // Custom domain /p/product-slug → Product page (keep as is, subdomain routing handles it)
      url.pathname = pathname
    } else if (pathname === "/" || pathname === "") {
      // Custom domain root → Store page
      url.pathname = `/u/${profile.username}`
    } else {
      // Any other path on custom domain → pass through to store subdomain routing
      url.pathname = `/u/${profile.username}${pathname}`
    }

    // Add custom domain header so pages know they're on a custom domain
    const response = NextResponse.rewrite(url)
    response.headers.set("x-custom-domain", hostWithoutPort)
    response.headers.set("x-creator-username", profile.username)
    return response
  } catch (error) {
    console.error("Custom domain middleware error:", error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - Public files with extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
}
