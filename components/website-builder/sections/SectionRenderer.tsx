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

import { memo, useLayoutEffect, type ReactNode } from "react"
import { SectionErrorBoundary } from "./SectionErrorBoundary"
import { sectionTokenAttrs, type SectionProps } from "./_shared"
import { SECTION_COMPONENTS } from "./registry"
import { StorelibSection } from "./StorelibSection"
import { entranceSetting, ownAnchor, sectionAnchor, SECTION_ANIMATIONS } from "@/lib/website-builder/section-anchors"
import { useLiveSection } from "@/lib/website-builder/live-settings"
import { holdStill, STILL_SECTION_ATTR } from "@/lib/website-builder/edit-still"

/** A section's `animation` setting as the page reads it; "theme" and anything unknown are no attribute. */
function sectionAnimationAttr(v: unknown): string | undefined {
  return typeof v === "string" && v !== "theme" && (SECTION_ANIMATIONS as readonly string[]).includes(v) ? v : undefined
}

/** A section's own animation duration and delay (ms), as the attributes the reveal reads; nothing for a section that has neither. */
export function animationTimingAttrs(settings: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  const ms = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? String(Math.round(Math.min(hi, Math.max(lo, v)))) : null)
  const d = ms(settings?.animation_duration, 150, 1500)
  const w = ms(settings?.animation_delay, 0, 1000)
  if (d !== null) out["data-animation-duration"] = d
  if (w !== null) out["data-animation-delay"] = w
  return out
}

/** A section's Show on choice as the box's attribute: nothing for "both", which is every section until somebody picks. */
export function showOnAttr(v: unknown, inEditor: boolean): Record<string, string> {
  if (v !== "desktop" && v !== "mobile") return {}
  return inEditor ? { "data-show-on-editor": v } : { "data-show-on": v }
}

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
  /**
   * The container also carries the section's design tokens: its colour
   * scheme as `--scheme-*` custom properties, the scheme's gradient when it
   * has one, and the heading and body style the theme stylesheet keys off.
   * Every renderer reads the same values through `sectionColors()`, so a
   * section painting `c.bg` and a stylesheet reading `var(--scheme-background)`
   * agree, in the editor and on the published page alike.
   */
  /**
   * `data-section-box` IS WHAT THE SECTION GAP HANGS OFF.
   *
   * The gap rule was `[data-section]:not([data-chrome])+[data-section]`, and
   * `[data-section]` is the wrapper INSIDE this container — so two sections'
   * wrappers are cousins, never siblings, and the selector matched nothing.
   * Measured on a real page: four sections, zero adjacent pairs, so the
   * theme's Section gap setting did nothing at all.
   *
   * This container is the element that does have siblings, so the marker
   * goes here, and `data-chrome` with it for the header and the footer,
   * which a gap must never be added above or below.
   */
  const chrome = props.section.type === "header" || props.section.type === "footer"
  /* An Overlay group section floats over the page (a popup, a phone tab bar,
     back to top). A query container would hold its `position: fixed` inside
     this box, and a section gap or an entrance reveal has nothing to space or
     move, so it is boxed like the chrome and without the container. */
  const overlay = props.section.group === "overlay"
  const tokens = sectionTokenAttrs(props.section, props.theme)
  /* Above the sticky header (z-40), which a popup's dimmed page has to cover, and never a band of the scheme's gradient. */
  if (overlay) tokens.style = { ...tokens.style, position: "relative", zIndex: 70, background: undefined }
  return (
    <div
      className={overlay ? props.boxClassName || undefined : props.boxClassName ? `@container ${props.boxClassName}` : "@container"}
      id={props.wrapperId}
      data-section-box=""
      /**
       * The TYPE, not just "is this chrome". A rule that has to name the
       * footer and not the header cannot be written against `data-chrome`,
       * and the editor has exactly that rule: a link in a footer navigates,
       * a link in a header does not, because a thumb lands on the logo and
       * the nav while it is trying to select the header.
       */
      data-section-type={props.section.type}
      data-chrome={chrome || overlay ? "" : undefined}
      data-overlay={overlay ? "" : undefined}
      /**
       * WHERE A LINK TO THIS SECTION LANDS, the same in the canvas and on the
       * live page. The id differs between the two (`wb-section-…` in the
       * editor, `section-…` live) because the editor's own code finds
       * sections by its id; the anchor does not, so a link picked in the
       * builder (`#section-<id>`) and the scroll that follows it agree on
       * both. See lib/website-builder/section-anchors.ts.
       */
      data-section-key={props.section.id}
      data-anchor={sectionAnchor(props.section.id)}
      data-anchor-alias={ownAnchor(props.section) || undefined}
      /* The section's own entrance animation, when it chose one over the theme's. */
      data-animation={sectionAnimationAttr(entranceSetting(props.section))}
      /* Its own duration and delay, when its code declares them (round L, lib/ai-builder/manifest.ts animation timing): read by section-motion.ts installReveal. */
      {...animationTimingAttrs(props.section.settings)}
      /* Show on: desktop only or phones only (theme-css.ts themeStylesheet). Faint in the builder rather than gone, so it can still be picked. */
      {...showOnAttr(props.section.settings?.show_on, props.isEditing === true || props.insideEditor === true)}
      {...tokens}
    >
      {guard(<Component {...props} />)}
    </div>
  )
}

function SectionRendererInner(props: SectionProps) {
  /* A setting under a finger on a slider is drawn by this section alone, before the editor commits it (lib/website-builder/live-settings.ts). */
  const section = useLiveSection(props.section)
  /*
    And drawn at the value, not eased towards it: while what is drawn is ahead
    of the editor's copy, the section holds still (lib/website-builder/
    edit-still.ts). Let go of once the two agree, when nothing moves.
  */
  const editing = section !== props.section
  const boxId = (props as { wrapperId?: string }).wrapperId
  useLayoutEffect(() => {
    if (boxId) holdStill(document.getElementById(boxId), STILL_SECTION_ATTR, editing)
  }, [editing, boxId])
  return renderSection(section === props.section ? props : { ...props, section }) ?? null
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
    prev.boxClassName === next.boxClassName &&
    prev.pageIndex === next.pageIndex &&
    (prev as any).canvasRoundedTopPx === (next as any).canvasRoundedTopPx &&
    (prev as any).canvasRoundedBottomPx === (next as any).canvasRoundedBottomPx
  )
})
