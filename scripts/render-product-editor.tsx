/**
 * The real product editor (app/app/products/new/product-editor.tsx) inside a
 * copy of the /app shell's frame: the 68px (58px from 768px) header space,
 * the .app-content-scroll pane and, on a phone, a stand-in for the navigation
 * pill with the same data attribute and the same place on the screen.
 * Mounted from the rows the server page would hand it, so what is measured
 * is the first frame a creator gets. Bundled by scripts/check-product-editor.mjs.
 *
 * `?new` mounts an empty form, anything else a saved product with pictures,
 * files and a variant.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductEditor } from "@/app/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/app/products/new/editor-form"

const pic = (hue: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="hsl(${hue},60%,78%)"/></svg>`)

const loaded: LoadedProduct = {
  product: {
    id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6",
    creator_id: "c1",
    title: "Portrait retouching presets, the complete set for Lightroom and Capture One",
    description: "<p>Forty presets made on real client sessions, with before and after files for each one.</p>" + "<p>Each preset was built on a real session and tested on skin tones from very fair to very deep, in daylight, tungsten and mixed light, so it holds up on the photos you actually take.</p>".repeat(5),
    price_cents: 2900,
    compare_at_cents: 3900,
    slug: "portrait-presets",
    type: "digital",
    status: "published",
    show_sales_badge: true,
    refund_policy_enabled: true,
    refund_policy_type: "14_day",
    seo_title: null,
    seo_description: null,
    call_to_action: "Buy Now",
    category: "Photography",
    pay_what_you_want: false,
    thumbnail_url: pic(260),
    gallery_urls: [pic(260), pic(20), pic(160)],
    whats_included: ["40 presets", "Before and after files", "Lifetime updates"],
    faqs: [{ question: "Which apps?", answer: "Lightroom Classic, Lightroom and Capture One." }],
  },
  assets: [
    { id: "a1", file_name: "portrait-presets-lightroom.zip", file_path: "c1/p/a1.zip", file_size: 48_000_000, mime_type: "application/zip" },
    { id: "a2", file_name: "portrait-presets-capture-one.zip", file_path: "c1/p/a2.zip", file_size: 52_000_000, mime_type: "application/zip" },
  ],
  variants: [],
}

const isNew = location.search.includes("new")

createRoot(document.getElementById("app")!).render(
  <div style={{ position: "fixed", inset: 0 }}>
    <main className="h-full pt-[68px] md:pt-[58px] bg-[#f8f9fa] overflow-hidden">
      <div className="h-[calc(100svh-68px)] md:h-[calc(100svh-58px)] overflow-y-auto app-content-scroll">
        <ProductEditor creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={isNew ? null : loaded} />
      </div>
    </main>
    <div
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden"
      style={{ paddingBottom: 6 }}
    >
      <div id="pill" className="pointer-events-auto h-[58px] w-[300px] rounded-full bg-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.18)]" />
    </div>
  </div>,
)
