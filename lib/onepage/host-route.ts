/**
 * ===========================================================================
 *  WHAT THE PROXY DOES WITH A ONEPAGE ADDRESS, DECIDED WITHOUT A REQUEST
 * ===========================================================================
 * proxy.ts asks `onePageRoute` first, with the host, the path, the query and
 * the method, and does exactly what it answers. Pure, so every case below is
 * pinned by tests/onepage-host.test.ts without a server.
 *
 * ON storelib.me (the exact host, never a look-alike):
 *
 *   /{name}                  the OnePage, rewritten to /{name}/links, the
 *                            route that has always rendered it
 *   /{Name}                  308 to /{name}: one spelling per page
 *   /{name}/, /{name}/links  308 to /{name}
 *   /{name}.links, /l/{name}
 *   /                        307 to storelib.com: the host has no page of
 *                            its own (temporary, so a page for it later
 *                            is not fighting a cached redirect)
 *   /robots.txt              its own, naming its own sitemap
 *   /sitemap.xml             its own index of OnePage sitemaps
 *   /sitemap/onepages-N-of-M.xml  one file of it
 *   /api/...                 ONLY the calls a public OnePage makes, with the
 *                            method it makes them with; every other API is a
 *                            404 here, so the session, the dashboard and the
 *                            admin cannot be reached through this host
 *   /_next/..., fonts, media  as they are
 *   /__canvas/{installId}    GET only: the builder's canvas shell
 *                            (lib/website-builder/canvas-origin.ts), served
 *                            by its route, which answers 404 unless the
 *                            canvas origin is configured to be this host and
 *                            the install's draft pass is given
 *   /app, /admin, /login,    308 to the same path on storelib.com: a
 *   /checkout, any platform  platform page is served where the session
 *   word                     lives, never on this host
 *   anything else            404 (a small page, noindex)
 *
 *   www.storelib.me/...      308 to storelib.me/..., should that host ever
 *                            be attached
 *
 * ON storelib.com (the old addresses, 308 so search engines move what they
 * know, the query carried through so utm and ref survive):
 *
 *   /{name}/links, /{name}.links, /l/{name}   308 to storelib.me/{name}
 *   {name}.storelib.com/links                 308 to storelib.me/{name}
 *
 * Where the name has moved (a renamed account or page) or has no OnePage
 * at all (a creator who never made one), proxy.ts turns that 308 into the
 * final address before answering: storelib.me/{current name}, or a 307 to
 * the creator page storelib.com/{username}. The redirects below carry the
 * name as `onePage` for that; lib/onepage/resolve-address decides.
 *
 * A name is redirected only when isResolvableOnePageName says it is one, so
 * nothing a visitor types in the path can steer where the redirect goes: the
 * host is always ours, and the path is a name that passed the check.
 *
 * THE NATIVE APP STAYS WHERE IT IS. It loads storelib.com, and a hop to
 * another origin drops the session it keeps there, so a request from the
 * app keeps being served at /{name}/links on storelib.com.
 */
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { getOnePageDomain } from "@/lib/onepage/address"
import { isResolvableOnePageName } from "@/lib/onepage/username"
import { CANVAS_FRAME_PATH, CANVAS_FRAME_ROUTE, CANVAS_INSTALL_ID } from "@/lib/website-builder/canvas-origin"

export type OnePageRoute =
  /** Leave the request alone. */
  | { kind: "next" }
  /** Serve this internal path instead (query included); the address bar does not change. */
  | { kind: "rewrite"; path: string }
  /**
   * Send the browser here. `onePage` is set on an OLD OnePage address: the
   * name it was for, which proxy.ts resolves (lib/onepage/resolve-address) so
   * a renamed page or a creator with no OnePage goes to the final address in
   * one hop. Without an answer from the database, `location` stands.
   */
  | { kind: "redirect"; location: string; status: 301 | 307 | 308; onePage?: string }
  /** Answer robots.txt for the OnePage host. */
  | { kind: "robots"; body: string }
  /** Nothing here: a page 404 (rewritten to `path`, which renders the page's own not found) or an API 404. */
  | { kind: "not-found"; api: boolean; path: string }

