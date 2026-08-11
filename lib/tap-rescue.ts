"use client"

/**
 * A tap that happened, whether or not the browser agreed it did.
 *
 * ---------------------------------------------------------------------------
 * The bug
 * ---------------------------------------------------------------------------
 * Press a tab in the bottom bar. The icon fills — and the app stays exactly
 * where it was, then un-fills a second later as if nothing had been pressed.
 * Intermittently. Press it again and it works.
 *
 * The fill and the navigation were driven by two different events and only one
 * of them is guaranteed. `pointerdown` lights the icon; `click` — which is what
 * a <Link> navigates on — does the rest. A browser only synthesises that click
 * if the gesture ends up classified as a tap, and there are several entirely
 * ordinary ways for it not to be:
 *
 *   • the finger drifts a few pixels before lifting, so the gesture is
 *     reclassified as a drag: `pointercancel` fires, `click` never does;
 *   • the tap lands on a page that still has scroll momentum, which a WebView
 *     swallows as a stop-the-scroll gesture rather than passing it on;
 *   • the touch is interrupted by the system — a notification banner, the app
 *     switcher, a second finger landing.
 *
 * Every one of those fires pointerdown and no click. Which is precisely the
 * reported symptom, and precisely why it is intermittent: it depends on how
 * still your thumb is and on what the page underneath happened to be doing.
 *
 * ---------------------------------------------------------------------------
 * The fix, and why it is a fallback rather than a replacement
 * ---------------------------------------------------------------------------
 * The gesture is tracked as a gesture. `down` records where the finger landed
 * and what the control means; `move` abandons it the moment it stops being a
 * tap; `up` starts a short grace period; `click`, if it arrives, calls that
 * grace period off, because whatever normally handles the click has it from
 * there. If the grace period expires with no click, the click is not coming,
 * and `onRescue` performs the action directly.
 *
 * Acting on pointerup unconditionally would have been fewer lines and worse:
 * it means giving up <Link> — real hrefs, prefetching, open-in-new-tab, middle
 * click, the accessibility tree — to work around a case that is uncommon. This
 * way the normal path is exactly what it was and only the swallowed tap is
 * rescued.
 *
 * Framework-agnostic and side-effect free on purpose: everything it does, it
 * does through the three callbacks, which is what makes the whole of it
 * testable without a router, a renderer or a real bottom bar.
 */

export type TapRescue<T> = {
  /** A finger landed on the control that means `target`. */
  down(target: T, x: number, y: number): void
  /** The finger moved. Abandons the gesture once it is a drag rather than a tap. */
  move(x: number, y: number): void
  /** The finger lifted on the control. Starts the wait for the click. */
  up(): void
  /**
   * The click arrived after all — stand down.
   *
   * Returns whether the CALLER should still act on it. False means this gesture
   * has already been rescued and acted upon, and this click is its late arrival:
   * doing the work again would be doing it twice for one press. See the note on
   * `spent` in the implementation.
   */
  click(): boolean
  /** The system took the gesture away (pointercancel), or the caller gave up. */
  cancel(): void
  /** Drop everything, including any pending timer. For unmount. */
  dispose(): void
  /** Testing seam: the gesture currently being tracked, if any. */
  peek(): T | null
}

