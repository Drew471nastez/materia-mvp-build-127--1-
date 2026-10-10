"use client"

/**
 * ===========================================================================
 *  THE PAGE YOU LEFT, HELD OVER THE PAGE THAT CAME
 * ===========================================================================
 * "Sometimes trying to go back from a checkout or whatever takes too much and
 * blocks."
 *
 * A cross fade between two pages wants a picture of the old one, and
 * `document.startViewTransition` is the obvious way to get it. It is also a
 * trap, and the same trap twice over:
 *
 *   WHILE A VIEW TRANSITION WAITS FOR ITS UPDATE THE BROWSER DRAWS NOTHING.
 *   Not the page behind, not the control that was pressed, not a spinner.
 *   So a transition whose update waits for a navigation to commit freezes
 *   the screen for exactly as long as the network takes, and the frozen
 *   frame is the OLD page: pressing Back appears to have done nothing at
 *   all. Filmed here with the page behind 2.5 seconds away, the screen
 *   stood still for 429ms (the wait's own cap) and then cut.
 *
 *   AND NOTHING INSIDE THE PAGE CAN SEE IT, because a page that is not being
 *   drawn runs no animation frames either. Only a film of the screen shows
 *   it, which is why this was measured wrong twice.
 *
 * So there is no view transition here. The page that is leaving is copied,
 * as it stands, in the commit that takes it away (the one moment it is still
 * in the document and the page that replaces it is in the same commit, before
 * either is painted), and the copy is laid over the new page and faded off
 * it. The browser is never asked to wait for anything: whatever
 * the navigation does, and however long it takes, every frame between the
 * press and the arrival is drawn live.
 *
 * It is the same shape as the page layer's way back (components/app/
 * page-layer.tsx, dropAtCommit) and the library stage's cross fade
 * (components/library/library-panel.tsx, leaveCopy), and it works in every
 * engine, including the WebKit on most of the iPhones the app is installed
 * on, which had no view transitions at all.
 *
 * A COPY IS NOT A PHOTOGRAPH, so four things are put back into it, because
 * cloneNode does not carry them: what is typed in the fields, where every
 * scroller is standing, no element ids (they must not exist twice in one
 * document), and no second frame. An <iframe> clone RELOADS its source, which
 * on the checkout is Stripe's card form: it is swapped for a plain box of the
 * same size, which for a fifth of a second of fading is the same picture.
 *
 * scripts/check-back-stall.mjs films it: press to first change, press to the
 * page behind painted, and the longest the screen stands still.
 */

/** How long the page that left fades over the page that came. */
export const LEAVE_FADE_MS = 240
/** The curve the rest of the app leaves on (the library stage, the layer). */
export const LEAVE_FADE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** A still never outlives this, whatever happens to the navigation it was taken for. */
export const STILL_CAP_MS = 1200
/** The attribute the still carries, so a second one is never started over the first. */
export const STILL_ATTR = "data-leaving-still"

/** The part of a clone a clone does not carry: what is typed, where things are scrolled to. */
export function copyLiveState(from: HTMLElement, to: HTMLElement) {
  const pair = <T extends HTMLElement>(selector: string, put: (a: T, b: T) => void) => {
    const a = from.querySelectorAll<T>(selector)
    const b = to.querySelectorAll<T>(selector)
    for (let i = 0; i < a.length && i < b.length; i++) put(a[i], b[i])
  }
  if (from.scrollTop) to.scrollTop = from.scrollTop
  pair<HTMLElement>("[data-page-scroll],.page-scroll,.overflow-y-auto", (a, b) => {
    if (a.scrollTop) b.scrollTop = a.scrollTop
    if (a.scrollLeft) b.scrollLeft = a.scrollLeft
  })
  pair<HTMLInputElement>("input", (a, b) => {
    b.value = a.value
    b.checked = a.checked
  })
  pair<HTMLTextAreaElement>("textarea", (a, b) => {
    b.value = a.value
  })
  pair<HTMLSelectElement>("select", (a, b) => {
    b.value = a.value
  })
}

