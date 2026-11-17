/**
 * The Products page (app/(storelib)/app/products/products-client.tsx) with a shop's
 * worth of products, for scripts/check-products-page.mjs to measure.
 * `#many` renders sixty, enough for a second page, `#none` an empty shop, and
 * `#legacy` one archived by its status alone. `#sidebar` sets the page
 * 240px in from the left, where the app's sidebar leaves it from 768px, so a
 * tablet is measured at the width it really gets.
 *
 * The page sits in the app's own scroller (`html.app-layout
 * .app-content-scroll`), so globals.css gives it the room it really gets for
 * the navigation pill at the foot of a phone, and that room is measured
 * rather than assumed.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { LanguageProvider } from "@/lib/i18n"
import { ProductsClient } from "@/app/(storelib)/app/products/products-client"
import { SaveButton, barIconButton } from "@/app/(storelib)/app/products/new/editor-buttons"

const many = location.hash.includes("many")
const sidebar = location.hash.includes("sidebar")
/* Covers in a few quiet colours with a shape on each, so a screenshot reads like a real shelf. */
const COVERS = [
  ["#d9cbb6", "#8a6f4e"],
  ["#c9d6df", "#3f5a6e"],
  ["#e5d0d0", "#8c4a4a"],
  ["#d3dccb", "#56684a"],
  ["#1f2330", "#e8c28c"],
  ["#ece6da", "#2c2a26"],
]
const cover = (i: number) => {
  const [bg, ink] = COVERS[i % COVERS.length]
  const shape = i % 3 === 0 ? `<circle cx="40" cy="44" r="20" fill="${ink}"/>` : i % 3 === 1 ? `<rect x="18" y="22" width="44" height="36" rx="3" fill="${ink}"/>` : `<path d="M10 62 L32 30 L46 48 L56 38 L70 62 Z" fill="${ink}"/>`
  return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${bg}"/>${shape}</svg>`)
}
const none = location.hash.includes("none")
/* `#legacy`: the last product saved with status "archived" and the flag off, which Restore could not bring back. */
const legacy = location.hash.includes("legacy")
const products = Array.from({ length: none ? 0 : many ? 60 : 14 }, (_, i) => ({
  id: `p${i}`,
  creator_id: "c1",
  title: i === 2 ? "The complete portrait retouching course, with every raw file and preset included for the whole year" : `Product ${i + 1}`,
  type: "digital",
  /* Product 5 is free. */
  price_cents: i === 4 ? 0 : 1200 + i * 350,
  status: legacy && i === 13 ? "archived" : i % 5 === 3 ? "draft" : "published",
  thumbnail_url: i % 4 === 1 ? null : cover(i),
  slug: `product-${i}`,
  /* Newest first, one a day, as the server reads them. */
  created_at: new Date(Date.UTC(2026, 8, 1) - i * 86400000).toISOString(),
  archived: !legacy && i === 13,
  sales_count: i % 3 === 0 ? 12 * i : 0,
}))

/*
  The shell's header is 68px on a phone and 58px from 768px, and
  globals.css sizes the scroller to what is left under it, so the scroller
  starts there too and ends at the bottom of the screen, as in the app. The
  header itself is a plain white stand-in.
*/
document.documentElement.classList.add("app-layout")
const HEADER = window.innerWidth >= 768 ? 58 : 68
document.head.insertAdjacentHTML("beforeend", "<style>html.app-layout, html.app-layout body { background-color: #f8f9fa !important }</style>")

createRoot(document.getElementById("app")!).render(
  <LanguageProvider>
    <PlatformSettingsProvider physicalCommerce={location.hash.includes("physical")} exploreMarketplace={false} buyerHeaderLight={false}>
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: HEADER, background: "#fff", borderBottom: "1px solid #eceef1" }} />
    <div className="app-content-scroll" style={{ position: "fixed", top: HEADER, left: sidebar ? 240 : 0, right: 0, overflowY: "auto" }}>
      <ProductsClient products={products} creatorUsername="astrid" />
    </div>
    {/* The editor's own more button and Save, off screen, for the probe to hold the list's buttons against. */}
    <div aria-hidden style={{ position: "fixed", left: -9999, top: 0 }}>
      <button type="button" data-probe-more="" className={barIconButton} />
      <span data-probe-save="">
        <SaveButton phase="idle" disabled={false} onSave={() => {}} />
      </span>
    </div>
    </PlatformSettingsProvider>
  </LanguageProvider>,
)
