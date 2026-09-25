/**
 * The creator page from the tab strip down, with the real components: the
 * strip, a Home panel and a Products tab of real product cards (each asking
 * next/image for its picture, the way the live page does), the Communities
 * empty state, the About block and the footer. Above it a block the height
 * of the cover and the profile, so the strip sits where it sits on a phone.
 *
 * Driven by scripts/check-storefront-tabs.mjs.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { StorefrontTabs, EmptyTabPanel, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { defaultAboutSettings } from "@/lib/store-builder/defaults"
import type { Section } from "@/lib/store-builder/types"

const product = (i: number, set: string) => ({
  id: `${set}${i}`,
  slug: `${set}-product-${i}`,
  title: `${set === "h" ? "Featured" : "Catalogue"} product number ${i}`,
  thumbnail_url: `/img/${set}${i}.png`,
  price_cents: 1200 + i * 100,
  compare_at_cents: null,
  sales_count: i,
  categories: [{ id: "c", name: i % 2 ? "Guides" : "Templates" }],
})

/* Home and Products do not share pictures, the way a Featured rail and the
   whole catalogue usually do not: six on Home, nine behind the tab. */
const home = Array.from({ length: 6 }, (_, i) => product(i + 1, "h"))
const catalogue = Array.from({ length: 9 }, (_, i) => product(i + 1, "p"))

const grid = (products: typeof home) =>
  createElement(AllProductsGrid, {
    products: products as never,
    creatorName: "Luca Dragoste",
    creatorUsername: "lucadragoste",
    creatorAvatarUrl: null,
    isOwner: false,
  })

const tabs: StorefrontTab[] = [
  { id: "home", label: "Home", panel: grid(home) },
  { id: "products", label: "Products", panel: grid(catalogue) },
  {
    id: "communities",
    label: "Communities",
    panel: createElement(EmptyTabPanel, { icon: "communities", title: "No communities yet", detail: "This creator hasn't opened any yet." }),
  },
]

const about = {
  id: "about-default",
  type: "about",
  order: 0,
  settings: { ...defaultAboutSettings },
} as Section

try {
  createRoot(document.getElementById("root")!).render(
    createElement(
      "div",
      { style: { background: "#f6f6f7" } },
      /* Stands in for the cover and the profile. */
      createElement("div", { "data-probe-header": "", style: { height: 520 } }),
      createElement(StorefrontTabs, { tabs }),
      createElement(SectionRenderer, {
        section: about,
        products: [],
        creatorName: "Luca Dragoste",
        creatorUsername: "lucadragoste",
        sellerMemberSince: "2025-12-16T00:00:00.000Z",
        sellerProductsCount: 2,
      }),
      createElement(SellerFooter, {}),
    ),
  )
} catch (e) {
  ;(window as unknown as { __err: string }).__err = String((e as Error)?.stack || e)
}
