import "server-only"

/**
 * ===========================================================================
 *  A CREATOR PAGE ON ITS OWN DOMAIN SPEAKS FOR ITSELF
 * ===========================================================================
 * A domain connected to the creator page (lib/custom-domains) serves
 * storelib.com/<handle> at `/`, each product at `/<slug>` and the OnePage at
 * `/links` (proxy.ts). Once it is the live primary one, every one of those
 * pages names the domain as its canonical, so the domain is where search
 * engines should find them:
 *
 *   <domain>/robots.txt    open, except the platform's own paths that answer
 *                          on every host (/app, /api, /checkout, ...), and
 *                          naming <domain>/sitemap.xml
 *   <domain>/sitemap.xml   the creator page, its products and its OnePage,
 *                          at the domain's addresses, by the same rules
 *                          storelib.com's sitemap uses for them
 *
 * and storelib.com's sitemap leaves those pages out
 * (lib/seo/sitemaps.ts liveCreatorPageDomains).
 *
 * THE SAME RULE AS THE CANONICAL. A domain has a sitemap only when it is the
 * one lib/custom-domains/store.ts primaryHostOf names: the creator page's
 * primary domain, and active. A domain still waiting for its DNS, one that
 * is not the primary, or a website domain showing the creator page because
 * no website is published, has no sitemap (404) and its robots.txt names
 * none: the pages it shows are canonical somewhere else, and listed there.
 * A database without the purpose columns (run-now part 22) has no creator
 * page domains, so nothing here lists anything and storelib.com's sitemap
 * is exactly what it was.
 *
 * The proxy rewrites a connected domain's /robots.txt and /sitemap.xml to
 * the routes under app/(marketing)/u/[username]. A rewrite keeps the
 * request's Host header, and that is the host the routes answer for (a
 * query added to the rewrite is not seen by a route handler: its
 * request.url is still the address the browser asked for).
 * storelib.com/u/... is a redirect to storelib.com/<name>, so those routes
 * are only reached from a connected domain.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { listCreatorDomains, primaryHostOf } from "@/lib/custom-domains/store"
import { getLinksShareUrl, getProductShareUrl, getStoreShareUrl } from "@/lib/url-helpers"
import { isBanned } from "./bans"
import { CUSTOM_DOMAIN_DISALLOW, creatorIndexable, lastmodOf, newestOf, productIndexable, robotsTxt, type SitemapEntry } from "./indexing"
import { SitemapReadFailed, readRange } from "./sitemaps"
import { imagesOnly } from "@/lib/media/video"

type Admin = ReturnType<typeof createAdminClient>

/** A sitemap holds 50,000 addresses; the page and its OnePage take two. */
const MAX_PRODUCTS = 49_000

export interface CreatorDomainProduct {
  slug: string | null
  status?: string | null
  updated_at: string | null
  thumbnail_url?: string | null
  gallery_urls?: string[] | null
}

/** A host as the proxy passes it: lowercase, no port, or null. */
export function cleanRequestHost(value: string | null | undefined): string | null {
  const host = (value ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "")
  return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(host) ? host : null
}

/**
 * What a creator page domain's sitemap lists, at the domain's own addresses:
 * the same helpers the pages' canonicals are written with, so the two can
 * never name different addresses. The rules are storelib.com's for the same
 * pages: the creator page and its OnePage once there is a published product
 * and the handle is not a farm's, each product by productIndexable, nothing
 * at all for a banned creator.
 */
export function creatorDomainEntries(input: {
  host: string
  handle: string
  banned: boolean
  avatarUrl?: string | null
  coverUrl?: string | null
  products: CreatorDomainProduct[]
  onePage: { updatedAt: string | null } | null
}): SitemapEntry[] {
  if (input.banned) return []
  const published = input.products.filter((p) => p.status === "published" && p.slug)
  const entries: SitemapEntry[] = []
  if (creatorIndexable({ publishedProducts: published.length, handle: input.handle })) {
    const newest = published.reduce<string | null>((at, p) => newestOf(at, p.updated_at), null)
    entries.push({ url: getStoreShareUrl(input.handle, input.host), lastModified: newest, images: [input.avatarUrl, input.coverUrl] })
    if (input.onePage) entries.push({ url: getLinksShareUrl(input.handle, input.host), lastModified: input.onePage.updatedAt })
  }
  for (const p of published) {
    if (!productIndexable(p, input.handle)) continue
    entries.push({
      url: getProductShareUrl(input.handle, p.slug as string, input.host),
      lastModified: lastmodOf(p.updated_at),
      images: imagesOnly([p.thumbnail_url, ...(p.gallery_urls ?? [])]),
    })
  }
  return entries
}

