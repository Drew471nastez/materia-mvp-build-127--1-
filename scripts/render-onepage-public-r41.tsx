/**
 * ROUND 41, for scripts/check-onepage-public-r41.mjs. The real published OnePage
 * (components/onepage/public-onepage) on a theme from the Design tab:
 *
 *   ?theme=<template id>     a product drawn as one pill button, a callout, a
 *                            row of social icons, an X post, and a product
 *                            that opens in a sheet (a download and a product
 *                            that ships, with options)
 *   &solid=1                 the theme's page colour as a flat fill, so an edge
 *                            can be measured against one known colour
 *
 * /api/onepage/product is answered here; the X post's frame is answered by the
 * probe (a stand in for X's document, see the check).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings } from "@/lib/onepage/types"

const px = (n: number, w = 600, h = 450) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 47},45%,52%)"/><circle cx="${w * 0.7}" cy="${h * 0.35}" r="${Math.min(w, h) / 5}" fill="rgba(255,255,255,0.3)"/></svg>`)}`

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href)
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (url.pathname === "/api/onepage/product") {
    const id = url.searchParams.get("id") || ""
    const ships = id === "p-ship"
    return json({
      product: {
        id,
        title: ships ? "Linen Tote" : "Night Guide",
        slug: ships ? "linen-tote" : "night-guide",
        type: ships ? "physical" : "digital",
        descriptionHtml: "<p>Printed on heavy paper, sent the next day.</p>",
        priceCents: 8230,
        compareAtCents: null,
        pwyw: false,
        pwywMinCents: 0,
        currency: "eur",
        images: [px(1), px(2)],
        variants: ships
          ? [
              { id: "v-s", name: "Small", description: null, priceCents: 8230, pwyw: false },
              { id: "v-l", name: "Large", description: null, priceCents: 9230, pwyw: false },
            ]
          : [],
        soldOut: false,
        left: null,
        pageUrl: ships ? "/p/linen-tote" : "/p/night-guide",
        ships,
        shopId: "seller_probe",
        maxQuantity: ships ? 5 : 1,
      },
      seller: { name: "Maria Clay", avatarUrl: px(9, 120, 120) },
      checkout: { instant: !ships, reason: ships ? "This one is bought on its checkout page." : null, url: `/checkout?productId=${id}`, tax: null, marketingOptIn: false, lastNameRequired: false },
      buyer: null,
    })
  }
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return json({})
  return realFetch(input as RequestInfo, init)
}

let order = 0
const b = (type: string, data: Record<string, unknown>, id: string) => ({ id, type, enabled: true, sort_order: order++, data }) as never
const product = { product_id: "p-live", show_price: true, show_description: true, product_title: "Night Guide", product_thumbnail: px(1), product_description: "A guide", product_price_cents: 8230, product_slug: "night-guide", product_type: "digital" }

const params = new URLSearchParams(location.search)
const named = params.get("theme") || "astrid"
const template = THEME_TEMPLATES.find((t) => t.id === named)
const theme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default", ...(params.get("solid") ? { background_type: "solid" } : {}) }
const blocks = [
  b("header", { show_avatar: true, show_name: true, show_bio: true }, "header"),
  b("social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/maria" }, { platform: "tiktok", url: "https://tiktok.com/@maria" }, { platform: "youtube", url: "https://youtube.com/@maria" }], style: "icons" }, "socials"),
  b("product", { ...product, style: "button", cta_text: "Get My Guide" }, "p_button"),
  b("product", { ...product, style: "callout", cta_text: "Get it now" }, "p_callout"),
  b("embed", { url: "https://x.com/maria/status/1234567890" }, "x_post"),
  b("product", { ...product, style: "row", cta_text: "See it", tap_action: "sheet", instant_checkout: true }, "p_sheet"),
  b("product", { ...product, product_id: "p-ship", product_title: "Linen Tote", product_slug: "linen-tote", product_type: "physical", style: "row", cta_text: "See it", tap_action: "sheet" }, "p_ship"),
  b("product", { ...product, style: "row", cta_text: "See it", tap_action: "sheet", sheet_action: "page" }, "p_sheet_page"),
  b("text", { content: "<p>" + "More words. ".repeat(400) + "</p>", alignment: "left" }, "long"),
]
const page = { id: "op_r41", slug: "maria", title: "Maria Clay", bio: "Prints and guides", avatar_url: px(9, 160, 160), theme, settings: defaultSettings, social_links: {}, blocks, seller_id: "seller_probe" }
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={page as never} />)
