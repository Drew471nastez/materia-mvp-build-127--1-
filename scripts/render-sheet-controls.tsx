/**
 * The editor's own controls inside its bottom sheet, at phone width.
 * See scripts/check-sheet-controls.mjs.
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"
import { Slider } from "@/components/ui/slider"

function Panel() {
  const [n, setN] = useState(40)
  return createElement(
    "div",
    { className: "flex min-h-0 flex-1 flex-col overflow-y-auto p-4", "data-sheet-scroll": "" },

    createElement("label", { className: "mb-1 block text-[11px] font-semibold uppercase" }, "Background video"),
    createElement("input", {
      id: "text-field", type: "text", placeholder: "Paste video URL...",
      className: "w-full h-9 px-3 text-sm border border-border rounded-lg bg-background",
    }),

    createElement("label", { className: "mb-1 mt-4 block text-[11px] font-semibold uppercase" }, "Overlay opacity"),
    createElement("div", { className: "flex items-center gap-2.5" },
      createElement("div", { className: "flex-1 relative py-2 -my-2 touch-none select-none" },
        createElement(Slider, { value: [n], onValueChange: ([v]: number[]) => setN(v), min: 0, max: 100, step: 1 }),
      ),
      createElement("input", {
        id: "number-field", type: "text", inputMode: "numeric", value: String(n), onChange: () => {},
        className: "h-8 w-[58px] px-2 text-xs text-center border border-neutral-200 rounded-md",
      }),
    ),

    createElement("label", { className: "mb-1 mt-4 block text-[11px] font-semibold uppercase" }, "Background image"),
    createElement("div", {
      id: "dropzone",
      className: "wb-dropzone relative w-full rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-1.5 py-5 aspect-video",
    },
      createElement("span", { className: "h-5 w-5" }),
      createElement("p", { className: "text-[13px] font-medium" }, "Add Image"),
      createElement("p", { className: "text-[10px]" }, "Click to upload or drag & drop"),
    ),
    createElement("div", { className: "h-40" }),
  )
}

createRoot(document.getElementById("root")!).render(
  createElement(MobileEditorSheet, { open: true, onOpenChange: () => {} }, createElement(Panel)),
)
