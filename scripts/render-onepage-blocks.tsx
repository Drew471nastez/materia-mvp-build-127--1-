/**
 * The OnePage's newer blocks (components/onepage/extra-blocks), for
 * scripts/check-onepage-blocks.mjs: each block on a filled theme at the live
 * page's size and in the editor's small phone, the question a sensitive link
 * asks, and the schedule and sensitive settings as the editor shows them.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ExtraBlock, SensitiveLinkQuestion } from "@/components/onepage/extra-blocks"
import { BlockExtras } from "@/components/onepage/extra-blocks-editor"
import type { OnePageBlock, OnePageTheme } from "@/lib/onepage/types"

const theme = {
  template_id: "t",
  background_type: "solid",
  background_color: "#f4efe9",
  text_color: "#1a1a2e",
  button_style: "filled",
  button_color: "#1a1a2e",
  button_text_color: "#ffffff",
  button_border_radius: 14,
  button_border_width: 0,
  button_border_color: "#000000",
  font_family: "Inter",
  spacing: "normal",
} as unknown as OnePageTheme

const b = (type: string, data: unknown, extra: Partial<OnePageBlock> = {}) => ({ id: type, type, enabled: true, sort_order: 0, data, ...extra }) as OnePageBlock
const BLOCKS = [
  b("heading", { text: "Shop my picks", size: "large", alignment: "center" }),
  b("faq", { title: "Questions", items: [{ id: "a", question: "What do I get?", answer: "Forty drum loops and\na project file." }, { id: "b", question: "Can I use them commercially?", answer: "Yes." }] }),
  b("countdown", { title: "New pack in", target_at: new Date(Date.now() + 2 * 86_400_000 + 3_600_000).toISOString(), ended_text: "" }),
  b("countdown", { title: "", target_at: new Date(Date.now() - 1000).toISOString(), ended_text: "Out now" }),
  b("map", { title: "The studio", address: "Strada Lipscani 12, Bucharest", show_button: true }),
  b("video", { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Watch the trailer" }),
]

;(window as any).__clicks = 0

function Editor() {
  const [block, setBlock] = React.useState<OnePageBlock>(b("link_button", { label: "Late night", url: "https://example.com" }))
  return (
    <div data-probe="editor" className="w-[360px] rounded-2xl bg-white p-4">
      <BlockExtras
        block={block}
        updateBlock={(u) => setBlock((x) => ({ ...x, ...u }))}
        updateData={(u) => setBlock((x) => ({ ...x, data: { ...x.data, ...u } as OnePageBlock["data"] }))}
      />
      <pre data-probe="state">{JSON.stringify({ schedule: block.schedule ?? null, sensitive: (block.data as any).sensitive ?? false })}</pre>
    </div>
  )
}

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4">
      <SensitiveLinkQuestion />
      <div className="flex flex-wrap items-start gap-6">
        <div data-probe="live" className="flex w-[380px] flex-col gap-4 rounded-2xl p-4" style={{ background: theme.background_color }}>
          {BLOCKS.map((block, i) => (
            <div key={i} data-probe-block={block.type}>
              <ExtraBlock block={block} look={{ theme, scale: "live" }} />
            </div>
          ))}
          <div data-sensitive-label="Late night" data-probe="sensitive">
            <a
              href="#opened"
              onClick={() => ((window as any).__clicks += 1)}
              className="block rounded-[14px] bg-[#1a1a2e] px-4 py-3.5 text-center font-medium text-white"
            >
              Late night
            </a>
          </div>
        </div>
        <div data-probe="small" className="flex w-[260px] flex-col gap-3 rounded-2xl p-3" style={{ background: theme.background_color }}>
          {BLOCKS.slice(0, 3).map((block, i) => (
            <ExtraBlock key={i} block={block} look={{ theme, scale: "small", preview: true }} />
          ))}
        </div>
        <Editor />
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
