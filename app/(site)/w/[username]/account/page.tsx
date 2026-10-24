import { notFound, redirect } from "next/navigation"
import { splitSiteName } from "@/lib/markets/site-name"
import type { Metadata } from "next"
import { createAdminClient } from "@/lib/supabase/admin"
import { SITE_RECEIPTS, siteCustomer } from "@/lib/site-accounts/account-data"
import { listSiteWishlist, wishlistCards } from "@/lib/site-accounts/wishlist-store"
import { wishlistObject } from "@/lib/storelib-theme/globals"
import { siteMetadata } from "../render-site"
import { renderAccountPage } from "../render-account"
import { siteVisitor } from "../visitor"

/**
 * ===========================================================================
 *  A CUSTOMER'S ACCOUNT, ON THE CREATOR'S OWN WEBSITE
 * ===========================================================================
 * The page a Shopify store's customer lands on after signing in: their
 * orders from this creator, their profile, the way to what they saved, and
 * the way out. Signed out, the sign in page, the way every shop does it.
 *
 * Per visitor, so never cached and never indexed: the page reads the
 * website's own session cookie (see ../visitor.ts), and two people must
 * never be sent each other's.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  /** `edit=name` opens the name for changing; `profile=` is how the save went. */
  searchParams: Promise<{ profile?: string; edit?: string; deleted?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username: segment } = await params
  const base = await siteMetadata(splitSiteName(segment).name, undefined, "account")
  return { ...base, alternates: undefined, robots: { index: false, follow: false } }
}

export default async function SiteAccountPage({ params, searchParams }: PageProps) {
  /* /fr/account: the same page, in French (lib/markets/site-name). */
  const { username: segment } = await params
  const { name: username, locale, market } = splitSiteName(segment)
  const root = locale ? `/${locale.toLowerCase()}` : ""
  const sp = await searchParams.catch(() => ({}) as Awaited<PageProps["searchParams"]>)
  const { visitor, customer, creatorId } = await siteVisitor(username)
  if (!creatorId) notFound()
  if (!visitor || !customer) redirect(`${root}/account/login`)

  const db = createAdminClient()
  const [account, list] = await Promise.all([siteCustomer(db, customer, SITE_RECEIPTS), listSiteWishlist(db, visitor)])
  const cards = await wishlistCards(db, visitor.creatorId, list.ids)

  return renderAccountPage(username, "account", {
    customer: account as unknown as Record<string, unknown>,
    wishlist: wishlistObject(cards, true),
    notice: sp.profile === "saved" ? "Saved." : sp.profile === "error" ? "That name could not be saved. Try again." : sp.deleted === "no" ? "Your account could not be deleted. Try again." : null,
    edit: sp.edit === "name" ? "name" : null,
    lang: { locale, market },
  })
}
