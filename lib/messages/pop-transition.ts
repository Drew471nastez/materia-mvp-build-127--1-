"use client"

/**
 * Coming back from a conversation, with both screens on screen — and without
 * this file being the one that has to keep them in sync.
 *
 * ---------------------------------------------------------------------------
 * The problem, stated once
 * ---------------------------------------------------------------------------
 * A pop only reads as a pop when the screen you are leaving travels off the one
 * you are going back to. That needs both on screen at once, and Next unmounts
 * the conversation on the frame it commits /messages — so for the length of the
 * transition there is exactly one screen, and every animation applied to it is
 * a soft edge on one side of a hard cut. Six versions of that were built and
 * every one of them read as "too direct", because the cut is the part you see.
 *
 * The seventh kept a copy: a clone of the conversation, held over the page while
 * the route changed underneath it. It worked, and then it did not — a stale
 * copy, images that had not decoded, scroll offsets that did not restore, two
 * animations on two clocks. lib/screen-transition.ts had already written down
 * why, before any of it: "too many ways to desynchronise from the real page,
 * each of which reads as a flash or a stutter." That is a list nobody finishes.
 *
 * ---------------------------------------------------------------------------
 * What is different here
 * ---------------------------------------------------------------------------
 * The browser takes the snapshot.
 *
 * `startViewTransition` captures the old screen as PIXELS before the DOM
 * changes, holds rendering while it changes, captures the new screen, and
 * animates between the two on the compositor. Everything the clone had to
 * reproduce by hand — scroll positions, decoded images, live layout, fixed
 * elements — is simply in the picture, because it is a picture of what was
 * actually on the glass. There is nothing to keep in sync, so there is nothing
 * to desynchronise.
 *
 * This is the browser API directly, NOT Next's `experimental.viewTransition`
 * flag. That flag changes every navigation in the app; this changes exactly one
 * — the back arrow in a conversation. Nothing else in the app can be affected
 * by it, which is the entire reason it is written this way.
 *
 * ---------------------------------------------------------------------------
 * Three ways out, so it can never hang
 * ---------------------------------------------------------------------------
 * The API's contract is that the callback returns a promise and the page stays
 * frozen until it settles. A promise that never settles is a frozen app, and
 * that is the only genuinely dangerous failure here. So it is resolved by
 * whichever of these happens first:
 *
 *   1. the inbox mounts and says so             — the precise signal
 *   2. the URL changes and a frame passes       — for a back that lands
 *                                                 somewhere the inbox is not
 *   3. HOLD_MS elapses                          — unconditional
 *
 * Unsupported browser, reduced motion, or a wide screen: it declines up front
 * and returns false, and the caller navigates the way it always did.
 */

/** Matches the slide in app/globals.css. Both are one movement. */
const SLIDE_MS = 340

/**
 * The longest the page may be held mid-transition. Past this the transition
 * plays against whatever the DOM happens to be, which at worst is a slide from
 * the conversation to the conversation — visibly nothing, and then the inbox
 * arrives normally. Short enough not to read as a freeze.
 */
const HOLD_MS = 400

/** Belt and braces on the class and the flag, well past `finished`. */
const CLEANUP_MS = 1500

const CLASS = "vt-pop"

let settle: (() => void) | null = null
let running = false

/**
 * True while the browser is driving the pop.
 *
 * The inbox asks, because its own arrival animation must not play on top of
 * one: `::view-transition-new(root)` is a live view of the new DOM, so an
 * animation inside it runs INSIDE the transition — two parallaxes over each
 * other, which is precisely the doubled entrance this app has removed twice.
 */
export function popIsViewTransitioning(): boolean {
  return running
}

/** The destination is mounted. Whatever is left to draw, the DOM is the new
 *  screen now — which is all the transition was waiting to be told. */
export function signalPopArrived(): void {
  const fn = settle
  settle = null
  fn?.()
}

function supported(): boolean {
  if (typeof document === "undefined") return false
  if (typeof (document as { startViewTransition?: unknown }).startViewTransition !== "function") {
    return false
  }
  // A conversation is a PANE beside the list on a wide screen. It is not
  // covering anything and there is nothing to uncover.
  if (!window.matchMedia("(max-width: 767px)").matches) return false
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false
  return true
}

/**
 * Run `go` inside a view transition, if this browser can.
 *
 * Returns false without touching anything if it cannot, so the caller can
 * navigate exactly as it did before — the fallback is not a degraded path, it
 * is the path that shipped.
 */
export function popBack(go: () => void): boolean {
  if (!supported()) return false

  const doc = document as Document & {
    startViewTransition: (cb: () => Promise<void>) => {
      finished: Promise<void>
    }
  }
  const root = document.documentElement

  root.classList.add(CLASS)
  running = true

  const done = () => {
    running = false
    settle = null
    root.classList.remove(CLASS)
  }

  /**
   * Whether `go` has been called.
   *
   * The one thing this function must never do is report failure after having
   * already navigated: the caller's fallback would navigate again, and two
   * `router.back()` calls pop two history entries and land you two screens
   * away. The callback is specified to run after the old snapshot is taken, so
   * a throw from `startViewTransition` itself arrives before this is ever set —
   * but the consequence of being wrong about that is bad enough to check rather
   * than reason about.
   */
  let navigated = false

  try {
    const transition = doc.startViewTransition(
      () =>
        new Promise<void>((resolve) => {
          let finished = false
          const finish = () => {
            if (finished) return
            finished = true
            if (settle === finish) settle = null
            resolve()
          }

          // 1. The precise signal.
          settle = finish

          // 3. The unconditional one, first so it is armed before anything can
          //    throw. A frozen page is the only failure here worth fearing.
          window.setTimeout(finish, HOLD_MS)

          // The DOM change itself. Everything the transition animates between
          // is decided by what this does.
          navigated = true
          go()

          // 2. For a back that does not land on the inbox — the history entry
          //    underneath a conversation is usually /messages, but it does not
          //    have to be. One frame after the URL moves is enough for the new
          //    route to have painted something.
          const from = window.location.pathname
          const watch = () => {
            if (finished) return
            if (window.location.pathname !== from) {
              requestAnimationFrame(finish)
              return
            }
            requestAnimationFrame(watch)
          }
          requestAnimationFrame(watch)
        }),
    )

    transition.finished.then(done, done)
  } catch {
    done()
    // Navigated already: report success so the caller does not do it again.
    // The transition is lost; the navigation is not, which is the half that
    // matters.
    return navigated
  }

  window.setTimeout(done, CLEANUP_MS)
  return true
}
