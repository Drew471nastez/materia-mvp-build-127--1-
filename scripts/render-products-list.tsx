/**
 * The real Products list (app/(storelib)/app/products/products-client.tsx) with 120
 * products: drafts, archived ones, free ones and ones with no picture, so
 * there is a second and third page. Bundled by
 * scripts/check-products-translate.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { LanguageProvider } from "@/lib/i18n"

const cover = (hue: number) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="hsl(${hue},45%,72%)"/></svg>`)
const shelf = Array.from({ length: 120 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: `Product ${i + 1}`,
  type: "digital",
  price_cents: i % 7 === 0 ? 0 : 1200 + i * 350,
  status: i % 5 === 2 ? "draft" : "published",
  thumbnail_url: i % 4 === 0 ? null : cover(i * 37),
  slug: `product-${i}`,
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(),
  archived: i % 9 === 4,
  sales_count: i % 3 === 0 ? 12 * i : 0,
}))

document.documentElement.classList.add("app-layout")
createRoot(document.getElementById("app")!).render(
  <div style={{ position: "fixed", inset: 0 }}>
    <main className="h-full overflow-hidden bg-[#f8f9fa]">
      <div className="app-content-scroll h-[100svh] overflow-y-auto">
        <LanguageProvider>
          <ProductsClient products={shelf as never} creatorUsername="astrid" />
        </LanguageProvider>
      </div>
    </main>
  </div>,
)
