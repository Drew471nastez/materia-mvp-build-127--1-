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
import { siteLocalizer } from "@/lib/markets/live"
import { accountNoticeIn, addressNoticeIn, addressNoticeIsError, wordedCustomer } from "@/lib/site-accounts/words"
import { countryChoices } from "@/lib/site-accounts/countries"

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
  /** `edit=name|phone|address|address:<id>` opens that for changing; `profile=` and `address=` are how the save went. */
  searchParams: Promise<{ profile?: string; edit?: string; deleted?: string; address?: string }>
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
  const [account, list, localizer] = await Promise.all([siteCustomer(db, customer, SITE_RECEIPTS), listSiteWishlist(db, visitor), siteLocalizer(creatorId, locale, market).catch(() => null)])
  const cards = await wishlistCards(db, visitor.creatorId, list.ids)
  /* What the page says, its orders' statuses and dates, in its language (lib/site-accounts/words.ts). */
  const words = localizer?.words
  const lang = localizer?.locale ?? null
  const shown = wordedCustomer(account, words, locale ? lang : null)
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))
  const said = accountNoticeIn(words, q)
  /* The address form: ?edit=address adds one, ?edit=address:<id> changes that one, when it is in the book. */
  const editing = typeof sp.edit === "string" && sp.edit.startsWith("address") ? sp.edit.slice("address:".length) : null
  const address = editing ? (account.addresses ?? []).find((a) => a.id === editing) ?? null : null
  const mode = sp.edit === "address" ? "new" : address ? "edit" : null
  const addressCode = sp.address ?? null

  return renderAccountPage(username, "account", {
    customer: shown as unknown as Record<string, unknown>,
    wishlist: wishlistObject(cards, true),
    /* The address book's own news is said in its block; the profile's and the account's at the profile. */
    notice: addressCode ? null : (said?.text ?? null),
    noticeError: !addressCode && !!said?.error,
    edit: sp.edit === "name" || sp.edit === "phone" ? sp.edit : null,
    addressBook: {
      mode,
      address: address ? (address as unknown as Record<string, unknown>) : mode === "new" ? { default: (account.addresses ?? []).length === 0 } : null,
      notice: addressCode ? addressNoticeIn(words, addressCode) : null,
      error: addressNoticeIsError(addressCode),
      countries: mode ? countryChoices(lang) : [],
    },
    lang: { locale, market },
  })
}
