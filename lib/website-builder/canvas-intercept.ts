/**
 * ===========================================================================
 *  THE CANVAS NEVER TAKES THE BROWSER ANYWHERE
 * ===========================================================================
 * The preview in the builder is the site's own markup, rendered inline rather
 * than in a frame. That markup has links and forms in it, and a tap that
 * reaches one performs its ordinary default: the link is followed, the form
 * is submitted. Either takes the whole builder off the page. A submit is the
 * worse of the two because it reads as "it redirected me and I lost where I
 * was", and a form in a section written in the theme language has no working
 * submit handler in here at all, since section scripts do not run in the
 * editor.
 *
 * So the canvas blocks the default of anything that would leave. It blocks
 * the DEFAULT only: React's own handlers, and the editor's, still run, so
 * selecting a section, pressing an insert strip and switching pages through
 * `onEditorNavigate` are untouched.
 *
 * Pure, and given the shape of an element rather than an Element, so a test
 * can hand it a fake tree.
 */

export interface ClickTargetLike {
  tagName?: string
  getAttribute(name: string): string | null
  closest(selector: string): ClickTargetLike | null
}

/**
 * Whether this element's default action would navigate the page: a link with
 * somewhere to go, or a control that submits a form.
 */
export function leavesThePage(target: ClickTargetLike | null): boolean {
  if (!target) return false
  if (target.closest("a[href]")) return true

  const control = target.closest("button, input")
  if (!control) return false
  const tag = (control.tagName ?? "").toLowerCase()
  const type = (control.getAttribute("type") ?? "").toLowerCase()
  // A button with no type IS a submit button inside a form; an input has to
  // say so. Anything else is a control that does its own thing.
  if (tag === "input" && type !== "submit" && type !== "image") return false
  if (tag === "button" && type !== "" && type !== "submit") return false
  return control.closest("form") !== null
}

/**
 * ===========================================================================
 *  SOMETHING YOU TYPE IN
 * ===========================================================================
 * The canvas cancels a press while the inspector is on, so a control cannot
 * take focus: a focused button is scrolled into view by the browser, and on
 * a short page the only place it can scroll to is the top, which is the jump
 * reported as "click a section and it goes back to the top".
 *
 * A FIELD IS THE OPPOSITE CASE. Refusing it focus means the caret never
 * lands and nothing can be typed, which is the header's own search field
 * doing nothing inside the builder. So a real editing control keeps its
 * press and everything else still loses it.
 *
 * `closest` rather than a tag test on the target itself, because a press
 * often lands on something inside the control: the text node of an option,
 * or an element inside a contenteditable.
 */
export function isTypingTarget(target: ClickTargetLike | null): boolean {
  if (!target?.closest) return false
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])") !== null
}

/**
 * ===========================================================================
 *  A LINK THE CANVAS IS GOING TO FOLLOW ITSELF
 * ===========================================================================
 * The header's and the footer's links are the site's navigation, and the
 * canvas follows them: it cancels the click and changes the page being
 * edited. What it never touched was the PRESS before the click, and a press
 * on a link does one thing of its own before any of that — it focuses it.
 *
 * A browser scrolls a focused element into view, and a scroller is scrolled
 * by exactly enough to bring it fully in. A footer link is at the bottom of
 * the page by definition, which is where "exactly enough" is a few dozen
 * pixels. The page then changes and the scroll resets to the top, so what
 * somebody sees is a nudge and then a page change: reported as "it glitches,
 * the scroll moves up a little, and then it opens the page".
 *
 * The guard for this already existed and did not cover it: the canvas
 * cancels every press while the INSPECTOR is on, and following a link is
 * what somebody does with the inspector off. So the rule is named here
 * instead, it applies in both modes, and it is as narrow as it can be: a
 * press only loses its focus when the canvas is about to leave the page
 * anyway, which is the one case where focusing something is pointless.
 *
 * Pure and shaped like the rest of this file, so tests/canvas-scroll.test.ts
 * can hand it a fake tree.
 */
export function isCanvasNavigationLink(target: ClickTargetLike | null): boolean {
  const anchor = target?.closest?.("a[href]")
  if (!anchor) return false
  /* Header and footer only, which is the same subtree the click handler
     navigates for. A link in a hero is content being edited. */
  if (!anchor.closest("[data-chrome]")) return false
  const href = (anchor.getAttribute("href") ?? "").trim()
  // An address inside this site. An external link is not followed here at
  // all, so there is nothing for a press to be in the way of.
  return href.startsWith("/") && !href.startsWith("//")
}
