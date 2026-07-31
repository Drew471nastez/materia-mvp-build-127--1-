"use client"

/**
 * Navigate with a native push/pop transition where the browser supports it.
 *
 * The transition itself is CSS (see globals.css). All this does is take the
 * snapshot at the right moment and say which direction we're going, so the same
 * pair of keyframes can read as "deeper" or "back".
 *
 * Falls straight through to the plain navigation where View Transitions don't
 * exist — the navigation is already instant there, it simply cuts instead of
 * sliding. Nothing waits on this.
 */
export function navigateWithTransition(direction: "forward" | "back", run: () => void) {
  const doc = typeof document !== "undefined" ? (document as any) : null
  if (!doc?.startViewTransition) {
    run()
    return
  }
  doc.documentElement.dataset.nav = direction
  const transition = doc.startViewTransition(() => run())
  transition.finished
    .catch(() => {})
    .finally(() => {
      delete doc.documentElement.dataset.nav
    })
}
