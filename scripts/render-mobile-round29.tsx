/**
 * ROUND 29, FOR scripts/check-mobile-round29.mjs: the community's real frame
 * with its place host (scripts/render-community-shell15.tsx, the same
 * fixtures and the same JSON place route), the real buyer tab bar mounted
 * after it as the marketing layout mounts it, and the root layout's pieces
 * that answer every change of address (app/(storelib)/layout.tsx: the dark look, the
 * landing fade, the bounce's ground, the band under the clock, the scroll
 * lock repair, the viewport's numbers, the bounce guard) and the marketing
 * layout's loading line. One bundle, so all of them meet through the same
 * modules they meet through on the site.
 */
import "./render-community-shell15"
import React from "react"
import { createRoot } from "react-dom/client"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"
import { SiteAppearance } from "@/components/platform/site-appearance"
import { NavLanding } from "@/components/ui/nav-landing"
import { ElasticOverscroll } from "@/components/ui/elastic-overscroll"
import { NativeChrome } from "@/components/platform/native-chrome"
import { BodyScrollRestorer } from "@/components/body-scroll-restorer"
import { ViewportVars } from "@/components/viewport-vars"
import { CapacitorBounceGuard } from "@/components/platform/capacitor-bounce-guard"
import { RouteLoadingBar } from "@/components/navigation/route-loading-bar"

try {
  localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", displayName: "Alex Morgan", username: "alex", isSeller: false }))
  /* The person's dark choice, as the site stores it, when the probe asks for the dark look. */
  if ((window as unknown as { __probeDark?: boolean }).__probeDark) localStorage.setItem("storelib:appearance", "dark")
} catch {
  /* Signed out, then. */
}

const el = document.createElement("div")
el.setAttribute("data-probe-tabs-root", "")
document.body.appendChild(el)
createRoot(el).render(
  <LocaleProvider>
    <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce={false}>
      <SiteAppearance />
      <RouteLoadingBar />
      <BuyerTabBar />
      <BodyScrollRestorer />
      <ViewportVars />
      <CapacitorBounceGuard />
      <ElasticOverscroll />
      <NavLanding />
      <NativeChrome />
    </ExploreMarketplaceProvider>
  </LocaleProvider>,
)
