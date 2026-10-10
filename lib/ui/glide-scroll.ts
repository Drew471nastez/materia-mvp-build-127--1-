/**
 * A SCROLL THAT GLIDES TO A PLACE, ON EVERY FRAME THE SCREEN DRAWS.
 *
 * Settings' sheet, a section pressed while scrolled down: "it should smooth
 * scroll me to the top, very smooth (high fps), instead of abruptly jumping
 * there" (components/app/settings-form-new.tsx).
 *
 * THE BROWSER'S OWN SMOOTH SCROLL, NOT ONE WRITTEN A FRAME AT A TIME. A
 * glide written from requestAnimationFrame runs on the page's thread, and
 * the press that starts it is also the moment the page is busiest (the new
 * section being built, the old one taken down): measured in Chromium
 * (scripts/check-settings-sheet-desktop.mjs), frames of 50 to 200ms landed in
 * the middle of it and the scroll jumped by hundreds of pixels across each.
 * The browser runs its own smooth scroll on the compositor, beside the page's
 * thread, so it keeps the screen's rate whatever the page is doing.
 *
 * What this adds is knowing when it is over: at the place, or stopped short
 * (a wheel or a finger took it over), or a safety timeout.
 */

export type Glide = {
  /** Stop watching; the scroll is the reader's. */
  cancel: () => void
  readonly done: boolean
}

/** How long a glide is watched at most before it is taken as over. */
export const GLIDE_TIMEOUT_MS = 1200
/** Frames without movement, after it has started moving, that mean it stopped short. */
const STILL_FRAMES = 6

export function glideScrollTop(el: HTMLElement, to: number, onEnd?: () => void): Glide {
  let done = false
  let frame = 0
  let timer = 0
  const finish = () => {
    if (done) return
    done = true
    if (frame) cancelAnimationFrame(frame)
    if (timer) window.clearTimeout(timer)
    onEnd?.()
  }
  if (Math.abs(el.scrollTop - to) < 1) {
    finish()
    return { cancel: finish, get done() { return done } }
  }
  el.scrollTo({ top: to, behavior: "smooth" })
  let last = el.scrollTop
  let moved = false
  let still = 0
  const watch = () => {
    frame = 0
    if (done) return
    const now = el.scrollTop
    if (Math.abs(now - to) < 1) return finish()
    if (now !== last) {
      moved = true
      still = 0
    } else if (moved && ++still >= STILL_FRAMES) return finish()
    last = now
    frame = requestAnimationFrame(watch)
  }
  frame = requestAnimationFrame(watch)
  timer = window.setTimeout(finish, GLIDE_TIMEOUT_MS)
  return { cancel: finish, get done() { return done } }
}
