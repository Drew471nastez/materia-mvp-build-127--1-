/**
 * ONE PAGE, DRAWN TWICE: the editor's preview and the published page, from
 * the same saved data, for scripts/check-onepage-parity.mjs.
 *
 *   ?view=preview&theme=<template id>   what the editor shows on a phone
 *   ?view=live&theme=<template id>      what a visitor sees
 *
 * The page holds one of every block the editor can add, in the shapes the
 * editor saves them in, so a block drawn differently in the two places shows
 * up as a difference in the probe.
 *
 * AND ITS PRODUCTS COME FROM A CATALOGUE, ON BOTH SIDES. The live route
 * reads every product block's row before it draws (withLiveProducts in
 * app/(marketing)/l/[slug]/page.tsx), and so does the preview's frame
 * (components/onepage/preview-document.tsx). Both read PROBE_PRODUCTS
 * below through the stubbed database (scripts/onepage-probe-server.mjs).
 * Without it the frame was told no product existed and left all three out,
 * while this page's live side skipped the read and drew them: 26 blocks
 * against 29, and neither was the live route. One product here is
 * archived, so both sides are also seen to leave the same block out.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageProvider } from "@/lib/onepage/context"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"
import * as Preview from "@/components/onepage/phone-preview"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { withLiveProducts, type ProductsDb } from "@/lib/onepage/live-products"
import { createClient } from "@/lib/supabase/client"

const px = (n: number, w = 400, h = 400) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 47},55%,62%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="hsl(${n * 47 + 120},45%,40%)"/></svg>`)}`

const params = new URLSearchParams(location.search)
const view = params.get("view") || "live"
const templateId = params.get("theme") || "default"
const only = params.get("only")
const template = THEME_TEMPLATES.find((t) => t.id === templateId)
const theme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" } as OnePage["theme"]
/* scripts/check-onepage-themes.mjs: &avatar=0 draws the page with no profile picture. */
const noAvatar = params.get("avatar") === "0"

let order = 0
const b = (type: string, data: Record<string, unknown>, id = `${type}_${order}`) => ({ id, type, enabled: true, sort_order: order++, data }) as any

