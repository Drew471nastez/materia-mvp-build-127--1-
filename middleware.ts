import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Resolve a custom domain to the creator's username in one Supabase REST call.
 * Uses nested resource embedding (custom_domains → creators → profiles).
 * Edge-runtime compatible — no Node.js modules, pure fetch.
 */
async function resolveCustomDomain(domain: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null

  try {
    // Single query: custom_domains → creators → profiles via FK embedding
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/custom_domains` +
        `?domain=eq.${encodeURIComponent(domain)}` +
        `&status=in.(active,ssl_provisioning)` +
        `&select=creator_id,creators!creator_id(user_id,profiles!user_id(username))` +
        `&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        cache: "no-store",
      }
    )

    if (!res.ok) return null

    const data: any[] = await res.json()
    if (!data?.length) return null

    // Navigate the nested join result
    const username =
      data[0]?.creators?.profiles?.username ??
      data[0]?.creators?.[0]?.profiles?.username ??
      data[0]?.creators?.[0]?.profiles?.[0]?.username ??
      null

    return username || null
  } catch {
    return null
  }
}

/**
 * Fallback resolver: three separate queries if nested join isn't supported.
 * Used when the single-query approach returns no username (schema variation).
 */
async function resolveCustomDomainFallback(domain: string): Promise<string | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null

  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  }

  try {
    const domainRes = await fetch(
      `${SUPABASE_URL}/rest/v1/custom_domains?domain=eq.${encodeURIComponent(domain)}&status=in.(active,ssl_provisioning)&select=creator_id&limit=1`,
      { headers, cache: "no-store" }
    )
    if (!domainRes.ok) return null
    const domainData: any[] = await domainRes.json()
    if (!domainData?.length) return null
    const creatorId = domainData[0].creator_id

    const creatorRes = await fetch(
      `${SUPABASE_URL}/rest/v1/creators?id=eq.${encodeURIComponent(creatorId)}&select=user_id&limit=1`,
      { headers, cache: "no-store" }
    )
    if (!creatorRes.ok) return null
    const creatorData: any[] = await creatorRes.json()
    if (!creatorData?.length) return null
    const userId = creatorData[0].user_id

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=username&limit=1`,
      { headers, cache: "no-store" }
    )
    if (!profileRes.ok) return null
    const profileData: any[] = await profileRes.json()
    return profileData?.[0]?.username || null
  } catch {
    return null
  }
}

/**
 * Check domain_redirects for a 301/302 redirect target.
 * Used for domains that were removed/changed — grace-period redirects.
 */
async function getDomainRedirect(
  domain: string
): Promise<{ redirectTo: string; httpCode: number } | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/domain_redirects?domain=eq.${encodeURIComponent(domain)}&select=redirect_to,http_code&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        cache: "no-store",
      }
    )
    if (!res.ok) return null
    const data: any[] = await res.json()
    if (!data?.length) return null
    return { redirectTo: data[0].redirect_to, httpCode: data[0].http_code || 301 }
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""
  // Normalize: strip port and www prefix for lookups
  const hostname = host.split(":")[0].toLowerCase().replace(/^www\./, "")

  // ── Skip storelib.com and all its subdomains (seller subdomains, app, www…) ──
  if (hostname === MAIN_DOMAIN || hostname.endsWith(`.${MAIN_DOMAIN}`)) {
    return NextResponse.next()
  }

  // ── Skip localhost / development ──
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return NextResponse.next()
  }

  // ── This is a custom domain request ──
  const pathname = request.nextUrl.pathname

  // Skip paths that never need domain-based rewriting
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot|webp|avif|mp4|webm|json|xml|txt)$/.test(
      pathname
    )
  ) {
    return NextResponse.next()
  }

  // ── 1. Check for grace-period redirect (removed/changed domain) ──
  const redirect = await getDomainRedirect(hostname)
  if (redirect) {
    let target = redirect.redirectTo
    // Preserve the original path in the redirect target
    if (pathname && pathname !== "/") {
      try {
        const targetUrl = new URL(target)
        targetUrl.pathname = pathname
        if (request.nextUrl.search) {
          targetUrl.search = request.nextUrl.search
        }
        target = targetUrl.toString()
      } catch {
        // Keep original target if URL construction fails
      }
    }
    return NextResponse.redirect(target, { status: redirect.httpCode })
  }

  // ── 2. Resolve custom domain → username ──
  let username = await resolveCustomDomain(hostname)

  // If nested join returned no username, fall back to three separate queries
  if (!username) {
    username = await resolveCustomDomainFallback(hostname)
  }

  if (!username) {
    // Domain not in our system — let Vercel serve a 404
    return NextResponse.next()
  }

  // ── 3. Rewrite to the correct internal route ──
  const url = request.nextUrl.clone()

  if (pathname === "/" || pathname === "") {
    // Root → seller's store
    url.pathname = `/u/${username}`
  } else if (pathname === "/links" || pathname === "/links/") {
    // /links → seller's OnePage
    url.pathname = `/l/${username}`
  } else if (pathname.startsWith("/p/")) {
    // Product pages — slug is globally unique, path stays the same
    // (no rewrite needed, already routed correctly by Next.js)
  } else {
    // Any unrecognised path on a custom domain → fall back to store root
    url.pathname = `/u/${username}`
  }

  // Attach metadata headers so page components know the custom domain context
  const response = NextResponse.rewrite(url)
  response.headers.set("x-custom-domain", hostname)
  response.headers.set("x-resolved-username", username)
  return response
}

export const config = {
  matcher: [
    /*
     * Run on all paths except:
     * - _next/static  (static assets)
     * - _next/image   (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
}
