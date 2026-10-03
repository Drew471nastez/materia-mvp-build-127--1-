/**
 * The link field with a page's sections in it, in a sidebar-width column.
 * See scripts/check-link-sections.mjs.
 *
 *   ?value=   what the field starts holding
 */
import { createElement, useState } from "react"
import { createRoot } from "react-dom/client"

import { LinkPicker, LinkTargetsProvider, type LinkTarget, type SectionLinkSource } from "@/components/website-builder/link-picker"
import { sectionLinkTargets } from "@/lib/website-builder/link-menu"
import type { SectionInstance } from "@/lib/website-builder/types"

/** The home page open in the builder, as the editor holds it. */
const HOME: SectionInstance[] = [
  { id: "header-1", type: "header", name: "Header", settings: {} },
  { id: "intro-a1", type: "rich_text", name: "Rich text", settings: { heading: "Words that sell" } },
  { id: "features-b2", type: "feature_grid", name: "Feature grid", settings: { heading: "Ghostwriting" } },
  { id: "pricing", type: "pricing", name: "Pricing", settings: { heading: "Plans" } },
  { id: "story-c3", type: "rich_text", name: "Rich text", settings: { heading: "<p>Our <em>story</em></p>" } },
  { id: "faq-x1", type: "faq", name: "FAQ", settings: {} },
  { id: "footer-1", type: "footer", name: "Footer", settings: {} },
]
const ABOUT: SectionInstance[] = [
  { id: "t1", type: "team_members", name: "Team", settings: { heading: "The team" } },
  { id: "t2", type: "timeline", name: "Timeline", settings: { heading: "Since 2019" } },
]

const targets: LinkTarget[] = [
  ...sectionLinkTargets(HOME, "/"),
  { href: "/", label: "Home", kind: "page" },
  { href: "/products", label: "Shop", kind: "page" },
  { href: "/about", label: "About", kind: "page" },
  { href: "/contact", label: "Contact", kind: "page" },
  { href: "/search", label: "Search", kind: "page" },
]

declare global {
  interface Window { __value: string; __loads: string[] }
}
window.__loads = []
const source: SectionLinkSource = {
  currentPath: "/",
  load: (path) => {
    window.__loads.push(path)
    /* A real read takes a moment; the list says so meanwhile. */
    return new Promise((r) => setTimeout(() => r(path === "/about" ? sectionLinkTargets(ABOUT, "/about", undefined, "About") : []), 250))
  },
}

const start = new URLSearchParams(location.search).get("value") ?? ""
window.__value = start

function Field() {
  const [value, setValue] = useState(start)
  return createElement(LinkPicker, {
    value,
    targets,
    onChange: (href: string) => {
      window.__value = href
      setValue(href)
    },
  })
}

createRoot(document.getElementById("root")!).render(
  createElement(LinkTargetsProvider, {
    targets,
    sections: source,
    children: createElement(
      "div",
      { id: "sidebar", "data-wb-sidebar-scroll": "", className: "h-screen w-[320px] overflow-y-auto border-r border-border bg-white p-4" },
      createElement("p", { className: "mb-1.5 text-xs font-medium text-muted-foreground" }, "Button link"),
      createElement("div", { id: "field" }, createElement(Field)),
      createElement("div", { className: "h-[600px]" }),
    ),
  }),
)
