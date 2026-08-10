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

/**
 * WHICH NAVIGATION OWNS THE BAR.
 *
 * There is one bar element and there was one `arrive` slot, and neither was
 * guarded — so two pushes in quick succession (a tap on a card while a previous
 * one is still resolving, which on a feed is not rare) trod on each other:
 *
 *   The second `navigateScreen` overwrote `arrive`, so the FIRST promise was
 *   left with no resolver and could only end at its 4-second ceiling. Four
 *   seconds later, with the second screen long since settled, that first call
 *   ran its `done()` — cancelling the live animation on the shared element and
 *   playing a completion over a bar nobody had started. A purple line
 *   materialising and sweeping across the top of a screen that had finished
 *   loading four seconds ago is exactly "it gets stuck / it does things for no
 *   reason", and the four-second gap is why it never looked connected to
 *   anything you had done.
 *
 * A counter fixes both halves. Every push takes the next ticket; only the
 * holder of the current one may touch the bar, and a late arrival or a late
 * ceiling from an older push finds its ticket stale and does nothing.
 */
let ticket = 0

/** The current owner's way of finishing early, so a newer push can take over a
 *  bar that is in a known state rather than mid-animation. */
let finishPending: (() => void) | null = null

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * NOTHING IS DRAWN FOR THE FIRST 180ms.
 *
 * The bar used to be created and animated on the same tick as the push, and it
 * was meant to be inaudible on a fast navigation — the old comment claims the
 * fade-in "over 140ms" means "a navigation that beats it shows nothing". It did
 * not, and the reason is the easing. `cubic-bezier(0.1, 0.8, 0.2, 1)` is
 * violently front-loaded: it reaches a quarter of its progress in the first one
 * percent of its own duration, so the keyframe at offset 0.12 where opacity hits
 * 1 was arriving about FORTY milliseconds in. Every warm, prefetched, instant
 * navigation in the app flashed a purple line across the top and took it away
 * again — a bar reporting a load that had already finished.
 *
 * A fade cannot fix that, because the honest signal is not "fade in slowly", it
 * is "say nothing yet". So the element is not created, not animated and not
 * appended until 180ms have actually passed. A navigation faster than that shows
 * nothing at all — not a faint bar, nothing — and one slower than that gets a
 * bar that starts from zero at the moment it becomes worth mentioning.
 */
const BAR_DELAY_MS = 180

function showBar(): () => void {
  let el: HTMLElement | null = null

  const start = window.setTimeout(() => {
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
    el = bar
    el.getAnimations().forEach((a) => a.cancel())
    el.style.opacity = "0"

    // Creeps toward the right but never reaches it — the bar is honest about not
    // knowing how long this will take, and only completes when the page actually
    // arrives.
    el.animate(
      [
        { transform: "scaleX(0)", opacity: 0 },
        { transform: "scaleX(0.3)", opacity: 1, offset: 0.12 },
        { transform: "scaleX(0.75)", opacity: 1, offset: 0.55 },
        { transform: "scaleX(0.9)", opacity: 1 },
      ],
      { duration: 3000, easing: "cubic-bezier(0.1, 0.8, 0.2, 1)", fill: "forwards" },
    )
  }, BAR_DELAY_MS)

  return () => {
    window.clearTimeout(start)
    // The 180ms never elapsed: there is no element, no animation and nothing to
    // finish. This is the common case and it is now completely silent.
    if (!el) return
    const node = el

    /**
     * MEASURED BEFORE THE ANIMATION IS CANCELLED, WHICH IS THE WHOLE BUG.
     *
     * This read used to sit AFTER `fill.cancel()`. Cancelling a Web Animation
     * removes its effect outright, so the element snapped back to its base style
     * — `width:100%` with no transform — and the very next line measured a
     * bounding box of exactly the viewport width. `current` was therefore 1 on
     * every single navigation, the `< 0.02` early return could never once be
     * true, and the completion animation always ran from a full-width bar.
     *
     * That is the purple flash: a bar that had never been visible, or had
     * crept to a tenth of the screen, jumping to FULL WIDTH and fading out. The
     * guard written to prevent exactly this was dead code, because the thing it
     * tested had already been destroyed one line above it.
     */
    const current = node.getBoundingClientRect().width / (window.innerWidth || 1)
    node.getAnimations().forEach((a) => a.cancel())
    if (current < 0.02) {
      node.style.opacity = "0"
      return
    }
    node
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
        // Back to a known state rather than parked on the last keyframe. A bar
        // left holding scaleX(1) is one that appears full-width for a frame the
        // next time anything touches it.
        node.getAnimations().forEach((a) => a.cancel())
        node.style.opacity = "0"
        node.style.transform = "scaleX(0)"
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

  // Take a ticket, and retire whatever the previous push was still doing. Its
  // bar is finished HERE rather than left for its own ceiling to trip over four
  // seconds from now, so the element is always handed over in a clean state
  // instead of two runs animating it at once.
  const mine = ++ticket
  finishPending?.()

  const done = showBar()
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    if (finishPending === close) finishPending = null
    done()
  }
  finishPending = close

  const settled = new Promise<void>((resolve) => {
    arrive = resolve
  })

  go()

  // Whichever comes first: the destination reporting itself rendered, or a
  // ceiling past which the bar should finish regardless rather than sit there.
  await Promise.race([settled, new Promise<void>((r) => setTimeout(r, 4000))])

  // A newer push has taken the bar since. Finishing it now would play a
  // completion over somebody else's load — which is the four-seconds-late purple
  // sweep this counter exists to stop.
  if (mine !== ticket) return
  close()
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
