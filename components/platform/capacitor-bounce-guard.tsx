"use client"

import { useEffect } from "react"

/**
 * CapacitorBounceGuard
 *
 * WKWebView (Capacitor iOS) ignores `overscroll-behavior: none` before iOS 16,
 * because the scroll is backed by a native UIScrollView whose `bounces`
 * property defaults to `true`. The Podfile targets iOS 14, so CSS alone cannot
 * be relied on and this listener has to exist.
 *
 * It intercepts `touchmove` and calls `e.preventDefault()` when a scroll would
 * go beyond its container's boundaries, which is what stops the native
 * UIScrollView bouncing.
 *
 * No-op on web browsers (checked via html.capacitor, set synchronously before
 * first paint only in the native shell).
 *
 * ===========================================================================
 *  THE DECISIONS ARE MADE ONCE PER GESTURE, NOT ONCE PER FRAME
 * ===========================================================================
 * "The app doesn't feel as smooth as the same site does in Safari."
 *
 * Safari loads the same site from the same deployment, so only code behind the
 * `html.capacitor` gate can explain a difference — and this was the heaviest
 * thing behind it. Every touchmove walked from the touch target up to <html>
 * calling `getComputedStyle` on each ancestor, and `getComputedStyle` forces a
 * style recalculation. Measured on the real component with real touch input by
 * scripts/check-native-scroll-cost: one ordinary 40-move scroll forced 585
 * style recalculations in the app and 0 in the browser. Fifteen per frame,
 * ahead of the page moving at all, on a listener the compositor already has to
 * wait for.
 *
 * None of that work changes DURING a gesture. Which element scrolls, whether
 * it is a sheet that handles its own drag, how tall its content is and whether
 * the screen is landscape are all fixed the moment a finger lands. So they are
 * settled once in `touchstart`, and `touchmove` does arithmetic on numbers
 * that are already in hand plus ONE `scrollTop` read, which is the only value
 * that moves.
 *
 * ===========================================================================
 *  AND WHERE CSS CAN DO THE JOB, THERE IS NO LISTENER AT ALL
 * ===========================================================================
 * Making the handler cheap was not enough, because half the cost was never in
 * the handler. A `{ passive: false }` touchmove listener on the document tells
 * the browser that the main thread MIGHT veto this scroll — so the compositor
 * has to wait for the main thread on every frame of every gesture, whatever
 * the handler then decides. Scrolling stops being a compositor job. That is
 * the part of "the app doesn't feel as smooth as Safari" that survived the
 * refactor above, and it cannot be optimised away; the listener has to not be
 * there.
 *
 * It does not need to be there. Everything this file prevents, CSS already
 * declares:
 *
 *   the page and the body    `overscroll-behavior: none` on html.capacitor
 *                            and html.capacitor body
 *   the /app scroll container `overscroll-behavior: none` on
 *                            .app-content-scroll
 *   landscape                `touch-action: none` and `overflow: hidden` on
 *                            html, body and both scroll containers, inside
 *                            @media (orientation: landscape)
 *
 * WebKit shipped `overscroll-behavior` in Safari 16. Before that the
 * declarations parse to nothing and this listener is the only thing between a
 * finger and a rubber band, which is why it is not simply deleted. So it is
 * registered on the engines that need it and not on the ones that do not, and
 * the question is put to the engine itself rather than guessed from a user
 * agent string.
 */
function cssRefusesTheBounce(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("overscroll-behavior-y", "none")
  } catch {
    /* No CSS.supports at all is an engine older than the property. */
    return false
  }
}

