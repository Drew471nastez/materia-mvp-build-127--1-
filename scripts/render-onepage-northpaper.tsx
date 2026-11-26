/**
 * The harness for scripts/check-onepage-northpaper.mjs (round 65): the real PublicOnePage wearing Northpaper
 * (components/onepage/themes/northpaper-theme), picked as Design › Themes picks it, blocks included
 * (lib/onepage/theme-blocks blocksAfterPick on a new page's blocks, then lib/onepage/theme-apply lookFromTemplate).
 *
 *   ?mode=default   a new page as ensure-onepage makes it (a name, no picture, no bio, no socials), Northpaper picked
 *   ?mode=creator   the same blocks on a creator who filled them in: a picture, a bio, socials, three templates on
 *                   the shelf, a free template attached to the signup
 *
 * Pictures are the Northpaper and Notion creator website templates' own files, served under /__files/.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { blocksAfterPick } from "@/lib/onepage/theme-blocks"
import { themeStarterBlocks } from "@/components/onepage/themes/northpaper-theme"
import { defaultSettings, defaultTheme, type OnePage, type OnePageBlock } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const creator = params.get("mode") === "creator"
const themeId = params.get("t") || "northpaper"

/* A new page's blocks (lib/onepage/ensure-onepage): the header, socials, two "My Link" rows, a line, the newsletter. */
const fresh = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "soc", type: "social_row", enabled: true, sort_order: 1, data: { platforms: [], style: "icons" } },
  { id: "l1", type: "link_button", enabled: true, sort_order: 2, data: { label: "My Link", url: "https://", icon: null, thumbnail_url: null } },
  { id: "l2", type: "link_button", enabled: true, sort_order: 3, data: { label: "My Link", url: "https://", icon: null, thumbnail_url: null } },
  { id: "dv", type: "divider", enabled: true, sort_order: 4, data: { style: "line", height: 24 } },
  { id: "em", type: "email_capture", enabled: true, sort_order: 5, data: { headline: "Join my newsletter", description: "Get updates and exclusive content", placeholder: "Enter your email", button_text: "Subscribe", success_message: "Thanks for subscribing!" } },
] as unknown as OnePageBlock[]

const template = THEME_TEMPLATES.find((t) => t.id === themeId)!
let blocks = blocksAfterPick(fresh, themeStarterBlocks(themeId)) ?? fresh

const uuid = (n: number) => `6f1b2c3d-4e5f-4a6b-8c7d-${String(n).padStart(12, "0")}`
if (creator) {
  blocks = blocks.map((b) => {
    const d = b.data as Record<string, unknown>
    if (b.type === "storelib_shelf") return { ...b, data: { ...d, items: [
      { id: uuid(1), kind: "digital", title: "Creator OS", href: "/p/creator-os", image: "/__files/notionpage-dashboard.webp", price_cents: 2900 },
      { id: uuid(2), kind: "digital", title: "Sponsor Kit", href: "/p/sponsor-kit", image: "/__files/notionpage-sponsors.webp", price_cents: 1900 },
      { id: uuid(3), kind: "digital", title: "The Creator Bundle", href: "/p/bundle", image: "/__files/notionpage-calendar.webp", price_cents: 3900 },
    ] } } as OnePageBlock
    if (b.type === "email_capture") return { ...b, data: { ...d, headline: "Twelve hook formulas", description: "Opening lines that work on YouTube, shorts and newsletters. Free, sent once.", enable_digital_product: true, digital_product_id: uuid(9), digital_product_title: "Hook formulas" } } as OnePageBlock
    if (b.type === "link_button" && d.icon === "notion") return { ...b, data: { ...d, url: "https://www.notion.com/@northpaper" } } as OnePageBlock
    if (b.type === "link_button" && d.icon === "youtube") return { ...b, data: { ...d, label: "How I plan a month of videos", url: "https://youtube.com/@northpaper" } } as OnePageBlock
    return b
  })
}

let onepage = {
  id: "op_probe", owner_id: "probe-user", seller_id: "seller_probe", slug: creator ? "northpaper" : "nora", title: creator ? "Nora Lind" : "Nora",
  bio: creator ? "Notion templates for the parts of work that need a system. Creator OS takes a video from the first idea to the published link." : "",
  avatar_url: creator ? "/__files/notionsite-avatar.webp" : null,
  theme: { ...defaultTheme } as never,
  settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true } as never,
  social_links: creator ? { instagram: "https://instagram.com/northpaper", tiktok: "https://tiktok.com/@northpaper", youtube: "https://youtube.com/@northpaper", email: "hello@example.com" } : {},
  draft_blocks: blocks,
  status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
} as unknown as OnePage

onepage = lookFromTemplate(onepage, template as never, "classic", null)
;(globalThis as { __probeTheme?: unknown }).__probeTheme = onepage.theme
;(globalThis as { __probeBlocks?: unknown }).__probeBlocks = onepage.draft_blocks.map((b) => b.type)
Object.assign(globalThis, { PROBE_USER: null })
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks: onepage.draft_blocks } as never} />)
