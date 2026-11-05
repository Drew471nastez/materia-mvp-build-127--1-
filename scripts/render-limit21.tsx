/**
 * Limit sales for a download, drawn for scripts/check-limit21.mjs.
 *
 *   ?editor  the real product editor (app/(storelib)/app/products/new/product-editor),
 *            mounted from the rows the server page hands it, with a saved
 *            limit of 100 and 97 copies sold (app/(storelib)/app/products/load-editor)
 *   ?shop    the product page's real buy box (components/checkout/
 *            purchase-status-wrapper) sold out and with three left, and the
 *            real Explore card (components/explore/product-card), which the
 *            creator page draws too, sold out beside one that is not
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ProductEditor } from "@/app/(storelib)/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/(storelib)/app/products/new/editor-form"
import { PurchaseStatusWrapper } from "@/components/checkout/purchase-status-wrapper"
import { ProductCard } from "@/components/explore/product-card"

const pic = (hue: number) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="hsl(${hue},60%,78%)"/></svg>`)

const loaded: LoadedProduct = {
  product: {
    id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6",
    creator_id: "c1",
    title: "Analog drum sample pack, limited run",
    description: "<p>Three hundred one shots and loops recorded on a 1972 kit.</p>",
    price_cents: 2900,
    slug: "drum-pack",
    type: "digital",
    status: "published",
    show_sales_badge: true,
    refund_policy_enabled: false,
    call_to_action: "Buy Now",
    category: "Music",
    pay_what_you_want: false,
    thumbnail_url: pic(30),
    gallery_urls: [pic(30)],
    whats_included: ["300 one shots", "40 loops"],
    faqs: [{ question: "Which format?", answer: "24 bit WAV." }],
  },
  assets: [{ id: "a1", file_name: "drum-pack.zip", file_path: "c1/p/a1.zip", file_size: 480_000_000, mime_type: "application/zip" }],
  variants: [],
  sales: { limit: 100, sold: 97, missing: false },
}

const card = (id: string, title: string, hue: number, soldOut: boolean) => ({
  id,
  title,
  slug: id,
  price_cents: 2900,
  thumbnail_url: pic(hue),
  type: "digital",
  categoryName: "Music",
  sold_out: soldOut,
  creator: { profile: { display_name: "Astrid", username: "astrid", avatar_url: null } },
})

function Shop() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4">
      <div className="mx-auto grid max-w-[1100px] gap-6 lg:grid-cols-2">
        <section data-box="sold" className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="mb-3 text-[17px] font-semibold text-[#1a1a2e]">Analog drum sample pack</h2>
          <p className="mb-4 text-2xl font-bold">$29</p>
          <PurchaseStatusWrapper productId="p-sold" productType="digital" priceCents={2900} creatorId="c1" callToAction="Buy Now" sales={{ soldOut: true, fewLeft: null }} />
        </section>
        <section data-box="few" className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <h2 className="mb-3 text-[17px] font-semibold text-[#1a1a2e]">Tape loops, second run</h2>
          <p className="mb-4 text-2xl font-bold">$19</p>
          <PurchaseStatusWrapper productId="p-few" productType="digital" priceCents={1900} creatorId="c1" callToAction="Buy Now" sales={{ soldOut: false, fewLeft: "Only 3 left" }} />
        </section>
        <div data-cards="" className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
          <ProductCard product={card("drum-pack", "Analog drum sample pack", 30, true)} />
          <ProductCard product={card("tape-loops", "Tape loops, second run", 200, false)} />
        </div>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById("app")!)
if (location.search.includes("shop")) root.render(<Shop />)
else
  root.render(
    <main className="fixed inset-0 overflow-y-auto bg-[#f8f9fa] app-content-scroll">
      <ProductEditor creator={{ id: "c1", slug: "astrid", username: "astrid" }} loaded={loaded} />
    </main>,
  )
