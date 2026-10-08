"use client"

import { useState, useSyncExternalStore } from "react"

const never = () => () => {}

/**
 * WAS THIS DRAWN BY THE SERVER? True for a component rendered while the page
 * hydrates (its markup came in the HTML), false for one mounted by the
 * browser afterwards (a client navigation, a list that grew). Kept for the
 * life of the component, so the render after hydration does not change it.
 *
 * What it is for: a picture that fades in when it arrives is drawn hidden
 * until it has loaded. Drawn by the server that meant hidden in the HTML, so
 * a picture the browser already had stayed invisible until the page's
 * scripts had run and then popped in (round 18, the owner: "when I land on
 * the community feed, the posts and their pictures flash"). A picture in the
 * HTML is shown as soon as the browser has it, as any page's picture is.
 */
export function useDrawnByServer(): boolean {
  const hydrating = !useSyncExternalStore(never, () => true, () => false)
  const [drawnByServer] = useState(hydrating)
  return drawnByServer
}