/** A copy of `el` for the still: no ids, no second frame, nothing live inside it. */
export function copyFor(el: HTMLElement): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement
  copy.removeAttribute("id")
  for (const node of Array.from(copy.querySelectorAll("[id]"))) node.removeAttribute("id")
  /* A second <iframe> fetches its source again (Stripe's card form, a video): a box of the same size instead. */
  const live = el.querySelectorAll<HTMLElement>("iframe,video,object,embed")
  const copies = copy.querySelectorAll<HTMLElement>("iframe,video,object,embed")
  for (let i = 0; i < copies.length; i++) {
    const box = document.createElement("div")
    const r = live[i]?.getBoundingClientRect()
    box.style.cssText = `width:${Math.round(r?.width ?? 0)}px;height:${Math.round(r?.height ?? 0)}px;background:#f3f4f6;border-radius:8px`
    copies[i].replaceWith(box)
  }
  for (const node of Array.from(copy.querySelectorAll("script,[data-activity-spinner]"))) node.remove()
  return copy
}

/**
 * Lays a copy of `el` over the window and fades it off whatever is under it.
 * Call it in the commit that takes `el` away, from a layout effect's cleanup,
 * where the node is still in the document and the page replacing it is in the
 * same commit: the first frame after shows the old page where it was, with
 * the new one already under it.
 *
 * Does nothing under reduced motion, with nothing to copy, or while another
 * still is up. Returns a function that takes it away early.
 */
export function holdLeavingStill(
  el: HTMLElement | null | undefined,
  ms = LEAVE_FADE_MS,
  /**
   * "fade" (the default) fades the copy off; "pop" slides it off to the right with a soft edge, a native pop (round 15:
   * leaving a community for Explore). `under` puts the copy below the app's bars (the tab bar stays on top, still).
   */
  opts: { motion?: "fade" | "pop"; under?: boolean } = {},
): () => void {
  const nothing = () => {}
  if (typeof document === "undefined" || typeof window === "undefined") return nothing
  if (!(el instanceof HTMLElement) || !el.isConnected) return nothing
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return nothing
  if (document.querySelector(`[${STILL_ATTR}]`)) return nothing
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return nothing

  const box = document.createElement("div")
  box.setAttribute(STILL_ATTR, "")
  box.setAttribute("aria-hidden", "true")
  box.inert = true
  /* Over everything the buyer pages draw, taking no presses, painting nothing outside itself. */
  box.style.cssText = `position:fixed;inset:0;z-index:${opts.under ? 40 : 2147483000};overflow:hidden;pointer-events:none;contain:layout paint style;will-change:${opts.motion === "pop" ? "translate" : "opacity"}`
  const copy = copyFor(el)
  copy.style.cssText += `;position:absolute;left:${Math.round(r.left)}px;top:${Math.round(r.top)}px;width:${Math.round(r.width)}px;height:${Math.round(r.height)}px;margin:0`
  box.append(copy)
  document.body.append(box)
  copyLiveState(el, copy)

  let over = false
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(cap)
    box.remove()
  }
  const cap = window.setTimeout(done, ms + STILL_CAP_MS)
  try {
    if (opts.motion === "pop") copy.style.boxShadow = "-12px 0 32px -16px rgba(17,24,39,0.28)"
    const move =
      opts.motion === "pop"
        ? box.animate([{ translate: "0 0" }, { translate: "100% 0" }], { duration: ms, easing: "cubic-bezier(0.32, 0.72, 0, 1)", fill: "forwards" })
        : box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: LEAVE_FADE_EASE, fill: "forwards" })
    move.finished.then(done, done)
  } catch {
    /* No Web Animations (a very old engine): the copy simply goes on the next task rather than fading. */
    window.setTimeout(done, 0)
  }
  return done
}
