"use client"

/**
 * Route changes: immediate feedback, then a short entry animation.
 *
 * ---------------------------------------------------------------------------
 * What this deliberately does NOT do
 * ---------------------------------------------------------------------------
 * It does not try to keep the outgoing screen on screen. Next unmounts it the
 * moment it navigates, and the two ways of working around that both failed here:
 * the View Transitions API is silently absent on plenty of devices, and cloning
 * the live DOM into an overlay — which did work in principle — turned out to
 * have too many ways to desynchronise from the real page, each of which reads as
 * a flash or a stutter. A transition that is right nine times out of ten is
 * worse than a simpler one that is right every time, because the tenth is all
 * anyone remembers.
 *
 * So nothing moves except the arriving page, and the arriving page is opaque
 * from its first frame. There is exactly one thing on screen at any moment,
 * which is the property that makes this impossible to glitch.
 *
 * The one hazard left is what sits behind the document while the new page
 * settles. That is owned by `surface-bg`, where each screen claims the strip in
 * its own colour and handovers are counted so they never pass through nobody —
 * which is what a black reels feed flashing white on the way back actually was.
 *
 * ---------------------------------------------------------------------------
 * Feedback
 * ---------------------------------------------------------------------------
 * Opening a page has costs you cannot drive to zero. What you can do is answer
 * immediately, so the wait is never mistaken for a dropped tap: the card dims
 * under the finger (see SmartLink), a haptic fires, and if the page takes longer
 * than a couple of frames a progress bar appears at the top. It fades in rather
 * than snapping on, so a fast navigation never flashes a bar on and off.
 */

type Kind = "push" | "pop"

const BAR_ID = "nav-progress"

// ---------------------------------------------------------------------------
// Arrival handshake
// ---------------------------------------------------------------------------

let arrive: (() => void) | null = null

/** Called by a destination screen once it is genuinely rendered. */
export function signalArrival(): void {
  const fn = arrive
  arrive = null
  fn?.()
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function showBar(): () => void {
  let bar = document.getElementById(BAR_ID)
  if (!bar) {
    bar = document.createElement("div")
    bar.id = BAR_ID
    bar.setAttribute("aria-hidden", "true")
    bar.style.cssText =
      "position:fixed;top:0;left:0;height:2.5px;width:100%;z-index:2147483000;" +
      "transform-origin:0 50%;background:#7c3aed;pointer-events:none;opacity:0;"
    document.body.appendChild(bar)
  }
  const el = bar
  el.getAnimations().forEach((a) => a.cancel())
  el.style.opacity = "0"

  // Creeps toward the right but never reaches it — the bar is honest about not
  // knowing how long this will take, and only completes when the page actually
  // arrives. Fades in over 140ms, so a navigation that beats it shows nothing.
  const fill = el.animate(
    [
      { transform: "scaleX(0)", opacity: 0 },
      { transform: "scaleX(0.3)", opacity: 1, offset: 0.12 },
      { transform: "scaleX(0.75)", opacity: 1, offset: 0.55 },
      { transform: "scaleX(0.9)", opacity: 1 },
    ],
    { duration: 3000, easing: "cubic-bezier(0.1, 0.8, 0.2, 1)", fill: "forwards" },
  )

  return () => {
    fill.cancel()
    const current = el.getBoundingClientRect().width / (window.innerWidth || 1)
    if (current < 0.02) {
      // Never became visible. Nothing to finish.
      el.style.opacity = "0"
      return
    }
    el
      .animate(
        [
          { transform: `scaleX(${current})`, opacity: 1 },
          { transform: "scaleX(1)", opacity: 1, offset: 0.6 },
          { transform: "scaleX(1)", opacity: 0 },
        ],
        { duration: 260, easing: "ease-out", fill: "forwards" },
      )
      .finished.catch(() => {})
      .then(() => {
        el.style.opacity = "0"
      })
  }
}

// ---------------------------------------------------------------------------
// Navigate
// ---------------------------------------------------------------------------

/**
 * Hint left on <html> for the duration of the change, so the arriving screen
 * knows which way it was entered and can pick its entry animation. Cleared on a
 * timer as well as on arrival, so a navigation that never lands cannot leave the
 * next one wearing the wrong one.
 */
const HINT_MS = 900

let clearHint = 0

export async function navigateScreen(kind: Kind, go: () => void): Promise<void> {
  if (typeof document === "undefined") {
    go()
    return
  }

  const root = document.documentElement
  root.dataset.nav = kind === "push" ? "enter" : "back"
  window.clearTimeout(clearHint)
  clearHint = window.setTimeout(() => delete root.dataset.nav, HINT_MS)

  // Going back is not a load.
  //
  // The screen you are returning to is already in the client router cache — no
  // request goes out, nothing is fetched, and the only thing standing between
  // the tap and the feed is React re-rendering a tree it already has. A progress
  // bar over that can only ever be a purple line appearing and vanishing again
  // in the same third of a second. That is one of the flashes on the way back,
  // and the honest fix is not to draw it: back gets the haptic and the slide,
  // and nothing else competing for the eye.
  if (kind === "pop") {
    go()
    return
  }

  const done = showBar()
  const settled = new Promise<void>((resolve) => {
    arrive = resolve
  })

  go()

  // Whichever comes first: the destination reporting itself rendered, or a
  // ceiling past which the bar should finish regardless rather than sit there.
  await Promise.race([settled, new Promise<void>((r) => setTimeout(r, 4000))])
  done()
}

/** Which way the current screen was entered, for its own entry animation. */
export function navHint(): "enter" | "back" | null {
  if (typeof document === "undefined") return null
  const v = document.documentElement.dataset.nav
  return v === "enter" || v === "back" ? v : null
}

/**
 * The same answer, but taken rather than read.
 *
 * A hint is for exactly one arrival. Left lying on <html> for its full 900ms it
 * is still there for whatever mounts next — a tab change, a category swap, a
 * remount for any reason at all — and that screen animates in as though you had
 * pressed back, which is a transition appearing out of nowhere. Whoever acts on
 * the hint clears it.
 */
export function consumeNavHint(): "enter" | "back" | null {
  const v = navHint()
  if (v && typeof document !== "undefined") {
    window.clearTimeout(clearHint)
    delete document.documentElement.dataset.nav
  }
  return v
}
