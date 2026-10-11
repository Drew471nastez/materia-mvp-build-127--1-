"use client"

/**
 * ===========================================================================
 *  ANOTHER PAGE IN THE BUILDER: THE OLD ONE STAYS UNTIL THE NEW ONE IS DRAWN
 * ===========================================================================
 * "The white flash when you switch pages inside the builder."
 *
 * The canvas went from one page to the next in one commit, then faded the new
 * page up from a third of its strength over the canvas's white: the white
 * showed through for those 180ms, which is the flash. And the new page's
 * pictures were not in yet, so it arrived as boxes that filled in one by one.
 *
 * Now the page being left is copied, as it stands, over the canvas, at the
 * moment the new one is put in under it (the same copy the app's leaving
 * pages use, lib/navigation/leaving-still.ts). The copy stays while the new
 * page is drawn and the pictures on its first screen decode, a few hundred
 * milliseconds at most, and then fades off it: old page, then a cross fade,
 * then the new page whole. Nothing is reloaded and nothing white is shown.
 *
 * The copy is laid INSIDE the canvas frame (.wb-canvas-frame), not over the
 * window: the frame is the container every section's width and height
 * queries answer to, and the box its fixed menus are held in, so the copy
 * lays out exactly as the page did. It is a scroller held where the page
 * was scrolled to, so a sticky header is where it was too. It takes no
 * presses: whatever is pressed while it fades is the new page under it.
 */
import { copyFor, copyLiveState } from "@/lib/navigation/leaving-still"

/** The cross fade itself. */
export const STILL_FADE_MS = 200
/** The longest the old page is held for the new one's first pictures. */
export const STILL_WAIT_MS = 350
/** The longest the new page is waited for at all, after which the copy goes whatever has happened. */
export const STILL_ARRIVE_MS = 1500
export const STILL_ATTR = "data-canvas-still"

const frame = (cb: () => void) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => cb()) : setTimeout(cb, 16))

/** The pictures the new page shows on its first screen and has not decoded yet. */
function firstScreenPictures(root: HTMLElement): HTMLImageElement[] {
  const box = root.getBoundingClientRect()
  return Array.from(root.querySelectorAll("img")).filter((img) => {
    if (img.complete && img.naturalWidth > 0) return false
    if (!img.currentSrc && !img.src) return false
    const r = img.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && r.bottom > box.top && r.top < box.bottom
  })
}

/**
 * Copy the canvas (`#wb-preview-root`) over itself, then fade the copy off
 * once `arrived()` says the new page is in and its first pictures have
 * decoded (or STILL_WAIT_MS has passed). Call it in the same task as the
 * state change that puts the new page in. Returns a function that takes the
 * copy away at once. Does nothing under reduced motion, with no canvas, or
 * while another copy is up.
 */
export function holdCanvasStill(arrived: () => boolean, rootId = "wb-preview-root"): () => void {
  const nothing = () => {}
  if (typeof document === "undefined" || typeof window === "undefined") return nothing
  const root = document.getElementById(rootId)
  const host = root?.parentElement
  if (!root || !host) return nothing
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return nothing
  if (host.querySelector(`[${STILL_ATTR}]`)) return nothing
  if (root.clientWidth < 1 || root.clientHeight < 1) return nothing

  const copy = copyFor(root)
  copy.setAttribute(STILL_ATTR, "")
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  /* Over the canvas, exactly where it is, scrolled where it was; it presses nothing and is never a second scroller anyone can reach. */
  copy.style.cssText += `;position:absolute;left:${root.offsetLeft}px;top:${root.offsetTop}px;width:${root.offsetWidth}px;height:${root.offsetHeight}px;margin:0;z-index:30;overflow:hidden;pointer-events:none;will-change:opacity`
  host.append(copy)
  copyLiveState(root, copy)
  copy.scrollTop = root.scrollTop

  let over = false
  const done = () => {
    if (over) return
    over = true
    window.clearTimeout(cap)
    copy.remove()
  }
  /* Whatever happens to the page it was taken for, the copy never outlives this. */
  const cap = window.setTimeout(done, STILL_ARRIVE_MS + STILL_WAIT_MS + STILL_FADE_MS + 200)

  let fading = false
  const fade = () => {
    if (over || fading) return
    fading = true
    try {
      copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: STILL_FADE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }).finished.then(done, done)
    } catch {
      done()
    }
  }
  const started = Date.now()
  const waitForPage = () => {
    if (over) return
    if (!arrived() && Date.now() - started < STILL_ARRIVE_MS) return void frame(waitForPage)
    /* One more frame, so the page that arrived has been laid out and its pictures asked for. */
    frame(() => {
      const pending = firstScreenPictures(root)
      if (!pending.length) return fade()
      let timer = 0
      const go = () => {
        window.clearTimeout(timer)
        fade()
      }
      timer = window.setTimeout(go, STILL_WAIT_MS)
      void Promise.all(pending.map((img) => img.decode().catch(() => undefined))).then(go)
    })
  }
  frame(waitForPage)
  return done
}
