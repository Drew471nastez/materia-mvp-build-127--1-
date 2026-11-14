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
import { robotsTxt, urlsetXml } from "@/lib/seo/indexing"
import { isSiteReadError, siteRead } from "@/lib/website-builder/site-read"
import { within } from "@/lib/onepage/bounded-read"
import { oneMomentHtml } from "@/lib/net/one-moment"
import { deploymentOwnerBanned, type OwnerBanReads } from "@/lib/sites/owner-ban"
import { creatorIsBanned } from "@/lib/seo/bans"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Locked down by default, because this is somebody else's JavaScript.
 *
 * `default-src 'self'` keeps a generated page from calling out to an
 * arbitrary host; the allowances below are what a Storelib site legitimately
 * needs and nothing more.
 *
 * SCRIPTS STAY AT 'self'. This is the directive that matters: a generated
 * page cannot pull executable code from anywhere but its own deployment, so
 * a prompt that talks a model into adding a third-party script tag produces
 * a page that refuses to run it.
 *
 * GOOGLE FONTS ARE ALLOWED, and this was a real defect rather than a
 * nicety. `style-src 'self'` refused fonts.googleapis.com outright — the
 * browser logs "Refused to load the stylesheet" — so every generated site
 * silently lost its typography and rendered in Times New Roman. Confirmed in
 * a real browser against this exact header. Stylesheets and font files carry
 * no script, and these two hosts are where essentially every generated site
 * gets its type.
 *
 * `frame-ancestors 'none'` stops a published site being framed into a
 * clickjacking attack, and `sandbox` is deliberately NOT set: this is a real
 * page on its own origin, not an embedded preview.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https:",
    /**
     * MEDIA AND EMBEDS, and leaving them out was a real defect rather than an
     * oversight in wording.
     *
     * Neither directive was declared, so both fell back to `default-src
     * 'self'` — and a page is not obviously missing a directive it never
     * mentions. The editor preview enforces no policy at all, so a video
     * background, a YouTube embed or a Google Map worked perfectly while
     * building and was silently blank the moment it went live. Confirmed in a
     * real browser against this exact header: an mp4, an mp3 and an iframe
     * embed all refused by `default-src 'self'`.
     *
     * These are the site types Storelib is for — landing pages, funnels,
     * agency sites, portfolios — and an embedded video or booking widget is
     * ordinary content on every one of them.
     *
     * https: only, never http:, so a page cannot quietly downgrade a visitor
     * to an unencrypted request. Framed pages defend themselves with their own
     * frame-ancestors; ours stays 'none' below, so this permits a Storelib site
     * to embed, never to be embedded.
     */
    "media-src 'self' data: blob: https:",
    "frame-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}

/**
 * The 404 carries the same headers as a page that exists.
 *
 * It is HTML served from a site's own origin, so leaving the security headers
 * off made the one response an attacker can always reach — ask for a slug
 * that is not there — the only one with no CSP and no frame-ancestors. A
 * response is not exempt from a policy because it is empty.
 */
function notFound(): NextResponse {
  return new NextResponse(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>Not found</title>" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<style>body{font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;" +
      "min-height:100vh;margin:0;background:#faf9f7;color:#3d3a34}</style>" +
      "<h1>Site not found</h1>",
    {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  )
}

/**
 * "ONE MOMENT", NEVER "NOT FOUND", WHEN THE DATABASE DID NOT ANSWER.
 *
 * A lookup that failed or timed out is not an answer. Turning it into a 404
 * told visitors and crawlers the site was gone, and turning it into the old
 * subdomain's 301 told them it had moved for good. A 503 with Retry-After is
 * the truth: try again shortly. Never cached, and it reloads by itself.
 */
/* A few times, then it stops (lib/net/one-moment.ts). */

function unavailable(req: Request): NextResponse {
  return new NextResponse(oneMomentHtml(new URL(req.url).search), {
    status: 503,
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "5",
    },
  })
}

