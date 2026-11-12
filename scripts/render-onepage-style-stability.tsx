/**
 * Harness for scripts/check-onepage-style-stability.mjs: a OnePage with every kind of block (the link button with an
 * Instagram mark, the Instagram block in each of its layouts, social icons, the product in every layout, the forms,
 * the cards), a theme picked as the Themes panel picks it (lib/onepage/theme-apply lookFromTemplate).
 *
 *   /app?live&t=<id>          the published page (PublicOnePage)
 *   /app?editor&t=<id>        the editor's preview: this document frames /onepage-preview and posts the page to it,
 *                             as components/onepage/live-preview does, so a theme switch arrives the way it does there
 *   &anim=<pulse|...|swipe>   the blocks that can move, moving
 *   &icons=<style>/<tone>     Design › Social icons over the theme (filled|outline|minimal|glass, brand|mono)
 *   &all=1                    every other block that draws a button or a choice as well (tips, a poll, events, the
 *                             contact card, the menu, booking, a map, a course, the social row as buttons), for the
 *                             contrast pass (scripts/onepage-button-contrast.mjs)
 *
 * window.__setTheme(id) picks another theme on the page that is already drawn (a rerender on the live page, a new
 * "page" message in the editor's frame), so a probe can watch a switch.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { withSkinOwn } from "@/lib/onepage/skin-own"
import { publicOnePageFromDraft } from "@/lib/onepage/public-shape"
import { ONEPAGE_PREVIEW_CHANNEL } from "@/lib/onepage/preview-channel"
import { appBlockDefaults, type AppProviderId } from "@/lib/onepage/app-blocks"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
const IMG = (n: number, w = 400, h = 400) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 67},55%,55%)"/></svg>`)}`
const anim = params.get("anim") || "none"

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
}
const product = (id: string, style: string, n: number, title = "Strength Blueprint: the twelve week programme") =>
  make("product", id, { product_id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`, product_title: title, product_description: "A printable plan with every session laid out.", show_description: true, product_thumbnail: IMG(n), product_price_cents: 4900, product_compare_at_cents: 6900, product_type: "digital", product_slug: `p${n}`, show_price: true, style, style_chosen: true, cta_text: "Get it now", tap_action: "sheet", instant_checkout: true, animation_type: anim })

const blocks: OnePageBlock[] = [
  make("link_button", "l1", { label: "Shop the prints", url: "https://example.com/shop", animation_type: anim }),
  make("link_button", "l2", { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram", animation_type: anim }),
  make("link_button", "l3", { label: "Studio journal", url: "https://example.com/journal", thumbnail_url: IMG(4), animation_type: anim }),
  make("link_button", "l5", { label: "Featured: the summer series", url: "https://example.com/summer", thumbnail_url: IMG(5, 800, 450), layout_type: "pro" }),
  ...["classic", "card", "profile", "single"].map((layout) => make("app", `ig-${layout}`, { provider: "instagram", url: "https://instagram.com/satori.shop", title: "Satori on Instagram", layout })),
  make("app", "tt-classic", { provider: "tiktok", url: "https://tiktok.com/@satori", layout: "classic" }),
  make("social_row", "s1", {}),
  make("heading", "h1", { text: "Shop" }),
  ...["callout", "row", "preview", "side", "tile", "overlay", "minimal", "button"].map((style, i) => product(`p-${style}`, style, i + 1)),
  product("p-row-short", "row", 9, "Poster"),
  /* Every layout at half the page's width (Layout › Size › Half), two to a row: where a card is narrowest. */
  ...["callout", "row", "preview", "side", "tile", "overlay", "minimal", "button"].map((style, i) => ({ ...product(`p-half-${style}`, style, i + 11), style: { presentation: { size: "half" } } }) as OnePageBlock),
  make("text", "x1", { content: "Prints made by hand in small runs, shipped from Lisbon.", alignment: "center" }),
  make("email_capture", "e1", { title: "Join the newsletter", description: "One letter a month, new prints first.", animation_type: anim }),
  make("faq", "f1", { title: "Questions", items: [{ question: "Do you ship worldwide?", answer: "Yes, from Lisbon." }] }),
  make("countdown", "c1", { title: "Next drop", target_date: "2030-01-01T00:00:00.000Z" }),
  make("promo_code", "pc1", { code: "SATORI10", title: "10% off your first print" }),
  make("testimonials", "tm1", { title: "Kind words", items: [{ id: "q1", quote: "The print arrived beautifully packed.", name: "Ana", detail: "Lisbon", rating: 5 }] }),
  make("contact_form", "cf1", { title: "Get in touch" }),
  make("pdf_document", "pdf1", { title: "Price list", file_url: "https://example.com/list.pdf", animation_type: anim }),
  make("lead_magnet", "lm1", { title: "Free guide", button_text: "Send me the guide" }),
  make("followers", "fo1", { networks: [{ network: "instagram", count: 12000 }, { network: "tiktok", count: 4000 }], style: "line" }),
  make("divider", "d1", {}),
  make("link_button", "l6", { label: "Read the blog", url: "https://example.com/blog" }),
]

