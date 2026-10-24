/**
 * The markup scripts/check-aa3.mjs measures, written as JSON to stdout:
 *
 *   built      a website's product block "Buy buttons" in its owned state,
 *              as a guest who bought in this browser gets it: the real
 *              ProductBlock (components/website-builder/sections/renderers/
 *              product/product-blocks.tsx) with buy.owned set to that
 *              order's receipt (lib/receipts/guest-access-server guestOpenHref)
 *   theme      an imported theme's product page notice (lib/storelib-theme/
 *              compat/owned-banner.ts) for the same guest
 *   files      the sentence Files says when a picture it was asked to delete
 *              stays (lib/files/kept-words.ts)
 *
 *   npx tsx scripts/render-aa3.tsx
 */
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ProductBlock, type ProductCtx } from "@/components/website-builder/sections/renderers/product/product-blocks"
import { ownedBanner } from "@/lib/storelib-theme/compat/owned-banner"
import { hiddenNote } from "@/lib/files/kept-words"

const ORDER = "0a000000-0000-4000-8000-000000000001"
/* lib/receipts/guest-access-server guestOpenHref, written out: that module is server only. */
const guestOpenHref = (id: string) => `/api/receipt/open?order=${encodeURIComponent(id)}`
const noop = () => {}
const ctx = {
  product: { id: "e0000000-0000-4000-8000-000000000001", title: "Lightroom presets", type: "digital", price_cents: 4900 },
  sample: false,
  variant: null,
  chosen: [],
  choose: noop,
  facts: { priceCents: 4900, payWhatYouWant: false },
  canBuy: true,
  quantity: 1,
  setQuantity: noop,
  maxQuantity: 1,
  pwywInput: "",
  setPwywInput: noop,
  pwywError: null,
  palette: { primary_button_background: "#1a1a2e", primary_button_text: "#ffffff", heading: "#1a1a2e" },
  inEditor: false,
  inert: false,
  buy: { add: noop, now: noop, added: false, unavailable: null, owned: guestOpenHref(ORDER) },
  wishlist: { saved: false, toggle: noop },
  radius: "8px",
  buttonRadius: { borderRadius: 8 },
  money: (c: number) => `${(c / 100).toFixed(2)} lei`,
} as unknown as ProductCtx

const built = renderToStaticMarkup(<ProductBlock block={{ id: "b1", type: "buy_buttons", settings: {} } as never} ctx={ctx} />)
const theme = ownedBanner({ whole: true, options: [] }, null, guestOpenHref(ORDER))
const files = hiddenNote([
  { kind: "product", label: "Lamp", href: "/app/products/p1" },
  { kind: "product", label: "Shade", href: "/app/products/p2" },
  { kind: "variant", label: "Bulb, Warm", href: "/app/products/p3" },
])
process.stdout.write(JSON.stringify({ built, theme, files }))
