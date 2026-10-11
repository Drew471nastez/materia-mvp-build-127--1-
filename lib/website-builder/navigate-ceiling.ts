/**
 * ===========================================================================
 *  LEAVING A PAGE ALWAYS ENDS, ONE WAY OR THE OTHER
 * ===========================================================================
 * "Going back from the editor takes too long sometimes and hangs on the
 * loading screen." A client-side navigation is a promise nobody keeps: the
 * next route's data has to arrive before anything is painted, and if that
 * request is slow, stalled, or dropped on a phone changing networks, the
 * screen that says "Going back" is all there is, for as long as it takes.
 *
 * So the wait has a ceiling. The soft navigation goes first, because when it
 * works it is instant and keeps the app's state. If the page is still here
 * when the ceiling is reached, the browser is asked to load the address for
 * real, which is slower but cannot hang on anything this code owns.
 *
 * The cancel it returns is the whole trick: navigating unmounts the caller,
 * whose cleanup cancels the fallback. So the hard load happens only when the
 * soft one did not.
 *
 * Pure: the timer is passed in, so a test runs the whole thing on a fake
 * clock.
 */

/**
 * HOW LONG THE SCREEN THAT SAYS YOU ARE LEAVING STAYS BEFORE THE PUSH: not at
 * all (round 23, the owner: "make sure back and entering pages don't have
 * that delay"). It held every way out of an editor for three seconds before
 * the page even asked for the next one, on a route already fetched ahead. The
 * push goes on the press now; the screen only shows when the next page is
 * slow to come (app/globals.css .wb-leaving, its delay).
 *
 * Here rather than in either editor, because both of them leave and a second
 * copy of this number is a second answer to the same question.
 */
export const LEAVING_SEEN_MS = 0

/**
 * A soft navigation still not there after this is loaded as a document. Not
 * sooner: a whole page load is slower than a slow server, and at 2.5s a cold
 * server answering a little late turned an ordinary Back into a reload of the
 * whole app (round 23). The app's own spinner gives a navigation the same
 * time (lib/ui/app-navigation NAV_SPINNER_CAP_MS).
 */
export const NAVIGATE_CEILING_MS = 8_000

export function navigateWithCeiling(
  soft: () => void,
  hard: () => void,
  after: (cb: () => void, ms: number) => number,
  clear: (id: number) => void,
  ms: number = NAVIGATE_CEILING_MS,
): () => void {
  soft()
  const id = after(hard, ms)
  return () => clear(id)
}
