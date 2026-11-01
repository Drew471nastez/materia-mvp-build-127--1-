/**
 * HOW THE SEARCH SCREEN IS OPENED, without the screen (round 46).
 *
 * The phone's tab bar is on every marketing page and asks this from inside
 * the Search press; the screen itself (components/search/search-overlay.tsx
 * and the search screen under it) is fetched after the page has woken up
 * (components/search/search-overlay-lazy.tsx). It registers its opener here
 * when it mounts. Until then there is no screen to open, and the caller goes
 * to the address instead, as it always did where there is none.
 */
export type SearchOverlayOpener = (q?: string) => boolean

let opener: SearchOverlayOpener | null = null

/** The mounted screen's opener; the returned function takes it off again (only if it is still the one). */
export function registerSearchOverlayOpener(fn: SearchOverlayOpener): () => void {
  opener = fn
  return () => {
    if (opener === fn) opener = null
  }
}

/**
 * Opens the screen, from inside the press that asked for it. Returns false
 * when there is no screen to open (a wide window, or not mounted), and the
 * caller goes to /explore/search instead.
 */
export function openSearchOverlay(q?: string): boolean {
  return opener ? opener(q) : false
}

/** Whether the field has the focus, so the touch's end can give it again if the press did not count. */
export function refocusSearchOverlay() {
  const el = document.querySelector<HTMLInputElement>("[data-search-overlay='open'] [data-search-screen-field]")
  if (el && document.activeElement !== el) el.focus({ preventScroll: true })
}
