import type { Metadata } from "next"
import { renderSite, siteMetadata, type SiteSearchParams } from "./render-site"

/**
 * Dynamic because this route reads `searchParams` for the preview token, so
 * it could never be prerendered anyway.
 *
 * IT DOES NOT TURN OFF THE CACHE UNDER IT, which is the thing worth writing
 * down. `force-dynamic` changes the default for `fetch`, and Next's
 * `unstable_cache` gates on `workStore.fetchCache === "force-no-store"` —
 * which is set only by an explicit `export const fetchCache` in the module,
 * and there is none here. So the published site below stays cached. Adding
 * `export const fetchCache = "force-no-store"` to this file would silently
 * put every visitor back on eight database round trips; a test refuses it.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  /** `?preview=<token>` shows the drafts, to whoever has the link. */
  searchParams?: Promise<SiteSearchParams>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username } = await params
  return siteMetadata(username, await searchParams, "home")
}

/** The front page of the site. Every other page is `[page]/page.tsx`. */
export default async function WebsitePublicPage({ params, searchParams }: PageProps) {
  const { username } = await params
  return renderSite(username, await searchParams, "home")
}
