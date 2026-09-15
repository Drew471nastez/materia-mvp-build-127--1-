import type React from "react"

import ShopLayout from "../u/[username]/layout"

/**
 * ===========================================================================
 *  THE SKELETON'S COLOURS FOLLOW THE PAGE TO ITS NEW ADDRESS
 * ===========================================================================
 * The storefront layout does one thing: look up the creator's theme and put
 * its colours on CSS custom properties, so the skeleton above is tinted to
 * the page that is about to arrive rather than flashing white in front of a
 * dark one.
 *
 * It lives in the `/u/[username]` segment and so did not apply here, where
 * every creator page is now served. The only difference between the two is
 * the name of the param, so this maps it and hands over. The lookup itself is
 * deduped per request and cached across requests in
 * lib/commerce/creator-page-data, so naming it twice costs nothing.
 */
export default async function SellerLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ sellername: string }>
}) {
  const { sellername } = await params
  return ShopLayout({ children, params: Promise.resolve({ username: sellername }) })
}
