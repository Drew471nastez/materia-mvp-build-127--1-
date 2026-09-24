/**
 * The link field, alone in a sidebar-width column at a desktop, and inside
 * the editor's real bottom sheet at a phone. See scripts/check-link-field.mjs.
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
  { href: "/products/geanta-guess-reptila-2g7yyk", label: "Geanta Guess reptila", kind: "product" },
]

declare global {
  interface Window {
    __value: string
    __changes: number
  }
}
const start = new URLSearchParams(location.search).get("value") ?? ""
window.__value = start
window.__changes = 0

function Field() {
  const [value, setValue] = useState(start)
  return createElement(LinkPicker, {
    value,
    targets,
    onChange: (href: string) => {
      window.__value = href
      window.__changes++
      setValue(href)
    },
  })
}

function Panel() {
  return createElement(
    "div",
    { id: "panel", className: "flex min-h-0 flex-1 flex-col overflow-y-auto", "data-sheet-scroll": "" },
    createElement(
      "div",
      { className: "p-4" },
      ...["Heading", "Subheading", "Background video", "Overlay opacity", "Style"].map((label) =>
        createElement(
          "div",
          { key: label, className: "mb-6" },
          createElement("p", { className: "mb-1 text-xs" }, label),
          createElement("div", { className: "h-9 rounded-lg border border-border" }),
        ),
      ),
      createElement("p", { className: "mb-1 text-xs" }, "Button link"),
      createElement(Field),
      createElement("div", { className: "h-24" }),
    ),
  )
}

const phone = window.innerWidth < 640
createRoot(document.getElementById("root")!).render(
  phone
    ? createElement(MobileEditorSheet, { open: true, onOpenChange: () => {} }, createElement(Panel))
    : createElement(
        "div",
        { "data-wb-sidebar-scroll": "", className: "h-screen w-[320px] overflow-y-auto border-r border-border bg-white p-4" },
        createElement("p", { className: "mb-1.5 text-xs font-medium text-muted-foreground" }, "Button link"),
        createElement(Field),
        createElement("div", { className: "mt-6 h-9 rounded-lg border border-border" }),
      ),
)
