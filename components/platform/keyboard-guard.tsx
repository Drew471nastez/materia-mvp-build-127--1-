"use client"

import { useEffect } from "react"

import { keyboardInsetOrFloor } from "@/lib/ui/keyboard-safe-sheet"
import { isSiteDocument } from "@/components/website-builder/site-document"

/**
 * KeyboardGuard — globally tracks software keyboard open/close via the
 * VisualViewport API and adds/removes the `keyboard-open` class on <html>.
 *
 * On iOS Capacitor, opening the keyboard exposes body { padding-bottom } and
 * any scroll-container padding-bottom as whitespace (the safe-area-inset-bottom
 * value does not automatically drop to 0 in WKWebView the way it does in Safari).
 * The CSS rules keyed on `html.keyboard-open` zero out those paddings while
 * the keyboard is visible, eliminating the whitespace gap.
 *
 * Also scrolls the focused input/textarea into view after the keyboard opens,
 * since the browser's native scroll-into-view doesn't work reliably inside
 * custom `overflow-y: auto` scroll containers (`.app-content-scroll`).
 *
 * The class is never added on a desktop, where visualViewport.height equals
 * window.innerHeight. The focus pass did run there, and on published
 * websites, centring every field clicked; it now stands down on a website
 * (components/website-builder/site-document) and moves a field only when
 * the keyboard covers it.
 */
