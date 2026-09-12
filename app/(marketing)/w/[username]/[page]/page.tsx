import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { pageKeyFromSegment } from "@/lib/website-builder/site-pages"
import { renderSite, siteMetadata, type SiteSearchParams } from "../render-site"

/** Same reasoning as the home route: see the comment in ../page.tsx. */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; page: string }>
  searchParams?: Promise<SiteSearchParams>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username, page } = await params
  const key = pageKeyFromSegment(page)
  if (!key) return { title: "Not Found", robots: { index: false, follow: false } }
  return siteMetadata(username, await searchParams, key)
}

/**
 * ===========================================================================
 *  EVERY PAGE OF THE SITE THAT IS NOT THE FRONT PAGE
 * ===========================================================================
 * The proxy rewrites `<name>.storelib.com/about` to `/w/<name>/about`, so
 * this is where About, Contact and anything the creator made themselves are
 * served. Until this route existed the rewrite landed on nothing and every
 * one of them was a 404, including the `/about` link the shipped header puts
 * in the nav of every new site.
 *
 * One segment deep on purpose. A page key is a single path segment in the
 * database, so `/about/team` is not an address the builder can produce and
 * pretending otherwise would serve the About page at two addresses.
 */
export default async function WebsiteSubPage({ params, searchParams }: PageProps) {
  const { username, page } = await params

  // `/home` is the front page, which lives at `/`. Sent there rather than
  // served, so one page never answers on two addresses.
  if (decodeURIComponent(page).toLowerCase() === "home") redirect("/")

  const key = pageKeyFromSegment(page)
  if (!key) notFound()

  return renderSite(username, await searchParams, key)
}
