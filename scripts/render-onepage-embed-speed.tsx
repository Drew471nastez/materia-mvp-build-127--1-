/**
 * The embed speed harness (scripts/check-onepage-embed-speed.mjs): every
 * OnePage block that opens another service's player or page in the block
 * sheet, inside the real BlockSheetProvider, so the probe can time a tap to
 * the embed being on screen, the first time and on a reopen.
 *
 *   ?preview   drawn as the editor's preview frame draws it
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockSheetProvider, useBlockSheet } from "@/components/onepage/block-sheet"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { musicSheetRequest } from "@/components/onepage/music-sheet"
import { warmEmbed } from "@/lib/onepage/embed-warm"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
if (params.has("preview")) (window as Window & { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

const block = (id: string, type: OnePageBlock["type"], data: Record<string, unknown>): OnePageBlock => ({ id, type, enabled: true, sort_order: 0, data: data as never })
const theme = { ...defaultTheme, button_style: "filled" as const, background_color: "#f4f1ea", text_color: "#1d1b16", button_color: "#1d1b16", button_text_color: "#ffffff", button_border_radius: 14 }
document.body.style.background = theme.background_color

/* A Spotify link button, as the live page's link block opens it (public-onepage openSpotifyModal). */
function SpotifyLink() {
  const sheet = useBlockSheet()
  const url = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
  const request = () => ({ blockId: "spl", ...musicSheetRequest({ service: "spotify", url, title: "Spotify link" }) })
  return (
    <button
      type="button"
      data-probe-open="spotify-link"
      {...warmEmbed(url, () => sheet.prewarm(request()))}
      style={{ display: "block", width: "100%", padding: 16, borderRadius: 14, background: theme.button_color, color: "#fff", font: "600 15px Inter, sans-serif" }}
      onClick={() => sheet.open(request())}
    >
      Spotify link
    </button>
  )
}

const BLOCKS: Array<[string, OnePageBlock]> = [
  ["spotify", block("sp", "music", { url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", title: "", open_mode: "sheet", layout: "button" })],
  ["soundcloud", block("sc", "music", { url: "https://soundcloud.com/artist/track-name", title: "", open_mode: "sheet", layout: "button" })],
  ["apple", block("am", "music", { url: "https://music.apple.com/us/album/name/1440857781", title: "", open_mode: "sheet", layout: "card" })],
  ["youtube", block("yt", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "", open_mode: "sheet", layout: "button" })],
  ["tiktok", block("tt", "video", { url: "https://www.tiktok.com/@someone/video/7234567890123456789", title: "", open_mode: "sheet", layout: "button" })],
  ["map", block("mp", "map", { address: "Rua Augusta 1, Lisbon", title: "", open_mode: "sheet" })],
  ["x", block("xx", "embed", { url: "https://x.com/someone/status/1790000000000000000", title: "", open_mode: "sheet" })],
]

function Page() {
  const look = { theme, scale: "live" as const, onepageId: null, sellerId: null }
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 560, margin: "20px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <SpotifyLink />
      {BLOCKS.map(([name, b]) => (
        <div key={name} data-probe={name}>
          <ExtraBlock block={b} look={look} />
        </div>
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <p key={i} style={{ padding: 18, background: "#e8e3d8", borderRadius: 12 }}>Row {i + 1}</p>
      ))}
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  <BlockSheetProvider theme={theme}>
    <Page />
  </BlockSheetProvider>,
)