/** How long one file may take to come out of Storage before the visitor is told to try again. */
const AI_SITE_DOWNLOAD_MS = 8000

/**
 * THE LAST LIVE PREFIX SEEN FOR EACH SLUG, on this instance.
 *
 * A deployment's prefix is immutable (every publish gets its own), so serving
 * the one we last saw while the database is not answering serves exactly the
 * bytes that were live a moment ago. Bounded, oldest out first.
 */
const LAST_GOOD_PREFIX = new Map<string, string>()
const LAST_GOOD_MAX = 2000

function rememberPrefix(slug: string, prefix: string | null) {
  LAST_GOOD_PREFIX.delete(slug)
  if (!prefix) return
  LAST_GOOD_PREFIX.set(slug, prefix)
  if (LAST_GOOD_PREFIX.size > LAST_GOOD_MAX) {
    const oldest = LAST_GOOD_PREFIX.keys().next().value
    if (oldest !== undefined) LAST_GOOD_PREFIX.delete(oldest)
  }
}

/**
 * WHOSE SITE THIS IS, for the ban check (lib/sites/owner-ban.ts). A site never
 * changes owner, so the answer is kept once read, bounded like the prefixes
 * above; the ban itself is held a minute and expired by the ban
 * (lib/seo/bans.ts creatorIsBanned). A read that fails or is slow is "not
 * known", and the site is served as it was.
 */
const SITE_CREATOR = new Map<string, string>()

function ownerReads(admin: ReturnType<typeof createAdminClient>): OwnerBanReads {
  return {
    creatorOfSite: async (siteId) => {
      const held = SITE_CREATOR.get(siteId)
      if (held) return held
      const { data } = await within<{ creator_id?: string | null }>(
        (signal) => admin.from("sites").select("creator_id").eq("id", siteId).abortSignal(signal).maybeSingle(),
        3000,
      )
      const creatorId = typeof data?.creator_id === "string" ? data.creator_id : null
      if (creatorId) {
        SITE_CREATOR.set(siteId, creatorId)
        if (SITE_CREATOR.size > LAST_GOOD_MAX) {
          const oldest = SITE_CREATOR.keys().next().value
          if (oldest !== undefined) SITE_CREATOR.delete(oldest)
        }
      }
      return creatorId
    },
    isBanned: creatorIsBanned,
  }
}

/**
 * A Storage answer that says the object is not there (a 4xx), as opposed to
 * Storage failing or not answering. A download's HTTP error comes back as a
 * StorageUnknownError holding the Response in `originalError` (storage-js
 * reads no JSON body for a download), so its status is looked for there too;
 * a network failure or our own timeout has no status at all.
 */
