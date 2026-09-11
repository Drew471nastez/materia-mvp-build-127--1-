/**
 * A page with three sections, the middle one throwing, rendered in a real
 * browser with react-dom/client so the error boundary actually engages —
 * server rendering does not run boundaries at all, which is exactly why this
 * has to happen here rather than in a unit test.
 *
 * Twice: once as the editor draws it, once as a visitor's browser does.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { SectionErrorBoundary } from "@/components/website-builder/sections/SectionErrorBoundary"

function Bomb(): never {
  throw new Error("settings.rows.map is not a function")
}
function Fine({ t }: { t: string }) {
  return createElement("p", { "data-fine": t }, t)
}

function page(isEditing: boolean) {
  return createElement(
    "div",
    null,
    createElement(SectionErrorBoundary, { sectionId: "a", sectionType: "hero", isEditing, children: createElement(Fine, { t: "before" }) }),
    createElement(SectionErrorBoundary, { sectionId: "b", sectionType: "faq_accordion", sectionName: "Accordion FAQ", isEditing, children: createElement(Bomb) }),
    createElement(SectionErrorBoundary, { sectionId: "c", sectionType: "footer", isEditing, children: createElement(Fine, { t: "after" }) }),
  )
}

const mount = (id: string, isEditing: boolean) => {
  const host = document.getElementById(id)!
  createRoot(host).render(page(isEditing))
}

;(window as unknown as { mountProbe: () => void }).mountProbe = () => {
  mount("editor", true)
  mount("visitor", false)
}
