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
 * component: a creator's own domain is theirs, and nothing of Storelib's is
 * drawn on it. The address alone settles the rest, on the first render, and
 * the host has the last word a moment later, as it does for the header.
 *
 * A CREATOR'S PAGE OR PRODUCT NEVER HAS THE BAR, however it was reached
 * (lib/nav/buyer-tabs.ts): the page's own buy bar is already at the foot of
 * it. That is read from the address, so the bar is gone on the frame the
 * product opens and there is nothing to flicker.
 *
 * Both are drawn below 768px only (md:hidden), so "the bar is on this page"
 * and "the bar is on screen" are the same question at every width the header
 * draws its phone row.
 */

import { useEffect, useState } from "react"

import { buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"

export type BuyerTabsWhere = { sellerSurface: boolean; customDomain: boolean }

export function useBuyerTabsWhere(pathname: string): BuyerTabsWhere {
  const [host, setHost] = useState<{ subdomain: boolean; customDomain: boolean }>({ subdomain: false, customDomain: false })
  useEffect(() => {
    const h = window.location.host
    const next = { subdomain: extractUsernameFromHost(h) !== null, customDomain: isCustomDomain(h) }
    setHost((w) => (w.subdomain === next.subdomain && w.customDomain === next.customDomain ? w : next))
  }, [])
  return { sellerSurface: host.subdomain || isSellerPage(pathname), customDomain: host.customDomain }
}

/** The same question, answered: true where the bar is drawn. */
export function useBuyerTabsHere(pathname: string): boolean {
  return buyerTabsBelongOn(pathname, useBuyerTabsWhere(pathname))
}
