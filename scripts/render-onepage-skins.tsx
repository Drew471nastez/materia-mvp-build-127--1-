/**
 * A realistic OnePage in one theme, for scripts/shot-onepage-skins.mjs
 * (round W9): the header, social icons, a heading, links (one with a
 * picture), products, a picture grid, a text, a subscribe form, an FAQ,
 * a countdown, testimonials, a divider, a promo code and a contact form.
 *
 *   ?theme=aero        a theme from the catalogue (components/onepage/tabs/design-tab THEME_TEMPLATES)
 *   &layout=grid       the theme's block layout overridden (list, grid, cards, compact, masonry)
 *   &preview           drawn as the editor's preview draws it
 *   &email=bold        the first subscribe form's layout (round W10: a second one is always Bold, the
 *                      layout the owner found white on white in Messenger and Grunge)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

const q = new URLSearchParams(location.search)
if (q.has("preview")) (window as unknown as { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

/* Pictures drawn here, never fetched: soft two-colour scenes, like a photo at a glance. */
const PIC = (a: string, b: string, c: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="290" cy="120" r="54" fill="${c}" opacity=".85"/><path d="M0 300 C 90 240 160 330 260 270 S 380 250 400 280 V400 H0Z" fill="${c}" opacity=".55"/></svg>`)}`
const AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d9c3ad"/><circle cx="100" cy="82" r="38" fill="#7a5a44"/><path d="M30 200 C 40 140 160 140 170 200Z" fill="#3d4f6b"/></svg>`)}`

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
}
const product = (id: string, title: string, cents: number, pic: string, style = "callout") =>
  make("product", id, { product_id: id, product_title: title, product_price_cents: cents, product_slug: id, product_thumbnail: pic, product_description: "A short line about what is inside.", cta_text: "Get it", style })

const blocks: OnePageBlock[] = [
  make("social_row", "so", { platforms: [{ platform: "instagram", url: "https://instagram.com/x" }, { platform: "tiktok", url: "https://tiktok.com/@x" }, { platform: "youtube", url: "https://youtube.com/@x" }, { platform: "spotify", url: "https://open.spotify.com/artist/x" }], style: "icons" }),
  make("heading", "hd1", { text: "New this week", size: "medium", alignment: "center" }),
  make("link_button", "l1", { label: "Watch the latest video", url: "https://example.com/video", thumbnail_url: PIC("#9fc6e8", "#3d6fa8", "#f2d27a") }),
  make("link_button", "l2", { label: "Book a session", url: "https://example.com/book" }),
  make("link_button", "l3", { label: "My podcast", url: "https://example.com/pod" }),
  make("link_button", "l4", { label: "Newsletter archive", url: "https://example.com/news" }),
  make("link_button", "l5", { label: "Studio tour: a day in the darkroom", url: "https://example.com/tour", layout_type: "pro", thumbnail_url: PIC("#c8d9ef", "#44628f", "#ffd9a0") }),
  product("p1", "Preset pack Vol. 2", 2400, PIC("#f6c9a8", "#c0584a", "#ffe9b0")),
  product("p2", "Field notes zine", 1200, PIC("#c9e6c0", "#4e8a5a", "#f8f3d6")),
  make("image", "img", { display_style: "grid", images: [{ id: "i1", image_url: PIC("#bcd7f2", "#2f5d9a", "#fff3c4") }, { id: "i2", image_url: PIC("#f2c6d8", "#a1416c", "#ffe3b3") }, { id: "i3", image_url: PIC("#d4ecc6", "#3f7a3a", "#fdf6cf") }, { id: "i4", image_url: PIC("#e9dcc9", "#7a5a3a", "#fff") }], image_url: PIC("#bcd7f2", "#2f5d9a", "#fff3c4") }),
  make("text", "tx", { content: "I make presets, zines and slow videos about cities. New drops every first Friday.", alignment: "center" }),
  make("email_capture", "em", { headline: "Join the letter", description: "One email a month. No spam.", placeholder: "you@email.com", button_text: "Subscribe", layout_type: q.get("email") || "default" }),
  make("divider", "dv", { style: "line", height: 24 }),
  make("faq", "fq", { title: "Questions", items: [{ id: "q1", question: "Do you ship worldwide?", answer: "Yes, everywhere." }, { id: "q2", question: "Can I get a refund?", answer: "Within 14 days." }] }),
  make("countdown", "cd", { title: "Next drop", target_at: "2030-01-01T00:00:00.000Z" }),
  make("testimonials", "ts", { title: "Kind words", items: [{ id: "t1", quote: "The presets changed how I edit.", name: "Ana", detail: "Photographer", rating: 5 }] }),
  make("promo_code", "pc", { title: "10% off prints", code: "HELLO10", description: "Use it at checkout", url: "https://example.com" }),
  make("contact_form", "cf", { title: "Get in touch", open_mode: "inline" }),
  make("email_capture", "em2", { headline: "Join my newsletter", description: "Get updates and exclusive content", placeholder: "Enter your email", button_text: "Subscribe", layout_type: "bold" }),
]

const named = q.get("theme") || "default"
const template = THEME_TEMPLATES.find((t) => t.id === named)
const layout = q.get("layout")
const theme = { ...defaultTheme, ...(template?.theme_config ?? {}), template_id: named, ...(layout ? { block_layout: layout } : {}) }

const header = { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }
const onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "mayajane",
  title: "Maya Jane",
  bio: "Lifestyle creator from New York. Presets, zines and slow videos.",
  avatar_url: AVATAR,
  theme,
  settings: { ...defaultSettings, share_style: (template as { share_style?: string } | undefined)?.share_style, subscribe_style: (template as { subscribe_style?: string } | undefined)?.subscribe_style },
  social_links: { instagram: "https://instagram.com/x", tiktok: "https://tiktok.com/@x", youtube: "https://youtube.com/@x", spotify: "https://open.spotify.com/artist/x", email: "hi@example.com" },
  blocks: [header, ...blocks],
  draft_blocks: blocks,
  status: "published",
  seller_id: "seller_probe",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={onepage as never} />)
