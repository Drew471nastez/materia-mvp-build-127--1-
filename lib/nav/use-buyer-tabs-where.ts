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
 * A CREATOR'S PRODUCT NEVER HAS THE BAR, however it was reached
 * (lib/nav/buyer-tabs.ts): the page's own buy bar is already at the foot of
 * it. That is read from the address, so the bar is gone on the frame the
 * product opens and there is nothing to flicker.
 *
 * Both are drawn below 768px only (md:hidden), so "the bar is on this page"
 * and "the bar is on screen" are the same question at every width the header
 * draws its phone row.
 */

import { useEffect, useState, useSyncExternalStore } from "react"

import { useExploreMarketplaceEnabled } from "@/components/platform/explore-marketplace-context"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { extractUsernameFromHost, isCustomDomain, isSellerPage, isSellerProductPath } from "@/lib/url-helpers"

export type BuyerTabsWhere = {
  /** A creator's page or product either way: what keeps Home lit on the bar. */
  sellerSurface: boolean
  /** One of their products, which carries its own buy bar at the foot. */
  sellerProduct: boolean
  /** Their page on storelib.com, which does not. */
  sellerStore: boolean
  /** Their own subdomain: their site, rather than Storelib browsing. */
  sellerSite: boolean
  customDomain: boolean
}

export function useBuyerTabsWhere(pathname: string): BuyerTabsWhere {
  const [host, setHost] = useState<{ subdomain: boolean; customDomain: boolean }>({ subdomain: false, customDomain: false })
  useEffect(() => {
    const h = window.location.host
    const next = { subdomain: extractUsernameFromHost(h) !== null, customDomain: isCustomDomain(h) }
    setHost((w) => (w.subdomain === next.subdomain && w.customDomain === next.customDomain ? w : next))
  }, [])
  const surface = isSellerPage(pathname)
  const product = isSellerProductPath(pathname)
  return {
    sellerSurface: host.subdomain || surface,
    sellerProduct: product,
    /* Their page, not one of their products, and on storelib.com rather than a host of their own. */
    sellerStore: surface && !product && !host.subdomain && !host.customDomain,
    sellerSite: host.subdomain,
    customDomain: host.customDomain,
  }
}

const readSignedIn = () => !!readAuthSnapshot()?.signedIn
const unknown = () => null

/**
 * Whether somebody is signed in, as the header's record says (lib/auth/auth-snapshot.ts), or null where that cannot be
 * known: on the server and while the page wakes up (round 39). The bar is then drawn marked for the record to settle
 * before the first paint (components/nav/buyer-tab-bar.tsx), never guessed one way and corrected the other.
 */
export function useSignedInKnown(): boolean | null {
  return useSyncExternalStore(subscribeAuthSnapshot, readSignedIn, unknown)
}

const noSubscribe = () => () => {}
/* The class the root layout's first script puts on <html> in the app, before anything paints (app/layout.tsx). */
const readNative = () => document.documentElement.classList.contains("capacitor")

/** Inside the Storelib app (the Capacitor shell), or null where that cannot be known yet (the server, the page waking up). */
export function useNativeShell(): boolean | null {
  return useSyncExternalStore(noSubscribe, readNative, unknown)
}

/** The same question, answered: true where the bar is drawn (or, before the page is awake, may be: see useSignedInKnown). */
export function useBuyerTabsHere(pathname: string): boolean {
  const exploreMarketplaceEnabled = useExploreMarketplaceEnabled()
  const signedIn = useSignedInKnown()
  const native = useNativeShell()
  return buyerTabsBelongOn(pathname, { ...useBuyerTabsWhere(pathname), exploreMarketplaceEnabled, signedIn: signedIn ?? undefined, native: native ?? false })
}
