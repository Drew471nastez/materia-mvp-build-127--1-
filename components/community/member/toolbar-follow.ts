"use client"

/**
 * ===========================================================================
 *  THE COMPOSER'S TOOLBAR GOES DOWN WITH THE KEYS (round 27, I7)
 * ===========================================================================
 * The owner, on a phone: the bar with attach, emoji and GIF should go
 * "smoothly back down" when the keyboard closes. The sheet lifts its content
 * by the keyboard's room (mobile-editor-sheet.tsx, keyboard "sheet") and
 * drops that room in one frame when it learns the keys have gone. Two things
 * made that a jump, or a bar left behind for a moment:
 *
 *   DONE LETS GO OF THE FIELD at once, but iOS reports the visible part only
 *   once the keys are down, a quarter second later. The bar waited for the
 *   report and then fell the whole keyboard in one frame. Now, when the field
 *   lets go and nothing that types takes the focus, the bar starts down with
 *   the keys on their own curve (a move on the compositor, held at its end),
 *   and the report that follows only confirms where it already is.
 *
 *   A REPORT THAT ARRIVES AFTER THE KEYS (the caret kept, Android's back,
 *   the app's plugin): the room goes in one layout, and the bar is carried
 *   from where it was drawn to its new place (FLIP on `translate`), so it
 *   slides down instead of jumping.
 *
 * Only downward moves are carried. Going up, the room is made in the focus
 * itself before the keys rise (visible-box.ts sheetKeyboardRoom), which is
 * what keeps iOS from panning, and that is left exactly as it is.
 */
import { useEffect } from "react"
import { RESIZED_MIN_PX } from "./keyboard-plan"
import { takesKeyboard } from "./visible-box"

/** iOS's keyboard, near enough: its time and its curve. */
export const KEYS_MS = 250
export const KEYS_EASE = "cubic-bezier(0.38, 0.7, 0.125, 1)"

/** How far an element is drawn from where it is laid out, by its own `translate` (a running move's). */
function drawnShift(el: HTMLElement): number {
  const t = getComputedStyle(el).translate
  if (!t || t === "none") return 0
  const y = Number.parseFloat(t.split(" ")[1] ?? "0")
  return Number.isFinite(y) ? y : 0
}

/** The home indicator's strip, which the sheet keeps under its content once the keys have gone. */
let safeProbe: HTMLElement | null = null
function safeBottom(): number {
  if (!safeProbe || !safeProbe.isConnected) {
    safeProbe = document.createElement("div")
    safeProbe.setAttribute("aria-hidden", "true")
    safeProbe.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none"
    document.body.appendChild(safeProbe)
  }
  return safeProbe.getBoundingClientRect().height
}

export function useToolbarFollowsKeys(active: boolean, bar: () => HTMLElement | null, scope: () => HTMLElement | null): void {
  useEffect(() => {
    if (!active) return
    const host = scope()
    const first = bar()
    if (!host || !first || typeof first.animate !== "function" || typeof ResizeObserver === "undefined") return
    const still = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    let run: Animation | null = null
    let runEnds = 0
    /* Where the bar's foot was last laid out on the screen (its own move taken off), and where it lands with no keys. */
    let placed: number | null = null
    let foot = 0
    const stop = () => {
      run?.cancel()
      run = null
    }

    /*
      THE LAYOUT MOVED IT. Read in the observer, where the layout is already done (nothing forced), before the frame is
      painted: carried from where it was drawn to its new place, downward only. Whatever the bar is drawn at when the
      layout catches up with it (Done's move, held at its end) becomes its place and the move ends there.
    */
    const ro = new ResizeObserver(() => {
      const el = bar()
      if (!el) return
      const shift = run ? drawnShift(el) : 0
      const now = el.getBoundingClientRect().bottom - shift
      const probe = document.querySelector<HTMLElement>("[data-viewport-probe]")
      foot = (probe?.offsetHeight || window.innerHeight) - safeBottom()
      const was = placed
      placed = now
      if (was === null) return
      const from = was + shift - now
      if (Math.abs(from) < 1 || (from > 0 && !run) || still()) return stop()
      stop()
      const left = Math.max(120, Math.round(runEnds - performance.now()))
      run = el.animate([{ translate: `0 ${from}px` }, { translate: "0 0" }], { duration: from < -RESIZED_MIN_PX ? KEYS_MS : left, easing: KEYS_EASE })
      runEnds = performance.now() + KEYS_MS
      const mine = run
      mine.onfinish = () => {
        if (run === mine) run = null
      }
    })
    /* The room comes and goes as the sheet's padding, its height, or both: its content box and its own box are watched. */
    ro.observe(host)
    const sheetBox = host.closest<HTMLElement>("[data-mobile-bottom-sheet]")
    if (sheetBox) ro.observe(sheetBox, { box: "border-box" })

    /*
      DONE: the field let go and nothing that types is taking the focus (relatedTarget says which, in the event itself). The
      keys are going now, so the bar starts down now, from the numbers the observer kept: nothing is read off the page here,
      where a blur has just made every style stale.
    */
    const onFocusOut = (e: FocusEvent) => {
      if (!(e.target instanceof Node) || !scope()?.contains(e.target) || !takesKeyboard(e.target as Element)) return
      if (takesKeyboard(e.relatedTarget as Element | null) || still() || placed === null) return
      const el = bar()
      const gap = Math.round(foot - placed)
      if (!el || gap <= RESIZED_MIN_PX) return
      stop()
      run = el.animate([{ translate: "0 0" }, { translate: `0 ${gap}px` }], { duration: KEYS_MS, easing: KEYS_EASE, fill: "forwards" })
      runEnds = performance.now() + KEYS_MS
    }
    /* A field anywhere takes the caret: the keys stay or come back, the bar goes where the sheet puts it. */
    const onFocusIn = (e: FocusEvent) => {
      if (takesKeyboard(e.target as Element | null)) stop()
    }
    document.addEventListener("focusout", onFocusOut, true)
    document.addEventListener("focusin", onFocusIn, true)
    return () => {
      ro.disconnect()
      stop()
      document.removeEventListener("focusout", onFocusOut, true)
      document.removeEventListener("focusin", onFocusIn, true)
    }
  }, [active, bar, scope])
}
