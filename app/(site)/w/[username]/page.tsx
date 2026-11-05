import type { Metadata } from "next"
import { renderSite, siteMetadata } from "./render-site"

/**
 * ===========================================================================
 *  THE PUBLISHED FRONT PAGE, HELD AT THE EDGE
 * ===========================================================================
 * This route used to be `force-dynamic`, because it read `?preview=` out of
 * `searchParams`, and a route that reads `searchParams` is rendered again for
 * every single visitor no matter what any header says.
 *
 * That was worth knowing: asking for a cache in `next.config` headers or on
 * the proxy's rewrite did NOTHING here. Next puts
 * `private, no-cache, no-store` on a dynamically rendered page itself, and
 * that wins over both. Measured on the live site — every configured rule on
 * `/`, `/blog` and `/explore` was being overridden the same way.
 *
 * Previews have an address of their own now (`/preview/<token>`), so nothing
 * on this page depends on the query string, or on who is asking: no Edit
 * button, no owner menu, no follow state. Two strangers get the same bytes,
 * so the page is rendered once and reused.
 *
 * AN HOUR, AS A BACKSTOP (round 54, lib/delivery/holds.ts). It was a
 * minute, and in production that was 85K ISR revalidations in 12 hours
 * against 11K reads: every page drawn and written again each minute
 * somebody opened it. Publish, a save and the database's own pings expire
 * this page and the data under it at once, so nothing waits for the hour.
 * Next keeps the shortest lifetime of any held read in the draw, so the
 * shop's reads make it five minutes when the database cannot ping
 * (shopHoldSeconds). Checking work in progress is immediate either way,
 * because the preview address is never cached.
 *
 * THE ONE LINE THAT WOULD TURN THE DATA CACHE OFF WITHOUT SAYING SO, kept
 * here because it still applies: Next's `unstable_cache` gates on
 * `workStore.fetchCache === "force-no-store"`, which is set only by an
 * explicit `export const fetchCache` in the module. Neither `force-dynamic`
 * nor `revalidate` sets it, which is why this route could be dynamic and
 * still cached, and why it can be cached and still cached now. Adding that
 * export here would silently put every visitor back on eight database round
 * trips; a test refuses it.
 */
export const revalidate = 3600

/**
 * Empty on purpose, and it is what turns the cache on.
 *
 * Without a `generateStaticParams` a dynamic segment is rendered at request
 * time and never kept. With one — even one that names nothing — Next treats
 * every username as a path it may generate on demand and then hold for
 * `revalidate` seconds. Nothing is named here because the list is every
 * published site, which changes without a deploy.
 */
export function generateStaticParams() {
  return []
}

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return siteMetadata(username, undefined, "home")
}

/** The front page of the site. Every other page is `[page]/page.tsx`. */
export default async function WebsitePublicPage({ params }: PageProps) {
  const { username } = await params
  return renderSite(username, undefined, "home")
}