function isMissingObject(error: unknown): boolean {
  const e = error as { status?: unknown; originalError?: { status?: unknown } } | null
  const status = typeof e?.status === "number" ? e.status : e?.originalError?.status
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429
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

  /**
   * THE SHARED RUNTIME, whichever subdomain asks for it.
   *
   * Every published page's import map points at `/_vendor/react-{version}/`,
   * an absolute path — so the browser requests it from the SITE'S OWN host:
   * andrewrullz.storelib.com/_vendor/react-19.2.0/react.js. The proxy rewrites
   * that to /site/andrewrullz/_vendor/..., which means the slug is the site
   * and `_vendor` is the first path segment.
   *
   * This used to test `slug === "_vendor"`, which only ever matched the
   * path-shaped address the sites domain had before. On a subdomain nothing
   * matched, the runtime was looked for inside the site's own deployment
   * prefix where it has never been, and React 404'd — every published site a
   * blank page. Compiles, typechecks, serves nothing.
   *
   * The prefix is version-stamped and platform-owned, so resolving it ahead
   * of the site's own files cannot shadow anything a creator wrote.
   */
  const wantsVendor = slug === "_vendor" || (path ?? [])[0] === "_vendor"
  let live: LivePrefix | null = null
  if (!wantsVendor) {
    try {
      live = await livePrefix(admin, slug)
    } catch (e) {
      if (!isSiteReadError(e)) throw e
      console.warn("[sites/serve] site unavailable", { slug, why: e.message })
      return unavailable(request)
    }
  }
  /*
    A BANNED CREATOR'S SITE ANSWERS AS NO SITE (round AW, lib/sites/owner-ban.ts):
    the same 404 an unknown address gets, never cached, so lifting the ban
    brings it back within the minute the ban answer is held for.
  */
  if (live?.prefix && (await deploymentOwnerBanned(live.prefix, ownerReads(admin)))) return notFound()
  const objectPath = wantsVendor
    ? slug === "_vendor"
      ? `_vendor/${requested}`
      : requested
    : live?.prefix
      ? `${live.prefix}/${requested || "index.html"}`
      : null

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
    if (!wantsVendor) {
      /* Asked only after the deployment read ANSWERED "none": a failed read never becomes a permanent redirect. */
      let moved: string | null
      try {
        moved = await creatorPathFor(admin, slug)
      } catch (e) {
        if (!isSiteReadError(e)) throw e
        console.warn("[sites/serve] site unavailable", { slug, why: e.message })
        return unavailable(request)
      }
      if (moved) {
        return NextResponse.redirect(`https://${SITES_HOST}/${moved}${requested ? `/${requested}` : ""}`, 301)
      }
    }
    return notFound()
  }

  const { data, error } = await within<Blob>(
    async () => {
      const r = await admin.storage.from(DEPLOYMENT_BUCKET).download(objectPath)
      /* The Storage error itself (its `status` tells a missing object from a failure), never a throw. */
      return { data: r.data, error: r.error ? (r.error as { status?: number; message?: string }) : null }
    },
    AI_SITE_DOWNLOAD_MS,
  )
  if (error || !data) {
    /**
     * STORAGE FAILING IS NOT THE FILE BEING MISSING. A timeout, a 5xx or a
     * dropped connection is a 503 to try again; only Storage answering "no
     * such object" falls through to the robots/sitemap defaults and the 404.
     * Neither is a 404 when the prefix came from the held copy: the database
     * did not confirm it, so "not there" is not known.
     */
    const seoFile = !wantsVendor && (requested === "robots.txt" || requested === "sitemap.xml")
    if (error && (!isMissingObject(error) || (live?.held && !seoFile))) {
      console.warn("[sites/serve] file unavailable", { slug, why: error.message || "storage did not answer" })
      return unavailable(request)
    }
    /**
     * A SITE WITHOUT ITS OWN ROBOTS.TXT OR SITEMAP GETS ONE. Google treats
     * every host as its own site and looks for both at the root; a built
     * site is one page app at its own address, so the sitemap is that
     * address, dated by the live deployment. A site that ships its own
     * files keeps them: this only answers what would have been a 404.
     */
    if (seoFile) {
      const origin = `https://${slug.toLowerCase()}.${SITES_HOST}`
      if (requested === "robots.txt") {
        return new NextResponse(robotsTxt({ sitemaps: [`${origin}/sitemap.xml`] }), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
        })
      }
      /* The date is a nicety: a read that failed or took too long lists the address without one. */
      const { data: dated } = await within<{ created_at?: string }>(
        (signal) =>
          admin
            .from("site_deployments")
            .select("created_at")
            .eq("is_live", true)
            .eq("slug", slug.toLowerCase())
            .abortSignal(signal)
            .maybeSingle(),
        3000,
      )
      return new NextResponse(urlsetXml([{ url: `${origin}/`, lastModified: dated?.created_at ?? null }]), {
        /* Held no longer than the page: a publish changes its date. */
        headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
      })
    }
    return notFound()
  }

  const isHtml = objectPath.endsWith(".html")

  return new NextResponse(await data.arrayBuffer(), {
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": contentTypeFor(objectPath),
      /**
       * THE HTML IS THE ONLY THING THAT MAY GO STALE, AND ONLY BRIEFLY.
       *
       * This was `s-maxage=60, stale-while-revalidate=86400`, which serves the
       * PREVIOUS page for up to twenty-four hours after it expires — and the
       * person most likely to look immediately after a publish is the creator
       * who just pressed the button. A day of "I published and nothing
       * changed" to save an origin hit is the wrong trade for a builder.
       *
       * Ten seconds still absorbs a burst of traffic; the short revalidate
       * window keeps the edge fast without lying about what is current.
       *
       * Everything else really is immutable now — the asset URLs carry the
       * revision they were built from (see publishedDocument), so a new
       * publish produces a new URL rather than new bytes at an old one. Before
       * that, /app.js was a stable path served `immutable` for a year, which
       * browsers honour so completely they will not revalidate it on a hard
       * reload: a creator published new code and every visitor who had ever
       * loaded the site kept running the old bundle.
       */
      "Cache-Control": isHtml
        ? "public, s-maxage=10, stale-while-revalidate=30"
        : "public, max-age=31536000, immutable",
    },
  })
}

