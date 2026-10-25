import type React from "react"
import type { Metadata } from "next"
import { CheckoutLinkOrigin } from "@/components/website-builder/checkout-link-origin"
import { CaptureTouch } from "@/components/attribution/capture-touch"
import { CheckoutReturnNotice } from "@/components/website-builder/checkout-return-notice"
import { SiteDocument } from "@/components/website-builder/site-document"
import { NewTabLinks } from "@/components/website-builder/new-tab-links"
import { SiteLinks } from "@/components/website-builder/site-links"
import { NAVIGATION_HEAD_SCRIPT, VIEW_TRANSITION_CSS } from "@/lib/website-builder/live-navigation"
import { STREAMED_SECTIONS_CSS } from "@/lib/website-builder/streamed-sections"

/**
 * A CREATOR'S WEBSITE DOES NOT SAY IT IS STORELIB'S. The root layout names
 * Storelib as the keywords, author, creator, publisher and generator of every
 * page, and a page inherits what it does not set, so every published website
 * told search engines it was written and published by Storelib about "sell
 * digital products". Null clears an inherited value; here, once, so the
 * site's front page, its other pages, its products and its search are all
 * covered. The title, description and share card are each page's own.
 */
export const metadata: Metadata = {
  keywords: null,
  authors: null,
  creator: null,
  publisher: null,
  generator: null,
}

/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE IS NOT A MARKETING PAGE
 * ===========================================================================
 * These routes used to sit under `(marketing)`, whose layout reads `cookies()`
 * for the wishlist badge and `headers()` for the host. Either one makes every
 * route beneath it render again for every visitor, forever — which is why the
 * cache rules in `next.config` never landed on `/`, `/blog`, `/explore` or a
 * published site. Measured on the live site before this moved: all four came
 * back `private, no-cache, no-store`, whatever the config said.
 *
 * None of that chrome belonged here anyway. A published site draws its own
 * header and footer from the creator's theme; the platform header hid itself
 * on a seller's domain after hydration, and the native padding rule pushed
 * the page down by 68px for a header that was not there.
 *
 * So: no dynamic reads, nothing wrapped, and the pages below decide their own
 * caching. The product routes stay dynamic, because a cart is per visitor.
 */
/*
  NO SPECULATION RULES HERE ANY MORE. They fetched the next page's whole
  document while the pointer rested on its link (lib/website-builder/
  prefetch-rules.ts, still used by imported themes' sites). A Storelib
  theme's link to another of its pages now opens in place through Next's
  router and is fetched ahead by it (SiteLinks below), so the document the
  rules fetched would never have been used.
*/
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* The page being left stays until the next is drawn, then they cross-fade (lib/website-builder/live-navigation.ts). Before the page, so the next one has it when it is drawn. */}
      <style data-storelib-navigation dangerouslySetInnerHTML={{ __html: VIEW_TRANSITION_CSS }} />
      {/* No transition in an app's web view or on a slow phone, where it froze the page between two; a press ends one (live-navigation.ts). */}
      <script data-storelib-navigation dangerouslySetInnerHTML={{ __html: NAVIGATION_HEAD_SCRIPT }} />
      {/* What follows a section still on its way stays unseen until it is moved in, so nothing shown jumps (lib/website-builder/streamed-sections.ts). */}
      <style data-storelib-streamed dangerouslySetInnerHTML={{ __html: STREAMED_SECTIONS_CSS }} />
      {children}
      {/* A link to checkout carries which website and where its visit came
          from, for the order's Source. Static: nothing here reads the request. */}
      <CheckoutLinkOrigin />
      {/* Where this visit came from, kept for this website's address and
          carried to checkout and to its sign-up forms (lib/attribution). */}
      <CaptureTouch property="website" />
      {/* Back from checkout having paid (?checkout=paid): said once, then gone. */}
      <CheckoutReturnNotice />
      {/* Marks <html> as a website, so the app shell's guards stand down. */}
      <SiteDocument />
      {/* A link marked "Open in a new tab" in the builder opens in one (lib/website-builder/new-tab). */}
      <NewTabLinks />
      {/* A link to another page of the website opens in place and is fetched ahead (lib/website-builder/site-navigation.ts). */}
      <SiteLinks />
    </>
  )
}
