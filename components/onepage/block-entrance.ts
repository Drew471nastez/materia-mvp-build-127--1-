"use client"

/**
 * ===========================================================================
 *  EACH BLOCK ARRIVES ONCE, WHERE IT CAN BE SEEN
 * ===========================================================================
 * The owner: "block entrance animations don't work in the editor preview or
 * on the live page". They ran, on a clock, where nobody saw them:
 *
 *   the live page  every block faded in 50ms after the one before it from
 *                  the first paint, so the blocks below the first screen
 *                  had arrived long before anyone scrolled to them.
 *   the preview    the editor keeps its frame hidden until the page and its
 *                  fonts are in ("drawn", up to 1.2s), and the whole
 *                  entrance played behind it.
 *
 * Now the first screen keeps its fade from the first paint (the server's
 * markup carries it, so it needs no script and nothing is hidden waiting for
 * one), and a block that is off screen when the page starts waits for its
 * turn: it is hidden while it is still out of sight, so no one sees it go,
 * and fades up as it comes into view. In the editor's preview the frame is
 * hidden at the start, so every block waits, and the first screen comes in
 * once the editor shows the frame (preview-document's "drawn"). Under reduced
 * motion nothing waits and nothing moves (app/globals.css).
 *
 * Only opacity and `translate` move, on the block's own box, and the box is
 * marked done when it ends, so nothing replays.
 */
import { useLayoutEffect } from "react"
import { isOnePagePreview } from "@/lib/onepage/preview-notice"

/** Said on the preview's window once the editor shows its frame (components/onepage/preview-document). */
export const PREVIEW_SHOWN_EVENT = "onepage-preview-shown"

/** How far apart the blocks of one screen arrive. */
export const ENTER_STAGGER_MS = 50
/** The most a block waits behind the ones before it, however many share its screen. */
export const ENTER_STAGGER_MAX_MS = 400

const ATTR = "data-op-enter"

function reducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

function inView(el: Element): boolean {
  const r = el.getBoundingClientRect()
  return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight) && r.width > 0
}

/** Starts a block's entrance now, `delay` ms from now, and lets it go when it ends. */
function enter(el: HTMLElement, delay: number): void {
  el.style.setProperty("--op-enter-delay", `${delay}ms`)
  el.setAttribute(ATTR, "in")
  const done = (e: AnimationEvent) => {
    if (e.target !== el) return
    el.removeEventListener("animationend", done)
    /* "done", not gone: the server's first-screen fade (animate-in) is still on the box until the page lets it go, and would play again. */
    el.setAttribute(ATTR, "done")
    el.style.removeProperty("--op-enter-delay")
  }
  el.addEventListener("animationend", done)
}

/**
 * Runs once per page mount. Every block box drawn with the first screen's fade (`data-onepage-enter`) is either
 * left to it (live, in view) or held until it is seen.
 */
export function useBlockEntrance(): void {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || reducedMotion() || typeof IntersectionObserver === "undefined") return
    const boxes = [...document.querySelectorAll<HTMLElement>(".onepage-live [data-onepage-enter]")].filter((el) => el.getClientRects().length > 0)
    if (!boxes.length) return
    const preview = isOnePagePreview()
    const waiting = new Set<HTMLElement>()
    for (const el of boxes) {
      if (!preview && inView(el)) continue
      el.setAttribute(ATTR, "wait")
      waiting.add(el)
    }
    if (!waiting.size) return
    /* Those that come into sight together arrive one after another, as the first screen does. */
    let batch: HTMLElement[] = []
    let flush = 0
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const el = e.target as HTMLElement
          io.unobserve(el)
          if (!waiting.delete(el)) continue
          batch.push(el)
        }
        if (batch.length && !flush)
          flush = requestAnimationFrame(() => {
            flush = 0
            batch.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
            batch.forEach((el, i) => enter(el, Math.min(i * ENTER_STAGGER_MS, ENTER_STAGGER_MAX_MS)))
            batch = []
          })
      },
      { rootMargin: "0px 0px 24px 0px" },
    )
    const watch = () => waiting.forEach((el) => io.observe(el))
    /* In the preview, nothing starts until the editor shows the frame (or a moment has passed, if it never says). */
    let fallback = 0
    const shown = () => {
      window.clearTimeout(fallback)
      window.removeEventListener(PREVIEW_SHOWN_EVENT, shown)
      watch()
    }
    if (preview && !(window as Window & { __onepagePreviewShown?: boolean }).__onepagePreviewShown) {
      window.addEventListener(PREVIEW_SHOWN_EVENT, shown)
      fallback = window.setTimeout(shown, 1600)
    } else watch()
    return () => {
      io.disconnect()
      window.clearTimeout(fallback)
      window.removeEventListener(PREVIEW_SHOWN_EVENT, shown)
      if (flush) cancelAnimationFrame(flush)
      for (const el of waiting) el.removeAttribute(ATTR)
    }
  }, [])
}