export function CapacitorBounceGuard() {
  useEffect(() => {
    if (typeof window === "undefined") return
    // Only activate inside the native Capacitor shell
    if (!document.documentElement.classList.contains("capacitor")) return
    /* See the note above: on an engine that honours overscroll-behavior the
       stylesheet has already refused every bounce this listener would, and
       registering it would only cost the compositor its fast path. */
    if (cssRefusesTheBounce()) return

    let lastTouchY = 0
    let lastTouchX = 0

    /**
     * Everything `touchmove` needs, worked out when the finger lands.
     *
     * `mode` is what the walk used to decide on every frame:
     *   "ignore"    a sheet or the builder, which handle their own gestures
     *   "landscape" the rotate-device overlay is up, nothing may move
     *   "element"   a scrollable ancestor owns this gesture
     *   "document"  nothing between the target and <html> scrolls
     *   "free"      a horizontally scrolling ancestor; leave it alone
     */
    let mode: "ignore" | "landscape" | "element" | "document" | "free" = "document"
    let scroller: HTMLElement | null = null
    /**
     * ═══════════════════════════════════════════════════════════════════
     *  THE PAGE'S SIZE IS NOT FIXED FOR THE LENGTH OF A GESTURE
     * ═══════════════════════════════════════════════════════════════════
     * These were read once at touchstart and held, on the reasoning that
     * neither the content nor the box changes size while a finger is on the
     * screen. Both do. The dashboard
     * loads its chart through a dynamic import with `ssr: false`, so a
     * 200px skeleton is replaced by the real chart while somebody is
     * already dragging, and every image that arrives moves the bottom
     * again.
     *
     * A stale `scrollHeight` that is too SMALL is the bug people feel: the
     * test below decides the finger has reached the bottom while there is
     * still half a page under it, and from that moment every downward
     * touchmove in the gesture is cancelled. The scroll simply stops
     * answering, part way down, for no reason the person can see —
     * reported as "at some point when I scroll down it lags really weirdly
     * and I don't know why".
     *
     * They stay cached, because the reason for caching them was real: a
     * layout read per touchmove is what this whole file exists to avoid.
     * What changes is that the cache is only ever TRUSTED TO SAY NO. The
     * moment it claims a boundary — which is the only moment a gesture is
     * ever cancelled, and happens at most once or twice in one — it is
     * checked against the page as it is now, and that is one read at the
     * one moment it matters rather than one on every frame.
     */
    let scrollHeight = 0
    let clientHeight = 0
    let canScrollDoc = false
    /** Where the finger landed, and whether the walk from there has been asked again this gesture. */
    let gestureTarget: Element | null = null
    let rewalked = false

    /** Re-read the two numbers the boundary test is made of. */
    function refreshExtent(): void {
      if (!scroller) return
      if (mode === "document") {
        scrollHeight = Math.max(scroller.scrollHeight, document.documentElement.scrollHeight)
        clientHeight = window.innerHeight
        canScrollDoc = scrollHeight > clientHeight + 1
        return
      }
      scrollHeight = scroller.scrollHeight
      clientHeight = scroller.clientHeight
    }

    /** The nearest ancestor of `from` that scrolls vertically and has room to go `dir` (-1 up, 1 down). Asked only at a boundary, never per move. */
    function nextScroller(from: HTMLElement, dir: -1 | 1): HTMLElement | null {
      let el = from.parentElement
      while (el && el !== document.documentElement && el !== document.body) {
        const oy = window.getComputedStyle(el).overflowY
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1) {
          const room = dir < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
          if (room) return el
        }
        el = el.parentElement
      }
      return null
    }

    /** The expensive part, and it runs once per gesture instead of once per frame. */
    function resolve(target: Element | null): void {
      if (window.innerWidth > window.innerHeight) {
        mode = "landscape"
        return
      }
      if (
        target?.closest("[data-mobile-bottom-sheet]") ||
        target?.closest("[data-mobile-top-sheet]") ||
        target?.closest("[data-wb-no-bounce-guard]") ||
        /*
          THE WHOLE BUILDER, NOT ONLY ITS ROOT (round 1026). The editor and
          the code page opt out with data-wb-no-bounce-guard on their root,
          and everything they open in a portal on <body> (a block picker, a
          menu, a dialog, a popover's list) is outside that root. Those were
          walked like a page: nothing scrollable found yet, a document that
          does not scroll (the builder locks it), and every move of the
          gesture cancelled. The surface is the builder's while the class
          that locks it is on <html>, and it polices its own touch.
        */
        document.documentElement.classList.contains("wb-fullscreen")
      ) {
        mode = "ignore"
        return
      }

      let el: Element | null = target
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el)
        const oy = style.overflowY
        const ox = style.overflowX
        // If element scrolls horizontally, let the browser handle it
        if (ox === "auto" || ox === "scroll") {
          const htmlEl = el as HTMLElement
          if (htmlEl.scrollWidth > htmlEl.clientWidth + 1) {
            mode = "free"
            return
          }
        }
        if (oy === "auto" || oy === "scroll") {
          const htmlEl = el as HTMLElement
          // Skip elements that have overflow-y:auto computed (often due to CSS spec
          // forcing auto when overflow-x:hidden is set) but aren't actually scrollable.
          // Without this check, e.g. the settings form root div (overflow-x:hidden →
          // implicit overflow-y:auto, scrollHeight==clientHeight) would block ALL scroll.
          if (htmlEl.scrollHeight > htmlEl.clientHeight + 1) {
            mode = "element"
            scroller = htmlEl
            scrollHeight = htmlEl.scrollHeight
            clientHeight = htmlEl.clientHeight
            return
          }
          el = el.parentElement
          continue
        }
        el = el.parentElement
      }

      // No scrollable ancestor — the document owns it.
      // `document.scrollingElement` is the reliable root (in Capacitor
      // WKWebView html carries overflow-y: auto on mobile).
      mode = "document"
      scroller = (document.scrollingElement as HTMLElement) || document.documentElement
      scrollHeight = Math.max(scroller.scrollHeight, document.documentElement.scrollHeight)
      clientHeight = window.innerHeight
      // Only prevent if the page is actually taller than the viewport.
      canScrollDoc = scrollHeight > clientHeight + 1
    }

    function onTouchStart(e: TouchEvent) {
      lastTouchY = e.touches[0]?.clientY ?? 0
      lastTouchX = e.touches[0]?.clientX ?? 0
      gestureTarget = e.target instanceof Element ? e.target : null
      rewalked = false
      scroller = null
      scrollHeight = 0
      clientHeight = 0
      canScrollDoc = false
      resolve(e.target as Element | null)
    }

    function onTouchMove(e: TouchEvent) {
      if (mode === "ignore" || mode === "free") return

      // In landscape the full-screen "rotate device" overlay covers all
      // content. Prevent every gesture so the WKWebView UIScrollView cannot
      // rubber-band on any inner scroll container — CSS touch-action:none on
      // html/body is not always honoured by nested overflow:auto elements.
      if (mode === "landscape") {
        e.preventDefault()
        return
      }

      const touchY = e.touches[0]?.clientY ?? 0
      const touchX = e.touches[0]?.clientX ?? 0
      const deltaY = touchY - lastTouchY
      const deltaX = touchX - lastTouchX

      // Only intercept primarily vertical gestures — horizontal swipes (e.g.
      // KPI metric tab carousels, analytics tables) must scroll freely without
      // interference. Allow a small bias so diagonal gestures that are mostly
      // vertical are still caught.
      if (Math.abs(deltaX) > Math.abs(deltaY) * 0.5 && Math.abs(deltaX) > 4) return
      if (!scroller) return

      /* The one thing that actually changes while a finger is moving. */
      const scrollTop =
        mode === "document"
          ? Math.max(scroller.scrollTop, document.documentElement.scrollTop, document.body.scrollTop)
          : scroller.scrollTop

      if (mode === "document" && !canScrollDoc) {
        /* The page did not fit when the finger landed. Make sure that is
           still true before refusing to move: a page that has grown since
           is a page somebody is entitled to scroll. */
        refreshExtent()
        /*
          AND THAT NOTHING UNDER THE FINGER HAS COME TO SCROLL SINCE (round
          1026). The walk at touchdown skips a box whose content did not
          overflow yet: a list still loading, a panel still opening. Asked
          again once, at the one moment the gesture would be cancelled for
          it, rather than on every move.
        */
        if (!canScrollDoc && !rewalked) {
          rewalked = true
          resolve(gestureTarget)
          if (mode !== "document") return
        }
        if (!canScrollDoc) {
          // Page fits on screen — prevent rubber-band in both directions
          if (deltaY !== 0) e.preventDefault()
          return
        }
      }

      const atTop = scrollTop <= 0
      let atBottom = scrollTop + clientHeight >= scrollHeight - 1
      /* The cache is allowed to say "not at the bottom" on its own. It is
         not allowed to end a gesture on numbers that may be stale, so the
         one answer that cancels anything is confirmed first. */
      if (atBottom) {
        refreshExtent()
        atBottom = scrollTop + clientHeight >= scrollHeight - 1
      }
      if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) {
        /*
          A BOX AT ITS END HANDS THE SCROLL ON (round 1026). Only the
          nearest scroller was known, so a list at its top inside a panel
          that could still scroll cancelled the move and neither moved: a
          short block list inside a long settings panel stopped the panel
          dead. One walk up, only at the boundary, for an ancestor that can
          still go the finger's way; the gesture follows that one.
        */
        if (mode === "element" && scroller) {
          const next = nextScroller(scroller, deltaY > 0 ? -1 : 1)
          if (next) {
            scroller = next
            refreshExtent()
            return
          }
        }
        e.preventDefault()
      }
    }


    document.addEventListener("touchstart", onTouchStart, { passive: true })
    // passive: false required so e.preventDefault() is allowed
    document.addEventListener("touchmove", onTouchMove, { passive: false })

    return () => {
      document.removeEventListener("touchstart", onTouchStart)
      document.removeEventListener("touchmove", onTouchMove)
    }
  }, [])

  return null
}
