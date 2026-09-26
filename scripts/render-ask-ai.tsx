/**
 * ASK STORELIB, MOUNTED THE WAY THE EDITOR MOUNTS IT, for scripts/check-ask-ai.mjs.
 *
 * `#desktop`: the editor's shape around the real ThemeChat in its dock
 * variant: a dark bar with the Ask AI toggle, a sidebar, and <main> holding a
 * canvas card and the dock, with the same props page.tsx passes (hidden from
 * aiOpen, openRequest from a counter). A stand-in for the selected section's
 * toolbar (`.wb-section-toolbar`) can be placed anywhere by the probe.
 *
 * `#phone`: MobileEditorSheet with the editor's AI sheet props and the real
 * ThemeChat in its sheet variant.
 *
 * The network is the probe's: see PRELUDE in check-ask-ai.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { ThemeChat } from "@/components/website-builder/theme-chat"
import { ASK_SOUNDS, PEAK_GAIN, scheduleSound, SOUND_LENGTH } from "@/lib/website-builder/ask-sounds"
import type { SectionInstance } from "@/lib/website-builder/types"

/* The sounds' own graph, for the probe to render in an OfflineAudioContext and measure. */
;(globalThis as unknown as Record<string, unknown>).__askSounds = { ASK_SOUNDS, PEAK_GAIN, scheduleSound, SOUND_LENGTH }

/*
  WHAT IS BEHIND THE PILL, for the glass measurements (?canvas=):
    photo    the default: text and coloured blocks, a page being edited
    dark     one flat dark colour, where a glow or any lightening shows as
             lifted pixels and a blur changes nothing
    stripes  fine black and white stripes, where a blur shows as lost
             contrast, so how much the band blurs can be read row by row
    blue     the site from the screenshot the softening was asked for: one
             saturated blue, white words over it, flat where the pill sits,
             so anything drawn round the pill shows against colour
*/
const CANVAS = new URLSearchParams(location.search).get("canvas") ?? "photo"

const SECTIONS: SectionInstance[] = [
  { id: "s1", type: "header", name: "Header", settings: {} },
  { id: "s2", type: "hero_centered", name: "Hero", settings: { heading: "Handmade ceramics for slow mornings and long dinners" } },
  { id: "s3", type: "faq_accordion", name: "FAQ", settings: {} },
  { id: "s9", type: "footer", name: "Footer", settings: {} },
]
const SETTINGS = { brand_name: "Nora Clay" }
const STORE = { productCount: 7 }

/* The editor's AI sheet props: page.tsx, `{isMobileView && aiMounted && (`. */
const AI_SHEET_DETENTS = [0.5, 1]

const noop = () => {}
const w = globalThis as unknown as Record<string, unknown>
/* The editor's side of a run's Undo and of Connect AI, counted so the probe can see them called. */
w.__runs = [] as string[]
w.__undone = [] as string[]
w.__connect = 0
const onRunStart = (runId?: string) => {
  ;(w.__runs as string[]).push(runId ?? "")
}
const onUndoRun = (runId: string) => {
  ;(w.__undone as string[]).push(runId)
  return true
}
const onConnectAi = () => {
  w.__connect = (w.__connect as number) + 1
}

