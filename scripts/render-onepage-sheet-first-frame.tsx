/**
 * The first frame harness (scripts/check-onepage-sheet-first-frame.mjs): the
 * blocks that open in the block sheet (Spotify from a link and from a block,
 * YouTube, a map, an X post, a contact form, an RSVP and the reviews list),
 * inside the real BlockSheetProvider, on a page whose theme sets its own
 * typeface the way a live page does (sheetRootCss --opk-font).
 *
 * The typeface is served by the probe as Google Fonts serves a static family:
 * one file per weight, each asked for only when something on the page first
 * draws in it. With ?plain the page itself uses only the regular weight, so a sheet whose
 * title (500) or button (600) asks for its weight on the first open would
 * draw it in a fallback first and swap it a moment later.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockSheetProvider, useBlockSheet } from "@/components/onepage/block-sheet"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { DataEventView } from "@/components/onepage/data-blocks"
import { musicSheetRequest } from "@/components/onepage/music-sheet"
import { warmEmbed } from "@/lib/onepage/embed-warm"
import { sheetRootCss } from "@/lib/onepage/sheet-theme"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"

const block = (id: string, type: OnePageBlock["type"], data: Record<string, unknown>): OnePageBlock => ({ id, type, enabled: true, sort_order: 0, data: data as never })
const FACE = "Probe Face"
const theme = { ...defaultTheme, font_family: `'${FACE}', sans-serif`, button_style: "filled" as const, background_color: "#f4f1ea", text_color: "#1d1b16", button_color: "#1d1b16", button_text_color: "#ffffff", button_border_radius: 14 }

/* One file per weight, as Google Fonts serves a static family: 400 the page's, 500 to 700 only a sheet's. */
const faces = `
@font-face { font-family: "${FACE}"; font-weight: 400; font-display: swap; src: url(/__face/regular.woff2) format("woff2"); }
@font-face { font-family: "${FACE}"; font-weight: 500; font-display: swap; src: url(/__face/medium.woff2) format("woff2"); }
@font-face { font-family: "${FACE}"; font-weight: 600; font-display: swap; src: url(/__face/semibold.woff2) format("woff2"); }
@font-face { font-family: "${FACE}"; font-weight: 700; font-display: swap; src: url(/__face/bold.woff2) format("woff2"); }
body { margin: 0; background: ${theme.background_color}; font-family: "${FACE}", sans-serif; font-weight: 400; }
${sheetRootCss(theme as never)}
`
const style = document.createElement("style")
style.textContent = faces
document.head.appendChild(style)

function SpotifyLink() {
  const sheet = useBlockSheet()
  const url = "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"
  const request = () => ({ blockId: "spl", ...musicSheetRequest({ service: "spotify", url, title: "Spotify link" }) })
  return (
    <button type="button" data-probe-open="spotify-link" {...warmEmbed(url, () => sheet.prewarm(request()))} style={{ display: "block", width: "100%", padding: 16, borderRadius: 14, background: theme.button_color, color: "#fff", font: "inherit", border: 0 }} onClick={() => sheet.open(request())}>
      Spotify link
    </button>
  )
}

const EXTRA: Array<[string, OnePageBlock]> = [
  ["spotify", block("sp", "music", { url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", title: "", open_mode: "sheet", layout: "button" })],
  ["youtube", block("yt", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "", open_mode: "sheet", layout: "button" })],
  ["map", block("mp", "map", { address: "Rua Augusta 1, Lisbon", title: "", open_mode: "sheet" })],
  ["x", block("xx", "embed", { url: "https://x.com/someone/status/1790000000000000000", title: "", open_mode: "sheet" })],
  ["form", block("cf", "contact_form", { title: "Write to me", description: "Questions about prints and commissions", open_mode: "sheet" })],
]

/* ?plain: a page drawn in its regular weight only, so the sheet's first open is the first thing to ask for its 500 and 600. */
const plain = new URLSearchParams(location.search).has("plain")

function Page() {
  const look = { theme, scale: "live" as const, onepageId: null, sellerId: null }
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 560, margin: "20px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <SpotifyLink />
      {plain ? null : EXTRA.map(([name, b]) => (
        <div key={name} data-probe={name}>
          <ExtraBlock block={b} look={look} />
        </div>
      ))}
      {plain ? null : (
        <div data-probe="rsvp">
          <DataEventView block={block("ev", "app", {})} data={{ title: "Studio open day", event_start: "2027-03-01T10:00:00.000Z", rsvp: true } as never} look={look} />
        </div>
      )}
      {Array.from({ length: 10 }, (_, i) => (
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
