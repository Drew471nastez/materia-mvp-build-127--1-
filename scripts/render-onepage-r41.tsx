/**
 * ROUND 41, for scripts/check-onepage-r41.mjs. The real components:
 *
 *   ?view=settings   three Links tab cards whose settings open and close in
 *                    components/onepage/reveal (the card, the title key, the
 *                    settings panel, as BlockItem draws them)
 *   ?view=blocks     the map, the contact form and a lead magnet
 *                    (components/onepage/extra-blocks ExtraBlock) on a Pill,
 *                    Large, Glow page, and the map inside a group (still)
 */
import React, { useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Reveal } from "@/components/onepage/reveal"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { defaultTheme, type OnePageBlock, type OnePageTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const view = params.get("view") || "settings"

function Card({ id, open, onToggle }: { id: string; open: boolean; onToggle: () => void }) {
  const titleRef = useRef<HTMLDivElement>(null)
  return (
    <div data-block-id={id} className="relative rounded-2xl border border-[#ececf1] bg-white">
      <div className="flex items-center gap-3 p-3">
        <div className="h-10 w-10 rounded-[11px] bg-[#f2f2f4]" />
        <div ref={titleRef} role="button" tabIndex={0} aria-expanded={open} data-block-open={id} onClick={onToggle} className="min-w-0 flex-1 cursor-pointer">
          <p className="text-sm font-medium">Link {id}</p>
          <p className="text-xs text-[#6b7280]">https://example.com/{id}</p>
        </div>
      </div>
      <Reveal open={open} returnFocus={titleRef} unmountWhenShut className="rounded-b-2xl">
        <div className="space-y-4 rounded-b-2xl border-t border-[#eef0f2] bg-[#fafafb] p-4" data-block-settings="">
          <input data-field="" defaultValue="My link" className="h-10 w-full rounded-lg border px-3" />
          <input defaultValue="https://example.com" className="h-10 w-full rounded-lg border px-3" />
          <div className="h-40 rounded-lg bg-white" />
        </div>
      </Reveal>
    </div>
  )
}

function Settings() {
  const [selected, setSelected] = useState<string | null>("a")
  return (
    <div style={{ maxWidth: 520, margin: "24px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      {["a", "b", "c"].map((id) => (
        <Card key={id} id={id} open={selected === id} onToggle={() => setSelected((s) => (s === id ? null : id))} />
      ))}
    </div>
  )
}

const theme = { ...defaultTheme, background_color: "#f4f1ea", button_border_radius: 999, button_size: "large", button_hover_animation: "glow", button_style: "filled", button_color: "#0e7c66", button_text_color: "#ffffff" } as OnePageTheme
const blk = (id: string, type: OnePageBlock["type"], data: Record<string, unknown>): OnePageBlock => ({ id, type, enabled: true, sort_order: 0, data: data as OnePageBlock["data"] })

function Blocks() {
  return (
    <div style={{ maxWidth: 520, margin: "24px auto", display: "flex", flexDirection: "column", gap: 16, background: theme.background_color, padding: 16 }}>
      <div data-probe="map"><ExtraBlock block={blk("m", "map", { address: "1 Main St", show_button: true })} look={{ theme, scale: "live" }} /></div>
      <div data-probe="contact"><ExtraBlock block={blk("c", "contact_form", { title: "Write to me", offer_signup: false })} look={{ theme, scale: "live" }} /></div>
      <div data-probe="magnet"><ExtraBlock block={blk("l", "lead_magnet", { kind: "waitlist", title: "Join the waitlist" })} look={{ theme, scale: "live" }} /></div>
      <div data-probe="still"><ExtraBlock block={blk("m2", "map", { address: "1 Main St", show_button: true })} look={{ theme, scale: "live", still: true }} /></div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(view === "blocks" ? <Blocks /> : <Settings />)
