/**
 * Round W9 (opblocks) harness for scripts/check-onepage-blocks-w9.mjs: a realistic page with one of every
 * kind of block a creator puts on a OnePage (plain links, a link with an icon, a link with a picture, product
 * callouts, a product tile, a heading, text, social icons, a subscribe form, a contact form, a FAQ, a
 * countdown, a promo code, testimonials, a picture, a divider, an embed and a group), with a theme PICKED the
 * way the Themes panel picks it (lib/onepage/theme-apply lookFromTemplate, from the plain default page) and a
 * Design › Layout › Blocks choice laid over it.
 *
 *   ?t=<theme id>   the theme picked (THEME_TEMPLATES), none for the default page
 *   ?l=<layout>     list | grid | cards | compact | masonry (Design › Layout › Blocks)
 *   ?live           the published page (else the editor, whose preview frame is /onepage-preview)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { layoutUpdates, type BlockLayout } from "@/lib/onepage/theme-layout"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
const IMG = (n: number, w = 400, h = 400) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 67},55%,55%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="hsl(${n * 67 + 120},60%,70%)"/></svg>`)}`

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
}
const product = (id: string, title: string, n: number, style: string, own: Record<string, unknown> = {}) =>
  make("product", id, { product_id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c0${n}`, product_title: title, product_thumbnail: IMG(n), product_price_cents: 1900 + n * 100, product_type: "digital", product_slug: `p${n}`, show_price: true, style, cta_text: "Get it", tap_action: "sheet", instant_checkout: true, ...own })

const blocks: OnePageBlock[] = [
  make("link_button", "l1", { label: "Shop the prints", url: "https://example.com/shop" }),
  make("link_button", "l2", { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" }),
  make("link_button", "l3", { label: "Studio journal", url: "https://example.com/journal", thumbnail_url: IMG(4) }),
  make("link_button", "l4", { label: "Book a portrait session", url: "https://example.com/book" }),
  make("link_button", "l5", { label: "Featured: the summer series", url: "https://example.com/summer", thumbnail_url: IMG(5, 800, 450), layout_type: "pro" }),
  make("heading", "h1", { text: "Shop" }),
  /* A block made dark by hand for an older theme: picking a theme takes its own colours off. */
  product("p1", "Strength Blueprint", 1, "callout", { block_background_color: "#111111", text_color: "#ffffff" }),
  product("p2", "Meal plan PDF", 2, "tile"),
  product("p3", "Poster pack", 3, "tile"),
  make("text", "x1", { content: "Prints made by hand in small runs, shipped from Lisbon.", alignment: "center" }),
  make("social_row", "s1", {}),
  make("email_capture", "e1", { title: "Join the newsletter", description: "One letter a month, new prints first." }),
  make("divider", "d1", {}),
  make("faq", "f1", { title: "Questions", items: [{ question: "Do you ship worldwide?", answer: "Yes, from Lisbon." }, { question: "Can I return a print?", answer: "Within 30 days." }] }),
  make("countdown", "c1", { title: "Next drop", target_date: "2030-01-01T00:00:00.000Z" }),
  make("promo_code", "pc1", { code: "SATORI10", title: "10% off your first print" }),
  make("testimonials", "tm1", { title: "Kind words", items: [{ id: "q1", quote: "The print arrived beautifully packed and the colours are even better in person.", name: "Ana", detail: "Lisbon", rating: 5 }, { id: "q2", quote: "Second order, same care.", name: "Tom", detail: "London", rating: 5 }] }),
  make("contact_form", "cf1", { title: "Get in touch" }),
  make("image", "i1", { image_url: IMG(6, 800, 500), images: [{ image_url: IMG(6, 800, 500) }] }),
  make("link_button", "l6", { label: "Read the blog", url: "https://example.com/blog" }),
  make("link_button", "l7", { label: "Wholesale enquiries", url: "https://example.com/wholesale" }),
]

const header = { id: "hdr", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } } as unknown as OnePageBlock
let onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  seller_id: "seller_probe",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: IMG(7),
  theme: { ...defaultTheme } as any,
  settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true } as any,
  social_links: { instagram: "https://instagram.com/satori", tiktok: "https://tiktok.com/@satori", youtube: "https://youtube.com/@satori" },
  draft_blocks: [header, ...blocks],
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as unknown as OnePage

const template = THEME_TEMPLATES.find((t) => t.id === params.get("t"))
if (template) {
  const config = (template.theme_config || {}) as Record<string, unknown>
  const hero = (template as { profile_layout?: string }).profile_layout === "hero" || config.header_layout === "hero"
  onepage = lookFromTemplate(onepage, template as never, hero ? "hero" : (template as { profile_layout?: string }).profile_layout === "classic" ? "classic" : undefined, null)
}
const layout = params.get("l") as BlockLayout | null
if (layout) {
  const u = layoutUpdates(onepage.theme as never, layout)
  if (u) onepage = { ...onepage, theme: { ...onepage.theme, ...u } as never }
}
;(globalThis as any).__probeTheme = onepage.theme
/* Every theme the Themes panel lists (another track's new ones included), for the check to walk. */
;(globalThis as any).__themeIds = THEME_TEMPLATES.map((t) => t.id)
;(globalThis as any).__probeSettings = onepage.settings

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(document.getElementById("app")!).render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks: onepage.draft_blocks } as any} />)
} else {
  createRoot(document.getElementById("app")!).render(<OnePageEditor initialOnePage={onepage} />)
}
