/**
 * A realistic OnePage for wave 11 (scripts/shot-onepage-w11.mjs): the live
 * page's own component with a real portrait, links, products, a picture
 * grid, forms and socials, in one theme of the catalogue.
 *
 *   ?theme=linen        a theme from the catalogue (components/onepage/tabs/design-tab THEME_TEMPLATES)
 *   &layout=grid        the theme's block layout overridden (list, grid, cards, compact, masonry)
 *   &header=hero        the header layout overridden (classic, hero)
 *   &name=chrome        a name style (lib/onepage/name-style)
 *   &font=Shrikhand     the name's font
 *   &verified=1         the verified badge beside the name
 *   &preview            drawn as the editor's preview draws it
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

const q = new URLSearchParams(location.search)
if (q.has("preview")) (window as unknown as { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

/* Real photographs (Unsplash License); the shot script serves them through the stubbed image optimizer. */
const U = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=80`
const AVATAR = U("1494790108377-be9c29b29330")
const PHOTOS = [U("1506126613408-eca07ce68773"), U("1517836357463-d25dfeac3438"), U("1544367567-0f2fcb009e0b"), U("1490645935967-10de6ba17061")]

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
}
const product = (id: string, title: string, cents: number, pic: string, style = "callout") =>
  make("product", id, { product_id: id, product_title: title, product_price_cents: cents, product_slug: id, product_thumbnail: pic, product_description: "A short line about what is inside.", cta_text: "Get it", style })

const blocks: OnePageBlock[] = [
  make("social_row", "so", { platforms: [{ platform: "instagram", url: "https://instagram.com/x" }, { platform: "tiktok", url: "https://tiktok.com/@x" }, { platform: "youtube", url: "https://youtube.com/@x" }, { platform: "spotify", url: "https://open.spotify.com/artist/x" }], style: "icons" }),
  make("link_button", "l1", { label: "Book a free intro call", url: "https://example.com/book", thumbnail_url: PHOTOS[0] }),
  make("link_button", "l2", { label: "8-week strength program", url: "https://example.com/program" }),
  make("link_button", "l3", { label: "Listen to the podcast", url: "https://example.com/pod" }),
  make("link_button", "l4", { label: "Free meal guide", url: "https://example.com/guide" }),
  make("heading", "hd1", { text: "Shop", size: "medium", alignment: "center" }),
  product("p1", "The Morning Routine Guide", 1900, PHOTOS[3]),
  product("p2", "1:1 Coaching, 4 weeks", 24900, PHOTOS[1]),
  make("image", "img", { display_style: "grid", images: PHOTOS.map((u, i) => ({ id: `i${i}`, image_url: u })), image_url: PHOTOS[0] }),
  make("text", "tx", { content: "Coach for busy people. Strength, food and sleep, without the noise.", alignment: "center" }),
  make("email_capture", "em", { headline: "Sunday notes", description: "One short email a week. No spam.", placeholder: "you@email.com", button_text: "Subscribe" }),
  make("faq", "fq", { title: "Questions", items: [{ id: "q1", question: "Do you coach online?", answer: "Yes, anywhere." }, { id: "q2", question: "Can I get a refund?", answer: "Within 14 days." }] }),
  make("testimonials", "ts", { title: "Kind words", items: [{ id: "t1", quote: "The first plan I actually kept.", name: "Ana", detail: "Client", rating: 5 }] }),
  make("contact_form", "cf", { title: "Get in touch", open_mode: "inline" }),
]

const named = q.get("theme") || "default"
const template = THEME_TEMPLATES.find((t) => t.id === named)
const layout = q.get("layout")
const header = q.get("header")
const wantsHero = header ? header === "hero" : (template as { profile_layout?: string } | undefined)?.profile_layout === "hero"
const theme = {
  ...defaultTheme,
  ...(template?.theme_config ?? {}),
  template_id: named,
  header_layout: wantsHero ? "hero" : "classic",
  ...(layout ? { block_layout: layout } : {}),
  ...(q.get("name") ? { name_style: q.get("name") } : {}),
  ...(q.get("font") ? { title_font: `'${q.get("font")}', sans-serif` } : {}),
}

const headerBlock = { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }
const onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "mayajane",
  title: "Maya Jane",
  bio: "Strength & nutrition coach in Brooklyn. Programs, guides and a weekly letter.",
  avatar_url: AVATAR,
  theme,
  settings: {
    ...defaultSettings,
    share_style: (template as { share_style?: string } | undefined)?.share_style,
    subscribe_style: (template as { subscribe_style?: string } | undefined)?.subscribe_style,
    ...(q.get("verified") ? { verified_badge_enabled: true, verified_badge_type: "verified_creator" } : {}),
  },
  social_links: { instagram: "https://instagram.com/x", tiktok: "https://tiktok.com/@x", youtube: "https://youtube.com/@x", spotify: "https://open.spotify.com/artist/x", email: "hi@example.com" },
  blocks: [headerBlock, ...blocks],
  draft_blocks: blocks,
  status: "published",
  seller_id: "seller_probe",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={onepage as never} />)
