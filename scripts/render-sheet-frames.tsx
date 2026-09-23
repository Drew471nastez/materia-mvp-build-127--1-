/**
 * The editor's own bottom sheet, with as much in it as a section's settings
 * panel really has, so a finger dragging it is dragging the weight it has to
 * drag in the product. Bundled and driven by scripts/check-sheet-frames.mjs.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

/*
  A settings panel's worth of controls. The point is the DOM cost: a sheet
  dragged with six rows in it proves nothing about a sheet dragged with a
  section's colour scheme, its typography, its padding sliders and its blocks.
*/
function Row({ i }: { i: number }) {
  return (
    <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
      <span className="text-sm font-medium">Setting {i}</span>
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={(i * 7) % 100}
        className="w-32 accent-[#1a1a2e]"
        aria-label={`Setting ${i}`}
      />
    </div>
  )
}

function Harness() {
  const [open, setOpen] = React.useState(true)
  ;(globalThis as unknown as { __setOpen: (v: boolean) => void }).__setOpen = setOpen
  return (
    <>
      <div style={{ height: 3000, background: "linear-gradient(#fff,#ddd)" }} />
      <MobileEditorSheet open={open} onOpenChange={setOpen}>
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0 min-h-[44px]">
          <span className="text-sm font-semibold truncate">Feature grid</span>
        </div>
        {/*
          data-sheet-scroll IS THE POINT, NOT DECORATION. The stylesheet hangs
          an ::after off this attribute whose HEIGHT is --wb-sheet-hidden, and
          that spacer is the only thing in the sheet that consumes the
          variable. Without the attribute the fixture had nothing reading it,
          so writing it every frame cost nothing here and cost a layout in the
          product — the probe measured a sheet that was not the sheet.
        */}
        <div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll">
          {Array.from({ length: 40 }, (_, i) => <Row key={i} i={i} />)}
        </div>
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
