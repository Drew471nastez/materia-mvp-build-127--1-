"use client"

/**
 * The half of a tab change that starts before the tab changes.
 *
 * A tab arrival used to be the whole animation: the route committed, and the
 * new screen faded up from 0.72. That is one event pretending to be a
 * transition — nothing at all happens between the finger landing and the route
 * being ready, which on a cold route is most of the time you spend looking at
 * it, and then the new page appears at 72% and climbs. The tap and the
 * animation are separate moments, and the gap between them is exactly the part
 * that reads as a jump rather than a switch.
 *
 * So the bar marks the document the moment you touch a different tab, the
 * outgoing screen eases DOWN, and the arrival simply takes the mark off again —
 * the same screen keeps going, back UP to 1. One continuous move, started by
 * the finger and finished by the router, with no point in it where anything is
 * assigned a value it was not already heading towards.
 *
 * Transitions, not an animation, and this is why. An animation always plays
 * from its first keyframe: interrupt one mid-flight — tap Messages, then
 * Profile 200ms later — and the screen snaps back to 0.72 to start again, which
 * is a flash. A transition reverses from wherever it currently is, for free. It
 * also means a warm route (30ms) and a cold one (600ms) are the same code: the
 * first barely dips before it is rising again, the second dips fully and holds
 * until the page is there. The dip's depth ends up proportional to the wait,
 * which is what makes a slow tab feel like a slow tab rather than a broken one.
 *
 * The give-up timer is not decoration. `begin` is called on pointerdown, and a
 * pointerdown is not a promise that a navigation follows — the finger can slide
 * off, the route can fail, the click can be eaten by the WebView. Every one of
 * those would otherwise leave the whole app sitting at 86% opacity with nothing
 * left to take the mark off.
 */

const LEAVING = "tab-leaving"

/** Longer than any tab change worth animating; shorter than "the user notices". */
const GIVE_UP_MS = 1600

let release: number | undefined

export function beginTabLeave(): void {
  if (typeof document === "undefined") return
  document.documentElement.classList.add(LEAVING)
  window.clearTimeout(release)
  release = window.setTimeout(() => {
    document.documentElement.classList.remove(LEAVING)
  }, GIVE_UP_MS)
}

/** The navigation arrived, or it never will. Either way, come back up. */
export function endTabLeave(): void {
  if (typeof document === "undefined") return
  window.clearTimeout(release)
  release = undefined
  document.documentElement.classList.remove(LEAVING)
}

export function isTabLeaving(): boolean {
  if (typeof document === "undefined") return false
  return document.documentElement.classList.contains(LEAVING)
}
