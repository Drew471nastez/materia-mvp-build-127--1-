/**
 * The checkout on its own, for scripts/check-checkout.mjs: the real page
 * component with a product, and the routes it calls answered the way the
 * real ones answer. `?case=` picks the product: a free one (no Stripe at
 * all), or a paid one drawn as the app draws it (plain card fields), so the
 * layout is measured without Stripe's iframes, which need a live key.
 */
import * as React from "react"
import CheckoutPageClient from "@/app/checkout/checkout-client"

declare global {
  interface Window {
    __commerceProbeCalls?: { url: string; body: unknown }[]
  }
}

function stubFetch() {
  const calls: { url: string; body: unknown }[] = (window.__commerceProbeCalls = [])
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    let body: unknown = null
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null
    } catch {
      body = String(init?.body)
    }
    calls.push({ url, body })
    if (url.startsWith("/api/coupons/validate")) {
      const code = (body as { code?: string })?.code
      return code?.toUpperCase() === "LAUNCH10" ? json({ ok: true, code: "LAUNCH10", label: "10%", discountCents: 490 }) : json({ ok: false, error: "That code is not valid." })
    }
    if (url.startsWith("/api/checkout/process")) return json({ success: true, receiptToken: "tok_free_1234567890", orderId: "o1" })
    return json({})
  }) as typeof fetch
}

export function boot(render: (el: React.ReactElement) => void) {
  stubFetch()
  const which = new URLSearchParams(location.search).get("case") || "paid"
  const free = which === "free"
  render(
    <CheckoutPageClient
      product={{ id: "p1", title: "Notion Creator OS: the complete template pack", slug: "creator-os", description: null, price_cents: free ? 0 : 4900, thumbnail_url: null, type: "digital" }}
      creator={{ id: "c1", name: "Andrew Rullz", avatar_url: null, username: "andrewrullz" }}
      userEmail={null}
      isLoggedIn={false}
      selectedVariant={free ? null : { id: "v1", name: "Pro licence", description: null, priceCents: 4900 }}
      allVariants={free ? [] : [
        { id: "v0", name: "Personal", description: null, priceCents: 2900 },
        { id: "v1", name: "Pro licence", description: null, priceCents: 4900 },
      ]}
    />,
  )
}
