/**
 * ===========================================================================
 *  DID THIS SCROLL MOVE THE THING A PANEL HANGS FROM?
 * ===========================================================================
 * A panel that follows a button or a field listens to every scroll in the
 * document, captured, because scroll does not bubble and the sidebar's panes
 * scroll too. The canvas is in that document as well, and a wheel over it is
 * a scroll event every frame: each one read the anchor's box (a layout of the
 * whole editor, the canvas's page with it) and set the panel's place (a
 * render), for a button in the sidebar or the chrome that the canvas does not
 * move (round 15, scripts/check-wb-live-r15.mjs).
 *
 * Only a scroll of something that holds the anchor can move it: the document
 * itself, or a pane the anchor is inside.
 */
export function scrollMoves(e: Event, anchor: Element | null | undefined): boolean {
  const t = e.target
  return !anchor || !(t instanceof Node) || t.contains(anchor)
}
