/**
 * THE EDITOR, ITS PREVIEW AND THE LIVE PAGE, FROM ONE SAVED ROW, for
 * scripts/check-onepage-audit.mjs.
 *
 *   /app/onepage        the real editor, opened on the row the stub server holds
 *                       (as app/app/onepage/page.tsx hands it the row it read)
 *   /onepage-preview    the preview's frame (components/onepage/preview-document)
 *   /live               the published page, built from the same row the way
 *                       app/(marketing)/l/[slug]/page.tsx builds it: the published
 *                       shape with the owner's live name and photo, products read
 *                       from the catalogue, prices in the store's currency
 *
 * The server (check-onepage-audit.mjs) keeps the row the way the real routes
 * do: PUT /api/onepage merges a save in (settings merged, the photo never
 * taken from the browser), POST /api/onepage/publish takes the published copy.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { PriceCurrency } from "@/components/platform/price-currency"
import { LiveStoreCurrency } from "@/lib/store/currency-context"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { withLiveProducts, type ProductsDb } from "@/lib/onepage/live-products"
import { createClient } from "@/lib/supabase/client"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

function readJson(url: string) {
  const x = new XMLHttpRequest()
  x.open("GET", url, false)
  x.send()
  return JSON.parse(x.responseText)
}

const { onepage: row, owner, currency, products } = readJson("/__state")
;(window as any).PROBE_PRODUCTS = products
const root = createRoot(document.getElementById("app")!)

if (location.pathname.startsWith("/onepage-preview")) {
  root.render(<OnePagePreviewDocument />)
} else if (location.pathname.startsWith("/live")) {
  const shape = publicOnePage(row, { source: "published", displayName: owner.displayName, liveAvatarUrl: owner.avatarUrl, sellerId: row.seller_id })
  withLiveProducts(createClient() as unknown as ProductsDb, shape.seller_id ?? "", shape.blocks).then((blocks) => {
    shape.blocks = blocks
    root.render(
      <PriceCurrency currency={currency}>
        <PublicOnePage onepage={shape as never} />
      </PriceCurrency>,
    )
  })
} else {
  root.render(
    <LiveStoreCurrency currency={currency}>
      <OnePageEditor initialOnePage={row} />
    </LiveStoreCurrency>,
  )
}
