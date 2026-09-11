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

import { memo, type ReactNode } from "react"
import { SectionErrorBoundary } from "./SectionErrorBoundary"
import type { SectionProps } from "./_shared"
import { SECTION_COMPONENTS } from "./registry"
import { StorelibSection } from "./StorelibSection"

/**
 * ============================================================
 *  WHY EVERY SECTION IS A CONTAINER
 * ============================================================
 * The editor does not render the preview in an iframe — it renders the real
 * section components inline, in the editor's own document, inside a card that
 * is 380px wide when you press the phone button.
 *
 * A Tailwind `md:` class is a VIEWPORT media query. It asks how wide the
 * BROWSER WINDOW is, and the browser window is 1440px whatever size the card
 * is. So every `md:grid-cols-3` stayed on: pressing the phone button gave you
 * a three-column grid crushed into 380px, which is not what a phone shows and
 * is not what anything shows. Two of the fifty sections had a `deviceMode`
 * prop and got this right by hand; the other forty-eight did not.
 *
 * `deviceMode` does not scale — it is fifty hand-edits and a fifty-first
 * every time somebody adds a section, and forty-eight of them were already
 * forgotten. So the sections ask about the WIDTH THEY ARE IN instead:
 * `@[768px]:grid-cols-3` is a container query, and this wrapper is the
 * container it measures.
 *
 * On a live storefront the container is the full page width, so a container
 * query at 768px and a media query at 768px are the same question and the
 * published site is unchanged. In the editor they are different questions,
 * and the container one is the one with the true answer.
 *
 * THE HEADER IS EXCLUDED, deliberately. It is the only section that positions
 * anything `fixed` — its mobile drawer and its sticky bar — and an ancestor
 * with containment can become the containing block for fixed descendants,
 * which would pin a site-wide header to a section instead of to the window.
 * It already implements `deviceMode` properly, so it loses nothing.
 */
const NO_CONTAINER = new Set(["header"])

// ── Public API ────────────────────────────────────────────────
export function renderSection(props: SectionProps) {
  if (props.section.hidden) return null
  /**
   * A TYPE THE REGISTRY DOES NOT KNOW IS NOT AN UNKNOWN SECTION.
   *
   * The registry is built at build time: the JSON-described sections, and
   * every `.storelib` the theme ships. A section somebody wrote themselves
   * lives in their own install, so it can never be in there — and it was
   * being drawn as "Unknown section type", which is a lie about a file that
   * exists and compiles.
   *
   * Anything the registry does not name goes to StorelibSection, which is
   * the component that renders from source. It finds the person's file in
   * the sources the editor loaded, and if there really is nothing to render
   * it says so with the file and the line rather than with a red box that
   * names no cause.
   */
  const Component = SECTION_COMPONENTS[props.section.type] ?? StorelibSection
  /**
   * The header takes `wrapperId` itself — the id has to land on its own
   * SectionWrapper root or `position: sticky` gets a containing block exactly
   * the header's height and never sticks.
   */
  /**
   * EVERY SECTION IS BEHIND A BOUNDARY. A render that throws with nothing to
   * catch it takes the whole React tree down: on a published page that is the
   * site replaced by nothing, and in the editor it is the canvas, the sidebar
   * and every unsaved change. Here, because this is the one place every
   * surface goes through, so no route can forget it.
   */
  const guard = (node: ReactNode) => (
    <SectionErrorBoundary
      sectionId={props.section.id}
      sectionType={props.section.type}
      sectionName={props.section.name}
      isEditing={props.isEditing || props.insideEditor}
    >
      {node}
    </SectionErrorBoundary>
  )

  if (NO_CONTAINER.has(props.section.type)) return guard(<Component {...props} />)
  /**
   * The id goes on the CONTAINER, not passed down: forty-nine of the fifty
   * renderers never destructured `wrapperId`, so an id handed to them
   * vanished. Putting it here means every section on a published page has a
   * stable anchor — `/#section-<id>` — which none of them had before.
   */
  return (
    <div className="@container" id={props.wrapperId}>
      {guard(<Component {...props} />)}
    </div>
  )
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
