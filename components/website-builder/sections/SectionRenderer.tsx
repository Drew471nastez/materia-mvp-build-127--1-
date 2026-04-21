"use client"

// ============================================================
// Storelib Theme Engine — Section Renderer (dispatcher)
//
// Stage 2 of the Shopify-style theme refactor: this file used
// to contain every section's component inline. After the
// refactor each section lives in its own file under
// ./renderers/*, the lookup table lives in ./registry.ts, and
// this dispatcher is just the tiny entry point the rest of
// the app imports.
//
// Responsibilities:
//   • `renderSection(props)` — the named export used by the
//     editor + any page that wants to render one section
//     directly. Looks up the component by `section.type` and
//     renders it. Returns `null` for hidden sections, an error
//     card for unknown types.
//   • `default export` — a memoized version so editor renders
//     don't re-run every section on unrelated state changes.
// ============================================================

import { memo } from "react"
import type { SectionProps } from "./_shared"
import { SECTION_COMPONENTS } from "./registry"

// ── Public API ────────────────────────────────────────────────
export function renderSection(props: SectionProps) {
  if (props.section.hidden) return null
  const Component = SECTION_COMPONENTS[props.section.type]
  if (!Component) {
    return (
      <div className="p-4 bg-red-50 text-red-500 text-sm text-center border border-red-200">
        Unknown section type: <code>{props.section.type}</code>
      </div>
    )
  }
  return <Component {...props} />
}

function SectionRendererInner(props: SectionProps) {
  return renderSection(props) ?? null
}

// Memoize on prop equality. In the editor, hover/selection changes elsewhere
// would re-render every section; memo short-circuits that when nothing in
// THIS section's props changed. We deliberately ignore the identity of
// `onClick` / `onEditorNavigate`: they're typically fresh closures on every
// render but their behaviour is stable for this section (they close over
// setState setters + memoized helpers on the editor side). Comparing them
// would defeat the memo in the exact workloads it's meant to help.
export default memo(SectionRendererInner, (prev, next) => {
  return (
    prev.section === next.section &&
    prev.theme === next.theme &&
    prev.isEditing === next.isEditing &&
    prev.isSelected === next.isSelected &&
    prev.deviceMode === next.deviceMode &&
    prev.insideEditor === next.insideEditor &&
    (prev as any).wrapperId === (next as any).wrapperId &&
    (prev as any).canvasRoundedTopPx === (next as any).canvasRoundedTopPx &&
    (prev as any).canvasRoundedBottomPx === (next as any).canvasRoundedBottomPx
  )
})