export type TapRescueOptions<T> = {
  /**
   * Past this many pixels of movement the finger is dragging, not tapping.
   * Roughly what the engines themselves use before they cancel a tap.
   */
  slop?: number
  /**
   * How long to wait for the click before deciding it is not coming.
   *
   * A click follows its own pointerup within a frame or two on every engine —
   * the 300ms tap delay has not existed anywhere since `touch-action` did. This
   * is long enough that a real click always wins the race, and short enough
   * that the rescue still feels like part of the same tap rather than a second,
   * later one.
   */
  graceMs?: number
  /** Somebody pressed this. Fires on pointerdown, with the finger. */
  onPress(target: T): void
  /** That press is not going to become a tap. Undo whatever onPress showed. */
  onAbandon(target: T): void
  /** The click was swallowed. Do the thing it would have done. */
  onRescue(target: T): void
  /** Injectable for tests. Defaults to the real timers. */
  setTimer?: (fn: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}

export function createTapRescue<T>(options: TapRescueOptions<T>): TapRescue<T> {
  const slop = options.slop ?? 12
  const graceMs = options.graceMs ?? 220
  const setTimer =
    options.setTimer ?? ((fn: () => void, ms: number) => window.setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((id: number) => window.clearTimeout(id))

  type Live = { target: T; x: number; y: number; clicked: boolean; timer: number | null }
  let live: Live | null = null

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  THE GESTURE WE HAVE ALREADY ACTED ON
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * THE BUG: pressing + sometimes opened the sell sheet TWICE — two history
   * entries, two pushes, and a visible glitch as the second landed on top of the
   * first.
   *
   * The rescue and the click are two callbacks for one press, and they were only
   * mutually exclusive while the gesture was still live. `click()` disarmed the
   * timer, and the timer's own callback checked `g.clicked`. But the timer fires
   * 220ms after pointerup and then sets `live = null` — so a click arriving
   * LATER than that found no gesture to disarm, returned silently, and the
   * caller went on to run the action a second time. The rescue had already run
   * it.
   *
   * 220ms is not long on a main thread that is doing something. The click is
   * synthesised by the engine after its own bookkeeping, and a busy frame, a
   * scroll settling, or a route committing is enough to push it past that
   * window — which is exactly why the double-open was intermittent and why it
   * happened on the one button whose action is the most expensive on the bar.
   *
   * So a rescued gesture is remembered rather than forgotten. The next `click()`
   * consumes that memory and reports back that it must not act, and the next
   * `down()` clears it — a press is the only thing that starts a new gesture, so
   * there is no state here that can outlive one.
   */
  let spent: Live | null = null

  /** Forget the gesture. `undo` tells the caller to take its press state back. */
  function drop(undo: boolean): void {
    const g = live
    if (!g) return
    if (g.timer !== null) clearTimer(g.timer)
    live = null
    if (undo) options.onAbandon(g.target)
  }

  return {
    down(target, x, y) {
      // A second finger, or a press that never got its up. The previous
      // gesture is over and its press state belongs to nobody, so it is
      // dropped silently rather than undone — the new press is about to
      // replace whatever it was showing anyway.
      drop(false)
      // A new press is a new gesture, so any click still owed to the last one is
      // no longer owed to anything.
      spent = null
      live = { target, x, y, clicked: false, timer: null }
      options.onPress(target)
    },

    move(x, y) {
      const g = live
      if (!g) return
      if (Math.abs(x - g.x) < slop && Math.abs(y - g.y) < slop) return
      // A drag. No click is coming, none should be invented, and the control
      // must stop claiming to have been pressed straight away rather than
      // sitting there lit until some later timeout notices.
      drop(true)
    },

    up() {
      const g = live
      if (!g) return
      if (g.timer !== null) clearTimer(g.timer)
      g.timer = setTimer(() => {
        // A newer press replaced this one while the grace period ran, or the
        // click turned up. Either way this gesture no longer decides anything.
        if (live !== g || g.clicked) return
        live = null
        // Remembered, not forgotten: a click that arrives after this must know
        // the work has been done. See the note on `spent`.
        spent = g
        options.onRescue(g.target)
      }, graceMs)
    },

    click(): boolean {
      const g = live
      if (!g) {
        // No live gesture. If the last one was RESCUED, this is its late click
        // and the action has already been performed — consume the memory and
        // tell the caller to stand down.
        if (spent) {
          spent = null
          return false
        }
        // Otherwise it is an ordinary click on something this machine is not
        // tracking — a keyboard activation, or one that follows a gesture we
        // abandoned. A real click is a real intention; let it act.
        return true
      }
      g.clicked = true
      if (g.timer !== null) clearTimer(g.timer)
      g.timer = null
      return true
    },

    cancel() {
      drop(true)
    },

    dispose() {
      drop(false)
      spent = null
    },

    peek() {
      return live ? live.target : null
    },
  }
}