/**
 * Does a creator own this name?
 *
 * BOTH WAYS A CREATOR PAGE IS ADDRESSED. `storelib.com/<name>` resolves by
 * `profiles.username` OR by `creators.slug` — see app/(marketing)/
 * [sellername]/page.tsx, which tries the profile first and falls back to the
 * creator slug. Checking only the first would 404 the old subdomain of every
 * creator who is addressed by the second.
 *
 * Reads through the admin client because the visitor is a stranger: RLS would
 * correctly show them nothing, and the answer is a public name anybody can
 * already see in the URL. Nothing else about the creator is read or returned.
 */
async function creatorPathFor(
  admin: ReturnType<typeof createAdminClient>,
  name: string,
): Promise<string | null> {
  /* Bounded and checked: a read that failed THROWS (SiteReadError), so the caller answers 503, never a 301 or a 404. */
  const profile = await siteRead<{ username: string }>("ai site creator name", (signal) =>
    admin
      .from("profiles")
      .select("username")
      .eq("username", name.toLowerCase())
      .abortSignal(signal)
      .maybeSingle(),
  )

  const username = profile?.username
  if (username) return username

  const creator = await siteRead<{ slug: string }>("ai site creator slug", (signal) =>
    admin
      .from("creators")
      .select("slug")
      .eq("slug", name.toLowerCase())
      .abortSignal(signal)
      .maybeSingle(),
  )

  return creator?.slug ?? null
}

type LivePrefix = { prefix: string | null; held: boolean }

/**
 * The live deployment's prefix, or null when the database ANSWERED that there
 * is none. A read that failed or did not answer within siteRead's limits
 * serves the last prefix this instance saw for the slug, and with none held
 * it THROWS a SiteReadError (the route answers 503).
 */
async function livePrefix(
  admin: ReturnType<typeof createAdminClient>,
  slug: string,
): Promise<LivePrefix> {
  /**
   * `eq` on a lowercased slug, not `ilike`.
   *
   * ILIKE cannot use an index, so this was a sequential scan of every
   * deployment on the platform on every cache miss — 9.25ms across 20,000
   * sites, measured, growing with the table. Slugs are written lowercase at
   * the source, so an exact match is the same question asked in a form the
   * index in 20260913 can answer: 0.05ms.
   */
  const key = slug.toLowerCase()
  try {
    const data = await siteRead<{ storage_prefix: string | null }>("ai site", (signal) =>
      admin
        .from("site_deployments")
        .select("storage_prefix")
        .eq("is_live", true)
        .eq("slug", slug.toLowerCase())
        .abortSignal(signal)
        .maybeSingle(),
    )
    const prefix = data?.storage_prefix ?? null
    rememberPrefix(key, prefix)
    return { prefix, held: false }
  } catch (e) {
    const held = LAST_GOOD_PREFIX.get(key)
    if (held && isSiteReadError(e)) {
      console.warn("[sites/serve] served the last good copy", { slug: key, why: e.message })
      return { prefix: held, held: true }
    }
    throw e
  }
}
