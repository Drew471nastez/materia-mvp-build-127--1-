/**
 * Wallpaper patterns and name styles on a real OnePage, for
 * scripts/shot-onepage-patterns.mjs (round W10).
 *
 *   ?atlas                       every pattern as a square, on a light, a dark and a gradient wallpaper
 *   ?theme=aero&pattern=grain    the live page in a theme with a pattern laid on
 *   &bg=#123456 | gradient       the wallpaper overridden: a flat colour, or a gradient
 *   &name=outline                the name drawn in a style (lib/onepage/name-style)
 *   &level=hard                  the pattern's strength
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { WALLPAPER_PATTERNS } from "@/lib/onepage/wallpaper"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

const q = new URLSearchParams(location.search)
const root = createRoot(document.getElementById("app")!)

const AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d9c3ad"/><circle cx="100" cy="82" r="38" fill="#7a5a44"/><path d="M30 200 C 40 140 160 140 170 200Z" fill="#3d4f6b"/></svg>`)}`
let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...extra } as never }
}
const blocks: OnePageBlock[] = [
  make("social_row", "so", { platforms: [{ platform: "instagram", url: "https://instagram.com/x" }, { platform: "tiktok", url: "https://tiktok.com/@x" }, { platform: "youtube", url: "https://youtube.com/@x" }], style: "icons" }),
  make("link_button", "l1", { label: "Watch the latest video", url: "https://example.com/video" }),
  make("link_button", "l2", { label: "Book a session", url: "https://example.com/book" }),
  make("link_button", "l3", { label: "My podcast", url: "https://example.com/pod" }),
  make("link_button", "l4", { label: "Newsletter archive", url: "https://example.com/news" }),
  make("text", "tx", { content: "I make presets, zines and slow videos about cities.", alignment: "center" }),
  make("link_button", "l5", { label: "Shop the presets", url: "https://example.com/shop" }),
  make("link_button", "l6", { label: "Say hello", url: "https://example.com/hi" }),
]

function themeFor(id: string | null, over: Record<string, unknown> = {}) {
  const template = THEME_TEMPLATES.find((t) => t.id === id)
  const theme: Record<string, unknown> = { ...defaultTheme, ...(template?.theme_config ?? {}), template_id: id || "default" }
  const bg = q.get("bg")
  if (bg === "gradient") Object.assign(theme, { background_type: "gradient", background_gradient: "linear-gradient(160deg, #f7c59f 0%, #c4553b 100%)" })
  else if (bg) Object.assign(theme, { background_type: "solid", background_color: bg })
  if (q.get("pattern")) Object.assign(theme, { background_pattern: q.get("pattern"), pattern_color: q.get("ink") || null, pattern_opacity: q.get("level") || null })
  if (q.get("name")) theme.name_style = q.get("name")
  if (q.get("text")) Object.assign(theme, { text_color: q.get("text"), title_color: q.get("text") })
  return { theme: { ...theme, ...over }, template }
}

function page(id: string | null, over: Record<string, unknown> = {}, title = "Maya Jane") {
  const { theme, template } = themeFor(id, over)
  const header = { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }
  return {
    id: "op_probe",
    owner_id: "probe-user",
    slug: "mayajane",
    title,
    bio: "Lifestyle creator from New York. Presets, zines and slow videos.",
    avatar_url: AVATAR,
    theme,
    settings: { ...defaultSettings, share_style: (template as { share_style?: string } | undefined)?.share_style, subscribe_style: (template as { subscribe_style?: string } | undefined)?.subscribe_style },
    social_links: {},
    blocks: [header, ...blocks],
    draft_blocks: blocks,
    status: "published",
    seller_id: "seller_probe",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    onboarding_completed: true,
  }
}

function Atlas() {
  const grounds: [string, string][] = [["#f4efe9", "light"], ["#14161c", "dark"], ["linear-gradient(160deg, #f7c59f 0%, #c4553b 100%)", "gradient"], ["linear-gradient(180deg, #0c4a6e 0%, #0ea5e9 100%)", "gradient"]]
  return (
    <div style={{ padding: 16, fontFamily: "Inter, sans-serif", background: "#fff" }}>
      {grounds.map(([bg, kind]) => (
        <div key={bg} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
          {WALLPAPER_PATTERNS.filter((p) => p.id !== "none").map((p) => (
            <div key={p.id} style={{ width: 150 }}>
              <div style={{ position: "relative", height: 150, borderRadius: 14, overflow: "hidden", background: bg }}>
                <WallpaperPattern pattern={p.id} color={q.get("ink") || undefined} ground={{ background_type: kind === "light" || kind === "dark" ? "solid" : "gradient", background_color: bg, background_gradient: bg }} level={q.get("level") || "medium"} />
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{p.name}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

if (q.has("atlas")) root.render(<Atlas />)
else root.render(<PublicOnePage onepage={page(q.get("theme")) as never} />)
