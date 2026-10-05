"use client"

import { useEffect } from "react"

import {
  KEYBOARD_CHANGE_EVENT,
  KEYBOARD_ESTIMATE_DELAY_MS,
  estimatedKeyboardInset,
  keyboardInsetFrom,
  needsKeyboardEstimate,
} from "@/lib/ui/keyboard-safe-sheet"

/**
 * Publishes the VISIBLE viewport — the one the keyboard leaves you — on <html>.
 *
 *   --vv-h       height of what is actually on screen
 *   --vv-top     how far the layout viewport has been scrolled out from under it
 *   --kb-inset   how much is hidden BELOW it, which is the keyboard
 *   data-keyboard="open" when something is eating a serious share of the screen
 *
 * This lived inside the conversation, which was the bug rather than the design.
 * A route with a loading boundary paints its skeleton first and the real screen
 * second, and only the second one had the effect — so the skeleton sized itself
 * from the fallback (`100dvh`) and the real thread from visualViewport, and any
 * difference between those two numbers was a jump at the exact moment of the
 * handover. On a phone with a keyboard open, or a browser with a collapsing
 * toolbar, that difference is not small.
 *
 * Published once, from the root, it is the same number for both. The skeleton
 * and the screen that replaces it are then the same box to the pixel, which is
 * the whole trick to a swap you cannot see.
 *
 * Costs one listener for the life of the tab and writes only when a value
 * actually changes, so nothing downstream is invalidated by a scroll that
 * happened to fire.
 */
