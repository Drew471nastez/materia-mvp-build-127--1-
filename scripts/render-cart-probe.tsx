/**
 * The cart page on its own, for scripts/check-cart-coupon.mjs: the real
 * CartPageBody inside the real SiteCartProvider, with a basket already in
 * local storage and /api/coupons/validate and /api/checkout/cart answered
 * the way the real routes answer. `?theme=dark` draws it on a dark site.
 */
import * as React from "react"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { cartStorageKey, serializeCart, type CartLine } from "@/lib/website-builder/cart"

declare global {
  interface Window {
    __commerceProbeCalls?: { url: string; body: unknown }[]
  }
}

const LINES: CartLine[] = [
  { productId: "11111111-1111-4111-8111-111111111111", variantId: null, title: "Lightroom presets, the full set", variantName: null, priceCents: 2900, thumbnailUrl: null, slug: "presets", digital: true, quantity: 1 },
  { productId: "22222222-2222-4222-8222-222222222222", variantId: null, title: "Printed zine", variantName: "Issue 3", priceCents: 1200, thumbnailUrl: null, slug: "zine", digital: false, quantity: 2 },
]

function stubFetch() {
  const calls: { url: string; body: unknown }[] = (window.__commerceProbeCalls = [])
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(String(init.body)) : null
    calls.push({ url, body })
    if (url.startsWith("/api/coupons/validate")) {
      const code = String(body?.code ?? "").toUpperCase()
      const items = (body?.items ?? []) as { quantity: number }[]
      const subtotal = 2900 + 1200 * (items[1]?.quantity ?? 0)
      if (code === "SAVE20") return json({ ok: true, code: "SAVE20", label: "20%", discountCents: Math.round(subtotal * 0.2), subtotalCents: subtotal, totalCents: subtotal - Math.round(subtotal * 0.2), lines: [] })
      if (code === "FREEBIE") return json({ ok: true, code: "FREEBIE", label: "100%", discountCents: subtotal, subtotalCents: subtotal, totalCents: 0, lines: [] })
      return json({ ok: false, error: code === "OLD" ? "That code has expired." : "That code is not valid." })
    }
    if (url.startsWith("/api/checkout/cart")) {
      if (body?.buyer && !(body.buyer.email && body.buyer.firstName && body.buyer.agreedToTerms)) return json({ error: "Enter your name and email, and agree to the Terms, to get your free order.", needsDetails: true }, 400)
      return json({ error: "stopped by the probe" }, 400)
    }
    return json({})
  }) as typeof fetch
}

export function boot(render: (el: React.ReactElement) => void) {
  stubFetch()
  window.localStorage.setItem(cartStorageKey("shop1"), serializeCart(LINES))
  const dark = new URLSearchParams(location.search).get("theme") === "dark"
  const palette = dark
    ? { bg: "#141414", text: "#e8e8e8", heading: "#ffffff", border: "#333333", buttonBg: "#f5f5f5", buttonText: "#111111" }
    : { bg: "#ffffff", text: "#111111", heading: "#111111", border: "#e5e7eb", buttonBg: "#111111", buttonText: "#ffffff" }
  document.body.style.background = palette.bg
  render(
    <SiteCartProvider shopId="shop1">
      <div data-page="cart">
        <CartPageBody palette={palette} radius={12} />
      </div>
    </SiteCartProvider>,
  )
}
