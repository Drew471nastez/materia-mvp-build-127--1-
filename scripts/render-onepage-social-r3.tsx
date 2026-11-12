/**
 * Harness for scripts/check-onepage-social-r3.mjs: the social row, the blocks that show a service's mark, the share
 * sheet's Story button and the story picture itself.
 *
 *   /app?social=few|many&icons=<filled|outline|minimal>/<brand|mono>&t=<theme id>
 *                                  a OnePage with a social row of 5 or 16 platforms, the Instagram, TikTok and YouTube
 *                                  blocks, a link with Instagram's mark and the followers block
 *   &look=<original|solid|outline|glass>   Layout › Icon style on every one of those blocks
 *   /app?story=<dark|light|gradient>   draws the 1080 x 1920 story picture; window.__story is its data address
 *   /app?share                     the visitor's share sheet, open
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePageShareSheet, shareBandBackground } from "@/components/onepage/share-sheet"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { lookFromTemplate } from "@/lib/onepage/theme-apply"
import { withSkinOwn } from "@/lib/onepage/skin-own"
import { renderStoryImage, storyInk } from "@/lib/onepage/story-image"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
const AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c27a"/><stop offset="1" stop-color="#b8572f"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)"/><circle cx="200" cy="160" r="70" fill="#fff3e0"/><rect x="90" y="250" width="220" height="180" rx="110" fill="#fff3e0"/></svg>`)}`
const look = params.get("look")

const FEW = ["instagram", "twitter", "linkedin", "youtube", "tiktok"]
const MANY = ["instagram", "twitter", "linkedin", "youtube", "tiktok", "facebook", "threads", "whatsapp", "snapchat", "spotify", "discord", "github", "pinterest", "twitch", "telegram", "website"]

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  const block = { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
  return look ? ({ ...block, style: { presentation: { icon_look: look } } } as OnePageBlock) : block
}

function page(): OnePage {
  const platforms = (params.get("social") === "many" ? MANY : FEW).map((platform) => ({ platform, url: platform === "website" ? "https://satori.studio" : `https://${platform}.com/satori` }))
  const header = { id: "hdr", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } } as unknown as OnePageBlock
  const blocks: OnePageBlock[] = [
    { ...make("social_row", "s1", { platforms }), style: undefined } as OnePageBlock,
    make("app", "ig-card", { provider: "instagram", url: "https://instagram.com/satori.shop", title: "Satori on Instagram", layout: "card" }),
    make("app", "tt-classic", { provider: "tiktok", url: "https://tiktok.com/@satori", layout: "classic" }),
    make("app", "yt-card", { provider: "youtube", url: "https://youtube.com/@satori", title: "Studio films", layout: "card" }),
    make("link_button", "l2", { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" }),
    make("followers", "fo1", { networks: [{ network: "instagram", count: 12000 }, { network: "tiktok", count: 4000 }, { network: "youtube", count: 2100 }], style: "line" }),
  ]
  let onepage = {
    id: "op_probe",
    owner_id: "probe-user",
    seller_id: "seller_probe",
    slug: "satori",
    title: "Satori Studio",
    bio: "Prints, posters and a newsletter",
    avatar_url: AVATAR,
    theme: { ...defaultTheme, social_icon_tone: "brand" } as any,
    settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true } as any,
    social_links: {},
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
    onepage = lookFromTemplate(onepage, template as never, hero ? "hero" : "classic", null)
  }
  const icons = params.get("icons")
  if (icons) {
    const [style, tone] = icons.split("/")
    onepage = { ...onepage, theme: { ...onepage.theme, ...withSkinOwn(onepage.theme as never, { social_icon_style: style, social_icon_tone: tone || "brand" }) } as never }
  }
  return onepage
}

;(globalThis as any).__themeIds = THEME_TEMPLATES.map((t) => t.id)
const app = document.getElementById("app")!

const GROUNDS: Record<string, string> = {
  dark: "#14141a",
  light: "#f6f1e7",
  gradient: "linear-gradient(135deg, #ff7a59 0%, #c2185b 55%, #4a148c 100%)",
}

if (params.has("story")) {
  const ground = shareBandBackground({ backgroundType: params.get("story") === "gradient" ? "gradient" : "solid", backgroundColor: GROUNDS[params.get("story") || "dark"], backgroundGradient: GROUNDS.gradient })
  renderStoryImage({ name: "Satori Studio", handle: "@satori", address: "storelib.com/satori", avatarSrc: params.has("noavatar") ? null : AVATAR, ground, ink: storyInk(ground), fontFamily: null })
    .then((blob) => new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(blob) }))
    .then((url) => { (window as any).__story = url; const img = document.createElement("img"); img.src = url; img.style.cssText = "width:360px;display:block"; app.appendChild(img) })
    .catch((e) => { (window as any).__story = `error: ${String(e)}` })
} else if (params.has("share")) {
  const Share = () => {
    const [open, setOpen] = React.useState(true)
    return <OnePageShareSheet open={open} onClose={() => setOpen(false)} dark={false} pageUrl="https://storelib.com/satori" pageTitle="Satori Studio" avatarUrl={AVATAR} band={{ backgroundType: "solid", backgroundColor: "#14141a" }} />
  }
  createRoot(app).render(<Share />)
} else {
  const p = page()
  createRoot(app).render(<PublicOnePage onepage={{ ...p, blocks: p.draft_blocks } as any} />)
}
