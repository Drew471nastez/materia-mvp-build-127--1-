/**
 * The editor's bottom sheet with the controls that were moving it.
 * See scripts/check-sheet-rest.mjs.
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { Slider } from "@/components/ui/slider"

/**
 * The state lives HERE, above the sheet, because that is where it lives in
 * the editor: a control changes a setting, the page re-renders, and the
 * sheet re-renders with it. A `useState` inside the panel would re-render
 * the panel alone and would never reach the thing being tested.
 */
function Harness() {
  const [n, setN] = useState(40)
  const [bumps, setBumps] = useState(0)

  return createElement(
    MobileEditorSheet,
    { open: true, onOpenChange: () => {}, detents: [0.5, 0.92] },
    createElement(
      "div",
      { className: "flex min-h-0 flex-1 flex-col overflow-y-auto p-4", "data-sheet-scroll": "" },

      createElement("button", {
        id: "rerender", type: "button", onClick: () => setBumps((b) => b + 1),
        className: "mb-3 h-9 w-full rounded-lg border border-border text-sm",
      }, `Re-render (${bumps})`),

      createElement("input", {
        id: "text-field", type: "text", placeholder: "Paste video URL...",
        className: "w-full h-9 px-3 text-sm border border-border rounded-lg bg-background",
      }),

      /* Wrapped exactly as SliderNumberControl wraps it in the editor. */
      createElement("div", { className: "mt-4 flex items-center gap-2.5" },
        createElement("div", { id: "slider-row", "data-sheet-no-drag": "", className: "flex-1 relative py-2 -my-2 touch-none select-none" },
          createElement(Slider, { value: [n], onValueChange: ([v]: number[]) => setN(v), min: 0, max: 100, step: 1 }),
        ),
      ),

      /* The panel that plays a move when you go into a section and back. */
      createElement("div", { id: "panel-in", className: "wb-sheet-panel mt-4 h-10", "data-dir": "in" }),
      createElement("div", { id: "panel-back", className: "wb-sheet-panel mt-1 h-10", "data-dir": "back" }),
      createElement("div", { id: "panel-none", className: "wb-sheet-panel mt-1 h-10", "data-dir": "none" }),

      createElement("div", { className: "h-[600px]" }),
    ),
  )
}

createRoot(document.getElementById("root")!).render(createElement(Harness))
