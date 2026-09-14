/**
 * ===========================================================================
 *  NO CATEGORY PILL ABOVE THE BIO
 * ===========================================================================
 * The header is mounted with a niche set in both of the places it could come
 * from — the creator row (creators.niche_tags) and the builder's own copy
 * (globalSettings.storeNicheTags) — and with the two old switches still
 * present in the stored settings, because a creator whose page was saved a
 * week ago has them saved. If the pill can still be drawn, this is where it
 * would come back.
 *
 * The word used as the niche is a real one from Explore rather than a
 * nonsense string, so a check for it is a check for the thing a visitor
 * would actually have seen.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { defaultShopHeaderSettings, defaultGlobalStoreSettings } from "@/lib/store-builder/defaults"

const NICHE = "Photography"

const creator = {
  id: "c1",
  slug: "andrewrullz",
  niche_tags: [NICHE],
  show_total_sales_badge: false,
} as never

const profile = {
  id: "p1",
  username: "andrewrullz",
  display_name: "Andrew Rullz",
  avatar_url: null,
} as never

// Both switches on, the way every config saved before today has them.
const settings = {
  ...defaultShopHeaderSettings,
  showBio: true,
  bio: "I shoot skate videos and sell the presets I grade them with.",
  showCategory: true,
  showNicheTags: true,
} as never

const globalSettings = {
  ...defaultGlobalStoreSettings,
  storeNicheTags: [NICHE],
} as never

createRoot(document.getElementById("app")!).render(
  <div style={{ background: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
    <div data-case="desktop">
      <UnifiedShopHeader
        settings={settings}
        creator={creator}
        profile={profile}
        products={[]}
        isPreviewMode
        globalSettings={globalSettings}
      />
    </div>
    <div data-case="mobile">
      <UnifiedShopHeader
        settings={settings}
        creator={creator}
        profile={profile}
        products={[]}
        isMobile
        isPreviewMode
        globalSettings={globalSettings}
      />
    </div>
  </div>,
)
