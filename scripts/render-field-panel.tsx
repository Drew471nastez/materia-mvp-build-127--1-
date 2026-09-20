/**
 * The link picker inside the editor's real bottom sheet, at phone width.
 * See scripts/check-field-panel.mjs.
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { LinkPicker, type LinkTarget } from "@/components/website-builder/link-picker"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

const targets: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/privacy-policy", label: "Privacy Policy", kind: "page" },
  { href: "/products/a-bottle", label: "A bottle", kind: "product" },
]

/** A section's settings: enough rows above the field to push it down the sheet. */
function Panel() {
  const [value, setValue] = useState("")
  return createElement(
    "div",
    { id: "panel", className: "flex min-h-0 flex-1 flex-col overflow-y-auto", "data-sheet-scroll": "" },
    createElement("div", { className: "p-4" },
      ...["Heading", "Subheading", "Background video", "Overlay opacity", "Style"].map((label) =>
        createElement("div", { key: label, className: "mb-6" },
          createElement("p", { className: "mb-1 text-xs" }, label),
          createElement("div", { className: "h-9 rounded-lg border border-border" }),
        ),
      ),
      createElement("p", { className: "mb-1 text-xs" }, "Button link"),
      createElement(LinkPicker, { value, onChange: setValue, targets }),
      createElement("div", { className: "h-24" }),
    ),
  )
}

createRoot(document.getElementById("root")!).render(
  createElement(MobileEditorSheet, { open: true, onOpenChange: () => {} }, createElement(Panel)),
)
