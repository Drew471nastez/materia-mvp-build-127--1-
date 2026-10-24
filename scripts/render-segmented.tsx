/**
 * Select settings drawn by ChoiceControl, for scripts/check-segmented.mjs:
 * two and three short options, four options, three long labels, and two
 * labels in a track that starts too narrow for them and is then widened.
 * Each value is on `window.__values`, so the check reads what was chosen.
 */
import { createRoot } from "react-dom/client"
import { createElement as h, useState } from "react"

import { ChoiceControl } from "@/components/website-builder/editor/controls/choice-control"

declare global {
  interface Window {
    __values: Record<string, string>
  }
}
window.__values = {}

const o = (...labels: string[]) => labels.map((label) => ({ label, value: label.toLowerCase().replace(/\s+/g, "-") }))
const CASES: { id: string; label: string; options: { label: string; value: string }[]; width?: number }[] = [
  { id: "direction", label: "Direction", options: o("Vertical", "Horizontal") },
  { id: "position", label: "Position", options: o("Top", "Center", "Bottom") },
  { id: "four", label: "Width", options: o("Narrow", "Medium", "Wide", "Full") },
  { id: "long", label: "When search is clicked", options: o("Open it in the header", "Open a search window", "Go to the search page") },
  { id: "narrow", label: "When pressed", options: o("Goes to its link", "Opens its sub-links"), width: 150 },
]

function Case({ c }: { c: (typeof CASES)[number] }) {
  const [value, setValue] = useState(c.options[0].value)
  return h(
    "div",
    { "data-case": c.id, style: { width: c.width ? `${c.width}px` : "100%", marginBottom: 16 } },
    h("p", { className: "text-[13px] font-medium mb-1.5" }, c.label),
    h(ChoiceControl, {
      value,
      label: c.label,
      options: c.options,
      onChange: (v: string) => {
        window.__values[c.id] = v
        setValue(v)
      },
    }),
  )
}

createRoot(document.getElementById("app")!).render(
  h("div", { id: "panel", className: "bg-white", style: { width: "min(100vw, 300px)", padding: 16, boxSizing: "border-box" } }, ...CASES.map((c) => h(Case, { key: c.id, c }))),
)
