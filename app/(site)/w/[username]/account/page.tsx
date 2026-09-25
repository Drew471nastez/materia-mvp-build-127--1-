import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"
import { siteCustomer } from "@/lib/site-accounts/account-data"
import { listSiteWishlist, wishlistCards } from "@/lib/site-accounts/wishlist-store"
import { wishlistObject } from "@/lib/storelib-theme/globals"
import { siteMetadata } from "../render-site"
import { renderAccountPage } from "../render-account"
import { siteVisitor } from "../visitor"

/**
 * ===========================================================================
 *  A VISITOR'S ACCOUNT, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * Their orders from this creator, what they saved here, and the way out.
 * Signed out, the sign in page, the way every shop does it.
 *
 * Per visitor, so never cached and never indexed: the page reads the
 * website's own session cookie (see ../visitor.ts), and two people must
 * never be sent each other's.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const base = await siteMetadata(username, undefined, "account")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteAccountPage({ params }: PageProps) {
  const { username } = await params
  const { visitor, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  if (!visitor) redirect("/account/login")

  const db = createAdminClient()
  const [customer, list] = await Promise.all([
    siteCustomer(db, visitor, `https://${getMainDomain()}`),
    listSiteWishlist(db, visitor),
  ])
  const cards = await wishlistCards(db, visitor.creatorId, list.ids)

  return renderAccountPage(username, "account", {
    customer: customer as unknown as Record<string, unknown> | null,
    wishlist: wishlistObject(cards, true),
  })
}
