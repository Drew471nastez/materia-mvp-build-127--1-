/**
 * The OnePage editor and the live page, mounted with a HEAVY page for
 * scripts/check-memory-r12.mjs: a photo wallpaper (or a video one), photos,
 * a YouTube video, embeds, a map and a music player. The network and
 * Supabase are stubs (scripts/onepage-probe-server.mjs); nothing in the
 * editor or the page is.
 *
 * window.__probeMount(false) takes the editor out of the page and
 * window.__probeMount(true) puts it back: what leaving for /app and coming
 * back does to the editor's own tree (the app shell stays).
 */
import React from "react"
import { createRoot, type Root } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const photo = (n: number) => `https://probe.supabase.co/storage/v1/object/public/onepage/photo-${n}.jpg`
const params = new URLSearchParams(location.search)
const wallpaper = params.get("wallpaper") || "image"

const theme = {
  ...defaultTheme,
  ...(wallpaper === "video"
    ? { background_type: "video", background_video_url: "/__media/wallpaper.webm", background_color: "#111113" }
    : wallpaper === "image"
      ? { background_type: "image", background_image_url: photo(0), background_color: "#111113", image_brightness: 90 }
      : {}),
  text_color: "#ffffff",
  button_style: "glass",
} as OnePage["theme"]

const block = (id: string, type: string, data: Record<string, unknown>, i: number) => ({ id, type, enabled: true, sort_order: i, data }) as unknown as OnePage["draft_blocks"][number]
const blocks = [
  block("h", "header", { show_avatar: true, show_name: true, show_bio: true }, -1),
  block("b1", "link_button", { label: "Shop the prints", url: "https://example.com/shop" }, 0),
  block("b2", "image", { image_url: photo(1), alt_text: "Print one" }, 1),
  block("b3", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Studio tour" }, 2),
  block("b4", "embed", { url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", title: "" }, 3),
  block("b5", "image", { image_url: photo(2), alt_text: "Print two" }, 4),
  block("b6", "map", { title: "Studio", address: "1 Main St, Lisbon", show_button: true }, 5),
  block("b7", "music", { url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", title: "" }, 6),
  block("b8", "embed", { url: "https://www.instagram.com/p/C1234567890/", title: "" }, 7),
  block("b9", "image", { image_url: photo(3), alt_text: "Print three" }, 8),
  block("b10", "text", { text: "Prints ship in a week. Every order comes signed." }, 9),
  block("b11", "link_button", { label: "Newsletter", url: "https://example.com/news" }, 10),
]

const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: photo(4),
  theme,
  settings: defaultSettings,
  social_links: { instagram: "https://instagram.com/satori", youtube: "https://youtube.com/@satori" },
  draft_blocks: blocks.filter((b) => b.type !== "header"),
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}

const host = document.getElementById("app")!
if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(host).render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  const live = { ...onepage, theme: { ...theme, template_id: "custom" }, blocks, seller_id: "seller_probe" }
  createRoot(host).render(<PublicOnePage onepage={live as never} />)
} else {
  let root: Root | null = null
  const mount = (on: boolean) => {
    if (on && !root) {
      root = createRoot(host)
      root.render(<OnePageEditor initialOnePage={onepage} />)
    } else if (!on && root) {
      root.unmount()
      root = null
    }
  }
  ;(window as unknown as { __probeMount: (on: boolean) => void }).__probeMount = mount
  mount(true)
}