export interface OnePageRouteInput {
  /** The Host header, as sent. */
  host: string
  /** The path as the browser asked for it (still percent encoded). */
  pathname: string
  /** The query with its `?`, or "". */
  search: string
  method?: string
  userAgent?: string | null
  /** storelib.com unless configured. */
  mainDomain: string
  /** The host published sites live under (<name>.storelib.com); the main domain unless configured. */
  sitesDomain?: string
  /** Subdomains that are the platform's own (www, app, api...), never a creator's. */
  platformSubdomains?: readonly string[]
}

/**
 * The API calls a published OnePage makes from its own page, and the method
 * each is made with (components/onepage/public-onepage.tsx). Nothing else
 * under /api answers on the OnePage host.
 */
export const ONEPAGE_HOST_API: readonly { path: RegExp; methods: readonly string[] }[] = [
  /* A view or a click on a block. */
  { path: /^\/api\/onepage\/track\/?$/, methods: ["POST"] },
  /* A members only Discord block asking whether this visitor owns its product (lib/community-roles): Join or Buy. */
  { path: /^\/api\/community-roles\/options\/?$/, methods: ["GET"] },
  /* The page's view in Analytics, and a step towards a sale (components/analytics/track-view, lib/analytics/page-tracker). */
  { path: /^\/api\/track-view\/?$/, methods: ["POST"] },
  { path: /^\/api\/track-event\/?$/, methods: ["POST"] },
  /* A lead form block. */
  { path: /^\/api\/onepage\/leads\/?$/, methods: ["POST"] },
  /* The subscribe bell. */
  { path: /^\/api\/subscribe\/?$/, methods: ["POST"] },
  /* A free product claimed in place. */
  { path: /^\/api\/checkout\/quick-free\/?$/, methods: ["POST"] },
  /* Its download, by the receipt token the claim returned. */
  { path: /^\/api\/download\/[A-Za-z0-9-]{1,64}\/?$/, methods: ["GET", "HEAD"] },
  /* The creator arriving from the app, so their own visits are not counted here (lib/analytics/own-marker). */
  { path: /^\/api\/analytics\/own\/?$/, methods: ["GET"] },
  /* Storelib's own speed, measured on the OnePage (lib/perf/config.ts BEACON_PATH): no visitor data. */
  { path: /^\/api\/public\/m\/?$/, methods: ["POST"] },
  /*
    The store's Google Analytics tag saying Google took a hit (lib/store/ga.ts gaSeenJs), which Settings › Integrations
    shows as "Receiving data". A public beacon with the creator and the ID only. Off this list it was a 404 on
    storelib.me, so a store whose visits come through its OnePage never saw Google Analytics as receiving.
  */
  { path: /^\/api\/store\/ga-seen\/?$/, methods: ["POST"] },
  /*
    The product sheet and Instant checkout (components/onepage/product-sheet.tsx,
    components/checkout/instant-checkout.tsx): a published product's public
    facts, a code checked, and the purchase through the same routes the
    checkout page uses. They answer a guest: no session lives on this host, so
    nothing here reaches an account. Left off this list, every one of them was
    a 404 on storelib.me, and the sheet and the window said "Not found".
  */
  { path: /^\/api\/onepage\/product\/?$/, methods: ["GET"] },
  { path: /^\/api\/coupons\/validate\/?$/, methods: ["POST"] },
  { path: /^\/api\/checkout\/stripe-session\/?$/, methods: ["POST"] },
  { path: /^\/api\/checkout\/confirm-payment\/?$/, methods: ["POST"] },
  { path: /^\/api\/checkout\/process\/?$/, methods: ["POST"] },
  /* The contact form block (lib/website-builder/contact-client.ts). */
  { path: /^\/api\/website-builder\/contact\/?$/, methods: ["POST"] },
  /*
    THE BLOCKS A VISITOR ANSWERS ON THE LIVE PAGE. A poll (its tally and a
    vote, components/onepage/data-blocks.tsx), an event's RSVP, a paid block
    asking whether this browser bought it, a tip and its confirmation
    (components/onepage/tip-block.tsx, whose route already sends Stripe back
    to storelib.me), and a lead magnet's download or code
    (components/onepage/storelib-blocks.tsx). Each is a guest route that reads
    no session, so none of them reaches an account from this host. Left off
    this list they answered 404 here: every one worked in the editor's
    preview on storelib.com and failed on the page visitors actually see.
  */
  { path: /^\/api\/onepage\/poll\/?$/, methods: ["GET", "POST"] },
  { path: /^\/api\/onepage\/rsvp\/?$/, methods: ["POST"] },
  { path: /^\/api\/onepage\/access\/?$/, methods: ["POST"] },
  { path: /^\/api\/onepage\/tip\/?$/, methods: ["POST"] },
  { path: /^\/api\/onepage\/email-capture\/?$/, methods: ["POST"] },
  { path: /^\/api\/onepage\/lead-magnet\/?$/, methods: ["POST"] },
  /*
    The platform's switches (lib/platform/use-flags.ts), which the root layout's
    header asks for on every page, the OnePage included: a 404 on every view of
    storelib.me (round 11). The same answer for everybody, asked without
    cookies: nothing about an account.
  */
  { path: /^\/api\/platform\/flags\/?$/, methods: ["GET"] },
]

