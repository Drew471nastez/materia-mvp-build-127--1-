/**
 * ===========================================================================
 *  THE /app SIDEBAR, OPEN OR AS A ROW OF ICONS
 * ===========================================================================
 * One width, read by both the sidebar and the page beside it, as the CSS
 * variable --app-rail-w on the shell's root (app/app/layout.tsx), so the two
 * can never disagree. The choice is a cookie, read on the server, so the
 * first frame is already the right width: nothing jumps after load.
 * globals.css fades the labels and folds the submenus and cards while it is collapsed;
 * every row keeps its icon, its link and a tooltip with its name.
 *
 * Pure but for `toggleAppRail`, which only runs in the browser.
 */
export const RAIL_COOKIE = "sl_rail"
export const RAIL_OPEN_PX = 240
/**
 * 63: the icons sit 31px from the sidebar's left (7px of gutter, 14px of row
 * padding, half a 20px icon), so a column of 62px plus the 1px border has
 * its centre exactly there. Collapsing then moves no icon at all (round 30;
 * it was 68, and the icons slid the last 2.5px to its centre).
 */
export const RAIL_COLLAPSED_PX = 63

export type RailState = "open" | "collapsed"

export function railStateOf(cookie: string | null | undefined): RailState {
  return cookie === "collapsed" ? "collapsed" : "open"
}

export function railWidth(state: RailState): number {
  return state === "collapsed" ? RAIL_COLLAPSED_PX : RAIL_OPEN_PX
}

/** Flip it, everywhere it is read, and remember it for a year. */
export function toggleAppRail(): RailState {
  const root = document.querySelector<HTMLElement>("[data-app-rail]")
  const next: RailState = root?.getAttribute("data-app-rail") === "collapsed" ? "open" : "collapsed"
  if (root) {
    root.setAttribute("data-app-rail", next)
    root.style.setProperty("--app-rail-w", `${railWidth(next)}px`)
  }
  document.cookie = `${RAIL_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
  window.dispatchEvent(new CustomEvent("storelib:app-rail", { detail: next }))
  return next
}
