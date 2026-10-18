/**
 * ===========================================================================
 *  LEAVING THE BUILDER SHOWS ITS SCREEN FOR AT LEAST THREE SECONDS
 * ===========================================================================
 * The owner: "when exiting the website builder editor it's too direct
 * sometimes; it should show at least 3 seconds of a going back screen".
 *
 * And then: the screen went over the whole window in white, and it belongs
 * in the canvas, the way it was. So the editor stays exactly as it is, bar,
 * sidebar and all, and only the canvas says Going back, in the canvas
 * loader's own look. That means the editor has to still be there for the
 * whole of the screen's minimum: the push goes when EXIT_MIN_MS is over, to
 * a route warmed on the press and before it (the editor's prefetch), and the
 * page that arrives replaces the editor in one commit. Nothing is laid over
 * the window, so there is no white sheet to come and go.
 *
 * A screen shown twice for one exit is one screen: a second start while one
 * is waiting is ignored, so two presses of Back are one navigation.
 *
 * Pure: the timers are passed in, so a test runs it on a fake clock
 * (tests/editor-perf-v.test.ts).
 */

/** The owner's choice of how long the "Going back" screen stays up at the least. */
export const EXIT_MIN_MS = 3000

/** How long the Going back screen takes to come up over the canvas (app/globals.css .wb-exit-canvas). */
export const EXIT_FADE_IN_MS = 220

/**
 * Longest the editor waits on a way out before it takes itself back: the
 * screen's minimum, the navigation's own ceiling, and two seconds of grace.
 */
export function exitWatchdogMs(ceilingMs: number, minMs: number = EXIT_MIN_MS): number {
  return minMs + ceilingMs + 2000
}

export type ExitPhase = "idle" | "holding" | "gone"

export interface ExitHoldDeps {
  after: (cb: () => void, ms: number) => number
  clear: (id: number) => void
  /** Put the screen up over the canvas. */
  show: () => void
  /** The minimum is over: navigate. */
  go: () => void
  minMs?: number
}

export interface ExitHold {
  /** The press: the screen goes up. False when one is already up (the second press of a double press). */
  start: () => boolean
  /** The exit did not happen (the page came back from the back/forward cache, a push refused): nothing is pushed. */
  cancel: () => void
  phase: () => ExitPhase
}

export function createExitHold(d: ExitHoldDeps): ExitHold {
  const minMs = d.minMs ?? EXIT_MIN_MS
  let phase: ExitPhase = "idle"
  let timer: number | null = null
  return {
    start() {
      if (phase === "holding" || phase === "gone") return false
      phase = "holding"
      d.show()
      timer = d.after(() => {
        timer = null
        if (phase !== "holding") return
        phase = "gone"
        d.go()
      }, minMs)
      return true
    },
    cancel() {
      if (timer !== null) d.clear(timer)
      timer = null
      phase = "idle"
    },
    phase: () => phase,
  }
}
