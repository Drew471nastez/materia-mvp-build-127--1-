"use client"

/**
 * Who owns the status-bar strip, and what colour it is.
 *
 * ---------------------------------------------------------------------------
 * The bug this exists to kill
 * ---------------------------------------------------------------------------
 * In the native app a black shield sits behind the status bar
 * (`html.capacitor::before`), and every marketplace surface wants it gone and
 * the strip painted its own colour instead. Four separate components were each
 * doing that for themselves, in a plain effect, with a cleanup that took it back
 * off again — and one of them also saved and restored `html.style.background`.
 *
 * On any navigation between two of them, the outgoing one's cleanup runs and
 * strips the class. For at least a frame the black shield is back and the
 * inline colour has been reverted to whatever it happened to be when that
 * component mounted — including reverting the colour the NEXT screen had just
 * asked for. That is the double flash at the top of the screen on the way into a
 * listing and on the way back out, and it is why it looked like the page was
 * loading twice.
 *
 * So ownership is counted rather than assumed. A surface claims the strip while
 * it is up and releases when it goes; the strip is only surrendered when nothing
 * holds it, and the release is deferred by a tick so a handover — where the
 * outgoing cleanup and the incoming effect are moments apart — never passes
 * through zero. The colour is whatever the most recent claimant asked for, so
 * the arriving screen decides it, not the departing one.
 */

type Claim = { colour: string }

const stack: Claim[] = []

function apply() {
  if (typeof document === "undefined") return
  const html = document.documentElement
  const top = stack[stack.length - 1]
  if (top) {
    html.classList.add("native-feed-bg")
    html.style.backgroundColor = top.colour
  } else {
    html.classList.remove("native-feed-bg")
    html.style.backgroundColor = ""
  }
}

/**
 * Take the strip for as long as this screen is up.
 *
 * `set` lets a screen change its mind — the feed is white as a grid and black as
 * a full-bleed reel, and switching between them must not mean releasing and
 * re-claiming.
 */
export function claimSurface(colour = "#ffffff"): { set: (c: string) => void; release: () => void } {
  const claim: Claim = { colour }
  stack.push(claim)
  apply()
  return {
    set(c: string) {
      if (claim.colour === c) return
      claim.colour = c
      apply()
    },
    release() {
      const i = stack.indexOf(claim)
      if (i < 0) return
      stack.splice(i, 1)
      // Deferred: during a navigation the outgoing screen's cleanup runs a beat
      // before the incoming screen's effect. Acting immediately would surrender
      // the strip in that gap and hand back the black shield for exactly as long
      // as it takes the next screen to ask for it — which is the flash.
      setTimeout(apply, 0)
    },
  }
}
