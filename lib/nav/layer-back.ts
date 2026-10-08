/**
 * A STEP BACK THAT ONLY CLOSES A LAYER. A post opened over the feed, or a
 * picture in the viewer, takes a history entry of its own
 * (components/community/member/lightbox.tsx useHistoryLayer), and closing it
 * any other way than Back steps back over that entry. That step is a
 * popstate like any Back, and the community's Back restore
 * (components/community/member/return-scroll.ts) answered it by putting the
 * feed back where it was noted, pinned for a few frames: a member who closed
 * a post and started scrolling at once had the feed pulled back under the
 * finger (round 19, the owner: "I close the post, start scrolling, and it
 * jumps"). The page under a layer never moved, so nothing is restored for
 * this step. Marked just before history.back(), read by the popstate it causes.
 */
let markedAt = -Infinity

/** Called right before a layer's own history.back(). */
export function markLayerBack(): void {
  markedAt = typeof performance === "undefined" ? 0 : performance.now()
}

/** Whether the popstate being handled is a layer's own step back (within a moment of the mark). */
export function isLayerBack(): boolean {
  return typeof performance !== "undefined" && performance.now() - markedAt < 400
}