/** Files a OnePage's markup may ask the host for directly: fonts, media, icons. */
const ASSET = /\.(?:ico|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|m4a)$/i

/** A picture in public/images: one or more plain segments and an image extension, nothing that could be a route. */
const PUBLIC_IMAGE = /^\/images\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:webp|png|jpe?g|gif|svg|avif)$/i

/** Where a request that has nothing on the OnePage host is rendered: the page's own not found (see app/(marketing)/l/[slug]). */
export const ONEPAGE_MISSING_PATH = "/l/-"

/** robots.txt for the OnePage host. The pages are open; the calls are not pages. */
export function onePageRobots(domain = getOnePageDomain()): string {
  return ["User-agent: *", "Allow: /", "Disallow: /api/", "", `Sitemap: https://${domain}/sitemap.xml`, ""].join("\n")
}

/** Is this User-Agent the Storelib app's own WebView? */
export function isNativeAppAgent(userAgent: string | null | undefined): boolean {
  return /Capacitor|StorelibApp/.test(userAgent || "")
}

function bareHostOf(host: string): string {
  return host.split(":")[0].trim().toLowerCase().replace(/\.$/, "")
}

/** A path segment as a name, or null when it cannot be one. Percent escapes are read; a name never contains one. */
function nameOf(segment: string | undefined): string | null {
  if (!segment) return null
  let s: string
  try {
    s = decodeURIComponent(segment)
  } catch {
    return null
  }
  return isResolvableOnePageName(s) ? s : null
}

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean)
}

/**
 * The decision for one request, or null when this request is not about a
 * OnePage at all (every other host and path, which the proxy handles as it
 * always has).
 */
export function onePageRoute(input: OnePageRouteInput): OnePageRoute | null {
  const host = bareHostOf(input.host)
  const domain = getOnePageDomain()
  const main = input.mainDomain.toLowerCase()
  const search = input.search || ""
  const method = (input.method || "GET").toUpperCase()
  const toMe = (name: string) => ({ kind: "redirect" as const, location: `https://${domain}/${name.toLowerCase()}${search}`, status: 308 as const, onePage: name })

  /* ── www.storelib.me: the name without www is the address ───────────── */
  if (host === `www.${domain}`) {
    return { kind: "redirect", location: `https://${domain}${input.pathname}${search}`, status: 308 }
  }

  /* ── storelib.me ────────────────────────────────────────────────────── */
  if (host === domain) return onTheOnePageHost(input.pathname, search, method, main, domain)

  const native = isNativeAppAgent(input.userAgent)

  /* ── {name}.storelib.com/links: the address the Share card once gave out ── */
  const sites = (input.sitesDomain || main).toLowerCase()
  if (host.endsWith(`.${sites}`) && (input.pathname === "/links" || input.pathname === "/links/")) {
    const sub = host.slice(0, -(sites.length + 1))
    if (sub.includes(".") || !isResolvableOnePageName(sub) || (input.platformSubdomains ?? []).includes(sub)) return null
    if (native) return { kind: "redirect", location: `https://${main}/${sub}/links${search}`, status: 308 }
    return toMe(sub)
  }

  /* ── storelib.com: the old addresses ────────────────────────────────── */
  if (host !== main) return null
  const parts = segmentsOf(input.pathname)

  /* /l/{name}, the first address a OnePage had. */
  if (parts[0] === "l" && parts.length >= 2) {
    const name = nameOf(parts[1])
    if (!name || isReservedRootSegment(name)) return null
    if (native) return { kind: "redirect", location: `https://${main}/${name.toLowerCase()}/links${search}`, status: 308 }
    return toMe(name)
  }

  /* /{name}/links, the address it had until now. */
  if (parts.length === 2 && parts[1].toLowerCase() === "links" && !isReservedRootSegment(parts[0])) {
    const name = nameOf(parts[0])
    if (!name || native) return null
    return toMe(name)
  }

  /* /{name}.links, a spelling that has been handed around. */
  if (parts.length === 1 && /\.links$/i.test(parts[0])) {
    const name = nameOf(parts[0].slice(0, -".links".length))
    if (!name || isReservedRootSegment(name)) return null
    if (native) return { kind: "redirect", location: `https://${main}/${name.toLowerCase()}/links${search}`, status: 308 }
    return toMe(name)
  }

  return null
}

