// The native main product section (components/website-builder/sections/renderers/product/product-media.tsx) with
// pictures of varied shapes, for scripts/check-product-images-r63.mjs.
//   ?imgs=a,b,c  ?layout=stacked|stacked_2col|slideshow|carousel  ?ratio=natural|square|portrait|landscape  ?mobile=slider|stacked
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { mainProductSection } from "@/lib/website-builder/product-page"
import type { ProductSectionData } from "@/lib/products/product-page-model"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const q = new URLSearchParams(location.search)
const base = q.get("base") ?? "https://img.test"
const imgs = (q.get("imgs") ?? "tall45").split(",").map((n) => `${base}/${n}.jpg`)
const product: ProductSectionData = {
  id: "11111111-1111-4111-8111-111111111111", title: "The Skinny To Strong Programme", slug: "skinny", type: "digital",
  description: "<p>A 12 week plan.</p>", description_html: "<p>A 12 week plan.</p>", price_cents: 0, compare_at_cents: null,
  thumbnail_url: imgs[0], gallery_urls: imgs, options: [], variants: [], inventory_left: null, created_at: new Date().toISOString(),
} as unknown as ProductSectionData
const made = mainProductSection("main-product")
const section: SectionInstance = { ...made, settings: { ...made.settings, multiple_images_layout: q.get("layout") ?? "stacked", mobile_media: q.get("mobile") ?? "slider", ...(q.get("ratio") ? { media_ratio: q.get("ratio") } : {}), _product_data: product } }
const theme: ThemeSettingsValues = { border_radius: 8, button_style: "rounded" }
createRoot(document.getElementById("root")!).render(
  <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
    <SiteCartProvider>
      <div className="@container" data-product-box="">
        <ProductSection section={section} theme={theme} />
      </div>
    </SiteCartProvider>
  </PlatformSettingsProvider>,
)
