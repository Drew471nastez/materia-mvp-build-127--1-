/**
 * ===========================================================================
 *  THE CREATOR PAGE'S TEMPLATE, SHARED WITH A PERSON WITHOUT A STORE
 * ===========================================================================
 * Round 12: "ONE profile system". A person without a store gets the SAME
 * page as a creator (app/(marketing)/u/[username]), simply without the
 * products: the page's ground and type, its top bar, its header (cover,
 * photo, name, @handle, bio, followers and Follow), the underline tabs,
 * About and the "Powered by Storelib" footer, all painted by one resolved
 * scheme (lib/store-builder/storefront-chrome.ts).
 *
 * What the two pages share is decided here once, so a change to how the
 * creator page hands its scheme to the header, the tabs or the footer is a
 * change to a person's page too:
 *
 *   ROOT     the ground, the ink and the design system's variables rebound
 *            to the scheme, on the element a scheme press repaints
 *   HEADER   the type colours and the ring round the photo
 *   TABS     the tab strip's ink, muted ink and rule
 *   FOOTER   the footer band and its links
 *
 * A person has no scheme of their own (they never opened the page editor),
 * so their page is the default scheme, exactly what a creator who never
 * chose one gets: PERSON_CHROME.
 *
 * No "use client": both pages build it on the server.
 */
import type React from "react"
import { resolveStorefrontChrome, type StorefrontChrome } from "@/lib/store-builder/storefront-chrome"

/** The default scheme, resolved as the creator page resolves a page nobody coloured. */
export const PERSON_CHROME: StorefrontChrome = resolveStorefrontChrome(undefined)

/** The page root: its ground, its ink and the design system's variables in the scheme's colours. */
export function storefrontRootStyle(chrome: StorefrontChrome): React.CSSProperties {
  return {
    background: chrome.pageBackground,
    color: chrome.text,
    ...(chrome.tokens as React.CSSProperties),
  }
}

/** The header's type colours and the ring round the photo (UnifiedShopHeader `surface`). */
export function storefrontHeaderSurface(chrome: StorefrontChrome) {
  return { textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }
}

/** The underline tabs (StorefrontTabs `surface`). */
export function storefrontTabsSurface(chrome: StorefrontChrome) {
  return { textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }
}

/** The footer band (SellerFooter `surface`). */
export function storefrontFooterSurface(chrome: StorefrontChrome) {
  return {
    backgroundColor: chrome.footerBackground,
    textColor: chrome.footerText,
    mutedColor: chrome.footerMuted,
    borderColor: chrome.border,
  }
}
