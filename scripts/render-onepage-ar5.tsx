/**
 * Round AR5: one page holding every block that draws words or a button,
 * drawn by the live page's own component with whatever theme a probe hands
 * it, for scripts/check-onepage-contrast-ar5.mjs and
 * scripts/check-onepage-settings-ar5.mjs.
 *
 *   ?preview   drawn from the draft, as the editor's preview frame builds it
 *              (lib/onepage/public-shape publicOnePageFromDraft), with the
 *              preview's sandbox flag set
 *   (else)     drawn from the published copy, as /l/<slug> builds it
 *              (publicOnePage, source "published")
 *
 * The probe calls window.__ar5Render(theme, blockIds?) and waits for
 * window.__ar5Drawn to hold the case number it asked for.
 */
import React from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"
import { appBlockDefaults, type AppProviderId } from "@/lib/onepage/app-blocks"
import { publicOnePage, publicOnePageFromDraft } from "@/lib/onepage/public-shape"

const q = new URLSearchParams(location.search)
const preview = q.has("preview")
if (preview) (window as unknown as { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

const IMG = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${n * 47},55%,62%)"/></svg>`)}`
const PDF = "https://files.example.com/guide.pdf"

const FILL: Partial<Record<OnePageBlockType, Record<string, unknown>>> = {
  link_button: { label: "Shop the prints", url: "https://example.com/shop" },
  text: { content: "Prints, posters and a newsletter." },
  pdf_document: { pdf_file_url: PDF, title: "The print guide", description: "Twelve pages", button_text: "View PDF" },
  food_menu: { pdf_file_url: PDF, title: "Menu", description: "Cafe hours 9 to 5", button_text: "View menu" },
  calendly: { calendly_url: "https://calendly.com/probe/30min", title: "Book a call", description: "Thirty minutes", button_text: "Book" },
  heading: { text: "Work with me" },
  map: { address: "Lisbon", title: "Studio", show_button: true },
  countdown: { title: "Launch", target_at: "2020-01-01T00:00:00.000Z", ended_text: "Out now" },
  faq: { title: "Questions", items: [{ id: "q1", question: "Do you ship?", answer: "Yes, worldwide." }] },
  contact_form: { title: "Get in touch" },
  promo_code: { code: "SATORI10", title: "10% off" },
  email_capture: { headline: "Sunday letter", description: "One email, every other week", placeholder: "Your email", button_text: "Subscribe" },
  product: { product_id: "p1", show_price: true, show_description: true, cta_text: "Buy now", style: "button", product_title: "A3 print", product_thumbnail: IMG(5), product_description: "Giclee on cotton rag", product_price_cents: 2400, product_slug: "a3-print" },
}

const APPS: [AppProviderId, Record<string, unknown>][] = [
  ["tips", { url: "https://ko-fi.com/satori" }],
  ["events", { items: [{ id: "e1", title: "Lisbon show", date: "2030-03-02", url: "https://tickets.example.com/1" }] }],
  ["stats", { items: [{ id: "s1", title: "Followers", value: "12k" }] }],
  ["poll", { poll_question: "Next print?", poll_options: [{ id: "a", label: "Waves" }, { id: "b", label: "Hills" }] }],
  ["discord", { url: "https://discord.gg/satori" }],
  ["mobile_app", { ios_url: "https://apps.apple.com/app/id123", android_url: "https://play.google.com/store/apps/details?id=x" }],
]

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...(FILL[type] ?? {}), ...extra } as never }
}

export const AR5_BLOCKS: OnePageBlock[] = [
  { id: "header", type: "header", enabled: true, sort_order: order++, data: { show_avatar: true, show_name: true, show_bio: true } } as never,
  make("link_button", "link_plain"),
  make("link_button", "link_thumb", { label: "Read the journal", thumbnail_url: IMG(2) }),
  make("link_button", "link_pro", { label: "New collection", thumbnail_url: IMG(4), layout_type: "pro" }),
  make("heading", "heading"),
  make("text", "text"),
  make("product", "product_button"),
  make("product", "product_callout", { style: "callout", product_id: "p2", product_title: "Poster pack" }),
  make("social_row", "social_buttons", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "spotify", url: "https://open.spotify.com/artist/1" }], style: "buttons" }),
  make("social_row", "social_icons", { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "tiktok", url: "https://tiktok.com/@satori" }], style: "icons" }),
  make("email_capture", "email"),
  make("pdf_document", "pdf"),
  make("food_menu", "menu"),
  make("calendly", "calendly", { embed_mode: "direct_link" }),
  make("faq", "faq"),
  make("countdown", "countdown"),
  make("map", "map"),
  make("contact_form", "contact"),
  make("promo_code", "promo"),
  make("testimonials", "testimonials"),
  make("course", "course"),
  make("lead_magnet", "lead"),
  ...APPS.map(([p, extra]) => {
    const b = createDefaultBlock("app")
    return { ...b, id: `app_${p}`, sort_order: order++, enabled: true, data: { ...appBlockDefaults(p), ...extra } as never }
  }),
]

const root = createRoot(document.getElementById("app")!)
let caseNo = 0

function row(theme: Record<string, unknown>, blocks: OnePageBlock[]) {
  return {
    id: "op_ar5",
    owner_id: "probe-user",
    slug: "satori",
    title: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    avatar_url: IMG(7),
    theme,
    published_theme: theme,
    settings: { ...defaultSettings, verified_badge_enabled: true },
    social_links: { instagram: "https://instagram.com/satori" },
    draft_blocks: blocks,
    published_blocks: blocks,
    status: "published",
    seller_id: "seller_ar5",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }
}

/** Draw the page in `theme` (a template id, or a theme object laid over the defaults). */
function render(theme: string | Record<string, unknown>, only?: string[] | null) {
  const blocks = only ? AR5_BLOCKS.filter((b) => only.includes(b.id)) : AR5_BLOCKS
  const tpl = typeof theme === "string" ? THEME_TEMPLATES.find((x) => x.id === theme) : null
  const t = tpl ? { ...tpl.theme_config, template_id: tpl.id, ...((tpl as { profile_layout?: string }).profile_layout === "hero" ? { header_layout: "hero" } : {}) } : typeof theme === "string" ? {} : theme
  const full = { ...defaultTheme, ...t }
  const r = row(full, blocks) as never
  const shape = preview ? publicOnePageFromDraft(r) : publicOnePage(r, { source: "published" })
  const n = ++caseNo
  /* A new key each case: the page is built fresh, as a visitor's first load is. */
  flushSync(() => root.render(<PublicOnePage key={n} onepage={shape as never} />))
  ;(window as unknown as { __ar5Drawn: number }).__ar5Drawn = n
  return n
}

Object.assign(window, {
  __ar5Render: render,
  __ar5Themes: THEME_TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category, theme_config: t.theme_config })),
})
render("default")
