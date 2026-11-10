"use client"

/**
 * ===========================================================================
 *  A PRESS YOU CAN FEEL, ON EVERY BUTTON OF A OnePage (round AR)
 * ===========================================================================
 * The owner: "when I click on a button it should actually feel like I
 * clicked it, when I touch or click". The page's buttons answered a mouse's
 * hover and, on a computer only, sank by 1.5% when held; a finger got
 * nothing at all.
 *
 * Now one rule for all of them (app/globals.css, html[data-op-press]): the
 * thing pressed sinks a little at once (scale, and a touch of opacity), in
 * 70ms, and springs back over 220ms when let go. It is set from pointerdown
 * through a data attribute rather than left to :active, because a phone's
 * browser holds :active back for a moment to see whether the finger is
 * about to scroll, which is the very delay that makes a tap feel dead. A
 * finger that starts to scroll (pointercancel), or moves off, lets go. The
 * action itself is never held back: the click lands exactly as before.
 *
 * Applied once, for the page and every sheet over it, by marking <html>
 * while a OnePage is drawn. Fields, embeds and anything marked
 * data-no-press are left alone.
 */
import { useEffect } from "react"
import { NOT_PRESSABLE, PRESSABLE } from "@/lib/onepage/feel"

const ATTR = "data-op-pressing"
/* Set for the spring back, so it eases out on its own curve whatever the element's own transitions are. */
const LETGO = "data-op-letgo"
const LETGO_MS = 240
/* A finger that travels this far is scrolling, not pressing. */
const SLOP_PX = 10

export function usePressFeel(): void {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-op-press", "")
    let pressed: Element | null = null
    let x = 0
    let y = 0
    const timers = new Map<Element, number>()
    const release = () => {
      const el = pressed
      pressed = null
      if (!el) return
      el.removeAttribute(ATTR)
      el.setAttribute(LETGO, "")
      window.clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => {
          el.removeAttribute(LETGO)
          timers.delete(el)
        }, LETGO_MS),
      )
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary) return
      const t = e.target instanceof Element ? e.target : null
      if (!t || t.closest(NOT_PRESSABLE)) return
      const el = t.closest(PRESSABLE)
      if (!el) return
      release()
      window.clearTimeout(timers.get(el))
      el.removeAttribute(LETGO)
      pressed = el
      x = e.clientX
      y = e.clientY
      /* A big card (a product, a picture) sinks less than a button: the same feel, not a lurch. */
      el.setAttribute(ATTR, el.getBoundingClientRect().height > 120 ? "soft" : "")
    }
    const onMove = (e: PointerEvent) => {
      if (pressed && Math.hypot(e.clientX - x, e.clientY - y) > SLOP_PX) release()
    }
    /* iOS gives :active only to a document that listens for touches; the attribute does the work, this keeps both in step. */
    const noop = () => {}
    const opts = { passive: true, capture: true } as const
    document.addEventListener("pointerdown", onDown, opts)
    document.addEventListener("pointermove", onMove, opts)
    document.addEventListener("pointerup", release, opts)
    document.addEventListener("pointercancel", release, opts)
    document.addEventListener("touchstart", noop, opts)
    window.addEventListener("blur", release)
    return () => {
      release()
      for (const [el, t] of timers) {
        window.clearTimeout(t)
        el.removeAttribute(LETGO)
      }
      root.removeAttribute("data-op-press")
      document.removeEventListener("pointerdown", onDown, opts)
      document.removeEventListener("pointermove", onMove, opts)
      document.removeEventListener("pointerup", release, opts)
      document.removeEventListener("pointercancel", release, opts)
      document.removeEventListener("touchstart", noop, opts)
      window.removeEventListener("blur", release)
    }
  }, [])
}
