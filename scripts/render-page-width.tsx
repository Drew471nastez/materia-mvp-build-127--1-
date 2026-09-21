/**
 * The creator page's three columns, side by side in one document: the tab
 * strip, the products grid it opens onto, and the About block every page
 * ends with. Driven by scripts/check-page-width.mjs.
 *
 * The real components, so this measures what ships rather than a copy of the
 * class names.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { StorefrontTabs, EmptyTabPanel, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { defaultAboutSettings } from "@/lib/store-builder/defaults"
import type { Section } from "@/lib/store-builder/types"

const products = [
  {
    id: "p1",
    title: "Arabic calligraphy",
    slug: "arabic-calligraphy",
    price: 2.5,
    compare_at_price: 3,
    thumbnail_url: "",
    product_type: "digital",
    category: "design",
  },
] as never[]

const grid = createElement(AllProductsGrid, {
  products,
  creatorName: "Sunshinedayzz",
  creatorUsername: "sunshinedayzz",
  creatorAvatarUrl: null,
  isOwner: false,
})

const tabs: StorefrontTab[] = [
  { id: "home", label: "Home", panel: grid },
  { id: "products", label: "Products", panel: grid },
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
    null,
    createElement(StorefrontTabs, { tabs }),
    createElement(SectionRenderer, {
      section: about,
      products: [],
      creatorName: "Sunshinedayzz",
      creatorUsername: "sunshinedayzz",
      sellerMemberSince: "2026-02-11T00:00:00.000Z",
      sellerProductsCount: 1,
    }),
  ),
)
} catch (e) {
  ;(window as unknown as { __err: string }).__err = String((e as Error)?.stack || e)
}
