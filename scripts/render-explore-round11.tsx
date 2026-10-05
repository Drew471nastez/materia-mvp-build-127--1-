/**
 * The round 11 pieces that render on their own, for
 * scripts/check-explore-round11.mjs: every back control that is a component
 * (the shared BackControl, the profile bar's chevron, the product's
 * "< Explore" breadcrumb and the product creator bar with its back), and
 * Explore's community cards (a logo, initials on a cover, Free and a price).
 *
 * The router is a counter (window.__nav.pushes), and history.back is counted
 * too (window.__nav.backs), so a double tap can be counted as navigations.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"

import { BackControl } from "@/components/navigation/back-control"
import { BackChevron } from "@/components/profile/profile-top-bar"
import { DiscoverBackBreadcrumb } from "@/components/product/discover-back-breadcrumb"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"
import { ExploreCommunityCard } from "@/components/explore/community-card"
import type { CommunityCard } from "@/lib/communities/types"

type Nav = { pushes: string[]; backs: number; at: number[] }
const nav: Nav = ((window as unknown as { __nav: Nav }).__nav = { pushes: [], backs: 0, at: [] })
/* A back that "works": it is counted and answers with a popstate, as a router-kept page would. */
history.back = () => {
  nav.backs += 1
  nav.at.push(Math.round(performance.now()))
  setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate")), 30)
}

const router = {
  push: (h: string) => { nav.pushes.push(h); nav.at.push(Math.round(performance.now())) },
  replace: (h: string) => { nav.pushes.push(h); nav.at.push(Math.round(performance.now())) },
  back: () => history.back(),
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as unknown as React.ContextType<typeof AppRouterContext>

const card = (over: Partial<CommunityCard>): CommunityCard => ({
  id: "c", slug: "c", name: "Night Studio", tagline: "Weekly critiques, lighting breakdowns and a calm room to share work in progress.",
  logoUrl: null, coverUrl: null, category: null, access: "free" as CommunityCard["access"], visibility: "public" as CommunityCard["visibility"],
  memberCount: 1284, priceLine: "Free", creator: { id: "u", name: "Ava Stone", username: "ava", avatarUrl: null }, url: "/community/c", viewCount: 5320, rating: null,
  ...over,
})
const LOGO = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#fdfdfd"/><circle cx="48" cy="48" r="26" fill="#1a1a2e"/></svg>')

function Harness() {
  const which = new URLSearchParams(location.search).get("show") || "backs"
  return (
    <AppRouterContext.Provider value={router}>
      {which === "backs" ? (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24, background: "#fff" }}>
          <div data-probe="back-control"><BackControl fallback="/account" label="Back to profile" /></div>
          <div data-probe="profile-back" style={{ color: "#1a1a2e" }}><BackChevron fallback="/explore" /></div>
          <div data-probe="breadcrumb" style={{ paddingLeft: 12 }}><DiscoverBackBreadcrumb showOnWeb creatorHref="/maker1" creatorName="Maker 1" /></div>
          <div data-probe="creator-bar" style={{ width: 390 }}>
            <LiveProductCreatorBar settings={defaultProductCreatorBarSettings} creatorName="Maker 1" creatorId="probe" creatorUsername="maker1" productTitle="Product 1" productSlug="product-1" />
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, background: "#f8f9fa", display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          <ExploreCommunityCard card={card({ slug: "logo", logoUrl: LOGO })} />
          <ExploreCommunityCard card={card({ slug: "initials", name: "Morning Pages", priceLine: "$19/month", memberCount: 86, viewCount: 940 })} />
        </div>
      )}
    </AppRouterContext.Provider>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
