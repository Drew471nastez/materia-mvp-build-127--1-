/**
 * ===========================================================================
 *  THE WEBSITE PAGE ASKS THE SERVER AGAIN ONLY WHEN ITS COPY IS BEHIND
 * ===========================================================================
 * The app keeps a page it has shown for five minutes (next.config staleTimes),
 * so coming back from the editor can draw the Website page as it was before
 * the edit. The page then asks the server for itself again: once per save
 * this tab made after the copy's own record of the site's last save, and
 * never again for the same save, so it cannot loop.
 *
 * The ask itself goes through the page's one refresh (website-builder-client
 * `refresh`), which folds an ask made while another is on its way into a
 * single one after it (round AP).
 *
 * Pure, so a test can hold the clocks still.
 */

/** The websites whose copy is behind a save this tab made, not yet asked about. Their keys go in `refreshed` when asked. */
export function pagesBehind(rows: readonly { id: string; saved_at: string }[], savedAt: (id: string) => number, refreshed: ReadonlySet<string>): string[] {
  return rows
    .filter((i) => {
      const saved = savedAt(i.id)
      if (!saved || refreshed.has(`${i.id}:${saved}`)) return false
      return saved > Date.parse(i.saved_at) + 2000
    })
    .map((i) => i.id)
}
