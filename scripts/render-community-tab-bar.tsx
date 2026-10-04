/**
 * THE PHONE'S TAB BAR INSIDE A COMMUNITY, for scripts/check-community-tab-bar.mjs.
 *
 * The community is drawn by scripts/render-community-shell.tsx, the real
 * frame with fixtures (its ?case= picks the page: feed, about-visitor...),
 * and the real buyer tab bar is mounted after it, the way the marketing
 * layout mounts it after the page. Both are one bundle, so the community's
 * search button and the bar meet through the same module they meet through
 * on the site (lib/nav/community-search-bridge).
 *
 * ?signedin=1 gives the bar a session (the Profile tab is the account, not
 * Log in), read from the header's record as the bar reads it.
 */
import "./render-community-shell"
import React from "react"
import { createRoot } from "react-dom/client"
import { BuyerTabBar } from "@/components/nav/buyer-tab-bar"
import { LocaleProvider } from "@/components/locale-provider"
import { ExploreMarketplaceProvider } from "@/components/platform/explore-marketplace-context"

if (new URLSearchParams(location.search).get("signedin") === "1") {
  try {
    localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u-me", displayName: "Alex Morgan", username: "alex", isSeller: false }))
  } catch {
    /* Signed out, then. */
  }
}

const el = document.createElement("div")
el.setAttribute("data-probe-tabs-root", "")
document.body.appendChild(el)
createRoot(el).render(
  <LocaleProvider>
    <ExploreMarketplaceProvider exploreMarketplace buyerHeaderLight={false} physicalCommerce={false}>
      <BuyerTabBar />
    </ExploreMarketplaceProvider>
  </LocaleProvider>,
)
