/**
 * ===========================================================================
 *  A COMMUNITY ON ITS OWN DOMAIN (round 31)
 * ===========================================================================
 * A creator can point a domain they own (club.maralind.com, maralind.club)
 * at one of their communities. The row in `custom_domains` says so with
 * purpose 'community', target_type 'community' and target_id the community's
 * id (run-now part 179). The id, not the slug: a renamed community keeps its
 * domain, and the slug is read again on every lookup.
 *
 * WHAT THE DOMAIN SERVES. Exactly one community, at the root:
 *
 *     /                    /community/<slug>
 *     /about, /join        /community/<slug>/about, /join
 *     /members, /learn...  /community/<slug>/members, /learn...
 *     /post/<id>           /community/<slug>/post/<id>
 *
 * The pages still build their links as /community/<slug>/...; on the
 * domain those answer a 308 to the same address without the prefix, so a
 * visitor stays on the domain and never sees the slug twice. A link to
 * ANOTHER community, to /community itself, or to any platform page (sign
 * in, /app, checkout, a creator page) is sent to storelib.com: a custom
 * domain serves the community it was verified for and nothing else of
 * Storelib's.
 *
 * WHY SIGN IN STAYS ON STORELIB.COM. The session cookie is host only on
 * storelib.com (proxy.ts). A session written on a creator's domain would
 * be sent to whatever that domain points at next, and the creator controls
 * its DNS, so no session is ever made here: /login, /signup, /auth and /app
 * on the domain answer a 307 to storelib.com, where members sign in and use
 * the member area. The domain is the community's public face.
 *
 * Pure and browser safe: the proxy, the routes, the Settings screens and
 * tests/community-domains-round31.test.ts all read it.
 */

export const COMMUNITY_TARGET = "community" as const

/**
 * The first segments that are pages of one community (app/(marketing)/community/[slug]/...).
 * Its pictures (share.png, cover.jpg, tab-icon.png) never reach the proxy
 * (its matcher skips images), and the pages name them at /community/<slug>/,
 * which the app answers on any host.
 */
export const COMMUNITY_SECTIONS: readonly string[] = [
  "about",
  "join",
  "post",
  "members",
  "space",
  "learn",
  "events",
  "leaderboard",
  "saved",
  "notifications",
  "membership",
]

/** Words a person types for a section that has another name here. */
const SECTION_ALIASES: Record<string, string> = {
  calendar: "events",
  classroom: "learn",
  posts: "",
  feed: "",
}

/** What a request on a community's domain becomes. */
export type CommunityDomainStep =
  /** Serve this path of the app (always /community/<slug>...). */
  | { kind: "rewrite"; path: string }
  /** Answer a redirect. `location` is a path on this host, or an https URL on storelib.com. */
  | { kind: "redirect"; location: string; status: 307 | 308 }
  /** Leave it alone: the pages' own calls, Next's files, public files. */
  | { kind: "pass" }
  /** The domain's own robots.txt or sitemap.xml. */
  | { kind: "text"; body: string; contentType: string }

/** Paths that pass through untouched on the domain. */
function passes(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return true
  if (pathname.startsWith("/_next/")) return true
  if (pathname.startsWith("/.well-known/")) return true
  /* A file at the root (favicon.ico, the push worker, a manifest): Storelib's public files, the same on every host. */
  return /^\/[^/]+\.[a-z0-9]{1,12}$/i.test(pathname)
}

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** robots.txt for a community's domain: everything may be read; each page's own robots tag decides indexing. */
export function communityRobots(host: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap.xml\n`
}

/** sitemap.xml for a community's domain: its two public pages. */
export function communitySitemap(host: string): string {
  const urls = [`https://${host}/`, `https://${host}/about`]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}\n</urlset>\n`
}

/**
 * Decide one request on a community's domain. `slug` is the community's
 * current slug, read by its id; `host` the domain as asked for, without a
 * port; `mainDomain` storelib.com.
 */
export function communityDomainStep(input: { slug: string; pathname: string; search: string; host: string; mainDomain: string }): CommunityDomainStep {
  const { slug, search, host, mainDomain } = input
  const pathname = input.pathname || "/"
  const apex = (path: string): CommunityDomainStep => ({ kind: "redirect", location: `https://${mainDomain}${path}${search}`, status: 307 })

  if (pathname === "/robots.txt") return { kind: "text", body: communityRobots(host), contentType: "text/plain; charset=utf-8" }
  if (pathname === "/sitemap.xml") return { kind: "text", body: communitySitemap(host), contentType: "application/xml; charset=utf-8" }
  if (passes(pathname)) return { kind: "pass" }

  const parts = pathname.split("/").filter(Boolean)
  const first = (parts[0] ?? "").toLowerCase()

  /* The address the pages build, /community/<slug>/..., comes back to the domain without the prefix. */
  if (first === "community") {
    const named = parts[1] ? decoded(parts[1]).toLowerCase() : ""
    if (named && named === slug.toLowerCase()) {
      const rest = parts.slice(2).join("/")
      return { kind: "redirect", location: `/${rest}${search}`, status: 308 }
    }
    /* Another community, or the list of them: Storelib's, at storelib.com. */
    return apex(pathname)
  }

  if (parts.length === 0) return { kind: "rewrite", path: `/community/${slug}` }

  if (first in SECTION_ALIASES) {
    const to = SECTION_ALIASES[first]
    const rest = parts.slice(1).join("/")
    const path = [to, to ? rest : ""].filter(Boolean).join("/")
    return { kind: "redirect", location: `/${path}${search}`, status: 308 }
  }

  if (COMMUNITY_SECTIONS.includes(first)) {
    return { kind: "rewrite", path: `/community/${slug}/${[first, ...parts.slice(1)].join("/")}` }
  }

  /* Sign in, /app, checkout, a creator page, anything else: Storelib's own pages live at storelib.com. */
  return apex(pathname)
}

/** The community a stored domain row serves, or null when it serves something else. */
export function communityIdOf(row: { purpose?: string | null; target_type?: string | null; target_id?: string | null } | null | undefined): string | null {
  if (!row || row.purpose !== "community" || row.target_type !== COMMUNITY_TARGET) return null
  return typeof row.target_id === "string" && row.target_id ? row.target_id : null
}

/**
 * May this domain serve this community? Only when the community is still
 * there and still belongs to the creator who connected the domain: a
 * community that changed hands, or was deleted, stops answering at once.
 */
export function communityServable(
  domain: { creator_id: string },
  community: { creator_id?: string | null; deleted_at?: string | null; slug?: string | null } | null | undefined,
): boolean {
  if (!community || !community.slug) return false
  if (community.deleted_at) return false
  return !!community.creator_id && community.creator_id === domain.creator_id
}

/** The cache tag a community's domain is read under (canonicals, the admin panel). */
export function communityDomainTag(communityId: string): string {
  return `community-domain:${communityId}`
}