export function KeyboardGuard() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return

    const vv = window.visualViewport
    const root = document.documentElement
    let lastInnerWidth = window.innerWidth

    function clampScrollContainers() {
      // After the keyboard closes the browser re-layouts (padding-bottom is
      // restored on .library-scroll-content / body) which can increase
      // scrollHeight. If the container's scrollTop now exceeds the new max,
      // clamp it so no blank space is visible at the bottom.
      const clamp = (el: Element) => {
        const h = el as HTMLElement
        const max = h.scrollHeight - h.clientHeight
        if (h.scrollTop > max) h.scrollTop = Math.max(0, max)
      }

      // Clamp the library scroll container and any other overflow-y-auto mains
      document.querySelectorAll("main, .app-content-scroll").forEach(clamp)

      // Also clamp the window itself (for pages that scroll at document level)
      const maxWin = document.documentElement.scrollHeight - window.innerHeight
      if (window.scrollY > maxWin) {
        window.scrollTo({ top: Math.max(0, maxWin), behavior: "instant" as ScrollBehavior })
      }
    }

    /**
     * Walk up the DOM from `el` and return the nearest ancestor that is an
     * independently scrollable container (overflow-y: auto|scroll with
     * scrollHeight > clientHeight). Returns null if none is found before
     * reaching <html>.
     */
    function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
      let node: HTMLElement | null = el.parentElement
      while (node && node !== document.documentElement) {
        const style = window.getComputedStyle(node)
        const oy = style.overflowY
        if (
          (oy === "auto" || oy === "scroll") &&
          node.scrollHeight > node.clientHeight
        ) {
          return node
        }
        node = node.parentElement
      }
      return null
    }

    /**
     * After the keyboard opens and the scroll container resizes (via CSS
     * `--vvh` / `--keyboard-inset-height`), scroll the focused input into
     * the centre of the visible area above the keyboard.
     *
     * Walks up the DOM from the focused element to find the nearest scrollable
     * ancestor — this handles nested scroll containers like the one-page
     * editor panel (`overflow-y-auto`) inside `.app-content-scroll`.
     */
    function scrollFocusedInputIntoView() {
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        const active = document.activeElement as HTMLElement | null
        if (
          !active ||
          (active.tagName !== "INPUT" && active.tagName !== "TEXTAREA" && !active.isContentEditable)
        ) return

        /* A surface that places its own field on the keyboard (an opened post, data-keyboard-own) is left as it is: centring its
           field in its scroller pushed the post half a screen along as the keyboard came up (round 17). */
        if (active.closest("[data-keyboard-own]")) return

        // Find the nearest scrollable ancestor — this correctly targets
        // nested overflow-y-auto containers (e.g. the one-page editor panel)
        // rather than always jumping to the outermost .app-content-scroll.
        const scrollContainer = findScrollableAncestor(active)

        if (!scrollContainer) {
          /*
            NOT UNDER /app. There the document is never the scroller: html
            is overflow: hidden and DocumentScrollGuard puts it back to 0
            the frame anything moves it. scrollIntoView ignores overflow:
            hidden, so this fallback would start a smooth scroll of the
            document that the guard undoes every frame for 300ms — a
            visible shudder of everything fixed, twice per tap (once from
            the keyboard-open transition and once from the focus timer).
            And it is reached exactly when a sheet's content FITS, because
            a scroller that does not overflow is not counted as one above:
            the social-link sheet, once it sits on the keyboard, is this
            case. A field in a box with no scroller is visible or it is
            not by where the box is, which is what --kb-inset decides.
          */
          if (document.documentElement.classList.contains("app-layout")) return
          /*
            THE DOCUMENT SCROLLS, AND THE BROWSER ALREADY BROUGHT THE FIELD
            INTO VIEW. This centred it anyway, smoothly, so a field that was
            plainly visible was dragged to the middle of the screen, and with
            a keyboard up the middle of the layout viewport is behind the
            keys. Now it moves only a field the keyboard actually covers,
            and only as far as it takes to show it.
          */
          const r = active.getBoundingClientRect()
          const top = vv.offsetTop
          const bottom = vv.offsetTop + vv.height
          if (r.top >= top && r.bottom <= bottom) return
          active.scrollIntoView({ block: "nearest", behavior: "auto" })
          return
        }

        const activeRect = active.getBoundingClientRect()
        const containerRect = scrollContainer.getBoundingClientRect()
        const containerVisibleHeight = scrollContainer.clientHeight

        // Always scroll the input to the centre of the visible area — don't
        // just check "is it visible?". On mobile keyboards the visible area is
        // small; centering keeps the input comfortably above the keyboard with
        // breathing room.
        const inputCentreInContainer =
          activeRect.top - containerRect.top + activeRect.height / 2
        const desiredScrollTop =
          scrollContainer.scrollTop +
          inputCentreInContainer -
          containerVisibleHeight / 2

        scrollContainer.scrollTo({
          top: Math.max(0, desiredScrollTop),
          behavior: "smooth",
        })
      })))
    }

    /* Whether the keyboard was up on the previous reading. The difference
       between this and `kbHeight > 0` is the whole fix: one is a transition,
       the other is a state that holds for as long as somebody is typing. */
    let keyboardWasOpen = false

    function onViewportChange() {
      /* A creator's website: the document scrolls, and the browser handles it. */
      if (isSiteDocument()) return
      // Ignore orientation changes — they are not keyboard events
      const currentWidth = window.innerWidth
      if (currentWidth !== lastInnerWidth) {
        lastInnerWidth = currentWidth
        return
      }

      /* Its own reading when the platform gave one, the published floor when
         it did not: see keyboardInsetOrFloor. Everything this class and
         `--vvh` drive was dead in a web view that reports nothing. */
      const kbHeight = keyboardInsetOrFloor(Math.max(0, window.innerHeight - vv.offsetTop - vv.height))
      const visibleHeight = Math.max(0, window.innerHeight - kbHeight)
      /*
        ═══════════════════════════════════════════════════════════════════════
         OPENING IS AN EVENT. BEING OPEN IS NOT.
        ═══════════════════════════════════════════════════════════════════════
        This ran on every visualViewport change, and one of the things it did
        was a SMOOTH scroll to centre the focused input. A smooth scroll moves
        the visual viewport, which fires `scroll` on it, which arrives here,
        which starts another smooth scroll. The page never settles.

        Filmed on a phone with the search focused: the content drifted the
        whole time the field was focused, moving more than 60px between
        samples 835ms apart, from 2.4s to 9.8s without stopping. That is the
        "it keeps slowly moving, like it is trying to pull out something".

        So the work that MOVES the page is done on the transition into
        keyboard-open, and the work that is merely bookkeeping — the class and
        the height variable — carries on every change, because those are
        idempotent and cost nothing.
      */
      const opening = kbHeight > 0 && !keyboardWasOpen
      if (kbHeight > 0) {
        root.classList.add("keyboard-open")
        // Expose the visual viewport height (visible area above the keyboard)
        // as a CSS variable so scroll containers can be clamped to exactly that
        // height, preventing them from extending into the blank area below the
        // keyboard and eliminating the rubber-band / blank-space effect.
        root.style.setProperty("--vvh", `${Math.round(visibleHeight)}px`)
        // Clamp scroll positions immediately after the CSS variable is set so
        // no blank space is visible at the bottom while the keyboard is open.
        // Two frames: first for the browser to apply the new height via CSS,
        // second to read the updated clientHeight and clamp safely.
        if (opening) {
          keyboardWasOpen = true
          requestAnimationFrame(() => requestAnimationFrame(clampScrollContainers))
          // After the container has resized, ensure the focused input is visible
          scrollFocusedInputIntoView()
        }
      } else {
        const wasOpen = root.classList.contains("keyboard-open")
        keyboardWasOpen = false
        root.classList.remove("keyboard-open")
        root.style.removeProperty("--vvh")
        if (wasOpen) {
          // Wait two frames: first for the CSS class removal to trigger a
          // layout recalculation (padding-bottom restored), second to read
          // the updated scrollHeight and clamp safely.
          requestAnimationFrame(() => requestAnimationFrame(clampScrollContainers))
        }
      }
    }

    // Also listen for focus events on inputs — on some devices the keyboard
    // opens after the focus event, so we need a secondary trigger.
    // Fire two passes: 300ms (early, for fast keyboards) and 600ms (late,
    // for slower iOS keyboards that take ~400-500ms to finish animating).
    let focusTimers: ReturnType<typeof setTimeout>[] = []
    function onFocusIn(e: FocusEvent) {
      if (isSiteDocument()) return
      const target = e.target as HTMLElement | null
      if (
        !target ||
        (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA" && !target.isContentEditable)
      ) return

      // Clear any pending timers from a previous focus
      focusTimers.forEach(clearTimeout)
      /*
        ONE PASS, NOT TWO. There were centrings at 300ms and 600ms, on top of
        the one the keyboard-open transition fires — three scrolls for one tap,
        each of them smooth and each interrupting the last. 500ms is after a
        slow iOS keyboard has finished animating, and the transition handler
        covers the fast case.
      */
      focusTimers = [setTimeout(scrollFocusedInputIntoView, 500)]
    }

    vv.addEventListener("resize", onViewportChange)
    vv.addEventListener("scroll", onViewportChange)
    document.addEventListener("focusin", onFocusIn, { passive: true })

    return () => {
      vv.removeEventListener("resize", onViewportChange)
      vv.removeEventListener("scroll", onViewportChange)
      document.removeEventListener("focusin", onFocusIn)
      focusTimers.forEach(clearTimeout)
      root.classList.remove("keyboard-open")
      root.style.removeProperty("--vvh")
    }
  }, [])

  return null
}
