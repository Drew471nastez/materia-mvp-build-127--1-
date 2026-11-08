/**
 * The block sheet's harness (scripts/check-onepage-block-sheet.mjs): a long
 * page inside the real BlockSheetProvider, with the real blocks that open it
 * (a video, a map, an Instagram post and a contact form set to "In a sheet",
 * one set to "Go to the link"), a Calendly-like button calling the API with a
 * full-height body, and an Instagram post drawn in place, alone and in a
 * narrow column, as a group's would be.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockSheetProvider, useBlockSheet } from "@/components/onepage/block-sheet"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { CompactInstagramPost } from "@/components/onepage/compact-post"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"

const block = (id: string, type: OnePageBlock["type"], data: Record<string, unknown>): OnePageBlock => ({ id, type, enabled: true, sort_order: 0, data: data as never })
const dark = new URLSearchParams(location.search).has("dark")
/* Round AN: a light and a dark page, each with its own button, which "View full post" is drawn as. */
const theme = dark
  ? { ...defaultTheme, button_style: "filled" as const, background_color: "#0e0e10", text_color: "#f4f4f5", button_color: "#f4f4f5", button_text_color: "#111113", button_border_radius: 999 }
  : { ...defaultTheme, button_style: "filled" as const, background_color: "#ffffff", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12 }
document.body.style.background = theme.background_color

function CalendlyLike() {
  const sheet = useBlockSheet()
  return (
    <button
      type="button"
      data-probe-calendly=""
      style={{ display: "block", width: "100%", padding: 16, borderRadius: 14, background: "#1a1a2e", color: "#fff" }}
      onClick={() =>
        sheet.open({
          blockId: "cal",
          title: "Calendly",
          body: <iframe title="Calendly" src="https://calendly.com/probe/30min" className="block h-full w-full rounded-[16px] border-0 bg-white" />,
          cta: { label: "Book A Call", href: "https://calendly.com/probe/30min" },
          shareUrl: "https://calendly.com/probe/30min",
          fill: true,
        })
      }
    >
      Calendly
    </button>
  )
}

function Page() {
  const look = { theme, scale: "live" as const, onepageId: null, sellerId: null }
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 560, margin: "20px auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <CalendlyLike />
      <div data-probe="video"><ExtraBlock block={block("v", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "", open_mode: "sheet" })} look={look} /></div>
      <div data-probe="map"><ExtraBlock block={block("m", "map", { address: "Lisbon", title: "", open_mode: "sheet" })} look={look} /></div>
      <div data-probe="post"><ExtraBlock block={block("e", "embed", { url: "https://www.instagram.com/p/ABC123/", title: "", open_mode: "sheet" })} look={look} /></div>
      <div data-probe="contact"><ExtraBlock block={block("c", "contact_form", { title: "Get in touch", open_mode: "sheet" })} look={look} /></div>
      <div data-probe="direct"><ExtraBlock block={block("d", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Direct", open_mode: "direct" })} look={look} /></div>
      <div data-probe="inline-old"><ExtraBlock block={block("o", "video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Saved before" })} look={look} /></div>
      <section data-probe="inline-post"><CompactInstagramPost src="https://www.instagram.com/p/TALL01/embed/" /></section>
      <section data-probe="group-post" style={{ width: "62%" }}><CompactInstagramPost src="https://www.instagram.com/p/SHORT1/embed/" /></section>
      {/* A tall post in a group's narrower column, folded. */}
      <section data-probe="group-tall" style={{ width: "62%" }}><CompactInstagramPost src="https://www.instagram.com/p/TALL02/embed/" /></section>
      {Array.from({ length: 40 }, (_, i) => (
        <p key={i} style={{ padding: 18, background: dark ? "#1c1c20" : "#eceef1", color: theme.text_color, borderRadius: 12 }}>Row {i + 1}</p>
      ))}
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  <BlockSheetProvider dark={dark} theme={theme}>
    <Page />
  </BlockSheetProvider>,
)
