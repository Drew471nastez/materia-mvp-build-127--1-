"use client"

import { useEffect } from "react"
import { superviseDocumentLocks, unblockInertOverlay } from "@/lib/website-builder/stuck-layer"

/**
 * ===========================================================================
 *  NOBODY SHOULD EVER HAVE TO RELOAD THIS APP TO GET IT MOVING AGAIN
 * ===========================================================================
 * Mounted once, at the root, for every page. It watches for the document
 * being held still by a modal that is no longer there and takes the lock
 * back — see `lib/website-builder/stuck-layer.ts` for what strands it and
 * why fixing it at the call sites is not possible.
 *
 * It is at the root rather than in the builder because the fault is in a
 * library every screen uses. The builder is only where it was noticed, and
 * where the panels mount and unmount often enough to hit it daily.
 *
 * Costs nothing when nothing is wrong: the observer is two elements' own
 * attributes, and every path reads two inline properties before it does
 * anything else.
 */
export function StuckLayerGuard() {
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return
    return superviseDocumentLocks(document, {
      timers: window,
      observe: (onChange) => {
        const mo = new MutationObserver(onChange)
        const opts = { attributes: true, attributeFilter: ["style", "class", "data-scroll-locked"] }
        mo.observe(document.documentElement, opts)
        mo.observe(document.body, opts)
        return () => mo.disconnect()
      },
      onCleared: (what) => {
        /**
         * The page may have been drawn while it could not be scrolled, so
         * anything that measured the viewport measured it wrong. A resize is
         * what every one of those listeners is already waiting for.
         */
        window.dispatchEvent(new Event("resize"))
        if (process.env.NODE_ENV !== "production") {
          console.warn("[stuck-layer] took back an abandoned document lock:", what.join(", "))
        }
      },
    })
  }, [])

  /**
   * AND THE PRESS THAT LANDS ON SOMETHING INVISIBLE.
   *
   * A document lock is not the only way to block a screen: a full-screen
   * layer that outlives its reason does it just as completely and looks like
   * nothing at all. This asks the one question that has an obvious answer —
   * did this press land on something nobody can see? — and takes that thing
   * out of the way when it did.
   *
   * Capture, so it runs before anything can stop the event travelling, and
   * passive, so it can never delay a press that was going to work.
   */
  useEffect(() => {
    const onPress = (e: PointerEvent | TouchEvent) => {
      const p = "touches" in e ? e.touches[0] : e
      if (!p) return
      const what = unblockInertOverlay(document, p.clientX, p.clientY)
      if (!what) return
      window.dispatchEvent(new Event("resize"))
      if (process.env.NODE_ENV !== "production") {
        console.warn("[stuck-layer] moved an invisible layer out of the way:", what)
      }
    }
    const opts = { passive: true, capture: true } as const
    document.addEventListener("pointerdown", onPress as EventListener, opts)
    document.addEventListener("touchstart", onPress as EventListener, opts)
    return () => {
      document.removeEventListener("pointerdown", onPress as EventListener, { capture: true })
      document.removeEventListener("touchstart", onPress as EventListener, { capture: true })
    }
  }, [])

  /**
   * AND A CLASS ON <html> THAT OUTLIVED THE SCREEN THAT SET IT (round 11).
   * "When I'm exiting the OnePage editor and I go back to the app [...]
   * there's a gray container showing and cutting things off in the entire
   * app." The editor marks <html> (`with-op-editor`, components/platform/
   * html-class) so that under 768px the shell's black header and its tab
   * pill are not painted; the server's HTML sets it with a one line script
   * before the editor hydrates. A way out before that hydration, or any path
   * that never runs the editor's cleanup, left it on: every /app page after
   * it drawn with no header and no pill, its grey page cut off at the top.
   * A class that says "this element is on the page" is only true while the
   * element is, so it is checked whenever <html>'s classes change and while
   * it is on, and taken off when its element is gone.
   */
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return
    const html = document.documentElement
    const HELD: ReadonlyArray<readonly [string, string]> = [["with-op-editor", "[data-onepage-editor]"]]
    let timer = 0
    const check = () => {
      let any = false
      for (const [name, sel] of HELD) {
        if (!html.classList.contains(name)) continue
        if (document.querySelector(sel)) any = true
        else html.classList.remove(name)
      }
      window.clearInterval(timer)
      timer = any ? window.setInterval(check, 1500) : 0
    }
    const mo = new MutationObserver(check)
    mo.observe(html, { attributes: true, attributeFilter: ["class"] })
    window.addEventListener("pageshow", check)
    window.addEventListener("popstate", check)
    check()
    return () => {
      mo.disconnect()
      window.clearInterval(timer)
      window.removeEventListener("pageshow", check)
      window.removeEventListener("popstate", check)
    }
  }, [])

  return null
}
