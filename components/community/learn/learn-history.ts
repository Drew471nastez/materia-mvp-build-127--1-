/**
 * ===========================================================================
 *  BACK FROM A PROGRAM TO LEARN, THE WAY IT CAME (round 18)
 * ===========================================================================
 * A program opened from Learn's shelf is one step in the browser's history
 * (the community's navigator pushes it, lib/communities/client/
 * navigator-context.tsx). Its arrow used to push Learn again as a new step:
 * the shelf came back at its top with an arrival, and Back in the browser
 * (or the iPhone's swipe) then went to the lesson again. Now the arrow is
 * the browser's Back when the step before is that shelf: the shelf comes
 * back exactly as it was left, scrolled where it was, with nothing redrawn.
 * Opened any other way (a link in a post, a reload), the arrow goes to Learn
 * as before.
 *
 * The step is recognised by the program's address and the navigator's
 * depth on the history entry (DEPTH_KEY there), noted when a card on the
 * shelf is pressed. A lesson changed inside the program replaces the entry
 * and keeps its depth (course-player.tsx), so it still counts.
 */

/** The navigator's mark on each history entry it makes (lib/communities/client/navigator-context.tsx DEPTH_KEY). */
const DEPTH_KEY = "__communityDepth"

let opened: { path: string; depth: number } | null = null

function depthNow(): number {
  try {
    const d = (window.history.state as Record<string, unknown> | null)?.[DEPTH_KEY]
    return typeof d === "number" ? d : 0
  } catch {
    return 0
  }
}

/**
 * A card on Learn's shelf was pressed. Called from the card's own click, which runs after the community's frame has
 * already pushed the program's entry (its listener is on the document, in the capture phase), so the depth read here is
 * the program's.
 */
export function noteProgramOpened() {
  if (typeof window === "undefined") return
  opened = { path: window.location.pathname, depth: depthNow() }
}

/** True when the entry on screen is the program opened from the shelf, so the step before it is Learn. */
export function cameFromLearn(): boolean {
  if (typeof window === "undefined" || !opened || opened.path !== window.location.pathname) return false
  return opened.depth > 0 && depthNow() === opened.depth
}
