/**
 * ===========================================================================
 *  LEAVING THE BUILDER SHOWS ITS SCREEN FOR AT LEAST THREE SECONDS
 * ===========================================================================
 * The owner: "when exiting the website builder editor it's too direct
 * sometimes; it should show at least 3 seconds of a going back screen".
 *
 * Round 23 took the hold away ("make sure back and entering pages don't have
 * that delay") and the push went on the press, with the screen shown only
 * when the next page was slow. On a warm route that meant no screen at all:
 * a press, then the list. Now the push still goes on the press, so the page
 * behind loads while the screen is up, and the screen stays until both are
 * true:
 *
 *   EXIT_MIN_MS has passed since the press, and
 *   the destination has arrived (the editor has been replaced by it).
 *
 * Then it fades off what has arrived. A screen shown twice for one exit is
 * one screen: a second start while one is up is ignored, so two presses of
 * Back are one navigation.
 *
 * Pure: the clock and the timers are passed in, so a test runs it on a fake
 * clock (tests/editor-perf-v.test.ts).
 */

/** The owner's choice of how long the "Going back" screen stays up at the least. */
export const EXIT_MIN_MS = 3000

/** How long the screen takes to fade off the page that has arrived. */
export const EXIT_FADE_MS = 320

/** How long, from now, until a screen raised at `startedAt` may go: never before EXIT_MIN_MS. */
export function exitRevealIn(startedAt: number, now: number, minMs: number = EXIT_MIN_MS): number {
  return Math.max(0, startedAt + minMs - now)
}

export type ExitPhase = "idle" | "holding" | "fading" | "done"

export interface ExitHoldDeps {
  now: () => number
  after: (cb: () => void, ms: number) => number
  clear: (id: number) => void
  /** Put the screen up. */
  show: () => void
  /** Start its fade off the page. */
  fade: () => void
  /** Take it away (after the fade, or at once on a cancel). */
  remove: () => void
  minMs?: number
  fadeMs?: number
}

export interface ExitHold {
  /** The press: the screen goes up. False when one is already up (the second press of a double press). */
  start: () => boolean
  /** The destination is on the page: the screen goes once EXIT_MIN_MS from the press has passed. */
  arrived: () => void
  /** The exit did not happen (the page came back from the back/forward cache, a push refused): the screen goes now. */
  cancel: () => void
  phase: () => ExitPhase
}

export function createExitHold(d: ExitHoldDeps): ExitHold {
  const minMs = d.minMs ?? EXIT_MIN_MS
  const fadeMs = d.fadeMs ?? EXIT_FADE_MS
  let phase: ExitPhase = "idle"
  let startedAt = 0
  let timer: number | null = null
  const stopTimer = () => {
    if (timer !== null) d.clear(timer)
    timer = null
  }
  const finish = () => {
    stopTimer()
    if (phase === "idle" || phase === "done") return
    phase = "done"
    d.remove()
  }
  const reveal = () => {
    timer = null
    if (phase !== "holding") return
    phase = "fading"
    d.fade()
    timer = d.after(finish, fadeMs)
  }
  return {
    start() {
      if (phase === "holding" || phase === "fading") return false
      phase = "holding"
      startedAt = d.now()
      d.show()
      return true
    },
    arrived() {
      if (phase !== "holding" || timer !== null) return
      timer = d.after(reveal, exitRevealIn(startedAt, d.now(), minMs))
    },
    cancel() {
      if (phase === "idle" || phase === "done") return
      stopTimer()
      phase = "done"
      d.remove()
    },
    phase: () => phase,
  }
}
