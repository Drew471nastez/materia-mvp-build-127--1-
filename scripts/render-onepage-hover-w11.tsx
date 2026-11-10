/**
 * Wave 11 (hover) harness for scripts/check-onepage-hover-w11.mjs: a page with every kind of control a OnePage draws
 * (link buttons in every layout and look, a highlighted one, the picture cards, a link with its own surface, a
 * product in each of its eight layouts and one with the creator's own dark button, the PDF, menu and booking
 * buttons, a group, music and video, the newsletter in every layout, the contact form, questions, a countdown, a
 * promo code, reviews, socials), with a theme PICKED as Design › Themes picks it, a block layout over it, and a
 * set of the creator's own Design changes made after it (through lib/onepage/skin-own withSkinOwn, as the Design
 * tab makes them).
 *
 *   ?t=<theme id>   the theme picked (every list the picker shows)
 *   ?l=<layout>     list | grid | cards | compact | masonry
 *   ?s=<setting>    one of SETTINGS below: the creator's own button design over the theme
 *   ?guard=0        the page without the guard (components/onepage/legible-guard): what the page draws by itself
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { withSkinOwn } from "@/lib/onepage/skin-own"
import { layoutUpdates, type BlockLayout } from "@/lib/onepage/theme-layout"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
const IMG = (n: number, w = 400, h = 400) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="hsl(${n * 67},55%,55%)"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="hsl(${n * 67 + 120},60%,70%)"/></svg>`)}`

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}, style?: Record<string, unknown>): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never, ...(style ? { style: { presentation: style } } : {}) } as OnePageBlock
}
const product = (id: string, title: string, n: number, style: string, own: Record<string, unknown> = {}) =>
  make("product", id, { product_id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c${String(n).padStart(2, "0")}`, product_title: title, product_description: "Designed for everyday wear, each piece combines comfort and care.", product_thumbnail: IMG(n), product_price_cents: 1900 + n * 100, product_type: "digital", product_slug: `p${n}`, show_price: true, style, cta_text: "Get My Guide", tap_action: "sheet", instant_checkout: true, ...own })

const PRODUCT_STYLES = ["button", "callout", "preview", "row", "side", "minimal", "overlay", "tile"]
const blocks: OnePageBlock[] = [
  make("link_button", "l1", { label: "Shop the prints", url: "https://example.com/shop" }),
  make("link_button", "l2", { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" }),
  make("link_button", "l3", { label: "Studio journal", url: "https://example.com/journal", thumbnail_url: IMG(4) }),
  make("link_button", "l4", { label: "Highlighted: new drop", url: "https://example.com/drop", animation_type: "swipe" }),
  make("link_button", "l5", { label: "Featured: the summer series", url: "https://example.com/summer", thumbnail_url: IMG(5, 800, 450), layout_type: "pro" }),
  /* The owner's "My Link": a picture card with no picture, a navy gradient of the creator's own. */
  make("link_button", "lv1", { label: "My Link", url: "https://example.com/my" }, { variant: "visual", gradient_from: "#000080", gradient_to: "#4b4bb0", align: "center", position: "center" }),
  make("link_button", "lv2", { label: "Compact card", url: "https://example.com/c" }, { variant: "compact" }),
  make("link_button", "lv3", { label: "Profile card", url: "https://instagram.com/satori.shop" }, { variant: "profile" }),
  make("link_button", "lv4", { label: "Picture card", url: "https://example.com/pic", thumbnail_url: IMG(8, 800, 500) }, { variant: "visual" }),
  /* A link with its own surface (Design › block › Layout): navy. */
  make("link_button", "lo1", { label: "Own navy surface", url: "https://example.com/own" }, { background: "#000080" }),
  make("heading", "h1", { text: "Shop" }),
  ...PRODUCT_STYLES.map((s, i) => product(`p-${s}`, `Pants Down (${s})`, i + 1, s)),
  /* A product whose button the creator made dark on a dark card (the button's own colours). */
  product("p-own", "Own dark button", 9, "callout", { button_color: "#1b1b1f", button_text_color: "#2a2a2e" }),
  make("pdf_document", "pdf1", { title: "Lookbook", pdf_file_url: "https://example.com/look.pdf", button_text: "View PDF" }),
  make("calendly", "cal1", { title: "Book a call", calendly_url: "https://calendly.com/satori/30min", button_text: "Schedule Now", embed_mode: "link" }),
  make("group", "g1", { title: "A group", layout: "stack", children: [make("link_button", "gl1", { label: "Inside a group", url: "https://example.com/g1" }), make("link_button", "gl2", { label: "Second in the group", url: "https://example.com/g2" })] }),
  make("music", "m1", { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Listen on Spotify" }),
  make("video", "v1", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Watch the film" }),
  make("social_row", "s1", {}),
  make("email_capture", "e1", { title: "Join the newsletter", description: "One letter a month, new prints first." }),
  ...["bold", "pro", "cover", "minimal", "connect", "letter", "bar"].map((layout_type) => make("email_capture", `e-${layout_type}`, { title: `Join my newsletter (${layout_type})`, description: "Get updates and exclusive content", layout_type })),
  make("faq", "f1", { title: "Questions", items: [{ id: "fq1", question: "Do you ship worldwide?", answer: "Yes, from Lisbon." }, { id: "fq2", question: "Can I return a print?", answer: "Within 30 days." }] }),
  make("countdown", "c1", { title: "Next drop", target_at: "2030-01-01T00:00:00.000Z" }),
  make("promo_code", "pc1", { code: "SATORI10", title: "10% off your first print", url: "https://example.com/shop" }),
  make("testimonials", "tm1", { title: "Kind words", items: [{ id: "q1", quote: "The print arrived beautifully packed.", name: "Ana", detail: "Lisbon", rating: 5 }] }),
  make("contact_form", "cf1", { title: "Get in touch", open_mode: "page" }),
  make("lead_magnet", "lm1", { title: "Free guide", description: "Ten prints to start with.", button_text: "Send it to me" }),
  make("link_button", "l6", { label: "Read the blog", url: "https://example.com/blog" }),
]

/*
 * The creator's own button design after the theme, one set per ?s=. The three the owner named ("the double hover
 * changing the text colour in 3 styles") are Fill, Pop and a style of their own; every style, shadow and shape is
 * walked, with colours that do not read on purpose (dark on dark, light on light, a hover fill the words vanish on).
 */
export const SETTINGS: Record<string, Record<string, unknown>[]> = {
  outline: [{ button_style: "outline" }],
  soft: [{ button_style: "soft" }],
  glass: [{ button_style: "glass" }],
  hard: [{ button_shadow: "hard", button_shadow_color: "#111111" }, { button_border_width: 2, button_border_color: "#111111" }],
  pill: [{ button_border_radius: 999 }],
  darkdark: [{ button_color: "#1b1b1f", button_text_color: "#2a2a2e", button_style: "filled" }],
  lightlight: [{ button_color: "#f2f2f2", button_text_color: "#e6e6e6", button_style: "filled" }],
  fill: [{ button_hover_animation: "fill", button_hover_fill: null, button_hover_text: null }],
  pop: [{ button_hover_animation: "pop", button_hover_fill: "#ffffff", button_hover_text: "#f0f0f0" }],
  ownhover: [{ button_hover_animation: "fill", button_hover_fill: "#000080", button_hover_text: "#111111" }],
  lift: [{ button_hover_animation: "lift" }],
  glow: [{ button_hover_animation: "glow" }],
  underline: [{ button_hover_animation: "underline" }],
  pink: [{ button_color: "#e0245e", button_text_color: "#ffffff", button_style: "filled" }, { button_hover_animation: "pop" }],
}

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
const setting = params.get("s")
for (const u of (setting && SETTINGS[setting]) || []) onepage = { ...onepage, theme: { ...onepage.theme, ...withSkinOwn(onepage.theme as never, u) } as never }
if (params.get("guard") === "0") (globalThis as any).__ONEPAGE_LEGIBLE_OFF = true
const layout = params.get("l") as BlockLayout | null
if (layout) {
  const u = layoutUpdates(onepage.theme as never, layout)
  if (u) onepage = { ...onepage, theme: { ...onepage.theme, ...u } as never }
}
;(globalThis as any).__probeTheme = onepage.theme
;(globalThis as any).__themeIds = THEME_TEMPLATES.map((t) => t.id)
;(globalThis as any).__themeNames = Object.fromEntries(THEME_TEMPLATES.map((t) => [t.id, t.name]))
;(globalThis as any).__settings = Object.keys(SETTINGS)

createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks: onepage.draft_blocks } as any} />)
