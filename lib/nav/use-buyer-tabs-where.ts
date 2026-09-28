"use client"

/**
 * ===========================================================================
 *  IS THE PHONE'S TAB BAR ON THIS PAGE
 * ===========================================================================
 * Asked by the bar itself (components/nav/buyer-tab-bar.tsx) and by the
 * header (components/platform/platform-header-client.tsx), which leaves out
 * what the bar already carries while the bar is there: the Library icon, the
 * search strip under the header. One answer for both, so the header can
 * never drop a control the bar is not there to replace.
 *
 * WHERE THIS IS depends on the host, which the server does not hand a client
 * component: a creator's subdomain or their own domain is theirs. The first
 * render answers from the address alone (a creator's page is left bare until
 * it is known to be browsed from Storelib), and the host has the last word a
 * moment later, as it does for the header.
 *
 * Both are drawn below 768px only (md:hidden), so "the bar is on this page"
 * and "the bar is on screen" are the same question at every width the header
 * draws its phone row.
 */

import { useEffect, useState } from "react"

import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"

export type BuyerTabsWhere = { sellerSurface: boolean; discover: boolean; customDomain: boolean }

export function useBuyerTabsWhere(pathname: string): BuyerTabsWhere {
  const [state, setState] = useState<BuyerTabsWhere & { forPath: string }>(() => ({ sellerSurface: isSellerPage(pathname), discover: false, customDomain: false, forPath: pathname }))
  useEffect(() => {
    const host = window.location.host
    const subdomain = extractUsernameFromHost(host) !== null
    const sellerSurface = subdomain || isSellerPage(pathname)
    const discover = sellerSurface && isDiscoverMode(pathname, new URLSearchParams(window.location.search), { isSubdomain: subdomain })
    const customDomain = isCustomDomain(host)
    setState((w) =>
      w.forPath === pathname && w.sellerSurface === sellerSurface && w.discover === discover && w.customDomain === customDomain
        ? w
        : { sellerSurface, discover, customDomain, forPath: pathname },
    )
  }, [pathname])
  /*
    BETWEEN TWO PAGES, UNTIL THE HOST HAS BEEN ASKED AGAIN. The answer above
    is for the address it was worked out on, and the first render of a new
    address comes before the effect that asks again. Read as it stood, a
    product opened from Explore was "a creator's page, not browsed from
    Storelib" for that one render, so the bar (and the search screen it
    carries) left the document and came back a frame later. So a creator's
    page reached from a page that had the bar keeps it until the effect has
    answered for this address; the effect has the last word, as before.
  */
  if (state.forPath !== pathname) {
    const had = buyerTabsBelongOn(state.forPath, state)
    return { sellerSurface: isSellerPage(pathname), discover: had, customDomain: state.customDomain }
  }
  return state
}

/** The same question, answered: true where the bar is drawn. */
export function useBuyerTabsHere(pathname: string): boolean {
  return buyerTabsBelongOn(pathname, useBuyerTabsWhere(pathname))
}
