/**
 * The link picker inside the editor's real bottom sheet, at phone width.
 * See scripts/check-field-screen.mjs.
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
  { href: "/products/another", label: "Another one", kind: "product" },
]

function Panel() {
  const [value, setValue] = useState("/products")
  return createElement(
    "div",
    { id: "panel", className: "flex flex-col gap-3 p-4" },
    createElement("p", { className: "text-sm font-semibold" }, "Hero"),
    createElement("label", { className: "text-xs" }, "Button URL"),
    createElement(LinkPicker, { value, onChange: setValue, targets }),
  )
}

function App() {
  return createElement(MobileEditorSheet, { open: true, onOpenChange: () => {} }, createElement(Panel))
}

createRoot(document.getElementById("root")!).render(createElement(App))
