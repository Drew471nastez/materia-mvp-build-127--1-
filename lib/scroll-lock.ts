/**
 * ===========================================================================
 *  ONE PAGE, SEVERAL THINGS THAT WANT IT TO HOLD STILL
 * ===========================================================================
 *
 * A sheet is over the page and the page still scrolls under it. On a phone that
 * is the single loudest reason a sheet reads as a web page rather than as part
 * of the app: your thumb lands slightly off the sheet, or it lands ON the sheet
 * but past the end of its list, and the whole profile behind slides. Nothing is
 * broken and everything feels loose.
 *
 * The obvious fix — each overlay saving `document.body.style.overflow` on the
 * way in and putting it back on the way out — is correct exactly until two of
 * them overlap, which is the normal case here: the manage sheet closes as the
 * delete confirmation opens. Then the dialog captures "hidden" as the value to
 * restore, the sheet restores "", and whichever effect runs last decides
 * whether the page is scrollable — including the case where it ends up locked
 * with nothing on screen to unlock it.
 *
 * So the lock is counted rather than saved. The first caller locks, the last
 * one to leave unlocks, and overlapping owners are the ordinary case rather
 * than the bug.
 */

let depth = 0
let restore = ""

/** Returns the release function. Call it once; calling it twice is a no-op. */
export function lockScroll(): () => void {
  if (typeof document === "undefined") return () => {}

  if (depth === 0) {
    restore = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  depth++

  let released = false
  return () => {
    if (released) return
    released = true
    depth = Math.max(0, depth - 1)
    if (depth === 0) document.body.style.overflow = restore
  }
}
