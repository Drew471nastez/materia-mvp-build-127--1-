/**
 * Explore as the route draws it, for scripts/check-explore-speed.mjs: the
 * real ExplorePageClient with sixty products across the pills and twenty
 * communities, and NO fetch stub. The communities route is answered by the
 * probe's own small HTTP server, so the browser's network throttling (Slow
 * 3G) applies to every pill's request exactly as it would on the site.
 *
 *   #products       products mode, communities switched on
 *   #communities    /explore?type=communities, the first page drawn with the page
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LocaleProvider } from "@/components/locale-provider"
import { ExplorePageClient } from "@/components/explore/explore-page-client"
import { COMMUNITIES, PRODUCTS } from "./explore-speed-fixture"

const mode = location.hash.replace("#", "") || "products"
;(window as any).__search = mode === "communities" ? "type=communities" : ""

createRoot(document.getElementById("app")!).render(
  <LocaleProvider>
    <main className="explore-ground min-h-screen bg-[#f8f9fa]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-5 sm:pb-8">
        <ExplorePageClient
          initialProducts={PRODUCTS}
          initialCategory="all"
          searchQuery=""
          communitiesEnabled
          discoverHeadlineSegmentEnabled={false}
          initialDiscoverMode={mode === "communities" ? "communities" : "products"}
          initialCommunities={mode === "communities" ? { query: "", items: COMMUNITIES.slice(0, 24), next: null } : null}
        />
      </div>
    </main>
  </LocaleProvider>,
)
