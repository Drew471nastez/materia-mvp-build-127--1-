/**
 * The real components a buyer and a seller meet with personalization, for
 * scripts/check-personalization-r13.mjs (?view=):
 *
 *   editor    the product editor (app/app/products/new/product-editor.tsx)
 *             on a physical product with personalization and custom fields
 *   product   a Storelib theme's product section (ProductSection), its
 *             default blocks, the product's fields above the buy buttons
 *   buybox    the storelib.com product page's buy box (PhysicalBuyBox)
 *   cart      the website's cart page (CartPageBody) with two personalized lines
 *   order     the seller's order (PhysicalOrderPanel), drawn from the order
 *             the journey's real route answered (tests/e2e-personalization)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductEditor } from "@/app/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/app/products/new/editor-form"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PhysicalBuyBox } from "@/components/physical/buy-box"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { PhysicalOrderPanel } from "@/components/physical/order-panel"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import productSchema from "@/themes/default/sections/product.json"

const w = window as unknown as { __product: Record<string, unknown>; __shop: string; __orderId: string }

async function main() {
  const view = new URLSearchParams(location.search).get("view") || "editor"
  const root = createRoot(document.getElementById("app")!)
  const wrap = (node: React.ReactNode) => (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      {node}
    </PlatformSettingsProvider>
  )
  if (view === "editor") {
    const loaded = (await fetch(`/__probe/loaded`).then((r) => r.json())) as LoadedProduct
    root.render(wrap(<main className="fixed inset-0 overflow-y-auto bg-[#f8f9fa] app-content-scroll"><ProductEditor creator={{ id: "c1", slug: "ema", username: "ema", currency: "USD" }} loaded={loaded} /></main>))
    return
  }
  if (view === "product" || view === "cart") {
    const preset = (productSchema as { presets: { settings: Record<string, unknown>; blocks: { id: string; type: string; settings: Record<string, unknown> }[] }[] }).presets[0]
    const section = { id: "main-product", type: "product", settings: { ...preset.settings, _product_data: w.__product }, blocks: preset.blocks }
    const theme = { border_radius: 10 } as never
    const palette = { bg: "#ffffff", text: "#303036", heading: "#111113", border: "#e5e7eb", buttonBg: "#111113", buttonText: "#ffffff" }
    root.render(
      wrap(
        <StorefrontProvider value={{ creatorId: w.__shop, currency: "USD" }}>
          <SiteCartProvider shopId={w.__shop} cartType="page" currency="USD">
            <div style={{ background: "#fff", minHeight: "100vh" }} className="@container">
              {view === "product" ? <ProductSection section={section as never} theme={theme} /> : <CartPageBody palette={palette} radius={10} />}
            </div>
          </SiteCartProvider>
        </StorefrontProvider>,
      ),
    )
    return
  }
  if (view === "buybox") {
    root.render(wrap(<div style={{ maxWidth: 440, margin: "0 auto", padding: 20, background: "#fff" }}><h1 style={{ fontSize: 26, fontWeight: 700, margin: "0 0 12px", color: "#111113" }}>Engraved Mug</h1><PhysicalBuyBox productId={String(w.__product.id)} /></div>))
    return
  }
  if (view === "order") {
    root.render(wrap(<div className="min-h-screen bg-[#f8f9fa] p-4 sm:p-6"><div className="mx-auto max-w-[760px]"><PhysicalOrderPanel orderRowId={w.__orderId} /></div></div>))
  }
}
void main()
