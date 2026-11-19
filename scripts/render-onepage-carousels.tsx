/**
 * Every row that slides sideways on a OnePage, for scripts/check-onepage-carousels.mjs.
 *
 * The real PublicOnePage with:
 *   links      a group carousel of picture links (1.2 in view), as the owner's 19.webp
 *   products   a group carousel of product cards (1.2 in view): one with only the editor's padded 16:9 copy, one
 *              with its cover as uploaded beside it, one plain, as the owner's 20.png
 *   shelf      a shelf of products as product cards, sliding (1.5 in view)
 *   posts      Instagram posts as a carousel of cards
 *
 *   ?theme=dark|light|image|gradient   the page behind them (dark is white buttons on black: the arrows' worst case)
 *   ?motion=reduce                     nothing here; the probe emulates the media feature
 *
 * The pictures are files the probe serves (window.PROBE_FILES).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { defaultSettings, defaultTheme } from "@/lib/onepage/types"

type Files = { photos: string[]; padded: string; original: string }
const files = (window as unknown as { PROBE_FILES: Files }).PROBE_FILES
const params = new URLSearchParams(location.search)
const themeName = params.get("theme") || "dark"

const themes: Record<string, Record<string, unknown>> = {
  dark: { background_type: "solid", background_color: "#000000", text_color: "#ffffff", button_style: "filled", button_color: "#ffffff", button_text_color: "#000000", button_border_color: "#ffffff", button_border_radius: 16 },
  light: { background_type: "solid", background_color: "#f6f4ef", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_color: "#1a1a2e", button_border_radius: 14 },
  image: { background_type: "image", background_color: "#20242c", background_image_url: files.photos[2], text_color: "#ffffff", button_style: "glass", button_color: "#ffffff", button_text_color: "#ffffff", button_border_color: "#ffffff", button_border_radius: 18, image_brightness: 70 },
  gradient: { background_type: "gradient", background_color: "#3b1d5e", background_gradient: "linear-gradient(135deg,#3b1d5e,#c2410c)", text_color: "#ffffff", button_style: "filled", button_color: "#fde68a", button_text_color: "#1a1a2e", button_border_color: "#fde68a", button_border_radius: 12 },
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
const link = (n: number, label: string, image: string) => ({
  id: `link-${n}`, type: "link_button", enabled: true, sort_order: n,
  data: { label, url: `https://example.com/${n}` },
  style: { presentation: { variant: "visual", image_url: image, align: "left", overlay: 40, aspect: "4:5" } },
})
const product = (n: number, title: string, extra: Record<string, unknown>) => ({
  id: `product-${n}`, type: "product", enabled: true, sort_order: n,
  data: { product_id: id(n), product_title: title, product_price_cents: n === 1 ? 0 : 1900 + n * 100, product_slug: `p-${n}`, product_type: "digital", show_price: true, style: "tile", style_chosen: true, tap_action: "page", cta_text: "Get the guide", ...extra },
})

const blocks = [
  { id: "g-links", type: "group", enabled: true, sort_order: 1, data: { title: null, layout: "carousel", carousel_view: "1.2", children: [link(1, "Studio", files.photos[0]), link(2, "Training plans", files.photos[1]), link(3, "Coaching", files.photos[2]), link(4, "Podcast", files.photos[3])] } },
  { id: "g-products", type: "group", enabled: true, sort_order: 2, data: { title: null, layout: "carousel", carousel_view: "1.2", children: [
    product(1, "Gym Starter Guide", { product_thumbnail: files.padded }),
    product(2, "Strength Blueprint, a twelve week programme with a long name", { product_thumbnail: files.padded, product_cover: files.original }),
    product(3, "Meal plan", { product_thumbnail: files.photos[1] }),
  ] } },
  { id: "shelf", type: "storelib_shelf", enabled: true, sort_order: 3, data: { source: "digital", layout: "carousel", carousel_view: "1.5", product_settings: { style: "tile", style_chosen: true, tap_action: "page" }, items: [
    { id: id(11), kind: "digital", title: "Gym Starter Guide", href: "/p/gym", image: files.padded, price_cents: 0 },
    { id: id(12), kind: "digital", title: "Strength Blueprint", href: "/p/strength", image: files.photos[0], price_cents: 2500 },
    { id: id(13), kind: "digital", title: "Mobility in ten minutes a day", href: "/p/mobility", image: files.photos[3], price_cents: 1200 },
  ] } },
  { id: "posts", type: "social_posts", enabled: true, sort_order: 4, data: { network: "instagram", layout: "carousel", presentation: "card", posts: [], items: [
    { kind: "instagram", id: "p1", url: "https://www.instagram.com/p/AAA/", thumb: files.photos[1], title: "Winter drill" },
    { kind: "instagram", id: "p2", url: "https://www.instagram.com/p/BBB/", thumb: files.photos[2], title: "Back day" },
    { kind: "instagram", id: "p3", url: "https://www.instagram.com/p/CCC/", thumb: files.photos[0], title: "Form check" },
  ] } },
]

Object.assign(globalThis, { PROBE_USER: null })
createRoot(document.getElementById("app")!).render(
  <PublicOnePage
    onepage={
      {
        id: "onepage", owner_id: "owner", seller_id: "seller", slug: "creator", title: "Creator", bio: "", avatar_url: null,
        theme: { ...defaultTheme, ...themes[themeName] },
        settings: { ...defaultSettings, share_enabled: false, subscribe_enabled: false },
        blocks,
      } as never
    }
  />,
)
