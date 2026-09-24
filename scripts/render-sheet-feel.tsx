/**
 * The editor's Sections sheet, as the editor builds it: the default stops
 * (half and full), the 72px peek, a row of tabs that does not scroll, and a
 * list under it in a scroller carrying the same two markers the editor's
 * does. scripts/check-sheet-feel.mjs reads those markers out of the editor's
 * source and refuses to run if this fixture has drifted from them.
 *
 * The page behind is a flat, loud colour so a strip of it showing under the
 * sheet is unmistakable in a one-pixel screenshot.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

function Row({ i }: { i: number }) {
  return (
    <div data-row={i} className="flex h-12 items-center justify-between border-b border-border px-4">
      <span className="text-sm font-medium">Section {i}</span>
      <span className="text-xs text-muted-foreground">Edit</span>
    </div>
  )
}

function Harness() {
  const [open, setOpen] = React.useState(true)
  ;(globalThis as unknown as { __setOpen: (v: boolean) => void }).__setOpen = setOpen
  return (
    <>
      <div style={{ height: "100vh", background: "#0b6e4f" }} />
      <MobileEditorSheet open={open} onOpenChange={setOpen}>
        <div id="tabs" className="shrink-0 bg-background px-3 pb-2 pt-1">
          <div className="flex h-9 items-center gap-2 text-sm font-semibold">Sections · Pages · Theme</div>
        </div>
        <div id="list" data-wb-sidebar-scroll data-sheet-scroll className="flex-1 min-h-0 overflow-y-auto wb-slim-scroll overflow-x-hidden bg-background">
          {Array.from({ length: 30 }, (_, i) => <Row key={i} i={i} />)}
        </div>
      </MobileEditorSheet>
    </>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
