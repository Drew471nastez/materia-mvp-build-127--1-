import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { GUEST_COOKIE, parseCookieValue } from "@/lib/site-accounts/wishlist-list"
import { listSiteWishlist, wishlistCards } from "@/lib/site-accounts/wishlist-store"
import { wishlistObject } from "@/lib/storelib-theme/globals"
import { siteMetadata } from "../render-site"
import { renderAccountPage } from "../render-account"
import { siteVisitor } from "../visitor"

/**
 * ===========================================================================
 *  THE WISHLIST, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * What this visitor saved with the heart: their customer account's list
 * when they are signed in to this website, and otherwise the list this
 * browser keeps,
 * which the page's own code copies into a cookie on this host so it can be
 * drawn here, full, rather than empty and then filled. Either way only this
 * creator's published products are drawn; an id that is anybody else's, or
 * no longer for sale, is left out (lib/site-accounts/wishlist-store).
 *
 * Per visitor, never cached, never indexed.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const base = await siteMetadata(username, undefined, "wishlist")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteWishlistPage({ params }: PageProps) {
  const { username } = await params
  const { visitor, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()

  const db = createAdminClient()
  let ids: string[] = []
  let signedIn = false
  if (visitor) {
    const list = await listSiteWishlist(db, visitor)
    /* Before the account list can be reached, the browser's list stands in. */
    if (list.available) {
      ids = list.ids
      signedIn = true
    }
  }
  if (!signedIn) {
    const jar = await cookies()
    ids = parseCookieValue(jar.get(GUEST_COOKIE)?.value)
  }
  const cards = await wishlistCards(db, creatorId, ids)

  return renderAccountPage(username, "wishlist", {
    wishlist: wishlistObject(cards, signedIn),
  })
}
