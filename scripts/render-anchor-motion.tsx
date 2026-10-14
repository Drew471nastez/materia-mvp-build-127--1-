/**
 * ===========================================================================
 *  A REAL PAGE WITH A STICKY HEADER, FOR SCROLL AND REVEAL TO BE MEASURED
 * ===========================================================================
 * Served by scripts/check-anchor-scroll.mjs and scripts/check-section-reveal.mjs.
 * The real ThemePage draws the real header, five library sections and the
 * footer, so the runtime under test (lib/website-builder/section-motion.ts)
 * runs exactly as it does on a published site.
 *
 *   ?mode=canvas   the same page inside the builder's canvas frame, a
 *                  scrolling card, with the page marked as in the editor
 *   ?w=<px>&h=<px> the canvas frame's size
 *   window.__edit  an edit made the way the editor makes it
 */
import React, { useState } from "react"
import { createRoot } from "react-dom/client"

import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { scrollToHash, themeRootOf } from "@/lib/website-builder/section-motion"
import type { BlockInstance, SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

declare global {
  interface Window {
    __ready: boolean
    __scrollToHash: (hash: string) => boolean
    __edit: (kind: "type" | "add" | "select") => void
  }
}

function fromPreset(type: string, id: string, settings: Record<string, unknown> = {}, blocks?: BlockInstance[]): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema?.presets?.[0]
  return {
    id,
    type,
    name: schema?.name ?? type,
    settings: { ...(preset?.settings ?? {}), ...settings },
    blocks: blocks ?? ((preset?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } })) as BlockInstance[]),
  }
}

const nav = (id: string, label: string, url: string): BlockInstance => ({ id, type: "nav_link", settings: { label, url } })

const params = new URLSearchParams(window.location.search)
const canvas = params.get("mode") === "canvas"

/** Tall enough to need a real scroll between any two sections. */
const tall = { padding_top: 120, padding_bottom: 120 }

const sections: SectionInstance[] = [
  fromPreset("header", "header-1", { header_sticky_enabled: true }, [
    nav("n1", "Pricing", "/#pricing"),
    nav("n2", "Questions", "/#section-faq-x1"),
    nav("n3", "Contact", "#cta"),
  ]),
  fromPreset("rich_text", "intro-a1", { ...tall, heading: "Words that sell" }),
  fromPreset("feature_grid", "features-b2", { ...tall, heading: "Ghostwriting" }),
  /* Saved with the id "pricing" by an older build, as "/#pricing" links expect. */
  fromPreset("pricing", "pricing", { ...tall, heading: "Plans" }),
  fromPreset("rich_text", "story-c3", { ...tall, heading: "Our story" }),
  fromPreset("faq", "faq-x1", { ...tall, heading: "Questions", animation: "zoom" }),
  fromPreset("rich_text", "quiet-d4", { ...tall, heading: "Stays put", animation: "none" }),
  fromPreset("cta", "cta-z9", { ...tall, heading: "Get in touch" }),
  fromPreset("footer", "footer-1"),
]

const theme = {
  animations_enabled: true,
  animation_style: "fade-up",
  animation_duration: 600,
  animation_stagger: 80,
  background_color: "#ffffff",
} as unknown as ThemeSettingsValues

/*
  The builder's edits, as the editor makes them: a letter typed into the
  first section's heading (a new settings object, the same ids), a section
  added at the end of the page, a section selected (a new list, nothing in
  it changed). scripts/check-section-reveal.mjs makes them in the canvas.
*/
let typed = 0
function edited(list: SectionInstance[], kind: "type" | "add" | "select"): SectionInstance[] {
  if (kind === "select") return [...list]
  if (kind === "type") {
    typed++
    return list.map((s) => (s.id === "intro-a1" ? { ...s, settings: { ...s.settings, heading: `Words that sell${"!".repeat(typed)}` } } : s))
  }
  const at = list.findIndex((s) => s.type === "footer")
  return [...list.slice(0, at), fromPreset("rich_text", "added-e5", { ...tall, heading: "Just added" }), ...list.slice(at)]
}

function App() {
  const [list, setList] = useState(sections)
  window.__edit = (kind) => setList((prev) => edited(prev, kind))
  const page = <ThemePage theme={theme} sections={list} storefront={canvas ? { inEditor: true } : undefined} />
  if (!canvas) return page
  const w = Number(params.get("w") || 1000)
  const h = Number(params.get("h") || 700)
  return (
    <div style={{ padding: 40, background: "#eef1f5", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ width: w, height: h, position: "relative", overflow: "hidden", borderRadius: 16 }}>
        <div id="wb-preview-root" className="relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden w-full h-full">
          <div className="flex flex-col w-full flex-1">{page}</div>
        </div>
      </div>
    </div>
  )
}

/* The canvas's own path for a link to a section: the editor's "anchor" case. */
window.__scrollToHash = (hash: string) => {
  const scroller = document.getElementById("wb-preview-root")
  const root = themeRootOf(scroller ? scroller.querySelector("[data-storelib-theme]") : null)
  return !!root && scrollToHash(root, hash, scroller ? { scroller } : {})
}

createRoot(document.getElementById("app")!).render(<App />)
let frames = 0
const wait = () => {
  if (++frames > 3 && document.querySelector("[data-section-box]")) window.__ready = true
  else requestAnimationFrame(wait)
}
requestAnimationFrame(wait)
