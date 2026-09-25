/**
 * ===========================================================================
 *  WHAT A REQUEST ON A CONNECTED DOMAIN IS SENT TO
 * ===========================================================================
 * The proxy knows the host is a creator's domain, whose it is and what it is
 * set to show (lib/custom-domain/targets.ts). This decides the rest, with no
 * database and no request object, so every rule can be tested by calling
 * it.
 *
 *   website       every path is the website's: /w/<name>/<path>, its own
 *                 robots.txt and sitemap.xml included. Until a website is
 *                 live the domain shows the creator page instead, which is
 *                 what every domain did before it could be told.
 *   creator_page  the domain stands in for storelib.com/<username>:
 *                   /            the creator page
 *                   /<slug>      one of their products
 *                   /links       their OnePage
 *                 and the addresses the page itself links to
 *                 (/<username>, /<username>/<slug>, /p/<slug>) answer too.
 *   onepage       /  is the OnePage; products answer as above.
 *
 * /links is the OnePage on every target. A product path is only served when
 * the product is this creator's: slugs are global, so without the check any
 * domain could show anybody's product. The decision names the slug and the
 * proxy asks, falling back to the domain's front page when it is not theirs.
 *
 * robots.txt and sitemap.xml are the domain's own on every target, never
 * storelib.com's: the website's from /w/<name>, the creator page's and the
 * OnePage's from /u/<username>/robots.txt and /sitemap.xml, which read the
 * domain from the database rather than from the request.
 */
import type { DomainTarget } from "./targets"

export type DomainRoute =
  /** Serve this internal path. `creatorPage` marks the per viewer storefront, which must not be cached shared. */
  | { kind: "rewrite"; path: string; search?: string; creatorPage?: boolean }
  /** Serve `path` if the product with `slug` is this creator's, else `fallback`. */
  | { kind: "product"; slug: string; path: string; fallback: string }
  /** Leave the request alone. */
  | { kind: "pass" }

export interface DomainRouteInput {
  pathname: string
  username: string
  target: DomainTarget
  /** A website is published and no AI site holds the name. Only asked when the target is the website. */
  hasWebsite: boolean
}

const SEO_FILES = new Set(["/robots.txt", "/sitemap.xml"])

/** What the domain actually shows: a website target with nothing live shows the creator page. */
export function effectiveTarget(target: DomainTarget, hasWebsite: boolean): DomainTarget {
  return target === "website" && !hasWebsite ? "creator_page" : target
}

export function domainRoute({ pathname, username, target, hasWebsite }: DomainRouteInput): DomainRoute {
  const u = username.toLowerCase()
  const path = pathname === "" ? "/" : pathname
  const shows = effectiveTarget(target, hasWebsite)
  const home: DomainRoute =
    shows === "onepage" ? { kind: "rewrite", path: `/l/${u}` } : { kind: "rewrite", path: `/u/${u}`, creatorPage: true }
  const homePath = home.kind === "rewrite" ? home.path : `/u/${u}`

  if (path === "/links" || path === "/links/") return { kind: "rewrite", path: `/l/${u}` }

  if (SEO_FILES.has(path)) {
    if (shows === "website") return { kind: "rewrite", path: `/w/${u}${path}` }
    return { kind: "rewrite", path: `/u/${u}${path}`, search: `?shows=${shows}` }
  }

  if (shows === "website") return { kind: "rewrite", path: path === "/" ? `/w/${u}` : `/w/${u}${path}` }

  /* A file the creator page does not have: left to the app, which has none either. */
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return { kind: "pass" }

  if (path === "/") return home

  const parts = path.split("/").filter(Boolean)
  const first = parts[0]?.toLowerCase()

  if (parts.length === 2 && first === "p") {
    return { kind: "product", slug: parts[1], path: `/p/${parts[1]}`, fallback: homePath }
  }
  if (first === u) {
    if (parts.length === 1) return { kind: "rewrite", path: `/u/${u}`, creatorPage: true }
    if (parts.length === 2 && parts[1].toLowerCase() === "links") return { kind: "rewrite", path: `/l/${u}` }
    if (parts.length === 2) return { kind: "product", slug: parts[1], path: `/${u}/${parts[1]}`, fallback: homePath }
  }
  if (parts.length === 1) {
    return { kind: "product", slug: parts[0], path: `/${u}/${parts[0]}`, fallback: homePath }
  }
  return home
}

/**
 * The address a page shown on a connected domain declares as its own, so a
 * search engine files the domain rather than storelib.com.
 *
 *   creator page   https://www.<domain>/
 *   product        https://www.<domain>/<slug>
 *   OnePage        https://www.<domain>/ when the domain shows it, else /links
 */
export function canonicalOnDomain(origin: string, what: { kind: "creator_page" } | { kind: "product"; slug: string } | { kind: "onepage"; front: boolean }): string {
  const base = origin.replace(/\/+$/, "")
  if (what.kind === "creator_page") return `${base}/`
  if (what.kind === "product") return `${base}/${what.slug}`
  return what.front ? `${base}/` : `${base}/links`
}

/**
 * The pages a domain showing the creator page or the OnePage lists in its
 * own /sitemap.xml, at the domain's addresses. The same rules storelib.com's
 * sitemaps apply: the creator page only once it has earned indexing, each
 * product only when it is indexable, the OnePage only when published.
 */
export function domainSitemapUrls(input: {
  origin: string
  shows: "creator_page" | "onepage"
  creatorIndexable: boolean
  onepageLive: boolean
  products: { slug: string; lastModified?: string | null }[]
}): { url: string; lastModified?: string | null }[] {
  const base = input.origin.replace(/\/+$/, "")
  const out: { url: string; lastModified?: string | null }[] = []
  if (input.shows === "creator_page") {
    if (input.creatorIndexable) out.push({ url: `${base}/` })
    if (input.onepageLive) out.push({ url: `${base}/links` })
  } else if (input.onepageLive) {
    out.push({ url: `${base}/` })
  }
  for (const p of input.products) out.push({ url: `${base}/${encodeURIComponent(p.slug)}`, lastModified: p.lastModified ?? null })
  return out
}