export function ViewportVars() {
  useEffect(() => {
    const root = document.documentElement
    const vv = window.visualViewport
    let lastH = -1
    let lastTop = -1
    let lastInset = -1
    let lastKb: boolean | null = null
    let settleTimer = 0
    /*
      THE FLOOR, when the platform will not say. See keyboard-safe-sheet.ts:
      a WKWebView without the keyboard plugin draws the keys over the page and
      reports nothing, so `inset` below comes out 0 with the keyboard up and
      every sheet reading it sits underneath. While this is non-zero it stands
      in for the measurement, and a real measurement always replaces it.
    */
    let estimate = 0
    let layoutAtFocus = -1
    let estimateTimer = 0

    /*
      THE PROBE. A fixed element's height IS the box fixed elements are laid
      out against, on every platform, which innerHeight is not: see
      keyboardInsetFrom. Zero width, hidden, no pointer events, and read only
      on the events already handled here.
    */
    const probe = document.createElement("div")
    probe.setAttribute("aria-hidden", "true")
    probe.setAttribute("data-viewport-probe", "")
    probe.style.cssText = "position:fixed;top:0;bottom:0;left:0;width:0;pointer-events:none;visibility:hidden;contain:strict"
    document.body.appendChild(probe)
    const layoutHeight = () => Math.round(probe.getBoundingClientRect().height) || window.innerHeight

    /**
     * ===================================================================
     *  THE KEYBOARD CLOSING IS ONE STEP, NOT A MOVEMENT
     * ===================================================================
     * iOS animates the keyboard down over about a quarter of a second and
     * then reports the new viewport ONCE, at the end. So everything sized
     * from `--vv-h` — the conversation shell, its composer, the messages
     * above it — is correct, then correct at a different size, with nothing
     * in between. That single step is the bump: the layout is never wrong,
     * it just arrives in one frame.
     *
     * There is nothing to interpolate here, because the intermediate sizes
     * were never reported. What can be done is let CSS carry the change:
     * a class is put on <html> for the length of the settle, and the shell
     * transitions its geometry only while it is there.
     *
     * ONLY FOR A JUMP. A collapsing browser toolbar is sixty-odd pixels and
     * a page scrolled under an open keyboard moves `offsetTop` continuously
     * — transitioning those would make the screen lag a finger that is
     * actively dragging it, which is a worse fault than the one being
     * fixed. 80px is comfortably above a toolbar and far below a keyboard.
     */
    const settle = () => {
      root.classList.add("vv-settling")
      /* Read forced BEFORE the variable changes. A transition only runs if
         the transition property was already in effect at the previous style
         resolution — set both in the same frame and the browser has nothing
         to interpolate from, so the value snaps and the class does nothing.
         One reflow per keyboard toggle, not per scroll event. */
      void root.offsetHeight
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => root.classList.remove("vv-settling"), 340)
    }

    /** What the platform says, read against the fixed box, which on some of them is nothing. */
    const measure = (layout = layoutHeight()) =>
      keyboardInsetFrom({
        layoutHeight: layout,
        innerHeight: window.innerHeight,
        vvTop: Math.round(vv?.offsetTop ?? 0),
        vvHeight: Math.round(vv?.height ?? window.innerHeight),
      })

    const apply = () => {
      const layout = layoutHeight()
      const reported = Math.round(vv?.height ?? window.innerHeight)
      const top = Math.round(vv?.offsetTop ?? 0)
      const measured = measure(layout)
      /* A real measurement wins, and ends the estimate for good. */
      if (measured > 0 && estimate) estimate = 0
      const standingIn = measured === 0 && estimate > 0
      const inset = standingIn ? estimate : measured
      /* One pair, always consistent: --kb-inset is where the usable room
         starts from the bottom of the fixed box, --vv-h is how much of that
         box is left above it. The smaller of what was reported and what the
         inset leaves, because either may be the one that knows. */
      const h = inset > 0 ? Math.min(reported, Math.max(0, layout - inset)) : reported
      let changed = false
      if (h !== lastH) {
        changed = true
        if (lastH >= 0 && Math.abs(h - lastH) > 80) settle()
        lastH = h
        root.style.setProperty("--vv-h", `${h}px`)
      }
      if (top !== lastTop) {
        lastTop = top
        root.style.setProperty("--vv-top", `${top}px`)
      }
      /*
        ═══════════════════════════════════════════════════════════════════
         WHAT IS HIDDEN BELOW THE VISIBLE AREA, WHICH IS THE KEYBOARD
        ═══════════════════════════════════════════════════════════════════
        A `position: fixed` element is laid out against the LAYOUT viewport,
        and on iOS the keyboard does not shrink that — only the visual one.
        So `bottom: 0` is the bottom of the screen the keyboard is sitting on
        top of, and a bottom sheet with a text field in it puts that field
        underneath the keys. That is the bug: you cannot see what you type.

        This is the one number that fixes it, in the same coordinates a fixed
        element is positioned in: the gap between the bottom of the layout
        viewport and the bottom of what you can actually see. A sheet sets
        `bottom: var(--kb-inset)` and sits on the keyboard instead of under
        it.

        It is self-correcting where the platform already does the work. In a
        WKWebView configured to resize the web view for the keyboard,
        innerHeight shrinks too and this comes out at 0 — which is right,
        because there is nothing left to compensate for.
      */
      if (inset !== lastInset) {
        changed = true
        lastInset = inset
        root.style.setProperty("--kb-inset", `${inset}px`)
      }
      // Loose on purpose: a browser toolbar collapsing is sixty-odd pixels, a
      // keyboard is never less than about a quarter of the screen. Nothing in
      // between should be mistaken for one.
      /*
        AND EVERYONE IS TOLD. The floor is published on a timer rather than on
        a viewport event, so a surface listening only to visualViewport would
        never hear about it. The synthetic resize wakes the six that were
        written before any of this existed, without touching one of them:
        their own measurement is still zero, and keyboardInsetOrFloor hands
        them this number instead. The re-entrant call this makes computes the
        same pair, changes nothing, and dispatches nothing.
      */
      if (changed) {
        window.dispatchEvent(new CustomEvent(KEYBOARD_CHANGE_EVENT, { detail: { inset, visibleHeight: h } }))
        try { vv?.dispatchEvent(new Event("resize")) } catch {}
      }
      const kb = layout - h > layout * 0.2
      if (kb !== lastKb) {
        lastKb = kb
        if (kb) root.dataset.keyboard = "open"
        else delete root.dataset.keyboard
      }
    }

    /*
      ── A FIELD TOOK FOCUS AND NOTHING WAS REPORTED ─────────────────────────
      The deadline is long enough that any platform which reports has already
      done so: Safari fires visualViewport resize as the keyboard animates, in
      well under 450ms. What is left after it is a platform that never will.
    */
    const TEXT_INPUT = /^(text|search|url|tel|email|password|number|date|datetime-local|month|week|time)$/
    const takesAKeyboard = (node: Element | null): boolean => {
      const el = node as HTMLElement | null
      if (!el) return false
      if (el.isContentEditable) return true
      if (el.tagName === "TEXTAREA") return true
      if (el.tagName !== "INPUT") return false
      return TEXT_INPUT.test(((el as HTMLInputElement).type || "text").toLowerCase())
    }

    const onFocusIn = (e: FocusEvent) => {
      if (!takesAKeyboard(e.target as Element | null)) return
      layoutAtFocus = layoutHeight()
      window.clearTimeout(estimateTimer)
      estimateTimer = window.setTimeout(() => {
        if (!takesAKeyboard(document.activeElement)) return
        if (
          !needsKeyboardEstimate({
            measuredInset: measure(),
            layoutHeightAtFocus: layoutAtFocus,
            layoutHeightNow: layoutHeight(),
            coarsePointer: window.matchMedia?.("(hover: none) and (pointer: coarse)").matches ?? false,
            viewportWidth: window.innerWidth,
            visibleHeightNow: Math.round(vv?.height ?? window.innerHeight),
          })
        ) return
        estimate = estimatedKeyboardInset(layoutHeight())
        apply()
      }, KEYBOARD_ESTIMATE_DELAY_MS)
    }

    /* Moving between two fields keeps the keyboard up, and the next focusin
       arrives in the same task, so the check waits a frame. */
    const onFocusOut = () => {
      window.clearTimeout(estimateTimer)
      const clearEstimate = () => {
        if (!estimate || takesAKeyboard(document.activeElement)) return
        estimate = 0
        apply()
      }
      requestAnimationFrame(clearEstimate)
      /* iOS often reports the keyboard gone one frame late; a second pass catches the sheet. */
      window.setTimeout(clearEstimate, 50)
      window.setTimeout(clearEstimate, 180)
    }

    apply()
    document.addEventListener("focusin", onFocusIn, { passive: true })
    document.addEventListener("focusout", onFocusOut, { passive: true })
    vv?.addEventListener("resize", apply)
    // Not optional on iOS: the page can be scrolled underneath an open keyboard,
    // and without following offsetTop a pinned column drifts off the top.
    vv?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    window.addEventListener("orientationchange", apply)
    return () => {
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      window.clearTimeout(settleTimer)
      window.clearTimeout(estimateTimer)
      probe.remove()
      root.classList.remove("vv-settling")
      root.style.removeProperty("--vv-h")
      root.style.removeProperty("--vv-top")
      root.style.removeProperty("--kb-inset")
      delete root.dataset.keyboard
    }
  }, [])

  return null
}