/** A creator page domain's robots.txt: open, the platform's paths closed, and its sitemap when it has one. */
export function creatorDomainRobotsTxt(host: string | null, live: boolean): string {
  return robotsTxt({ disallow: CUSTOM_DOMAIN_DISALLOW, sitemaps: live && host ? [`https://${host}/sitemap.xml`] : [] })
}

type Owner = { creatorId: string; handle: string; avatarUrl: string | null; creator: Record<string, unknown> }

/** The creator a handle names, as the proxy found it (profiles.username, then creators.user_id). */
async function ownerOf(admin: Admin, username: string): Promise<Owner | null> {
  const { data: profile, error } = await admin.from("profiles").select("id, username, avatar_url").eq("username", username).maybeSingle()
  if (error) throw new SitemapReadFailed("domain owner")
  const p = profile as { id: string; username: string | null; avatar_url: string | null } | null
  if (!p?.username) return null
  /* Read whole: a column one database has and another does not (banned_at) cannot fail it. */
  const { data: creator, error: creatorError } = await admin.from("creators").select("*").eq("user_id", p.id).maybeSingle()
  if (creatorError) throw new SitemapReadFailed("domain creator")
  const c = creator as ({ id?: string } & Record<string, unknown>) | null
  if (!c?.id) return null
  return { creatorId: c.id, handle: p.username, avatarUrl: p.avatar_url ?? null, creator: c }
}

/** The creator page's live primary host, by primaryHostOf; null before part 22 or without one. */
async function liveHostOf(admin: Admin, creatorId: string): Promise<string | null> {
  const { rows, schema, error } = await listCreatorDomains(admin, creatorId)
  if (error && error !== "missing_table") throw new SitemapReadFailed("creator page domain")
  return primaryHostOf(rows, "creator_page", schema)
}

/**
 * The sitemap `host` answers with, or null when it has none: it is not the
 * creator page's live primary domain, or nobody has the handle. A read that
 * fails throws SitemapReadFailed, which the route answers with a 503.
 */
export async function creatorDomainSitemap(username: string, requestedHost: string | null | undefined, admin: Admin = createAdminClient()): Promise<SitemapEntry[] | null> {
  const host = cleanRequestHost(requestedHost)
  if (!host || !username) return null
  const owner = await ownerOf(admin, username)
  if (!owner) return null
  if ((await liveHostOf(admin, owner.creatorId)) !== host) return null
  const id = owner.creatorId
  const [products, onePages] = await Promise.all([
    readRange<CreatorDomainProduct>(
      (a, b) =>
        admin
          .from("products")
          .select("slug, status, updated_at, thumbnail_url, gallery_urls")
          .eq("creator_id", id)
          .eq("status", "published")
          .order("id", { ascending: true })
          .range(a, b) as unknown as PromiseLike<{ data: CreatorDomainProduct[] | null; error: { message: string } | null }>,
      0,
      MAX_PRODUCTS,
      "domain products",
    ),
    readRange<{ updated_at: string | null }>(
      (a, b) =>
        admin
          .from("onepages")
          .select("updated_at")
          .eq("status", "published")
          .or(`creator_id.eq.${id},seller_id.eq.${id}`)
          .order("updated_at", { ascending: false })
          .range(a, b),
      0,
      1,
      "domain onepage",
    ),
  ])
  return creatorDomainEntries({
    host,
    handle: owner.handle,
    banned: isBanned(owner.creator as { banned_at?: string | null }),
    avatarUrl: owner.avatarUrl,
    coverUrl: (owner.creator.cover_url as string | null | undefined) ?? null,
    products,
    onePage: onePages[0] ? { updatedAt: onePages[0].updated_at ?? null } : null,
  })
}

/**
 * The robots.txt `host` answers with. Never an error: a lookup that fails
 * leaves out the Sitemap line, and the rules stand, which is a file that is
 * right for any host showing a creator's pages.
 */
export async function creatorDomainRobots(username: string, requestedHost: string | null | undefined, admin?: Admin): Promise<string> {
  const host = cleanRequestHost(requestedHost)
  let live = false
  try {
    const db = admin ?? createAdminClient()
    const owner = host && username ? await ownerOf(db, username) : null
    live = !!owner && (await liveHostOf(db, owner.creatorId)) === host
  } catch {
    live = false
  }
  return creatorDomainRobotsTxt(host, live)
}