function Desktop() {
  const [aiOpen, setAiOpen] = React.useState(true)
  const [ask, setAsk] = React.useState(0)
  const [selected, setSelected] = React.useState<string | undefined>("s2")
  /* How many times the editor stand-in has rendered: typing and streaming in the chat must not move it. */
  const renders = React.useRef(0)
  renders.current++
  w.__editorRenders = renders.current
  w.__setSelected = setSelected
  w.__ask = () => setAsk((n) => n + 1)
  const onClose = React.useCallback(() => setAiOpen(false), [])
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "#eef1f5" }}>
      <header style={{ height: 48, flexShrink: 0, background: "#171717", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "0 12px" }}>
        <button
          id="ask-ai-toggle"
          type="button"
          aria-label="Ask Storelib"
          aria-pressed={aiOpen}
          onClick={() => setAiOpen((open) => !open)}
          style={{ width: 32, height: 32, borderRadius: 8, background: aiOpen ? "#3a3a3a" : "#2a2a2a", border: 0 }}
        />
        <span style={{ width: 92, height: 32, borderRadius: 16, background: "#8B56FA" }} />
      </header>
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 6, padding: "6px 6px 0" }}>
        <aside style={{ width: 300, flexShrink: 0, background: "#fff", borderRadius: "20px 20px 0 0" }} />
        <main id="canvas-main" className="relative flex-1 min-w-0 overflow-hidden flex justify-center rounded-t-[20px] bg-[#eef1f5] items-stretch p-0">
          <div
            id="wb-preview-root"
            style={{
              width: "100%",
              height: "100%",
              overflowY: "auto",
              background:
                CANVAS === "dark"
                  ? "#1f2937"
                  : CANVAS === "stripes"
                    ? "repeating-linear-gradient(90deg, #111 0 2px, #fff 2px 4px)"
                    : CANVAS === "blue"
                      ? "#2563eb"
                      : "#fff",
            }}
          >
            {CANVAS === "blue" &&
              Array.from({ length: 8 }, (_, i) => (
                <section key={i} id={`wb-section-${i}`} style={{ height: 320, padding: 48, background: i % 2 ? "#2563eb" : "#1d4ed8" }}>
                  <h2 style={{ font: "700 44px Inter, system-ui", margin: 0, color: "#fff" }}>Everything blue</h2>
                  <p style={{ font: "17px Inter, system-ui", color: "rgba(255,255,255,0.86)", maxWidth: 560 }}>
                    A saturated page being edited, the kind the pill was floating over when the softening was asked for.
                  </p>
                </section>
              ))}
            {CANVAS === "photo" && Array.from({ length: 8 }, (_, i) => (
              <section key={i} id={`wb-section-${i}`} style={{ height: 320, padding: 48, borderBottom: "1px solid #eee", background: i % 2 ? "#fafafa" : "#fff" }}>
                <h2 style={{ font: "700 40px Inter, system-ui", margin: 0, color: "#1a1a2e" }}>Section {i + 1}</h2>
                <p style={{ font: "16px Inter, system-ui", color: "#6b7280", maxWidth: 560 }}>
                  A page being edited, with words and pictures behind the pill, so the frosted glass has something to blur.
                </p>
                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                  {["#f59e0b", "#10b981", "#3b82f6", "#ef4444"].map((c) => (
                    <span key={c} style={{ width: 120, height: 80, borderRadius: 12, background: c }} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div
            id="fake-toolbar"
            className="wb-section-toolbar absolute z-30"
            style={{ display: "none", width: 232, height: 40, borderRadius: 12, background: "#fff", border: "1px solid #e5e7eb" }}
          />
          <ThemeChat
            variant="dock"
            hidden={!aiOpen}
            suspended={false}
            openRequest={ask}
            installId="00000000-0000-4000-8000-000000000001"
            page="home"
            sections={SECTIONS}
            settings={SETTINGS}
            store={STORE}
            selectedSectionId={selected}
            onRunStart={onRunStart}
            onUndoRun={onUndoRun}
            onBusyChange={noop}
            onOp={noop}
            onClose={onClose}
            onConnectAi={onConnectAi}
          />
        </main>
      </div>
    </div>
  )
}

function Phone() {
  const [open, setOpen] = React.useState(true)
  ;(globalThis as unknown as { __setOpen: (v: boolean) => void }).__setOpen = setOpen
  return (
    <>
      <div
        id="bar"
        data-sheet-clear=""
        style={{ height: 48, background: "#171717", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box" }}
      />
      <div style={{ height: "calc(100vh - 48px)", background: "#f8f9fa" }} />
      <MobileEditorSheet open={open} onOpenChange={(next) => setOpen(next)} openFull layer="raised" peekHeight={0} detents={AI_SHEET_DETENTS} fadeOnMove moveMs={320} keyboard="composer">
        <ThemeChat
          variant="sheet"
          installId="00000000-0000-4000-8000-000000000001"
          page="home"
          sections={SECTIONS}
          settings={SETTINGS}
          store={STORE}
          selectedSectionId="s2"
          onRunStart={onRunStart}
          onUndoRun={onUndoRun}
          onBusyChange={noop}
          onOp={noop}
          onClose={() => setOpen(false)}
          onConnectAi={onConnectAi}
        />
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(location.hash === "#phone" ? <Phone /> : <Desktop />)
