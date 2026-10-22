"use client"

/**
 * ===========================================================================
 *  ANOTHER PAGE IN THE BUILDER: THE OLD ONE STAYS UNTIL THE NEW ONE IS DRAWN
 * ===========================================================================
 * "The white flash when you switch pages inside the builder." Filmed again:
 * the canvas went blank white for a frame, then both pages at once, the one
 * being left showing through the one arriving.
 *
 * That is a cross fade. The new page was faded up from a third of its
 * strength over the canvas's white, and the copy of the old page was faded
 * off it at the same time. Wherever the two differed, both were on screen,
 * and wherever both were faint the white showed through.
 *
 * The live site does not do that (lib/website-builder/live-navigation.ts).
 * The page being left stays exactly as it is until the next one can be
 * drawn, its first pictures included, and then the next one is shown whole,
 * in one frame. The same here.
 *
 * The browser's view transition is the picture of the page being left: it is
 * taken before anything changes, so it cannot be a blank clone, and the
 * screen keeps it while the next page is put in and its first pictures
 * decode. The group's animation is none (app/globals.css, data-canvas-swap),
 * so the handover is the cut, not a dissolve.
 *
 * A browser without that takes a copy instead, into CanvasStillHost, which
 * the editor renders and then leaves alone. The copy stays opaque and is
 * taken away in one frame when the next page is ready. It is never faded.
 */
import { createElement, memo } from "react"
import { flushSync } from "react-dom"
import { copyFor, copyLiveState } from "@/lib/navigation/leaving-still"

/** The longest the old page is held for the new one's first pictures. */
export const STILL_WAIT_MS = 350
/** The longest a fallback copy is kept at all, after which it goes whatever has happened. */
export const STILL_ARRIVE_MS = 1500
export const STILL_ATTR = "data-canvas-still"
const HOST_ATTR = "data-canvas-still-host"
const SWAP_ATTR = "data-canvas-swap"

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

/**
 * The slot the fallback copy is laid in. Rendered once, with no props, so a
 * page change does not reconcile it: a copy put here stays until it is taken
 * away. It covers the canvas and presses nothing.
 */
export const CanvasStillHost = memo(function CanvasStillHost() {
  return createElement("div", { "data-canvas-still-host": "", "aria-hidden": "true", className: "pointer-events-none absolute inset-0 z-[30]" })
})

/** The pictures on the new page's first screen. */
function firstScreenImages(root: HTMLElement): HTMLImageElement[] {
  const box = root.getBoundingClientRect()
  return Array.from(root.querySelectorAll("img")).filter((img) => {
    if (!img.currentSrc && !img.src) return false
    const r = img.getBoundingClientRect()
    return r.width > 1 && r.height > 1 && r.bottom > box.top + 1 && r.top < box.bottom - 1
  })
}

/**
 * The new page's first pictures, decoded, and marked shown. The theme hides a
 * picture until it is marked (data-sl-loaded), which on a page that just
 * arrived is a white box. One that is already decoded is marked at once, so
 * the frame that shows the page shows its pictures too.
 */
export function settleFirstPictures(root: HTMLElement | null): Promise<void> {
  if (!root) return Promise.resolve()
  const imgs = firstScreenImages(root)
  const pending = imgs.filter((img) => !(img.complete && img.naturalWidth > 0))
  const mark = () => {
    for (const img of imgs) if (img.complete && img.naturalWidth > 0) img.setAttribute("data-sl-loaded", "")
    /* Laid out with the pictures in, so the frame that shows the page is that layout. */
    root.getBoundingClientRect()
  }
  if (!pending.length) {
    mark()
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      mark()
      resolve()
    }
    window.setTimeout(finish, STILL_WAIT_MS)
    void Promise.all(pending.map((img) => img.decode().catch(() => undefined))).then(finish)
  })
}

/** A copy of the canvas, opaque, over it. Taken away by the function returned, in one frame. */
function holdCover(root: HTMLElement): () => void {
  const nothing = () => {}
  const host = root.parentElement?.querySelector(`[${HOST_ATTR}]`)
  if (!host) return nothing
  if (host.querySelector(`[${STILL_ATTR}]`)) return nothing
  if (root.clientWidth < 1 || root.clientHeight < 1) return nothing
  const copy = copyFor(root)
  copy.setAttribute(STILL_ATTR, "")
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  copy.style.cssText += ";position:absolute;inset:0;width:100%;height:100%;margin:0;overflow:hidden;pointer-events:none"
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
  const cap = window.setTimeout(done, STILL_ARRIVE_MS + STILL_WAIT_MS + 200)
  return done
}

let swaps = 0

/**
 * Put the next page on the canvas. The page on screen stays, whole, until the
 * next one is in and its first pictures have decoded, and then the next one
 * replaces it in one frame. `apply` is the state change that puts the next
 * page in. Call it when that page's sections are already in hand.
 */
export function swapCanvasPage(apply: () => void): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    apply()
    return
  }
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  const root = document.getElementById("wb-preview-root")
  const start = (document as ViewTransitionDocument).startViewTransition?.bind(document)
  if (!root || reduced || !start) {
    const release = root && !reduced ? holdCover(root) : () => {}
    flushSync(apply)
    void settleFirstPictures(document.getElementById("wb-preview-root")).then(release)
    return
  }
  const mine = ++swaps
  const html = document.documentElement
  html.setAttribute(SWAP_ATTR, "")
  const clear = () => {
    if (mine === swaps) html.removeAttribute(SWAP_ATTR)
  }
  try {
    const move = start(() => {
      flushSync(apply)
      return settleFirstPictures(document.getElementById("wb-preview-root"))
    })
    move.finished.then(clear, clear)
  } catch {
    clear()
    flushSync(apply)
  }
}
