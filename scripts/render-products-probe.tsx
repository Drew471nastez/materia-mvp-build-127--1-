/**
 * The Products page (app/app/products/products-client.tsx) with a shop's
 * worth of products, for scripts/check-products-page.mjs to measure.
 * `#many` renders sixty, enough for a second page, `#none` an empty shop, and
 * `#legacy` one archived by its status alone. `#sidebar` sets the page
 * 240px in from the left, where the app's sidebar leaves it from 768px, so a
 * tablet is measured at the width it really gets.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LanguageProvider } from "@/lib/i18n"
import { ProductsClient } from "@/app/app/products/products-client"

const many = location.hash.includes("many")
const sidebar = location.hash.includes("sidebar")
const PIC = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#c7b8f5"/></svg>')
const none = location.hash.includes("none")
/* `#legacy`: the last product saved with status "archived" and the flag off, which Restore could not bring back. */
const legacy = location.hash.includes("legacy")
const products = Array.from({ length: none ? 0 : many ? 60 : 14 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: i === 2 ? "The complete portrait retouching course, with every raw file and preset included for the whole year" : `Product ${i + 1}`,
  type: "digital",
  price_cents: 1200 + i * 350,
  status: legacy && i === 13 ? "archived" : i % 5 === 3 ? "draft" : "published",
  thumbnail_url: i % 4 === 1 ? null : PIC,
  slug: `product-${i}`,
  /* Newest first, one a day, as the server reads them. */
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(),
  archived: !legacy && i === 13,
  sales_count: i % 3 === 0 ? 12 * i : 0,
}))

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <div style={{ position: "fixed", inset: 0, left: sidebar ? 240 : 0 }}>
      <ProductsClient products={products} creatorUsername="astrid" />
    </div>
  </LanguageProvider>,
)
