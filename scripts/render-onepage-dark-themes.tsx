/**
 * The harness for scripts/check-onepage-dark-themes.mjs: the real PublicOnePage, a whole page of every part a
 * creator puts on one (links plain, with an icon and with a picture, a carousel of picture links, products as a
 * callout, tiles and a carousel, a shelf, a text, the newsletter, a contact form, a booking, an embed, an open
 * form, questions, kind words, a code, a countdown, the socials, Share and Subscribe), with a theme PICKED as
 * Design › Themes picks it (lib/onepage/theme-apply lookFromTemplate).
 *
 *   ?t=<theme id>   the theme (any THEME_TEMPLATES id; velvet and basalt are the ones this is for)
 *
 * Pictures are files scripts/check-onepage-dark-themes.mjs draws and serves under /__files/; the avatar is drawn here.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { createDefaultBlock, defaultSettings, defaultTheme, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
/* A photograph's stand in: two tones and a soft disc, in muted colours a real picture would have. */
const IMG = (a: string, b: string, w = 800, h = 1000) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.62}" cy="${h * 0.42}" r="${Math.min(w, h) / 4}" fill="${b}" opacity="0.55"/></svg>`)}`
/* The pictures a page shows (link pictures must be addresses, lib/onepage/block-presentation safeCardMedia): files the check serves. */
const P = [0, 1, 2, 3, 4].map((i) => `/__files/photo-${i}.jpg`)

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}, style?: Record<string, unknown>): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never, ...(style ? { style: style as never } : {}) }
}
const uuid = (n: number) => `6f1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, "0")}`
const product = (id: string, title: string, n: number, style: string, extra: Record<string, unknown> = {}) =>
  make("product", id, { product_id: uuid(n), product_title: title, product_thumbnail: P[n % P.length], product_price_cents: 1200 + n * 300, product_type: "digital", product_slug: `p${n}`, show_price: true, style, style_chosen: true, cta_text: "Buy the guide", tap_action: "sheet", ...extra })
const visualLink = (n: number, label: string) => ({
  id: `vl-${n}`, type: "link_button", enabled: true, sort_order: n,
  data: { label, url: `https://example.com/${n}` },
  style: { presentation: { variant: "visual", image_url: P[n % P.length], align: "left", overlay: 40, aspect: "4:5" } },
})

const blocks: OnePageBlock[] = [
  make("link_button", "l1", { label: "New prints, autumn edition", url: "https://example.com/prints" }),
  make("link_button", "l2", { label: "Instagram", url: "https://instagram.com/mara.studio", icon: "instagram" }),
  make("link_button", "l3", { label: "Field notes from Lisbon", url: "https://example.com/journal", thumbnail_url: P[2] }),
  make("link_button", "l4", { label: "Book a portrait session", url: "https://example.com/book" }),
  { id: "g-links", type: "group", enabled: true, sort_order: order++, data: { title: "Series", layout: "carousel", carousel_view: "1.2", children: [visualLink(1, "Coastline"), visualLink(2, "Night trains"), visualLink(3, "Markets"), visualLink(4, "Studio")] } } as unknown as OnePageBlock,
  make("heading", "h1", { text: "Shop" }),
  product("p1", "Darkroom notes, a 60 page guide", 1, "callout"),
  product("p2", "Lightroom presets", 2, "tile"),
  product("p3", "Print, 30 by 40", 3, "tile"),
  { id: "g-products", type: "group", enabled: true, sort_order: order++, data: { title: null, layout: "carousel", carousel_view: "1.2", children: [product("gp1", "Film scans pack", 4, "tile"), product("gp2", "Postcard set", 5, "tile"), product("gp3", "Zine, issue 3", 6, "tile")] } } as unknown as OnePageBlock,
  make("storelib_shelf", "shelf", { source: "digital", layout: "carousel", carousel_view: "1.5", title: "More from the shop", product_settings: { style: "tile", style_chosen: true, tap_action: "page" }, items: [
    { id: uuid(11), kind: "digital", title: "Darkroom notes", href: "/p/a", image: P[0], price_cents: 1500 },
    { id: uuid(12), kind: "digital", title: "Lightroom presets", href: "/p/b", image: P[1], price_cents: 2500 },
    { id: uuid(13), kind: "digital", title: "Colour grading course", href: "/p/c", image: P[3], price_cents: 4900 },
  ] }),
  make("text", "x1", { content: "Photographs of the Atlantic coast, printed on cotton paper in small runs and shipped from Lisbon.", alignment: "center" }),
  make("email_capture", "e1", { title: "The monthly letter", description: "New prints first, and where they were made." }),
  make("contact_form", "cf1", { title: "Commissions" }),
  make("calendly", "bk1", { title: "Book a portrait session", description: "Forty minutes in the studio or outdoors.", calendly_url: "https://calendly.com/mara-studio/portrait" }),
  make("embed", "em1", { url: "https://www.loom.com/share/0123456789abcdef0123456789abcdef", title: "Behind the prints", open_mode: "sheet" }),
  make("form_quiz", "fq1", { form_id: "", title: "Which print suits your room?", inline: false }),
  make("divider", "d1", {}),
  make("faq", "f1", { title: "Questions", items: [{ question: "Do you ship worldwide?", answer: "Yes, tracked, from Lisbon." }, { question: "Can I return a print?", answer: "Within 30 days, unframed." }] }),
  make("testimonials", "tm1", { title: "Kind words", items: [{ id: "q1", quote: "The print arrived flat, wrapped in tissue, and the blacks are deep.", name: "Ana", detail: "Porto", rating: 5 }, { id: "q2", quote: "Second order, same care.", name: "Tom", detail: "London", rating: 5 }] }),
  make("promo_code", "pc1", { code: "AUTUMN", title: "15% off prints this month" }),
  make("countdown", "c1", { title: "Next print drop", target_date: "2030-01-01T00:00:00.000Z" }),
]

const header = { id: "hdr", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } } as unknown as OnePageBlock
let onepage = {
  id: "op_probe", owner_id: "probe-user", seller_id: "seller_probe", slug: "mara", title: "Mara Lind",
  bio: "Photographer. Prints, presets and a monthly letter.",
  avatar_url: IMG("#6b5a4a", "#d8c3a5", 400, 400),
  theme: { ...defaultTheme } as never,
  settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true } as never,
  social_links: { instagram: "https://instagram.com/mara", tiktok: "https://tiktok.com/@mara", youtube: "https://youtube.com/@mara", email: "hello@example.com" },
  draft_blocks: [header, ...blocks],
  status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
} as unknown as OnePage

const template = THEME_TEMPLATES.find((t) => t.id === params.get("t"))
if (template) onepage = lookFromTemplate(onepage, template as never, (template as { profile_layout?: string }).profile_layout === "hero" ? "hero" : "classic", null)
;(globalThis as { __probeTheme?: unknown }).__probeTheme = onepage.theme
Object.assign(globalThis, { PROBE_USER: null })
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks: onepage.draft_blocks } as never} />)