const ALL = [
  b("header", { show_avatar: true, show_name: true, show_bio: true }, "header"),
  b("link_button", { label: "Shop the prints", url: "https://example.com/shop" }, "link_plain"),
  b("link_button", { label: "Read the journal", url: "https://example.com/journal", thumbnail_url: px(2, 120, 120) }, "link_thumb"),
  b("link_button", { label: "Instagram", url: "https://instagram.com/satori", icon: "instagram" }, "link_icon"),
  b("link_button", { label: "New collection", url: "https://example.com/new", thumbnail_url: px(4, 800, 450), layout_type: "pro" }, "link_pro"),
  b("heading", { text: "Work with me", size: "medium", alignment: "center" }, "heading"),
  b("text", { content: "Prints, posters and a letter every other Sunday. Studio in Cluj.", alignment: "center" }, "text"),
  b("product", { product_id: "p1", show_price: true, show_description: true, cta_text: "Buy now", style: "button", product_title: "A3 print", product_thumbnail: px(5, 300, 300), product_description: "Giclee on cotton rag", product_price_cents: 2400, product_slug: "a3-print" }, "product_button"),
  b("product", { product_id: "p2", show_price: true, show_description: true, cta_text: "Get it", style: "callout", product_title: "Poster pack", product_thumbnail: px(6, 300, 300), product_description: "Six posters", product_price_cents: 4800, product_slug: "poster-pack" }, "product_callout"),
  b("product", { product_id: "p3", show_price: true, show_description: true, cta_text: "Download", style: "preview", product_title: "Brush set", product_thumbnail: px(7, 300, 300), product_description: "Forty brushes", product_price_cents: 0, product_slug: "brush-set", layout_type: "pro" }, "product_preview"),
  /* Archived since it was added: on neither side. */
  b("product", { product_id: "p4", show_price: true, cta_text: "Buy now", style: "button", product_title: "Old zine", product_thumbnail: px(23, 300, 300), product_price_cents: 900, product_slug: "old-zine" }, "product_archived"),
  b("social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "tiktok", url: "https://tiktok.com/@satori" }, { platform: "youtube", url: "https://youtube.com/@satori" }], style: "icons" }, "social_icons"),
  b("social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "spotify", url: "https://open.spotify.com/artist/1" }], style: "buttons" }, "social_buttons"),
  b("image", { image_url: px(8, 800, 600), images: [{ id: "i1", image_url: px(8, 800, 600) }], display_style: "single", aspect_ratio: "landscape" }, "image_single"),
  b("image", { image_url: px(9), images: [1, 2, 3, 4].map((n) => ({ id: `g${n}`, image_url: px(9 + n) })), display_style: "grid", grid_columns: 2, aspect_ratio: "square" }, "image_grid"),
  b("image", { image_url: px(14), images: [1, 2, 3].map((n) => ({ id: `c${n}`, image_url: px(14 + n, 600, 600) })), display_style: "carousel", carousel_view: "1.3", aspect_ratio: "square" }, "image_carousel"),
  b("divider", { style: "line", height: 24 }, "divider_line"),
  b("divider", { style: "dots", height: 24 }, "divider_dots"),
  b("email_capture", { headline: "Sunday letter", description: "One email, every other week", placeholder: "Your email", button_text: "Subscribe", success_message: "Thanks" }, "email_default"),
  b("email_capture", { headline: "Free brush", description: "Get it by email", placeholder: "Your email", button_text: "Get access", success_message: "Sent", layout_type: "pro", product_image: px(18, 300, 300) }, "email_pro"),
  b("group", { title: "Favourites", layout: "stack", children: [
    { id: "g_a", type: "link_button", enabled: true, sort_order: 0, data: { label: "Studio tour", url: "https://example.com/tour" } },
    { id: "g_b", type: "link_button", enabled: true, sort_order: 1, data: { label: "Press kit", url: "https://example.com/press" } },
  ] }, "group_stack"),
  b("group", { title: "Recent", layout: "carousel", carousel_view: "1.2", children: [
    { id: "gc_a", type: "link_button", enabled: true, sort_order: 0, data: { label: "Spring", url: "https://example.com/spring", thumbnail_url: px(20, 600, 400), layout_type: "pro" } },
    { id: "gc_b", type: "link_button", enabled: true, sort_order: 1, data: { label: "Summer", url: "https://example.com/summer", thumbnail_url: px(21, 600, 400), layout_type: "pro" } },
  ] }, "group_carousel"),
  b("pdf_document", { title: "Price list", description: "2026 rates", pdf_file_url: "https://example.com/a.pdf", button_text: "View PDF" }, "pdf_default"),
  b("pdf_document", { title: "Lookbook", description: "Twelve pages", pdf_file_url: "https://example.com/b.pdf", layout_type: "pro", thumbnail_url: px(22, 400, 300), button_text: "Open" }, "pdf_pro"),
  b("food_menu", { title: "Menu", description: "Cafe hours 9 to 5", pdf_file_url: "https://example.com/m.pdf", button_text: "View menu" }, "food_menu"),
  b("calendly", { title: "Book a call", description: "Thirty minutes", calendly_url: "https://calendly.com/satori/30", button_text: "Book", embed_mode: "direct_link" }, "calendly"),
  b("faq", { title: "Questions", items: [{ id: "q1", question: "Do you ship abroad?", answer: "Yes, everywhere." }, { id: "q2", question: "Can I return a print?", answer: "Within 30 days." }] }, "faq"),
  /* Ended, so it reads the same whenever it is drawn. */
  b("countdown", { title: "Drop in", target_at: "2020-01-01T00:00:00.000Z", ended_text: "Out now" }, "countdown"),
  b("map", { title: "Studio", address: "Strada Memorandumului 28, Cluj", show_button: true }, "map"),
  b("video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Studio film" }, "video"),
]

/* The seller's products as the catalogue has them now: the three on the page live and unchanged, the fourth archived. */
const CATALOGUE = [
  { id: "p1", title: "A3 print", slug: "a3-print", price_cents: 2400, thumbnail_url: px(5, 300, 300), status: "published", archived: false },
  { id: "p2", title: "Poster pack", slug: "poster-pack", price_cents: 4800, thumbnail_url: px(6, 300, 300), status: "published", archived: false },
  { id: "p3", title: "Brush set", slug: "brush-set", price_cents: 0, thumbnail_url: px(7, 300, 300), status: "published", archived: false },
  { id: "p4", title: "Old zine", slug: "old-zine", price_cents: 900, thumbnail_url: px(23, 300, 300), status: "archived", archived: true },
]
;(window as any).PROBE_PRODUCTS = CATALOGUE

const blocks = only ? ALL.filter((x) => x.id === "header" || only.split(",").includes(x.id)) : ALL

export const PARITY_PAGE: OnePage = {
  id: "op_parity",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: noAvatar ? null : px(3),
  theme,
  settings: { ...defaultSettings, verified_badge_enabled: true },
  /* A page with a seller, as every saved one has (lib/onepage/ensure-onepage): the bell needs one. */
  seller_id: "seller_parity",
  social_links: { instagram: "https://instagram.com/satori", tiktok: "https://tiktok.com/@satori", email: "hi@satori.studio" },
  draft_blocks: blocks,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as OnePage

/* The editor opens on its tabs, not the first visit's wizard. */
try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

/* The blocks as both sides lay them out, by id, so the probe can name what differs: set by the live side once its products are read. */
const orderOf = (list: any[]) => list.filter((x) => isBlockShown(x)).sort((x, y) => x.sort_order - y.sort_order).map((x) => x.id)

const root = createRoot(document.getElementById("app")!)
if (location.pathname.startsWith("/onepage-preview")) {
  /* The editor preview's frame, as app/onepage-preview renders it. */
  root.render(<OnePagePreviewDocument />)
} else if (view === "none") {
  /* A blank page the probe draws its comparisons on. */
} else if (view === "preview") {
  const Mobile = (Preview as any).MobilePreviewContent as React.ComponentType
  root.render(
    <OnePageProvider initialOnePage={PARITY_PAGE}>
      {/* Where the editor puts it on a phone: the whole screen under its bar. */}
      <div className="flex flex-col" style={{ position: "fixed", inset: 0 }} data-parity-preview="">
        <Mobile />
      </div>
    </OnePageProvider>,
  )
} else {
  /*
    THE LIVE ROUTE'S TWO STEPS (app/(marketing)/l/[slug]/page.tsx): the
    published shape, then its products read from the catalogue, by the
    seller the shape names. The page has not been published, so the shape
    falls back to its draft, which is what the preview draws.
  */
  const shape = publicOnePage(PARITY_PAGE as any, { source: "published" })
  withLiveProducts(createClient() as unknown as ProductsDb, shape.seller_id ?? "", shape.blocks).then((live) => {
    ;(window as any).__PARITY_ORDER = orderOf(live)
    root.render(<PublicOnePage onepage={{ ...shape, blocks: live } as any} />)
  })
}
