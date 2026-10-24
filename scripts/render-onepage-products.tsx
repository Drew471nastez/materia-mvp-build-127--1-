/**
 * THE ONEPAGE'S PRODUCTS, FOR scripts/check-onepage-products.mjs (round 10)
 *
 *   ?live&theme=<template id>   the published page: one product block in each
 *                               layout, two tiles side by side, a block that
 *                               opens a sheet and one with instant checkout
 *   ?editor                     the editor, with a published, a draft and an
 *                               archived product on the page
 *
 * The network is stubbed here: /api/onepage/product answers the facts a
 * published download would have (components/checkout/instant-checkout), and
 * nothing is ever sent anywhere else. Supabase is the probe server's stub,
 * which hands PROBE_PRODUCTS to a read of products.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

const px = (n: number, w = 600, h = 450) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${n * 47},45%,58%)"/><stop offset="1" stop-color="hsl(${n * 47 + 40},40%,32%)"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${Math.min(w, h) / 5}" fill="rgba(255,255,255,0.25)"/></svg>`)}`

;(globalThis as any).PROBE_PRODUCTS = [
  { id: "p-live", title: "Tech House Master Bundle 2025", price_cents: 9191, thumbnail_url: px(1), description: "Kicks, loops and presets", slug: "tech-house", type: "digital", status: "published", archived: false },
  { id: "p-draft", title: "Deep Cuts Vol. 2", price_cents: 2900, thumbnail_url: px(4), description: "Coming soon", slug: "deep-cuts", type: "digital", status: "draft", archived: false },
  { id: "p-old", title: "Old Sample Pack", price_cents: 900, thumbnail_url: px(6), description: "Retired", slug: "old-pack", type: "digital", status: "archived", archived: true },
  { id: "p-course", title: "Mixing Course", price_cents: 4900, thumbnail_url: null, description: "Twelve lessons", slug: "mixing", type: "course", status: "published", archived: false },
]

/* The product facts and every write, answered here. */
const realFetch = window.fetch.bind(window)
;(window as any).__clicks = []
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/onepage/product") {
    const id = url.searchParams.get("id") || ""
    return json({
      product: {
        id,
        title: id === "p-course" ? "Mixing Course" : "Tech House Master Bundle 2025",
        slug: "tech-house",
        type: id === "p-course" ? "course" : "digital",
        descriptionHtml: "<p>Two hundred kicks, eighty loops and twelve presets, made for late nights.</p><ul><li>WAV, 24 bit</li><li>Royalty free</li></ul>",
        priceCents: 9191,
        compareAtCents: 12900,
        pwyw: false,
        pwywMinCents: 0,
        currency: "usd",
        images: [px(1), px(2), px(3)],
        variants: [],
        soldOut: false,
        left: 4,
        pageUrl: "/p/tech-house",
        ships: false,
      },
      seller: { name: "Satori Sounds", avatarUrl: px(9, 120, 120) },
      checkout: { instant: true, reason: null, url: `/checkout?productId=${id}`, tax: null, marketingOptIn: true, lastNameRequired: false },
      buyer: null,
    })
  }
  if (url.pathname.startsWith("/api/onepage/track")) {
    try {
      ;(window as any).__clicks.push(JSON.parse(String(init?.body ?? "{}")).block_id)
    } catch {}
    return json({ ok: true })
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
  return realFetch(input as RequestInfo, init)
}

try {
  localStorage.setItem("onepage-onboarding-completed", "true")
} catch {}

let order = 0
const b = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, enabled: true, sort_order: order++, data }) as any
const base = { product_id: "p-live", show_price: true, show_description: true, product_title: "Tech House Master Bundle 2025", product_thumbnail: px(1), product_description: "Kicks, loops and presets for late nights", product_price_cents: 9191, product_compare_at_cents: 12900, product_slug: "tech-house", product_type: "digital" }

const liveBlocks = [
  b("header", { show_avatar: true, show_name: true, show_bio: true }, "header"),
  b("product", { ...base, style: "callout", cta_text: "Get it now" }, "l_callout"),
  b("product", { ...base, style: "row", cta_text: "Buy" }, "l_row"),
  b("product", { ...base, style: "preview", cta_text: "Get it now" }, "l_preview"),
  b("product", { ...base, style: "side", cta_text: "Get it now" }, "l_side"),
  b("product", { ...base, style: "tile", cta_text: "Buy", product_title: "Tech House Bundle" }, "l_tile1"),
  b("product", { ...base, style: "tile", cta_text: "Buy", product_id: "p-course", product_title: "Mixing Course", product_thumbnail: px(5), product_price_cents: 4900, product_compare_at_cents: null, product_type: "course" }, "l_tile2"),
  b("product", { ...base, style: "overlay", cta_text: "Get it" }, "l_overlay"),
  b("product", { ...base, style: "minimal", cta_text: "Buy" }, "l_minimal"),
  b("product", { ...base, style: "button", cta_text: "Buy now" }, "l_button"),
  b("product", { ...base, style: "callout", cta_text: "See it", tap_action: "sheet", instant_checkout: true }, "l_sheet"),
  b("product", { ...base, style: "row", cta_text: "Pay", tap_action: "checkout", instant_checkout: true, product_pwyw: false }, "l_instant"),
  /* The page's own older sheet (the free quick checkout), measured beside the product sheet as this machine's baseline. */
  b("product", { ...base, style: "minimal", cta_text: "Get it", product_id: "p-free", product_title: "Free Guide", product_price_cents: 0, product_compare_at_cents: null, quick_checkout: true }, "l_quick"),
]

const params = new URLSearchParams(location.search)
const root = createRoot(document.getElementById("app")!)
if (location.pathname.startsWith("/onepage-preview")) {
  /* The editor preview's own frame (components/onepage/live-preview). */
  root.render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  const named = params.get("theme") || "default"
  const template = THEME_TEMPLATES.find((t) => t.id === named)
  const theme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" }
  const page = { id: "op_products", slug: "satori", title: "Satori Sounds", bio: "Samples, courses and late night mixes", avatar_url: px(9, 120, 120), theme, settings: defaultSettings, social_links: {}, blocks: liveBlocks, seller_id: "seller_probe" }
  root.render(<PublicOnePage onepage={page as any} />)
} else {
  const onepage: OnePage = {
    id: "op_products",
    owner_id: "probe-user",
    slug: "satori",
    title: "Satori Sounds",
    bio: "Samples, courses and late night mixes",
    avatar_url: px(9, 120, 120),
    theme: defaultTheme,
    settings: defaultSettings,
    social_links: {},
    draft_blocks: [
      b("product", { ...base, style: "callout", cta_text: "Get it now" }, "e_live"),
      b("product", { ...base, product_id: "p-draft", product_title: "Deep Cuts Vol. 2", product_thumbnail: px(4), style: "row", cta_text: "Buy" }, "e_draft"),
      b("product", { ...base, product_id: "p-old", product_title: "Old Sample Pack", product_thumbnail: px(6), style: "callout", cta_text: "Buy" }, "e_old"),
    ],
    status: "published",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    onboarding_completed: true,
  } as OnePage
  root.render(<OnePageEditor initialOnePage={onepage} />)
}
