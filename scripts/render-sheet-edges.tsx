/**
 * Every sheet the website builder opens on a phone, over a stand-in for the
 * editor's bar, for scripts/check-sheet-edges.mjs. The hash picks the sheet:
 *
 *   #sections  the Sections / Pages / Settings sheet: default stops, the
 *              72px peek, a tab row, and a list holding what fights a sheet
 *              for a finger (a reorder grip that is `touch-none`, a range
 *              input, a sideways row of chips, a button, a text field)
 *   #add       Add section: one 92% stop, opens full, raised, no peek
 *   #ai        Ask Storelib: half and the whole screen below the status bar
 *   #publish   Publish: sized to its content under an 88% cap
 *
 * The props are the ones page.tsx and publish-panel.tsx pass; the probe
 * reads them out of those files and refuses to run if they have drifted.
 *
 * The bar is marked `data-sheet-clear` and sized the way `.wb-editor-topbar`
 * is (48px under the status bar), with violet buttons at both ends: a
 * violet pixel at a sheet's top corners is the "purple things in the
 * corners" the owner reported.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

/* page.tsx: `const AI_SHEET_DETENTS = [0.5, 1]` */
const AI_SHEET_DETENTS = [0.5, 1]
/* page.tsx, Add section: `detents={[0.92]}` */
const ADD_DETENTS = [0.92]
/* publish-panel.tsx: `detents={[0.88]}` */
const PUBLISH_DETENTS = [0.88]

const log: string[] = []
;(globalThis as unknown as { __log: string[] }).__log = log
/* Every touch the page hears, for the probe to say what a gesture was. */
for (const type of ["touchstart", "touchend", "touchcancel"]) {
  window.addEventListener(type, (e) => log.push(`${type}:${(e as TouchEvent).touches.length}`), { capture: true, passive: true })
}

function Bar() {
  return (
    <header
      id="bar"
      data-sheet-clear=""
      className="wb-editor-topbar relative z-50 flex shrink-0 items-center justify-between gap-2 px-3"
      style={{ background: "#171717", boxSizing: "border-box" }}
    >
      <span id="violet-left" style={{ width: 32, height: 32, borderRadius: 8, background: "#8b5cf6" }} />
      <span id="violet-right" style={{ width: 84, height: 32, borderRadius: 8, background: "#8b5cf6" }} />
    </header>
  )
}

function SectionsBody() {
  return (
    <>
      <div id="tabs" className="shrink-0 bg-background px-3 pb-2 pt-1">
        <div className="flex h-9 items-center gap-2 text-sm font-semibold">Sections · Pages · Theme</div>
      </div>
      <div id="list" data-wb-sidebar-scroll data-sheet-scroll className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden bg-background">
        {/* A reorder grip, as SidebarSectionRow draws it: touch-none, and a
            long press starts a reorder (recorded here). */}
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <span
            id="grip"
            className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md touch-none bg-muted"
            onPointerDown={(e) => {
              const id = e.pointerId
              const t = window.setTimeout(() => log.push("reorder"), 220)
              const up = (u: PointerEvent) => {
                if (u.pointerId !== id) return
                window.clearTimeout(t)
                window.removeEventListener("pointerup", up)
                window.removeEventListener("pointercancel", up)
              }
              window.addEventListener("pointerup", up)
              window.addEventListener("pointercancel", up)
            }}
          />
          <span className="text-sm">Section with a grip</span>
        </div>
        <div className="flex h-12 items-center border-b border-border px-4">
          <input id="range" type="range" min={0} max={100} defaultValue={50} className="w-full" />
        </div>
        <div id="chips" className="wb-chip-row shrink-0 overflow-x-auto px-4 py-2">
          <div className="flex w-max gap-2">
            {Array.from({ length: 14 }, (_, i) => (
              <span key={i} className="rounded-full border border-border px-3 py-1.5 text-sm">Category {i}</span>
            ))}
          </div>
        </div>
        <div className="flex h-12 items-center border-b border-border px-4">
          <button id="button" type="button" className="h-9 rounded-md border border-border px-3 text-sm" onClick={() => log.push("click")}>
            A button
          </button>
        </div>
        <div className="flex h-14 items-center border-b border-border px-4">
          <input id="field" type="text" placeholder="A field" className="h-11 w-full rounded-md border border-border px-3" />
        </div>
        {Array.from({ length: 26 }, (_, i) => (
          <div key={i} data-row={i} className="flex h-12 items-center border-b border-border px-4 text-sm">Section {i}</div>
        ))}
      </div>
    </>
  )
}

function Harness() {
  const kind = location.hash.replace("#", "") || "sections"
  const [open, setOpen] = React.useState(kind !== "sections")
  ;(globalThis as unknown as { __setOpen: (v: boolean) => void }).__setOpen = setOpen
  return (
    <>
      <div className="wb-editor fixed inset-0 flex flex-col" style={{ background: "#eef1f5" }}>
        <Bar />
        <div className="flex-1" />
      </div>
      {kind === "sections" && (
        <MobileEditorSheet open={open} onOpenChange={setOpen}>
          <SectionsBody />
        </MobileEditorSheet>
      )}
      {kind === "add" && (
        <MobileEditorSheet open={open} onOpenChange={setOpen} openFull detents={ADD_DETENTS} layer="raised" peekHeight={0}>
          <div className="flex min-h-0 flex-1 flex-col">
            <h2 className="shrink-0 px-5 pb-3 pt-0.5 text-[17px] font-semibold">Add section</h2>
            <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto">
              {Array.from({ length: 30 }, (_, i) => <div key={i} className="h-16 border-b border-border px-4">Section {i}</div>)}
            </div>
          </div>
        </MobileEditorSheet>
      )}
      {kind === "ai" && (
        <MobileEditorSheet open={open} onOpenChange={setOpen} openFull layer="raised" peekHeight={0} detents={AI_SHEET_DETENTS} fadeOnMove moveMs={320} keyboard="composer">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center px-4 text-sm font-semibold">Ask Storelib</div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3" />
            <div className="shrink-0 border-t border-border p-2.5">
              <textarea id="field" rows={2} className="w-full rounded-xl border border-border px-3 py-2" />
            </div>
          </div>
        </MobileEditorSheet>
      )}
      {kind === "publish" && (
        <MobileEditorSheet open={open} onOpenChange={setOpen} className="bg-[#1f1f1f]" fit detents={PUBLISH_DETENTS} layer="raised" peekHeight={0}>
          <div className="flex min-h-0 flex-col text-white">
            <div data-sheet-scroll className="min-h-0 overflow-y-auto px-5">
              <div data-sheet-content="">
                <p className="py-3 text-[17px] font-semibold">Publish</p>
                <p className="py-2 text-sm">Your site is live at example.storelib.com</p>
                <div className="h-40" />
              </div>
            </div>
            <div className="shrink-0 px-5 pb-3 pt-2"><div className="h-11 rounded-lg bg-white" /></div>
          </div>
        </MobileEditorSheet>
      )}
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
