/**
 * Serving a published site.
 *
 * ---------------------------------------------------------------------------
 *  STATIC AT THE EDGE, NOT RENDERED PER REQUEST
 * ---------------------------------------------------------------------------
 * This function runs once per cache miss and then does not run again: the
 * response carries `s-maxage` and the CDN answers everybody else. It never
 * queries a site's data, never renders a component, and never touches the
 * dashboard's session. 4,000 sites cost one bucket and one lookup per miss.
 *
 * The one database read is slug → live deployment, and it uses the admin
 * client because the visitor is a stranger with no session — RLS would
 * correctly show them nothing. The filter that makes this safe is
 * `is_live`, and it is the only thing this route will serve.
 */

import { type NextRequest, NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { SITES_HOST } from "@/lib/sites/public-host"
import { contentTypeFor } from "@/lib/sites/content-type"
import { DEPLOYMENT_BUCKET } from "@/lib/sites/publish"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Locked down by default, because this is somebody else's JavaScript.
 *
 * `default-src 'self'` keeps a generated page from calling out to an
 * arbitrary host; the two explicit allowances are what a Storelib site
 * legitimately needs — its own bundle, and images the creator uploaded.
 * `frame-ancestors 'none'` stops a published site being framed into a
 * clickjacking attack, and `sandbox` is deliberately NOT set: this is a real
 * page on its own origin, not an embedded preview.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

function notFound(): NextResponse {
  return new NextResponse("<!doctype html><title>Not found</title><h1>Site not found</h1>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> },
) {
  /**
   * ONLY on the sites domain.
   *
   * The proxy rewrites storelib.site/<slug> to this path, and a rewrite is
   * invisible to the browser — but the path is not secret, and nothing stopped
   * anybody typing storelib.com/site/andrew and being served a generated page
   * ON THE DASHBOARD ORIGIN. That is the entire domain-separation argument
   * defeated by a URL, which is worse than never having made it: the isolation
   * would have looked present in the design and been absent in fact.
   *
   * Checked here rather than only in the proxy because this is the thing being
   * protected. A route that is safe only because something upstream is
   * configured correctly is one config change from unsafe.
   */
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase()

  /**
   * A SUBDOMAIN, and never the apex.
   *
   * `host.endsWith(".storelib.com")` is true for andrewrullz.storelib.com and
   * false for storelib.com, which is the whole distinction: the apex is the
   * dashboard, and serving a generated page there would put somebody else's
   * JavaScript on the origin that holds the session. Comparing against the
   * apex as well — the shape this guard had when sites lived on their own
   * domain — would now match storelib.com itself and hand out exactly that.
   */
  const onSiteSubdomain =
    host.endsWith(`.${SITES_HOST}`) && host.slice(0, -(SITES_HOST.length + 1)).split(".").length === 1
  // localhost keeps working in development, where there are no subdomains
  // and no dashboard session worth stealing.
  const isLocal = host === "localhost" || host.endsWith(".localhost") || host.startsWith("127.")
  if (!onSiteSubdomain && !isLocal) return notFound()

  const { slug, path } = await context.params
  const admin = createAdminClient()

  /**
   * The shared React runtime, which every site's import map points at. It
   * lives outside any one deployment because it is the same bytes for the
   * whole platform, so it is resolved before the slug lookup.
   */
  const requested = (path ?? []).join("/")
  const isVendor = slug === "_vendor"
  const objectPath = isVendor
    ? `_vendor/${requested}`
    : await livePrefix(admin, slug).then((prefix) => (prefix ? `${prefix}/${requested || "index.html"}` : null))

  if (!objectPath) {
    /**
     * No site here — but this address used to mean something.
     *
     * <name>.storelib.com was the creator storefront before AI-built sites
     * took the subdomains. Those links are in bios, posts and search results,
     * and answering them with "Site not found" would break every one of them
     * for a change that has nothing to do with the person clicking. A creator
     * with this username gets a permanent redirect to where their page lives
     * now; only a name belonging to nobody is a 404.
     */
    if (!isVendor) {
      const moved = await creatorPathFor(admin, slug)
      if (moved) {
        return NextResponse.redirect(`https://${SITES_HOST}/${moved}${requested ? `/${requested}` : ""}`, 301)
      }
    }
    return notFound()
  }

  const { data, error } = await admin.storage.from(DEPLOYMENT_BUCKET).download(objectPath)
  if (error || !data) return notFound()

  const isHtml = objectPath.endsWith(".html")

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": contentTypeFor(objectPath),
      /**
       * HTML is revalidated often so a publish appears quickly; everything
       * else lives under an immutable, deployment-scoped prefix and can be
       * cached for a year. `stale-while-revalidate` means even the HTML miss
       * is served instantly from the edge while the new copy is fetched.
       */
      "Cache-Control": isHtml
        ? "public, s-maxage=60, stale-while-revalidate=86400"
        : "public, max-age=31536000, immutable",
    },
  })
}

/**
 * Does a creator own this name?
 *
 * Reads through the admin client because the visitor is a stranger: RLS would
 * correctly show them nothing, and the answer here is a public username that
 * anybody can already see at storelib.com/<name>. Nothing else about the
 * creator is read or returned.
 */
async function creatorPathFor(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("username")
    .ilike("username", name)
    .maybeSingle()

  return (data as { username: string } | null)?.username ?? null
}

async function livePrefix(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<string | null> {
  const { data } = await admin
    .from("site_deployments")
    .select("storage_prefix")
    .eq("is_live", true)
    .ilike("slug", slug)
    .maybeSingle()
  return (data as { storage_prefix: string | null } | null)?.storage_prefix ?? null
}
