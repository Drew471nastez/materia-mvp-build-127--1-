/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE: HOW THE TAB MOVES
 * ===========================================================================
 * Two small rules the tab's controls follow, pure so
 * tests/performance-tab-w.test.ts can hold them:
 *
 *   SEGMENTS   A row of choices is one stop for Tab, and the arrow keys,
 *              Home and End move the choice inside it (the radio group
 *              pattern), wrapping at the ends.
 *   RANGES     Choosing a new period never empties the page. What is on
 *              screen stays, dimmed, until the new period's answer is in;
 *              an answer to an older question is dropped; an answer kept
 *              from before is drawn at once. Only the very first load, with
 *              nothing to show, has a placeholder, and that one waits
 *              PERF_SKELETON_AFTER_MS before it is drawn at all.
 */

export const PERF_SKELETON_AFTER_MS = 300

/** The choice a key moves to, or null for a key the row does not take. */
export function segmentKey<T>(options: readonly T[], current: T, key: string): T | null {
  const n = options.length
  if (n === 0) return null
  const i = Math.max(0, options.indexOf(current))
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return options[(i + 1) % n]
    case "ArrowLeft":
    case "ArrowUp":
      return options[(i - 1 + n) % n]
    case "Home":
      return options[0]
    case "End":
      return options[n - 1]
    default:
      return null
  }
}

export interface LoadState<A> {
  /** What is drawn. */
  shown: A | null
  /** The question `shown` answers. */
  shownKey: string | null
  /** The question last asked. */
  wantKey: string | null
  /** The ask in flight, 0 for none. */
  pending: number
  error: string | null
}

export type LoadEvent<A> =
  | { type: "ask"; key: string; id: number; cached: A | null }
  | { type: "answer"; key: string; id: number; answer: A }
  | { type: "fail"; id: number; error: string }
  /** Something on screen changed in place (a lab test ran): the same question, a newer answer. */
  | { type: "patch"; answer: A }

export function initialLoad<A>(cached: A | null, key: string | null): LoadState<A> {
  return { shown: cached, shownKey: cached ? key : null, wantKey: key, pending: 0, error: null }
}

export function loadReducer<A>(s: LoadState<A>, e: LoadEvent<A>): LoadState<A> {
  switch (e.type) {
    case "ask":
      return {
        shown: e.cached ?? s.shown,
        shownKey: e.cached ? e.key : s.shownKey,
        wantKey: e.key,
        pending: e.id,
        error: null,
      }
    case "answer":
      if (e.id !== s.pending) return s
      return { shown: e.answer, shownKey: e.key, wantKey: s.wantKey, pending: 0, error: null }
    case "fail":
      if (e.id !== s.pending) return s
      return { ...s, pending: 0, error: e.error }
    case "patch":
      return { ...s, shown: e.answer }
    default:
      return s
  }
}

/** What the page draws from a load state. */
export function loadView<A>(s: LoadState<A>): { dim: boolean; placeholder: boolean; busy: boolean } {
  const busy = s.pending !== 0
  return {
    /* An older period's figures, on screen while the asked one comes. */
    dim: busy && s.shown !== null && s.shownKey !== s.wantKey,
    placeholder: s.shown === null && s.error === null,
    busy,
  }
}
