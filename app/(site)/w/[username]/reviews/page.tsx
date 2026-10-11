import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { creatorByName } from "@/lib/website-builder/published-site"
import { publishedReviewsApp } from "@/lib/reviews/app-server"
import { createAdminClient } from "@/lib/supabase/admin"
import { siteMetadata } from "../render-site"
import { renderAccountPage } from "../render-account"

/** Reviews change as they come in; the shop's reviews are held a minute on their own (lib/reviews/storefront-server). */
export const revalidate = 60

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return siteMetadata(username, undefined, "reviews")
}

/**
 * ===========================================================================
 *  /reviews ON A WEBSITE (Storelib Reviews)
 * ===========================================================================
 * Every published review of the shop, with the product each is about: the
 * page a creator opens as "reviews" in the builder when they saved one, the
 * generated one (header, All reviews, footer: lib/website-builder/
 * account-pages reviewsSections) until then. Only while Storelib Reviews is
 * on; off, the address is not a page.
 */
export default async function SiteReviewsPage({ params }: PageProps) {
  const { username } = await params
  const creator = await creatorByName(username)
  if (!creator) notFound()
  const settings = await publishedReviewsApp(createAdminClient(), creator.creatorId)
  if (!settings.enabled) notFound()
  return renderAccountPage(username, "reviews")
}
