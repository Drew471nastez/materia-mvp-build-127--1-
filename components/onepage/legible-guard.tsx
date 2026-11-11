"use client"

/**
 * ===========================================================================
 *  THE LEGIBILITY GUARD, ON THE LIVE ONEPAGE (wave 10)
 * ===========================================================================
 * lib/onepage/legible guardLegibility, run over the whole document a OnePage
 * is (the published page, the editor's preview frame, and every sheet it opens
 * in a portal: product, share, subscribe, contact, a block's own sheet):
 *
 *   - before the first paint after hydration (a layout effect), so a word the
 *     theme would draw unreadable is never seen that way once the page runs;
 *   - again on the next frame whenever the document changes (a sheet opens, a
 *     form says thank you, the editor sends a new colour or theme to the
 *     preview), once the fonts are in, and when the width crosses a layout;
 *   - its own writes are not changes: the observer is paused while it writes.
 *
 * It measures what the browser actually painted, so it does not need to know
 * any theme, skin or block by name: a theme added tomorrow is covered too.
 */
import * as React from "react"
import { guardLegibility, LEGIBLE_CSS, PRESSED_LOOK, settleGuard } from "@/lib/onepage/legible"
import { honourOwnStyles } from "@/lib/onepage/skin-own"

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

export function LegibleGuard({ look }: { look?: string } = {}) {
  const runNow = React.useRef<(() => void) | null>(null)
  /*
    A NEW LOOK IS MEASURED BEFORE IT IS PAINTED. A theme sent to the editor's preview used to be painted once as the
    theme drew it and corrected on the next frame (a skin's light window under the theme's white words, then dark
    words: two changes where there should be one). `look` is the page's fingerprint (components/onepage/look-still):
    when it changes, the pass runs in this commit's layout phase, before the browser paints the new look.
  */
  const firstLook = React.useRef(look)
  useIsoLayoutEffect(() => {
    if (look === firstLook.current) return
    firstLook.current = look
    runNow.current?.()
  }, [look])
  useIsoLayoutEffect(() => {
    if (typeof document === "undefined" || !document.body) return
    /* A probe's "before" picture (scripts/check-onepage-legible-w10.mjs ?guard=0) turns it off; nothing else does. */
    if ((window as unknown as { __ONEPAGE_LEGIBLE_OFF?: boolean }).__ONEPAGE_LEGIBLE_OFF) return
    let frame = 0
    let observer: MutationObserver | null = null
    const observe = () =>
      observer?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "data-state", "data-open", "open", "inert", "value", "placeholder"] })
    const run = () => {
      frame = 0
      observer?.disconnect()
      /*
        ONE PASS, NOTHING ANIMATES (the owner: buttons that "flash and change colours on their own"). Each pass takes
        back what the last one set, measures, and sets it again. A button transitions its colour (.op-btn, a block's
        transition-colors), so taking a colour back STARTED a transition toward the unreadable one; the pass then
        measured the first frame of it (still the readable colour), found nothing wrong, and let it run to the
        unreadable colour. Its transitionend ran the guard again, which set the colour back, which transitioned...
        a button flashing between two colours for as long as the page was open. While the pass runs, every
        transition of a box it touches is off (lib/onepage/legible GUARD_TOUCH); the browser works the styles out
        once with the result in place before that is lifted, so lifting it starts nothing either.
      */
      try {
        /* The creator's own design over a skin first (lib/onepage/skin-own), then the words on what that leaves. */
        honourOwnStyles(document.body)
        guardLegibility(document.body)
      } catch {
        /* Never let a measurement break the page. */
      }
      void document.documentElement.offsetWidth
      settleGuard(document.body)
      observer?.takeRecords()
      observe()
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(run)
    }
    /*
      A box added or removed, a class, a sheet's state: measured on the next frame. Only inline styles changing (a
      carousel's dot riding the scroll, a sheet following the thumb, a drag) is motion, not a new look: measured once
      it has rested for 250ms, so the guard never runs frame after frame.
    */
    let rest = 0
    const settle = () => {
      window.clearTimeout(rest)
      rest = window.setTimeout(soon, 250)
    }
    observer = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList" || r.attributeName !== "style")) soon()
      else settle()
    })
    runNow.current = () => {
      if (frame) cancelAnimationFrame(frame)
      run()
    }
    run()
    /* Sheets rise, cards fade in, transitions settle: once more after they do. */
    const late = window.setTimeout(soon, 450)
    document.fonts?.ready.then(soon).catch(() => {})
    /* A sheet's rise or a card's fade ends without a change to the document: measure once it has (big boxes only, not every hover). */
    const settled = (e: Event) => {
      const t = e.target as Element | null
      /* A button's hover has ended (its words were held as they were while the pointer was on it: lib/onepage/legible HELD). */
      if (t && (t.getBoundingClientRect().width >= 200 || t.matches(PRESSED_LOOK))) soon()
    }
    /*
      A block under content-visibility: auto is not drawn (nor measured) off screen. When it comes into view the
      browser says so before it paints it: measure in a microtask, so it is never painted unreadable for a frame.
    */
    let queued = false
    const now = () => {
      if (queued) return
      queued = true
      queueMicrotask(() => {
        queued = false
        if (frame) cancelAnimationFrame(frame)
        run()
      })
    }
    window.addEventListener("resize", soon)
    document.addEventListener("contentvisibilityautostatechange", now, true)
    document.addEventListener("input", soon, true)
    document.addEventListener("transitionend", settled, true)
    document.addEventListener("animationend", settled, true)
    return () => {
      runNow.current = null
      observer?.disconnect()
      observer = null
      if (frame) cancelAnimationFrame(frame)
      window.clearTimeout(late)
      window.clearTimeout(rest)
      window.removeEventListener("resize", soon)
      document.removeEventListener("contentvisibilityautostatechange", now, true)
      document.removeEventListener("input", soon, true)
      document.removeEventListener("transitionend", settled, true)
      document.removeEventListener("animationend", settled, true)
    }
  }, [])
  return <style data-legible-css="" dangerouslySetInnerHTML={{ __html: LEGIBLE_CSS }} />
}
