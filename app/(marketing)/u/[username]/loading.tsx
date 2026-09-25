/**
 * ===========================================================================
 *  WHILE A CREATOR PAGE LOADS: THEIR PAGE COLOUR, AND NOTHING PRETENDING
 * ===========================================================================
 * This was three hundred lines of pulsing grey furniture: a centred header
 * in a 4xl column, a row of category tags, a six-card grid in a 6xl column,
 * an About block with three stats. None of it was the page any more. The
 * header has had a handle and a meta row and no tags for a long time, the
 * columns are 1180 wide, the tab strip was missing entirely, and whether
 * there is a cover at all depends on the creator. So on a slow load the
 * visitor watched one layout pulse and then a different one replace it,
 * which is a jump of its own.
 *
 * What stays true of every creator page while it loads is its colour, which
 * the layout beside this file resolves from the creator's scheme so a dark
 * page does not flash white. The route's own loading bar
 * (components/navigation/route-loading-bar) says that something is coming.
 */
export default function StorefrontLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="min-h-screen"
      style={{ backgroundColor: "var(--skeleton-bg, #f6f6f7)" }}
    />
  )
}
