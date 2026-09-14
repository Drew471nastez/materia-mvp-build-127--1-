/**
 * The real shop header, with and without a contact address, so the line a
 * buyer reads can be measured rather than described. The address used to
 * exist only inside the About block — a section a creator may never have
 * added — so most pages had no way to reach the seller at all.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { UnifiedShopHeader } from "@/components/store-builder/unified-section-renderer"
import { defaultShopHeaderSettings } from "@/lib/store-builder/defaults"

const common = {
  settings: { ...defaultShopHeaderSettings, bio: "Building cool stuff on the internet" },
  creator: { id: "c1", slug: "andrewrullz" } as never,
  profile: { display_name: "Andrew Rullz", username: "andrewrullz" },
  productCount: 3,
  followerCount: 2,
  isPreviewMode: false,
} as const

createRoot(document.getElementById("app")!).render(
  <div style={{ background: "#fff" }}>
    <div data-case="with">
      <UnifiedShopHeader {...common} contactEmail="hello@andrewrullz.com" />
    </div>
    <div data-case="without">
      <UnifiedShopHeader {...common} />
    </div>
  </div>,
)
