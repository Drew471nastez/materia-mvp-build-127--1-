/**
 * The Products page (app/app/products/products-client.tsx) with a shop's
 * worth of products, for scripts/check-products-page.mjs to measure.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { ProductsClient } from "@/app/app/products/products-client"

const PIC = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#c7b8f5"/></svg>')
const products = Array.from({ length: 14 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: i === 2 ? "The complete portrait retouching course, with every raw file and preset included" : `Product ${i + 1}`,
  type: "digital",
  price_cents: 1200 + i * 350,
  status: i % 5 === 3 ? "draft" : "published",
  thumbnail_url: i % 4 === 1 ? null : PIC,
  slug: `product-${i}`,
  created_at: "2026-09-01T00:00:00Z",
  archived: i === 13,
}))

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <div style={{ position: "fixed", inset: 0 }}>
      <ProductsClient products={products} creatorUsername="astrid" />
    </div>
  </LanguageProvider>,
)
