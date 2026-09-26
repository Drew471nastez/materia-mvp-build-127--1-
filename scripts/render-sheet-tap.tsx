/**
 * The editor's Sections sheet over a canvas that counts the clicks it gets,
 * for scripts/check-sheet-tap-through.mjs. The sheet is the base sheet the
 * editor builds (default stops, the 72px peek) with a row of three tabs and a
 * list; the canvas under it is a full-screen button, standing in for a
 * section on the page, that records every click, mousedown and mouseup that
 * reaches it.
 *
 * `__moveOnLift` makes the page move the sheet out from under the finger the
 * moment it lifts, before the browser makes its click: the one thing every
 * report of a tap "going through" the sheet has in common, whatever moved it
 * (a tap that caught the sheet mid-slide and let it carry on, a release that
 * snapped it, a tab switch that laid it out again).
 */
import React from "react"
import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

type Probe = {
  canvas: string[]
  sheet: string[]
  moveOnLift: boolean
  /** Cancel the browser's own click for the tap, so the probe can make WebKit's instead. */
  eatNativeClick: boolean
  setOpen: (v: boolean) => void
}
const probe = globalThis as unknown as { __probe: Probe }
probe.__probe = { canvas: [], sheet: [], moveOnLift: false, eatNativeClick: false, setOpen: () => {} }

function Harness() {
  const [open, setOpen] = React.useState(true)
  probe.__probe.setOpen = (v) => flushSync(() => setOpen(v))
  React.useEffect(() => {
    /* Before the sheet's own window listener: the page acting on a lift. */
    const onLift = (e: TouchEvent) => {
      if (probe.__probe.eatNativeClick && e.cancelable) e.preventDefault()
      if (!probe.__probe.moveOnLift) return
      const sheet = document.querySelector<HTMLElement>("[data-mobile-bottom-sheet]")
      if (sheet) {
        sheet.style.transition = "none"
        sheet.style.transform = "translateY(2000px)"
      }
    }
    document.addEventListener("touchend", onLift, true)
    return () => document.removeEventListener("touchend", onLift, true)
  }, [])
  const note = (list: "canvas" | "sheet") => (e: React.MouseEvent) => probe.__probe[list].push(`${e.type}:${(e.target as HTMLElement).id || (e.target as HTMLElement).tagName}`)
  return (
    <>
      <button
        id="canvas"
        type="button"
        onClick={note("canvas")}
        onMouseDown={note("canvas")}
        onMouseUp={note("canvas")}
        style={{ position: "fixed", inset: 0, background: "#0b6e4f", border: 0 }}
      />
      <MobileEditorSheet open={open} onOpenChange={setOpen}>
        <div className="shrink-0 bg-background px-3 pb-2 pt-1">
          <div role="tablist" className="grid h-9 grid-cols-3 gap-1 text-sm font-medium">
            {["Sections", "Pages", "Theme"].map((t) => (
              <button key={t} id={`tab-${t}`} type="button" role="tab" onClick={note("sheet")}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto bg-background">
          {Array.from({ length: 20 }, (_, i) => (
            <button key={i} id={`row-${i}`} type="button" onClick={note("sheet")} className="block h-12 w-full border-b border-border px-4 text-left text-sm">
              Section {i}
            </button>
          ))}
        </div>
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
