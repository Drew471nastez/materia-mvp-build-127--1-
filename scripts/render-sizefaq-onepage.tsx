/**
 * A published OnePage with a product that opens in a sheet, for
 * scripts/check-sizefaq-r13.ts (round 13). /api/onepage/product answers
 * what the real route answers for a tee that ships, with its questions and
 * its size chart (`window.SIZEFAQ_SHEET`, made by the probe in Node with
 * lib/size-charts/storefront.ts and lib/products/product-faqs.ts, as
 * app/api/onepage/product/route.ts makes them).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

declare global {
  interface Window {
    SIZEFAQ_SHEET: Record<string, unknown>
  }
}

const px = (n: number, w = 600, h = 450) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 47},30%,${70 - n * 4}%)"/><circle cx="${w * 0.5}" cy="${h * 0.45}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,0.35)"/></svg>`)}`

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/onepage/product") return json(window.SIZEFAQ_SHEET)
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
  return realFetch(input as RequestInfo, init)
}

const block = { id: "tee", type: "product", enabled: true, sort_order: 0, data: { product_id: "a0000000-0000-4000-8000-000000000001", show_price: true, show_description: true, product_title: "Classic tee", product_thumbnail: px(1), product_description: "Heavy cotton, cut straight", product_price_cents: 2800, product_slug: "classic-tee", product_type: "physical", style: "callout", cta_text: "See it", tap_action: "sheet" } }
const page = { id: "op_tees", slug: "atelier", title: "Atelier Nord", bio: "Tees and sweats, made slow", avatar_url: px(9, 120, 120), theme: defaultTheme, settings: defaultSettings, social_links: {}, blocks: [block], seller_id: "seller_probe" }
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={page as never} />)
