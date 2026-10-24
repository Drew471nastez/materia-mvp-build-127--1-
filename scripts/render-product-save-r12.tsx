/**
 * The real product editor, for scripts/check-product-save-r12.mjs.
 *
 * The rows come from /__probe/loaded, which the probe answers from its
 * stand-in database, the way the server page (app/app/products/load-editor)
 * hands them to the editor. So a reload after a Save draws what the save
 * wrote, and the probe can say whether it stayed.
 *
 *   ?kind=digital   a download with two variants, a file, a refund policy
 *   ?kind=physical  a thing that ships, with its stock and shipping cards
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductEditor } from "@/app/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/app/products/new/editor-form"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"

async function main() {
  const kind = new URLSearchParams(location.search).get("kind") || "digital"
  const loaded = (await fetch(`/__probe/loaded?kind=${kind}`).then((r) => r.json())) as LoadedProduct
  createRoot(document.getElementById("app")!).render(
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <main className="fixed inset-0 overflow-y-auto bg-[#f8f9fa] app-content-scroll">
        <ProductEditor creator={{ id: "c1", slug: "astrid", username: "astrid", currency: "USD" }} loaded={loaded} />
      </main>
    </PlatformSettingsProvider>,
  )
}
void main()
