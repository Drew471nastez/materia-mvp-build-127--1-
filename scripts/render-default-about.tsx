/**
 * The About block a creator gets when they have never opened the builder:
 * the real section renderer, handed nothing but the defaults.
 * Driven by scripts/check-default-about.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { SectionRenderer } from "@/components/store-builder/section-renderer"
import { defaultAboutSettings } from "@/lib/store-builder/defaults"
import type { Section } from "@/lib/store-builder/types"

const section = {
  id: "about-default",
  type: "about",
  order: 0,
  /* Nothing typed in, which is the whole point: this is what a page shows
     for somebody who has only ever uploaded a product. */
  settings: { ...defaultAboutSettings },
} as Section

createRoot(document.getElementById("root")!).render(
  createElement(SectionRenderer, {
    section,
    products: [],
    creatorName: "Sunshinedayzz",
    creatorUsername: "sunshinedayzz",
    sellerMemberSince: "2026-02-11T00:00:00.000Z",
    sellerTotalSales: 17,
    sellerProductsCount: 1,
  }),
)
