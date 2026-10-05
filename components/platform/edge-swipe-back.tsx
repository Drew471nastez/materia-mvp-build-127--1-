"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import {
  ARRIVAL_CAP_MS,
  BACKDROP,
  CANCEL_EASE,
  COMPLETE_EASE,
  REVEAL_EASE,
  REVEAL_MS,
  SAME_PATH_SETTLE_MS,
  cancelMs,
  completeMs,
  dimOpacity,
  edgeSwipeEnvironment,
  edgeSwipeRouteAllowed,
  handledSideways,
  judgeMove,
  overlayUp,
  pageOffset,
  progressOf,
  releaseVelocity,
  shadowOpacity,
  shouldComplete,
  startsAtEdge,
  typing,
} from "@/lib/navigation/edge-swipe"
import { backInFlight, backThen, readBackEvidence } from "@/lib/navigation/go-back"
import { planBack } from "@/lib/navigation/back-plan"
import { ActivitySpinner, SPINNER_WAIT_MS } from "@/components/ui/activity-spinner"

/**
 * ===========================================================================
 *  SWIPE FROM THE LEFT EDGE TO GO BACK, IN THE APP
 * ===========================================================================
 * The rules (where a touch may start, when it becomes the page's drag, when
 * a release goes, where it never runs) are lib/navigation/edge-swipe.ts.
 * This moves the page. Mounted once, in the root layout, next to
 * NativeChrome. Renders nothing; outside the app it does not even listen.
 *
 * THE WHOLE PAGE MOVES, ON THE COMPOSITOR. The page is everything in <html>:
 * the in flow content, the sticky bars and the fixed ones (the header, a
 * join bar), so it is <html> that is offset. An offset <html> becomes the
 * box its fixed children are placed in, and with the document scrolled that
 * box starts above the screen: the fixed header would jump up by the scroll.
 * So for the length of the drag the scroll moves from the window to <body>
 * (html: overflow hidden, height 100%; body: its own scroller at the same
 * offset). <html> is then exactly the screen, every fixed and sticky thing
 * sits where it sat, and a move is one offset on one layer, plus the tab
 * bar's opposite offset (it stays put, as a tab bar does on iOS) and two
 * opacities. No layout, no paint per frame. The window's scroll events
 * from that hand over (and the one back) are kept from the page, so a
 * header that hides on scroll or a saved scroll position never sees a jump
 * that did not happen. Measured: scripts/check-edge-swipe.mjs.
 *
 * NO LISTENER THAT CAN HOLD A SCROLL. Every listener here is passive. A
 * touch that lands at the edge and goes sideways cannot scroll the page
 * anyway (nothing on it scrolls sideways), and once the drag has the page
 * the window has nothing left to scroll. A touch that goes down first is a
 * scroll and is left alone, so vertical scrolling costs one comparison per
 * move, as before.
 *
 * GOING BACK IS THE SAME BACK AS EVERY CONTROL. When the page has slid out,
 * a stand in for the page behind (BACKDROP) covers the screen above the tab
 * bar, the page goes back to scrolling the window where it was, and
 * backThen (lib/navigation/go-back) goes back once: the back hold, the echo
 * click guard and the watch that falls back when a back does nothing are
 * all its own. When the page behind has arrived, the stand in fades off it;
 * if it takes longer than SPINNER_WAIT_MS (a page the router has to fetch),
 * the app's own spinner shows on the stand in meanwhile.
 */
export function EdgeSwipeBack() {
  const pathname = usePathname() || "/"
  const onPath = useRef<((path: string) => void) | null>(null)
  /* The stand in while it waits for the page behind: the app's own spinner shows there after SPINNER_WAIT_MS, as on a slow page. */
  const [waitingIn, setWaitingIn] = useState<HTMLElement | null>(null)

  useEffect(() => {
    onPath.current?.(pathname)
  }, [pathname])

  useEffect(() => {
    if (typeof window === "undefined" || !edgeSwipeEnvironment(window)) return
    const swipe = installEdgeSwipe(setWaitingIn)
    onPath.current = swipe.pathChanged
    return () => {
      onPath.current = null
      swipe.dispose()
    }
  }, [])

  if (!waitingIn) return null
  return createPortal(
    <div
      data-edge-swipe-spinner=""
      className="pointer-events-none absolute inset-x-0 top-[40%] flex justify-center opacity-0"
      style={{ animation: `skeleton-reveal 150ms ease-out ${SPINNER_WAIT_MS}ms forwards` }}
    >
      <ActivitySpinner />
    </div>,
    waitingIn,
  )
}

