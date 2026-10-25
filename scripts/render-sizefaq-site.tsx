/**
 * A Storelib theme's product page as the published site draws it, for
 * scripts/check-sizefaq-r13.ts (round 13): the sections and their
 * prerendered .storelib markup are made by the probe in Node with the real
 * server code (lib/products/product-section-data.ts for the product,
 * lib/products/page-product.ts and lib/website-builder/storefront-render.ts
 * as components/website-builder/theme/render-product.tsx calls them) and
 * handed over as `window.SIZEFAQ_PAGE`; this mounts them in ThemePage, under
 * the same providers the live route uses (app/(site)/w/[username]/render-site.tsx).
 */
import { createRoot } from "react-dom/client"
import { createElement, useEffect } from "react"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import type { RenderedSection } from "@/components/website-builder/sections/storelib-sources"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    SIZEFAQ_PAGE: { theme: ThemeSettingsValues; sections: SectionInstance[]; prerendered: Record<string, RenderedSection> }
    __sizefaqReady?: boolean
  }
}

function Mount() {
  useEffect(() => {
    window.__sizefaqReady = true
  }, [])
  const { theme, sections, prerendered } = window.SIZEFAQ_PAGE
  return createElement(StorelibSourcesProvider, {
    prerendered,
    page: { template: "product" },
    children: createElement(ThemePage, { theme, sections, storefront: { creatorId: "11111111-1111-4111-8111-111111111111", installId: "probe-install", pageKey: "product" } }),
  })
}

createRoot(document.getElementById("mount")!).render(createElement(Mount))
