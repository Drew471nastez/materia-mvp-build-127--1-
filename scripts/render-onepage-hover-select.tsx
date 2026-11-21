/**
 * The harness of scripts/check-onepage-hover-select.mjs: a OnePage with every
 * kind of button a visitor can point at, and a form whose dropdown is the
 * page's own (not the system's menu).
 *
 *   ?theme=dark|light   the page behind them
 *   ?hover=<id>         the page's "On hover" choice (button_hover_animation)
 *
 *   /app?live           the published page (PublicOnePage)
 *   /app?host           the editor's preview: the real LivePreviewFrame and its
 *                       frame. window.__hover(id) is the Design tab changing
 *                       "On hover"; the frame must follow without a reload.
 *   /onepage-preview    the frame itself (OnePagePreviewDocument)
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { LivePreviewFrame } from "@/components/onepage/live-preview"
import { defaultSettings, defaultTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
document.documentElement.classList.remove("app-layout")

export const FORM_ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const themes: Record<string, Record<string, unknown>> = {
  dark: { background_type: "solid", background_color: "#111113", text_color: "#f4f4f5", button_style: "filled", button_color: "#f4f4f5", button_text_color: "#111113", button_border_color: "#f4f4f5", button_border_radius: 14 },
  light: { background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_color: "#1a1a2e", button_border_radius: 14 },
}
const theme = { ...defaultTheme, header_layout: "classic", font_family: "Inter", ...themes[params.get("theme") || "dark"], button_hover_animation: params.get("hover") || "lift" }

const pid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const link = (id: string, label: string, i: number, extra: Record<string, unknown> = {}) => ({ id, type: "link_button", enabled: true, sort_order: i, data: { label, url: `https://example.com/${id}`, ...extra } })
const product = (n: number, title: string) => ({
  id: `product-${n}`, type: "product", enabled: true, sort_order: n,
  data: { product_id: pid(n), product_title: title, product_price_cents: 1900, product_slug: `p-${n}`, product_type: "digital", show_price: true, style: "tile", style_chosen: true, tap_action: "page", cta_text: "Get the guide" },
})

const blocks = [
  { id: "h", type: "header", enabled: true, sort_order: 0, data: { show_avatar: false, show_name: true, show_bio: true } },
  link("top", "Shop the prints", 1),
  link("form", "Antrenamente 1:1", 2, { action: { type: "form", form_id: FORM_ID } }),
  { id: "g-list", type: "group", enabled: true, sort_order: 3, data: { title: "In a group", layout: "list", children: [link("in-group", "Grouped link", 0), link("in-group-2", "Second grouped link", 1)] } },
  { id: "g-row", type: "group", enabled: true, sort_order: 4, data: { title: null, layout: "carousel", carousel_view: "1.2", children: [link("in-carousel", "Carousel link", 0), link("in-carousel-2", "Next one", 1)] } },
  { id: "g-products", type: "group", enabled: true, sort_order: 5, data: { title: null, layout: "carousel", carousel_view: "1.2", children: [product(1, "Gym Starter Guide"), product(2, "Strength Blueprint")] } },
  product(3, "Meal plan"),
  /* A map that opens in a sheet: no place read, so the sheet is its foot bar and its main button, Open in Maps. */
  { id: "map", type: "map", enabled: true, sort_order: 7, data: { title: "Sala", address: "Strada Lipscani 10, București", open_mode: "sheet" } },
]

export const PAGE = {
  id: "hover-page", owner_id: "owner", seller_id: "seller", slug: "andrei", title: "Coach Andrei", bio: "Antrenamente personale", avatar_url: null,
  theme, settings: { ...defaultSettings, show_branding: false, share_enabled: false, subscribe_enabled: false }, social_links: {}, blocks,
}

const app = document.getElementById("app")!
type W = { __hover: (h: string) => void; __drawn: boolean }
const w = window as unknown as W
Object.assign(globalThis, { PROBE_USER: null })

function Host() {
  const [hover, setHover] = useState(theme.button_hover_animation)
  w.__hover = setHover
  const page = { ...PAGE, theme: { ...theme, button_hover_animation: hover } }
  return <LivePreviewFrame page={page as never} width={390} height={844} onDrawn={() => (w.__drawn = true)} />
}

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(app).render(<OnePagePreviewDocument />)
} else if (params.has("host")) {
  document.documentElement.style.cssText = "margin:0;height:100%"
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden"
  w.__drawn = false
  createRoot(app).render(<Host />)
} else {
  createRoot(app).render(<PublicOnePage onepage={PAGE as never} />)
}