type Phase = "idle" | "armed" | "drag" | "settle" | "wait" | "reveal"

type Saved = Array<[CSSStyleDeclaration, string, string, string]>

function installEdgeSwipe(waiting: (host: HTMLElement | null) => void) {
  const win = window
  const doc = document
  const html = doc.documentElement
  const body = doc.body

  let phase: Phase = "idle"
  /* An engine that does not place fixed things in an offset <html> (none known) turns this off for the visit. */
  let disabled = false
  let touchId = -1
  let startX = 0
  let startY = 0
  let width = 0
  let scrollY = 0
  let offset = 0
  let samples: Array<[number, number]> = []
  let tab: HTMLElement | null = null
  let tabRoom = 0
  let saved: Saved = []
  let timer = 0
  let capTimer = 0
  let leftPath = ""
  let onPop: (() => void) | null = null
  let reveal: Animation | null = null
  let drawRaf = 0

  /** Anything left on <html> from a missed cleanup (a route change mid drag, a tab backgrounded). */
  function clearEdgeSwipeStyles() {
    win.clearTimeout(timer)
    win.clearTimeout(drawRaf)
    drawRaf = 0
    if (saved.length) restore()
    html.style.removeProperty("translate")
    html.style.removeProperty("transition")
    html.style.removeProperty("will-change")
    html.style.removeProperty("height")
    html.style.removeProperty("overflow")
    html.style.removeProperty("scroll-behavior")
    body.style.removeProperty("height")
    body.style.removeProperty("overflow-x")
    body.style.removeProperty("overflow-y")
    body.style.removeProperty("scroll-behavior")
    if (tab) {
      tab.style.removeProperty("translate")
      tab.style.removeProperty("transition")
      tab.style.removeProperty("will-change")
    }
    tab = null
    saved = []
    offset = 0
    html.removeAttribute("data-edge-swipe")
    hideBackdrop()
    waiting(null)
    reveal?.cancel()
    reveal = null
    if (onPop) {
      win.removeEventListener("popstate", onPop)
      onPop = null
    }
    phase = "idle"
    disabled = false
  }

  /* ── The stand in for the page behind ──────────────────────────────────── */
  let parts: { root: HTMLDivElement; band: HTMLDivElement; dim: HTMLDivElement; shadow: HTMLDivElement } | null = null
  function backdrop() {
    if (parts && parts.root.isConnected) return parts
    const root = doc.createElement("div")
    root.setAttribute("data-edge-swipe-backdrop", "")
    /* Hidden from a screen reader, but not inert: while it covers the page that is leaving it has to catch the presses meant for that page. */
    root.setAttribute("aria-hidden", "true")
    const band = doc.createElement("div")
    const dim = doc.createElement("div")
    const shadow = doc.createElement("div")
    band.style.cssText = `position:absolute;left:0;right:0;top:0;background:${BACKDROP.band};box-shadow:0 1px 0 ${BACKDROP.hairline}`
    dim.style.cssText = `position:absolute;inset:0;background:${BACKDROP.dim};will-change:opacity`
    shadow.style.cssText = `position:absolute;top:0;bottom:0;right:0;width:${BACKDROP.shadowPx}px;background:linear-gradient(to left, ${BACKDROP.shadow}, rgba(26,26,46,0.04) 40%, transparent);will-change:opacity`
    root.append(band, dim, shadow)
    body.append(root)
    parts = { root, band, dim, shadow }
    return parts
  }
  /* Behind the page: left of it, in the page's own box, under the tab bar. */
  function placeBehind(bandHeight: string) {
    const p = backdrop()
    p.root.style.cssText = `position:fixed;top:0;bottom:0;left:-100%;width:100%;z-index:49;pointer-events:none;background:${BACKDROP.page};contain:strict;opacity:1`
    p.band.style.height = bandHeight
  }
  /* Over the page that is leaving, while the one behind comes: the whole screen above the tab bar. */
  function placeOver() {
    const p = backdrop()
    p.root.style.left = "0"
    p.root.style.bottom = `${tabRoom}px`
    p.root.style.zIndex = "2147483000"
    p.root.style.pointerEvents = "auto"
    p.dim.style.opacity = "0"
    p.shadow.style.opacity = "0"
  }
  function hideBackdrop() {
    if (!parts) return
    parts.root.style.cssText = "display:none"
    parts.dim.style.transition = ""
    parts.shadow.style.transition = ""
  }

  /* ── The hand over of the scroll, and back ─────────────────────────────── */
  /* The window's scroll events from the hand over are not the visitor's: kept from the page for the next two frames. */
  function muteScroll() {
    const mute = (e: Event) => {
      if (e.target === doc || e.target === body || e.target === html) e.stopImmediatePropagation()
    }
    win.addEventListener("scroll", mute, true)
    win.addEventListener("scrollend", mute, true)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        win.removeEventListener("scroll", mute, true)
        win.removeEventListener("scrollend", mute, true)
      }),
    )
  }
  function put(style: CSSStyleDeclaration, prop: string, value: string) {
    saved.push([style, prop, style.getPropertyValue(prop), style.getPropertyPriority(prop)])
    style.setProperty(prop, value)
  }
  function restore() {
    for (let i = saved.length - 1; i >= 0; i--) {
      const [style, prop, value, priority] = saved[i]
      if (value) style.setProperty(prop, value, priority)
      else style.removeProperty(prop)
    }
    saved = []
  }

  function topBand(): string {
    const bars = [doc.getElementById("platform-header-root"), doc.querySelector<HTMLElement>(".native-top-surface")]
    for (const el of bars) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (r.height > 0 && r.top <= 1 && r.bottom > 0) return `${Math.round(Math.min(160, r.bottom))}px`
    }
    return "calc(env(safe-area-inset-top, 0px) + 56px)"
  }

  /** The page becomes one layer that can move. False (and nothing changed) when it cannot be done here. */
  function enter(): boolean {
    width = win.innerWidth
    scrollY = win.scrollY
    const shownTab = doc.querySelector<HTMLElement>('[data-buyer-tab-bar="shown"]')
    const tabBox = shownTab?.getBoundingClientRect()
    tab = tabBox && tabBox.height > 0 && tabBox.top < win.innerHeight - 1 ? shownTab! : null
    tabRoom = tab && tabBox ? Math.max(0, Math.round(win.innerHeight - tabBox.top)) : 0
    /* Something fixed to check the hand over against: the header, else the tab bar. */
    const fixedRef = doc.getElementById("platform-header-root") ?? tab
    const before = fixedRef?.getBoundingClientRect()
    placeBehind(topBand())

    muteScroll()
    put(html.style, "height", "100%")
    put(html.style, "overflow", "hidden")
    put(html.style, "will-change", "translate")
    put(html.style, "transition", "none")
    put(html.style, "scroll-behavior", "auto")
    put(html.style, "translate", "0px 0px")
    put(body.style, "height", "100%")
    put(body.style, "overflow-x", "hidden")
    put(body.style, "overflow-y", "auto")
    put(body.style, "scroll-behavior", "auto")
    if (tab) {
      put(tab.style, "translate", "0px 0px")
      put(tab.style, "will-change", "translate")
      put(tab.style, "transition", "none")
    }
    body.scrollTop = scrollY
    /* And the window to its top: a kept sheet resting below the screen still overflows <html>, so the window can stay scrolled after the content has left it. */
    if (win.scrollY !== 0) win.scrollTo(0, 0)

    /* One read, once: the content is where it was, and the fixed bars too. */
    let ok = Math.abs(body.scrollTop - scrollY) <= 1
    if (ok && fixedRef && before) {
      html.style.translate = "1px 0px"
      const after = fixedRef.getBoundingClientRect()
      const fixedFollows = Math.abs(after.left - (before.left + 1)) <= 0.5
      ok = fixedFollows && Math.abs(after.top - before.top) <= 1
      if (!fixedFollows) disabled = true
    }
    if (!ok) {
      leave()
      hideBackdrop()
      return false
    }
    html.setAttribute("data-edge-swipe", "drag")
    return true
  }

  /** Everything put back: the window scrolls again, from where it was. */
  function leave() {
    win.clearTimeout(drawRaf)
    drawRaf = 0
    muteScroll()
    restore()
    html.style.removeProperty("translate")
    html.style.removeProperty("transition")
    if (tab) {
      tab.style.removeProperty("translate")
      tab.style.removeProperty("transition")
    }
    /* At once, whatever the stylesheet says about smooth scrolling. */
    const own = html.style.scrollBehavior
    html.style.scrollBehavior = "auto"
    win.scrollTo(0, scrollY)
    html.style.scrollBehavior = own
    html.removeAttribute("data-edge-swipe")
    tab = null
  }

  function applyDraw(x: number) {
    offset = x
    html.style.translate = `${x}px 0px`
    if (tab) tab.style.translate = `${-x}px 0px`
    const p = progressOf(x, width)
    if (parts) {
      parts.dim.style.opacity = String(dimOpacity(p))
      parts.shadow.style.opacity = String(shadowOpacity(p))
    }
  }

  function draw(x: number) {
    if (phase !== "drag" && phase !== "settle") return
    if (drawRaf) {
      win.cancelAnimationFrame(drawRaf)
      drawRaf = 0
    }
    drawRaf = win.requestAnimationFrame(() => {
      drawRaf = 0
      applyDraw(x)
    })
  }

  /* ── The touch ─────────────────────────────────────────────────────────── */
  const reduced = () => win.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true

  function touchOf(e: TouchEvent): Touch | null {
    for (const list of [e.changedTouches, e.touches]) {
      for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i]
    }
    return null
  }

  function onStart(e: TouchEvent) {
    if (phase === "armed" || phase === "drag") {
      /* A second finger: whatever it is, this is no longer a swipe. */
      if (phase === "drag") springBack()
      else phase = "idle"
      return
    }
    if (phase !== "idle" || disabled || e.touches.length !== 1) return
    const t = e.touches[0]
    if (!startsAtEdge(t.clientX)) return
    if (!edgeSwipeRouteAllowed(win.location.pathname)) return
    if (backInFlight()) return
    if (planBack(readBackEvidence(), null).kind !== "history") return
    if (overlayUp(doc) || typing(doc)) return
    if (handledSideways(e.target instanceof Element ? e.target : null, win, t.clientX)) return
    phase = "armed"
    touchId = t.identifier
    startX = t.clientX
    startY = t.clientY
    samples = [[e.timeStamp, t.clientX]]
  }

  function onMove(e: TouchEvent) {
    if (phase !== "armed" && phase !== "drag") return
    const t = touchOf(e)
    if (!t) return
    const dx = t.clientX - startX
    if (phase === "armed") {
      const verdict = judgeMove(dx, t.clientY - startY)
      if (verdict === "wait") return
      if (verdict === "give-up" || !enter()) {
        phase = "idle"
        return
      }
      phase = "drag"
    }
    samples.push([e.timeStamp, t.clientX])
    if (samples.length > 12) samples.shift()
    draw(pageOffset(dx, width))
  }

  function onEnd(e: TouchEvent) {
    if (phase === "armed") {
      if (!touchOf(e) || e.touches.length === 0) phase = "idle"
      return
    }
    if (phase !== "drag") return
    if (e.type === "touchcancel") return springBack()
    const t = touchOf(e)
    if (t) {
      samples.push([e.timeStamp, t.clientX])
      applyDraw(pageOffset(t.clientX - startX, width))
    }
    if (shouldComplete(offset, width, releaseVelocity(samples))) slideOut()
    else springBack()
  }

  /* ── Letting go ────────────────────────────────────────────────────────── */
  function settle(to: number, ms: number, ease: string, then: () => void) {
    phase = "settle"
    html.setAttribute("data-edge-swipe", "settle")
    /* The values the transitions start from are the ones on screen. */
    void getComputedStyle(html).getPropertyValue("translate")
    win.cancelAnimationFrame(drawRaf)
    drawRaf = 0
    const move = `translate ${ms}ms ${ease}`
    const fade = `opacity ${ms}ms ${ease}`
    html.style.transition = move
    /* The tab bar's own slide (away on scroll) is the same property: it is put back with the rest. */
    if (tab) tab.style.transition = move
    if (parts) {
      parts.dim.style.transition = fade
      parts.shadow.style.transition = fade
    }
    applyDraw(to)
    win.clearTimeout(timer)
    timer = win.setTimeout(then, ms + 34)
  }

  function springBack() {
    if (phase !== "drag") return
    settle(0, cancelMs(offset, reduced()), CANCEL_EASE, () => {
      leave()
      hideBackdrop()
      phase = "idle"
    })
  }

  function slideOut() {
    const v = Math.max(0, releaseVelocity(samples))
    settle(width, completeMs(width - offset, v, reduced()), COMPLETE_EASE, () => {
      /* The page is off the screen: the stand in covers it, the window scrolls again, and the back goes. */
      placeOver()
      leave()
      phase = "wait"
      html.setAttribute("data-edge-swipe", "wait")
      leftPath = win.location.pathname
      onPop = () => {
        if (win.location.pathname === leftPath) win.setTimeout(arrive, SAME_PATH_SETTLE_MS)
      }
      win.addEventListener("popstate", onPop)
      capTimer = win.setTimeout(arrive, ARRIVAL_CAP_MS)
      if (parts) waiting(parts.root)
      /* The one back. A back already on its way (it cannot be: the finger was here) is waited for the same way. */
      if (!backInFlight()) backThen(arrive)
    })
  }

  /** The page behind is up (or the back did nothing): the stand in fades off whatever is there. */
  function arrive() {
    if (phase !== "wait") return
    phase = "reveal"
    waiting(null)
    win.clearTimeout(capTimer)
    if (onPop) win.removeEventListener("popstate", onPop)
    onPop = null
    html.setAttribute("data-edge-swipe", "reveal")
    /* The page under it is the one to press now. */
    if (parts) parts.root.style.pointerEvents = "none"
    const done = () => {
      reveal?.cancel()
      reveal = null
      hideBackdrop()
      html.removeAttribute("data-edge-swipe")
      phase = "idle"
    }
    /* Two frames: the page has been drawn and its scroll put back before it is shown. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!parts || reduced()) return done()
        try {
          reveal = parts.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL_MS, easing: REVEAL_EASE, fill: "forwards" })
          reveal.finished.then(done, done)
        } catch {
          done()
        }
      }),
    )
  }

  /** Anything that ends the visit to this page mid drag puts everything back at once. */
  function abort() {
    win.clearTimeout(timer)
    if (phase === "drag" || phase === "settle") {
      leave()
      hideBackdrop()
      phase = "idle"
    } else if (phase === "armed") {
      phase = "idle"
    }
  }

  function pathChanged(path: string) {
    if (phase === "wait") {
      if (path !== leftPath) arrive()
      return
    }
    /* Something else moved the page while a finger was on it: put everything back. */
    if (phase === "armed" || phase === "drag" || phase === "settle") abort()
    if (phase === "reveal") return
    /* A missed cleanup must never leave the shell shifted sideways. */
    if (html.getAttribute("data-edge-swipe") || html.style.translate) clearEdgeSwipeStyles()
    else disabled = false
  }

  const onHide = () => {
    if (doc.visibilityState === "hidden") abort()
  }
  const opts: AddEventListenerOptions = { passive: true, capture: true }
  win.addEventListener("touchstart", onStart, opts)
  win.addEventListener("touchmove", onMove, opts)
  win.addEventListener("touchend", onEnd, opts)
  win.addEventListener("touchcancel", onEnd, opts)
  doc.addEventListener("visibilitychange", onHide)
  win.addEventListener("pagehide", abort)

  return {
    pathChanged,
    dispose() {
      abort()
      clearEdgeSwipeStyles()
      if (phase === "wait" || phase === "reveal") {
        waiting(null)
        reveal?.cancel()
        html.removeAttribute("data-edge-swipe")
        phase = "idle"
      }
      win.removeEventListener("touchstart", onStart, opts)
      win.removeEventListener("touchmove", onMove, opts)
      win.removeEventListener("touchend", onEnd, opts)
      win.removeEventListener("touchcancel", onEnd, opts)
      doc.removeEventListener("visibilitychange", onHide)
      win.removeEventListener("pagehide", abort)
      if (onPop) win.removeEventListener("popstate", onPop)
      win.clearTimeout(capTimer)
      parts?.root.remove()
      parts = null
    },
  }
}