function onTheOnePageHost(pathname: string, search: string, method: string, main: string, domain: string): OnePageRoute {
  const missing = (api = false): OnePageRoute => ({ kind: "not-found", api, path: ONEPAGE_MISSING_PATH })
  const toPlatform = (): OnePageRoute => ({ kind: "redirect", location: `https://${main}${pathname}${search}`, status: 308 })
  const toName = (name: string) => ({ kind: "redirect" as const, location: `https://${domain}/${name.toLowerCase()}${search}`, status: 308 as const })
  /* An old spelling of the address on the new host: resolved by the proxy like the storelib.com ones. */
  const fromOld = (name: string) => ({ ...toName(name), onePage: name })

  /* Next's own files: scripts, styles, fonts and optimised images. */
  if (pathname.startsWith("/_next/")) return { kind: "next" }

  if (pathname === "/") return { kind: "redirect", location: `https://${main}/${search}`, status: 307 }
  if (pathname === "/robots.txt") return { kind: "robots", body: onePageRobots(domain) }
  if (pathname === "/sitemap.xml") return { kind: "rewrite", path: "/sitemap/onepages.xml" }
  /* onepages-N-of-M.xml since round 44 (lib/seo/indexing.ts chunkIdRange); onepages-N.xml from an older index. */
  if (/^\/sitemap\/onepages-\d{1,6}(?:-of-\d{1,6})?\.xml$/.test(pathname)) return { kind: "next" }

  /* The builder's canvas shell, one install id and nothing else; the route itself decides whether to answer (lib/website-builder/canvas-frame.ts). */
  if (pathname.startsWith(CANVAS_FRAME_PATH) && (method === "GET" || method === "HEAD")) {
    const id = pathname.slice(CANVAS_FRAME_PATH.length)
    if (CANVAS_INSTALL_ID.test(id)) return { kind: "rewrite", path: `${CANVAS_FRAME_ROUTE}${id.toLowerCase()}${search}` }
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const allowed = ONEPAGE_HOST_API.some((a) => a.path.test(pathname) && a.methods.includes(method))
    return allowed ? { kind: "next" } : missing(true)
  }

  if (ASSET.test(pathname)) return { kind: "next" }
  /*
    The app's own pictures the page draws (the footer badge's logo, lib/brand/logo.ts): files in public/images, never a
    page or a session. proxy.ts's matcher skips most picture files already (measured round 11: storelib.me answers the
    logo 200, directly and through /_next/image); this keeps them answering here should a request reach the router.
  */
  if (PUBLIC_IMAGE.test(pathname)) return { kind: "next" }

  const parts = segmentsOf(pathname)
  if (parts.length === 0) return missing()
  const first = parts[0]

  if (parts.length === 1) {
    /* storelib.me/{name}.links: the old spelling on the new host. */
    if (/\.links$/i.test(first)) {
      const name = nameOf(first.slice(0, -".links".length))
      return name ? fromOld(name) : missing()
    }
    /* A platform word: the platform page, on the platform's host. */
    if (isReservedRootSegment(first)) return toPlatform()
    const name = nameOf(first)
    if (!name) return missing()
    if (name !== name.toLowerCase() || name !== first || pathname.endsWith("/")) return toName(name)
    return { kind: "rewrite", path: `/${name}/links${search}` }
  }

  /* storelib.me/l/{name} */
  if (first === "l" && parts.length === 2) {
    const name = nameOf(parts[1])
    return name ? fromOld(name) : missing()
  }

  if (isReservedRootSegment(first)) return toPlatform()

  /* storelib.me/{name}/links */
  if (parts.length === 2 && parts[1].toLowerCase() === "links") {
    const name = nameOf(first)
    return name ? fromOld(name) : missing()
  }

  return missing()
}