/* Every other block with a button, a chip or a choice in it, for the contrast pass (&all=1). */
const PDF = "https://files.example.com/guide.pdf"
const appBlock = (p: AppProviderId, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock("app")
  return { ...b, id: `app-${p}`, sort_order: order++, enabled: true, data: { ...appBlockDefaults(p), ...extra } as never }
}
if (params.get("all") === "1")
  blocks.push(
    appBlock("tips", { title: "Buy me a coffee", subtitle: "Every tip goes to paper and ink", tip_ready: true, tip_currency: "usd" }),
    appBlock("poll", { poll_question: "Next print?", poll_options: [{ id: "a", label: "Waves" }, { id: "b", label: "Hills" }, { id: "c", label: "Harbour" }] }),
    appBlock("events", { title: "Shows", items: [{ id: "e1", title: "Lisbon show", date: "2030-03-02", url: "https://tickets.example.com/1" }] }),
    appBlock("event", { title: "Open studio", event_start: "2030-05-02T18:00:00.000Z", venue: "Rua da Prata 12" }),
    appBlock("contact", { title: "Studio", contact: { email: "hi@satori.example", phone: "+351 210 000 000" } }),
    appBlock("email", { title: "Write to me", url: "mailto:hi@satori.example" }),
    appBlock("discord", { url: "https://discord.gg/satori" }),
    appBlock("mobile_app", { title: "Satori app", ios_url: "https://apps.apple.com/app/id123", android_url: "https://play.google.com/store/apps/details?id=x" }),
    make("social_row", "s-buttons", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "spotify", url: "https://open.spotify.com/artist/1" }], style: "buttons" }),
    make("food_menu", "menu1", { pdf_file_url: PDF, title: "Menu", description: "Cafe hours 9 to 5", button_text: "View menu" }),
    make("calendly", "cal1", { calendly_url: "https://calendly.com/probe/30min", title: "Book a call", description: "Thirty minutes", button_text: "Book", embed_mode: "direct_link" }),
    make("map", "map1", { address: "Lisbon", title: "Studio", show_button: true }),
    make("course", "course1", {}),
  )

const header = { id: "hdr", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } } as unknown as OnePageBlock
const base = {
  id: "op_probe",
  owner_id: "probe-user",
  seller_id: "seller_probe",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: IMG(7),
  theme: { ...defaultTheme } as any,
  settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true } as any,
  social_links: { instagram: "https://instagram.com/satori", tiktok: "https://tiktok.com/@satori", youtube: "https://youtube.com/@satori", x: "https://x.com/satori", facebook: "https://facebook.com/satori" },
  draft_blocks: [header, ...blocks],
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as unknown as OnePage

function pageFor(themeId: string | null): OnePage {
  let onepage = base
  const template = THEME_TEMPLATES.find((t) => t.id === themeId)
  if (template) {
    const config = (template.theme_config || {}) as Record<string, unknown>
    const hero = (template as { profile_layout?: string }).profile_layout === "hero" || config.header_layout === "hero"
    onepage = lookFromTemplate(onepage, template as never, hero ? "hero" : (template as { profile_layout?: string }).profile_layout === "classic" ? "classic" : undefined, null)
  }
  const icons = params.get("icons")
  if (icons) {
    const [style, tone] = icons.split("/")
    /* As Design › Social icons sets them (lib/onepage/context updateTheme through withSkinOwn): over a skin they become the creator's own. */
    const u = { social_icon_style: style, social_icon_tone: tone || "mono" }
    onepage = { ...onepage, theme: { ...onepage.theme, ...withSkinOwn(onepage.theme as never, u) } as never }
  }
  return onepage
}

;(globalThis as any).__themeIds = THEME_TEMPLATES.map((t) => t.id)
const app = document.getElementById("app")!

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(app).render(<OnePagePreviewDocument />)
} else if (params.has("editor")) {
  /* The editor's side of the preview channel (components/onepage/live-preview), and nothing else of the editor. */
  let current = pageFor(params.get("t"))
  const frame = document.createElement("iframe")
  frame.src = `/onepage-preview?embedded=1`
  frame.style.cssText = "border:0;width:100%;height:100vh;display:block"
  frame.id = "preview"
  app.appendChild(frame)
  const post = () => frame.contentWindow?.postMessage({ channel: ONEPAGE_PREVIEW_CHANNEL, kind: "page", page: publicOnePageFromDraft(current as never), currency: "usd" }, location.origin)
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || e.data?.channel !== ONEPAGE_PREVIEW_CHANNEL) return
    if (e.data.kind === "ready") post()
    if (e.data.kind === "drawn") (window as any).__drawn = true
  })
  ;(window as any).__setTheme = (id: string) => {
    current = pageFor(id)
    post()
  }
} else {
  const root = createRoot(app)
  const draw = (id: string | null) => {
    const p = pageFor(id)
    root.render(<PublicOnePage onepage={{ ...p, blocks: p.draft_blocks } as any} />)
  }
  draw(params.get("t"))
  ;(window as any).__setTheme = (id: string) => draw(id)
}
