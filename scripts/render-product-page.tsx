/**
 * The main product section (components/website-builder/sections/renderers/
 * ProductSection.tsx) with a fixture product, for scripts/check-product-page.mjs.
 * Drawn the way a live product page draws it: inside the section box's
 * container, under a sticky header, with `_product_data` as the server
 * fills it.
 *
 *   ?layout=stacked|stacked_2col|slideshow|carousel   the media layout
 *   ?width=50|55|60                                   the media column, in %
 *   ?mobile=slider|stacked                            the phone's media
 *   ?sticky=1|0                                       the details kept in view
 *   ?legacy=1                                         a section saved before blocks
 *
 * The fixture's main picture is stored again as the gallery's first, the way
 * products are saved, so a duplicate would show.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"

import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { SiteCartProvider, useSiteCart } from "@/components/website-builder/site-cart"
import { mainProductSection } from "@/lib/website-builder/product-page"
import type { ProductSectionData } from "@/lib/products/product-page-model"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const q = new URLSearchParams(location.search)
const img = (name: string) => `https://img.test/${name}.svg`

const product: ProductSectionData = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Field overshirt",
  slug: "field-overshirt",
  type: "physical",
  description: "<p>Heavy cotton twill, garment dyed.</p><p>Two chest pockets, horn buttons.</p>",
  description_html: "<p>Heavy cotton twill, garment dyed.</p><p>Two chest pockets, horn buttons.</p>",
  price_cents: 8900,
  compare_at_cents: 11000,
  thumbnail_url: img("one"),
  /* The main picture again, first, as the product editor stores it. */
  gallery_urls: [img("one"), img("two"), img("three"), img("four")],
  options: [
    { name: "Colour", values: ["Black", "Sand"] },
    { name: "Size", values: ["S", "M", "L"] },
  ],
  variants: [
    { id: "v-bs", name: "Black / S", options: ["Black", "S", null], price_cents: 8900, compare_at_cents: 11000, image_url: img("one"), available: true, left: null, max_quantity: 99, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
    { id: "v-bm", name: "Black / M", options: ["Black", "M", null], price_cents: 8900, compare_at_cents: 11000, image_url: img("one"), available: true, left: 3, max_quantity: 3, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
    { id: "v-sm", name: "Sand / M", options: ["Sand", "M", null], price_cents: 8900, compare_at_cents: null, image_url: img("sand"), available: true, left: null, max_quantity: 99, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
    { id: "v-sl", name: "Sand / L", options: ["Sand", "L", null], price_cents: 8900, compare_at_cents: null, image_url: img("sand"), available: false, left: null, max_quantity: 0, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
  ],
  inventory_left: null,
  created_at: new Date().toISOString(),
}

const made = mainProductSection("main-product")
const section: SectionInstance = q.get("legacy") === "1"
  ? { id: "main-product", type: "product", name: "Product", settings: { show_wishlist: true, show_share_button: true, show_whats_included: true, image_width: `${q.get("width") ?? "55"}%`, multiple_images_layout: q.get("layout") ?? "stacked", _product_data: product }, blocks: [] }
  : {
      ...made,
      settings: {
        ...made.settings,
        multiple_images_layout: q.get("layout") ?? "stacked",
        image_width: `${q.get("width") ?? "55"}%`,
        mobile_media: q.get("mobile") ?? "slider",
        sticky_info: q.get("sticky") !== "0",
        media_ratio: "portrait",
        image_click_action: "zoom",
        _product_data: product,
      },
      blocks: [
        ...(made.blocks ?? []),
        { id: "tab-1", type: "collapsible_tab", settings: { heading: "Fit and care", content: "<p>True to size. Wash cold.</p>", margin_bottom: 0 } },
        { id: "icon-1", type: "icon_with_text", settings: { icon: "truck", heading: "Ships in 2 days", text: "From Lisbon", margin_bottom: 12 } },
      ],
    }

const theme: ThemeSettingsValues = { border_radius: 8, button_style: "rounded" }

/** What the cart holds, written on the page for the check to read. */
function CartProbe() {
  const cart = useSiteCart()
  return <script type="application/json" data-cart-lines="" data-open={cart.open ? "1" : "0"} dangerouslySetInnerHTML={{ __html: JSON.stringify(cart.lines) }} />
}

function Page() {
  return (
    <div>
      {/* A header that stays on screen, as a site's does: the sticky column stops under it. */}
      <div data-chrome="" data-section="" style={{ position: "sticky", top: 0, zIndex: 40 }}>
        <header style={{ position: "sticky", top: 0, height: 64, background: "#fff", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", padding: "0 20px", fontWeight: 600 }}>Northwind</header>
      </div>
      {/* Physical commerce on, as on the live platform, unless ?physical=off. */}
      <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce={q.get("physical") !== "off"}>
        {/* The cart in memory, as in the builder: no shop id, nothing stored. */}
        <SiteCartProvider>
          <div className="@container" data-product-box="">
            <ProductSection section={section} theme={theme} />
          </div>
          <CartProbe />
        </SiteCartProvider>
      </PlatformSettingsProvider>
      <div style={{ height: 1600, background: "#f3f4f6" }} data-after="" />
    </div>
  )
}

createRoot(document.getElementById("root")!).render(<Page />)
