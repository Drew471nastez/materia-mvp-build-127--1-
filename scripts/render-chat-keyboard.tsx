/**
 * Ask Storelib on a phone, as the editor builds it: MobileEditorSheet with
 * the editor's AI sheet props and the real ThemeChat inside it, over a dark
 * bar standing in for the editor's top bar (violet button included, which is
 * what showed as slivers above the sheet). scripts/check-chat-keyboard.mjs
 * reads the editor's AI sheet props out of page.tsx and refuses to run if
 * this fixture has drifted from them.
 *
 * The conversation is served by a stubbed fetch (see the probe), with the
 * content that breaks a thread sideways: a 200 character URL, a word longer
 * than the line, a wide line of code, a long section name in the chip.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { ThemeChat } from "@/components/website-builder/theme-chat"
import type { SectionInstance } from "@/lib/website-builder/types"

const SECTIONS: SectionInstance[] = [
  { id: "s1", type: "header", name: "LD 01 Header with a name long enough to need cutting short", settings: {} },
  { id: "s2", type: "hero", name: "Hero", settings: {} },
]

/* The editor's AI sheet props: page.tsx, `{isMobileView && aiMounted && (`. */
const AI_SHEET_DETENTS = [0.5, 1]

/* The desktop shape, `#desktop`: the 340px column page.tsx docks beside the canvas. */
function Desktop() {
  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8f9fa" }}>
      <div style={{ flex: 1 }} />
      <div className="relative flex-shrink-0" style={{ width: 340 }}>
        <div className="h-full overflow-hidden bg-white rounded-t-[20px]">
          <ThemeChat
            installId="probe"
            page="index"
            sections={SECTIONS}
            settings={{}}
            selectedSectionId="s1"
            onRunStart={() => {}}
            onBusyChange={() => {}}
            onOp={() => {}}
            onClose={() => {}}
          />
        </div>
      </div>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = React.useState(true)
  ;(globalThis as unknown as { __setOpen: (v: boolean) => void }).__setOpen = setOpen
  return (
    <>
      <div
        id="bar"
        data-sheet-clear=""
        style={{
          height: "calc(48px + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: 12,
          paddingRight: 12,
          background: "#171717",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxSizing: "border-box",
        }}
      >
        <span style={{ width: 32, height: 32, borderRadius: 8, background: "#2a2a2a" }} />
        <span id="publish" style={{ width: 84, height: 32, borderRadius: 8, background: "#8b5cf6" }} />
      </div>
      {/* Taller than the screen by a strip, the way the body's safe-area
          padding makes a real page, so the document CAN be scrolled and the
          probe can see whether the sheet puts it back. */}
      <div style={{ height: "calc(100vh + 120px)", background: "#f8f9fa" }} />
      <MobileEditorSheet open={open} onOpenChange={(next) => setOpen(next)} openFull layer="raised" peekHeight={0} detents={AI_SHEET_DETENTS} fadeOnMove moveMs={320} keyboard="composer">
        <ThemeChat
          installId="probe"
          page="index"
          sections={SECTIONS}
          settings={{}}
          selectedSectionId="s1"
          onRunStart={() => {}}
          onBusyChange={() => {}}
          onOp={() => {}}
          onClose={() => setOpen(false)}
        />
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(location.hash === "#desktop" ? <Desktop /> : <Harness />)
