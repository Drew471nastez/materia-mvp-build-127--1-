"use client"

/**
 * ===========================================================================
 *  THE FIELD BEING TYPED IN STAYS IN SIGHT (round 9)
 * ===========================================================================
 * A phone's editor screen and the post's sheet are sized to the part of the
 * screen the keyboard leaves (--vv-h and --vv-top from components/viewport-
 * vars.tsx, or --kb-inset for a sheet sitting on the keyboard). By the time
 * the visible part changes (a keyboard opening or closing, Safari panning
 * the page under it) they have already been resized; what is left is the
 * field itself, which may now be under the toolbar or the sheet's edge. Its
 * box (the comment box around a comment's field, say) is scrolled back into
 * the part of its scroller that can be seen, its bottom edge first, since
 * that is where the caret is while typing.
 *
 * Listens to visualViewport's resize and scroll, ViewportVars' own keyboard
 * event (its estimate for a webview that reports nothing) and focus moving,
 * once a frame at most, and only while `active`.
 */
import { useEffect, useRef } from "react"
import { KEYBOARD_CHANGE_EVENT } from "@/lib/ui/keyboard-safe-sheet"

/** Room kept between the field and the scroller's edge. */
const PAD = 12

export function keepFieldInSight(box: HTMLElement): void {
  const el = document.activeElement as HTMLElement | null
  if (!el || !box.contains(el) || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return
  const target = (el.closest("[data-keep-in-sight]") as HTMLElement | null) ?? el
  const b = box.getBoundingClientRect()
  const r = target.getBoundingClientRect()
  if (r.bottom > b.bottom - PAD) box.scrollTop += Math.min(r.bottom - (b.bottom - PAD), r.top - (b.top + PAD))
  else if (r.top < b.top + PAD) box.scrollTop -= b.top + PAD - r.top
}

export function useKeepFieldInSight(active: boolean, scroller: () => HTMLElement | null): void {
  const get = useRef(scroller)
  useEffect(() => {
    get.current = scroller
  })
  useEffect(() => {
    if (!active) return
    let raf = 0
    let later = 0
    const now = () => {
      const box = get.current()
      if (box) keepFieldInSight(box)
    }
    const keep = () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(later)
      raf = requestAnimationFrame(now)
      /* Again once a sheet riding up on the keyboard (a 250ms move, bottom-sheet.tsx) has arrived. */
      later = window.setTimeout(now, 300)
    }
    const vv = window.visualViewport
    vv?.addEventListener("resize", keep)
    vv?.addEventListener("scroll", keep)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, keep)
    document.addEventListener("focusin", keep)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(later)
      vv?.removeEventListener("resize", keep)
      vv?.removeEventListener("scroll", keep)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, keep)
      document.removeEventListener("focusin", keep)
    }
  }, [active])
}
