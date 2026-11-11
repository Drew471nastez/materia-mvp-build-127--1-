/**
 * The page shell's harness (scripts/check-onepage-header.mjs): the header as the page
 * scrolls, the bar that takes its place, the Share and Subscribe buttons in the corners,
 * the cover's fade, the column's width and the rows that slide sideways.
 *
 *   /app?layout=classic|hero|cover|herocover   the header (cover: the creator's own
 *                         cover over a classic header; herocover: a Hero made from it)
 *   &dark                 a dark page
 *   &verified             the verified badge beside the name
 *   &nofade               the cover's fade switched off
 *   &rows                 the rows that slide sideways: a group carousel of products, a
 *                         group carousel of links, a shelf of product cards, a shelf of
 *                         simple cards
 *   /app?host...          the editor's preview: the real preview frame, answered with the page
 *   /onepage-preview      the frame itself
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { ViewportVars } from "@/components/viewport-vars"
import { defaultTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
document.documentElement.classList.remove("app-layout")
const layout = params.get("layout") || "classic"
const dark = params.has("dark")
const block = (id: string, type: string, data: Record<string, unknown>, i: number) => ({ id, type, enabled: true, sort_order: i, data })

const theme = {
  ...defaultTheme,
  header_layout: layout === "hero" || layout === "herocover" ? "hero" : "classic",
  background_type: "solid",
  background_color: dark ? "#111114" : "#f4efe8",
  text_color: dark ? "#f4f4f5" : "#1d1a16",
  button_style: "filled",
  button_color: dark ? "#26262c" : "#ffffff",
  button_text_color: dark ? "#f4f4f5" : "#1d1a16",
  button_border_radius: 16,
  button_shadow: "soft",
  font_family: "Inter",
  ...(layout === "cover" || layout === "herocover"
    ? { cover_image_url: "https://probe.storelib.test/images/onepage-themes/fusion.webp", cover_profile_layout: true, ...(params.has("nofade") ? { cover_fade: false } : null) }
    : null),
}

const product = (id: string, title: string, image: string, cents: number) => block(id, "product", { product_id: id, product_title: title, product_thumbnail: image, product_price_cents: cents, product_type: "digital", style: "callout", show_price: true, cta_text: "Get it" }, 0)

let n = 0
const rows = params.has("rows")
const blocks = [
  block("h", "header", { show_avatar: true, show_name: true, show_bio: true }, n++),
  block("l1", "link_button", { label: "Latest video", url: "https://example.com/v" }, n++),
  ...(rows
    ? [
        block("g-products", "group", { title: "Shop", layout: "carousel", carousel_view: "1.2", children: [product("p1", "Film presets", "/images/onepage-themes/nature.webp", 1900), product("p2", "Studio guide", "/images/onepage-themes/fusion.webp", 2900), product("p3", "Print pack", "/images/onepage-themes/nature.webp", 900)] }, n++),
        block("g-links", "group", { title: "Links", layout: "carousel", carousel_view: "1.5", children: [block("c1", "link_button", { label: "Podcast", url: "https://example.com/1" }, 0), block("c2", "link_button", { label: "Newsletter", url: "https://example.com/2" }, 1), block("c3", "link_button", { label: "Tour dates", url: "https://example.com/3" }, 2)] }, n++),
        block("shelf-cards", "storelib_shelf", { title: "Products", source: "all", layout: "carousel", limit: 4, product_settings: { show_price: true }, card_style: "product" }, n++),
        block("shelf-simple", "storelib_shelf", { title: "More", source: "all", layout: "carousel", limit: 4, card_style: "simple" }, n++),
      ]
    : []),
  ...Array.from({ length: 12 }, (_, i) => block(`t${i}`, "text", { content: `Paragraph ${i + 1}. Prints, posters and notes from the studio, written long enough to wrap onto a second line.` }, n++)),
]

export const PAGE = {
  id: "header-page",
  title: "Ana Studio",
  bio: "Prints, posters and a newsletter",
  slug: "ana",
  avatar_url: "/images/onepage-themes/nature.webp",
  avatar_video_url: null,
  avatar_video_crop: null,
  theme,
  blocks,
  social_links: {},
  settings: { show_branding: false, share_enabled: true, subscribe_enabled: true, verified_badge_enabled: params.has("verified"), verified_badge_type: "verified_creator" },
  seller_id: "seller_probe",
}
;(window as unknown as { __PAGE: typeof PAGE }).__PAGE = PAGE

const app = document.getElementById("app")!
if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(app).render(<OnePagePreviewDocument />)
} else if (params.has("host")) {
  document.documentElement.style.cssText = "margin:0;height:100%"
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden"
  const f = document.createElement("iframe")
  f.src = "/onepage-preview?embedded=1"
  f.setAttribute("data-host-frame", "")
  f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0"
  const post = (page: unknown) => f.contentWindow?.postMessage({ channel: "storelib-onepage-preview", kind: "page", page, currency: "USD" }, location.origin)
  window.addEventListener("message", (e) => {
    if (e.data?.channel === "storelib-onepage-preview" && e.data.kind === "ready") post(PAGE)
  })
  document.body.appendChild(f)
} else {
  createRoot(app).render(
    <>
      <ViewportVars />
      <PublicOnePage onepage={PAGE as never} />
    </>,
  )
}
