"use client"

/**
 * Blended route changes.
 *
 * The problem this exists to solve: Next unmounts the outgoing page the instant
 * it navigates, so during a route change there is *nothing* behind the incoming
 * one. Any animation that is translucent, or that moves in from off-frame, is
 * therefore animating against the bare document background rather than against
 * the screen you came from — which is where every white flash came from. The
 * only ways out are to animate nothing (instant, but dead), or to keep the old
 * screen on screen while the new one arrives.
 *
 * The View Transitions API does exactly the second thing: it photographs the
 * current screen, lets us swap the DOM underneath, photographs the result, and
 * cross-fades the two snapshots. Both sides of the blend are real pictures of
 * real screens, so a fade is finally safe — there is no background to leak
 * through, in either direction.
 *
 * An earlier attempt at this glitched, and it is worth being precise about why,
 * because the fix is the whole point of the handshake below. `startViewTransition`
 * takes the *second* photograph as soon as its callback returns. `router.push`
 * is asynchronous — it returns long before the new route has rendered — so the
 * second photograph caught a half-built page and the transition played against
 * it. Here the callback returns a promise that stays open until the destination
 * says it is actually on screen, so the photograph is always of a finished page.
 */

type Blend = "enter" | "back"

/** Resolver for the in-flight navigation, set while a transition is open. */
let arrive: (() => void) | null = null

/**
 * Called by a destination screen once it has genuinely rendered.
 *
 * Call it from a layout effect (before paint), and — where the screen restores
 * scroll — only once that has landed. Photographing a feed that is still sat at
 * the top would blend to the wrong place and then jump.
 *
 * Safe to call at any time: outside a transition it does nothing.
 */
export function signalArrival(): void {
  const fn = arrive
  arrive = null
  fn?.()
}

function supported(): boolean {
  if (typeof document === "undefined") return false
  if (typeof (document as any).startViewTransition !== "function") return false
  // Someone who has asked for less motion gets the instant swap.
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Hold the transition open for at most this long. Past it, the destination is
 * either slower than any animation should wait for or it never signalled, and a
 * frozen screen is far worse than an unblended swap. Routes are warmed on touch
 * (see SmartLink), so in practice arrival beats this comfortably.
 */
const MAX_HOLD = 420

/**
 * Run `go` as a blended navigation.
 *
 * `kind` only picks the direction of the movement — see the
 * `::view-transition-*` rules in globals.css. Falls back to running `go`
 * directly wherever view transitions aren't available (Firefox, older WebKit),
 * where the page's own CSS entry animation takes over instead.
 */
export function navigateBlended(kind: Blend, go: () => void): void {
  if (!supported()) {
    go()
    return
  }

  const root = document.documentElement

  // A second tap while one is still running would photograph a screen that is
  // itself mid-transition. Let the swap happen unblended rather than stack them.
  if (root.dataset.blend) {
    go()
    return
  }

  root.dataset.blend = kind

  const transition = (document as any).startViewTransition(() => {
    const settled = new Promise<void>((resolve) => {
      arrive = resolve
    })
    go()
    return Promise.race([
      settled,
      new Promise<void>((resolve) => setTimeout(resolve, MAX_HOLD)),
    ])
  })

  const clear = () => {
    delete root.dataset.blend
    arrive = null
  }
  transition.finished.then(clear, clear)
}
