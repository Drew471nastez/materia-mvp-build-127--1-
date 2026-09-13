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
