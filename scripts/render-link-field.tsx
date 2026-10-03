/**
 * The link field, in a sidebar-width scroller with settings above and below
 * it at a desktop, and inside the editor's real bottom sheet at a phone. See
 * scripts/check-link-field.mjs.
 *
 *   ?value=      what the field starts holding
 *   ?at=bottom   the field near the foot of the sidebar, so its list opens upward
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { LinkPicker, type LinkTarget } from "@/components/website-builder/link-picker"
import { MobileEditorSheet } from "@/components/website-builder/mobile-editor-sheet"

/** A product's picture: a flat colour, so a thumbnail is something the probe can see and measure. */
const swatch = (c: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="${c}"/></svg>`)}`
const PRODUCTS = ["A bottle", "Geanta Guess reptila", "Linen shirt", "Field notebook", "Wool scarf", "Canvas tote", "Brass pen", "Desk lamp", "Clay mug", "Rope basket", "Wax candle", "Oak tray"]
const COLOURS = ["#c2410c", "#0f766e", "#1d4ed8", "#a16207", "#7c3aed", "#be123c"]

const targets: LinkTarget[] = [
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/search", label: "Search", kind: "page" },
  { href: "/account", label: "Account", kind: "page" },
  { href: "/account/login", label: "Sign in", kind: "page" },
  { href: "/wishlist", label: "Wishlist", kind: "page" },
  { href: "/lookbook", label: "Lookbook", kind: "page" },
  { href: "/privacy-policy", label: "Privacy Policy", kind: "page" },
  { href: "/refund-policy", label: "Refund Policy", kind: "page" },
  { href: "/terms-of-service", label: "Terms Of Service", kind: "page" },
  ...PRODUCTS.map((label, i) => ({
    href: i === 1 ? "/products/geanta-guess-reptila-2g7yyk" : `/products/${label.toLowerCase().replace(/\s+/g, "-")}`,
    label,
    kind: "product" as const,
    /* One without a picture, which falls back to the product mark. */
    image: i === 2 ? undefined : swatch(COLOURS[i % COLOURS.length]),
  })),
]

declare global {
  interface Window {
    __value: string
    __changes: number
  }
}
const params = new URLSearchParams(location.search)
const start = params.get("value") ?? ""
const atBottom = params.get("at") === "bottom"
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

const filler = (label: string) =>
  createElement(
    "div",
    { key: label, className: "mb-6" },
    createElement("p", { className: "mb-1 text-xs" }, label),
    createElement("div", { className: "h-9 rounded-lg border border-border" }),
  )

function Panel() {
  return createElement(
    "div",
    { id: "panel", className: "flex min-h-0 flex-1 flex-col overflow-y-auto", "data-sheet-scroll": "" },
    createElement(
      "div",
      { className: "p-4" },
      ...["Heading", "Subheading", "Background video", "Overlay opacity", "Style"].map(filler),
      createElement("p", { className: "mb-1 text-xs" }, "Button link"),
      createElement(Field),
      createElement("div", { className: "h-24" }),
    ),
  )
}

const ABOVE = ["Heading", "Subheading", "Background video", "Overlay opacity", "Style", "Text size", "Alignment", "Colour scheme", "Top padding", "Bottom padding", "Width", "Image"]
const BELOW = ["Button label", "Open in a new tab", "Second button", "Second link", "Animation", "Corner radius", "Shadow", "Border"]

const phone = window.innerWidth < 640
createRoot(document.getElementById("root")!).render(
  phone
    ? createElement(MobileEditorSheet, { open: true, onOpenChange: () => {}, children: createElement(Panel) })
    : createElement(
        "div",
        { id: "sidebar", "data-wb-sidebar-scroll": "", className: "h-screen w-[320px] overflow-y-auto border-r border-border bg-white p-4" },
        ...(atBottom ? ABOVE : ABOVE.slice(0, 2)).map(filler),
        createElement("p", { className: "mb-1.5 text-xs font-medium text-muted-foreground" }, "Button link"),
        createElement("div", { id: "field" }, createElement(Field)),
        createElement("div", { id: "after", className: "mt-6 h-9 rounded-lg border border-border" }),
        ...(atBottom ? BELOW.slice(0, 1) : BELOW).map(filler),
        createElement("div", { className: atBottom ? "h-2" : "h-[600px]" }),
      ),
)
