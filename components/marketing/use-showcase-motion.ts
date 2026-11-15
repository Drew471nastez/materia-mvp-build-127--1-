"use client"

import { useCallback, useEffect, useRef } from "react"
import { RailMotion, SHOWCASE_MOTION, type RailMotionConfig } from "@/lib/ui/rail-motion"

/*
  THE SHOWCASE'S MOTION (round 60). One controller (lib/ui/rail-motion) owns
  the rail's position: dragging, release momentum, settling, the trackpad,
  the wheel, the keys and autoplay. It replaces Keen Slider here, whose drag,
  release animation and the autoplay timer around it were three systems
  moving one position.

  What it snaps to depends on the width, as before: from 768px a complete
  wide, OnePage, wide group comes to rest; on a phone each card does, its
  left edge on the page's gutter.

  Wave 13: a flick or a short drag is a whole step, and every timed motion
  (the settle, autoplay) plays on the compositor (lib/ui/rail-motion), so
  autoplay does no work per frame; it runs only while half the rail is on
  screen and the tab is visible.
*/
const PHONE = "(max-width: 767px)"

/*
  LANDING ROUND 5, THE OWNER (on an iPhone): "the swipe doesn't work at all.
  I go with the touch and it doesn't work. It doesn't initialize. It thinks
  that I want to scroll the page." Wanted: a swipe that is smooth,
  "butterish", and autoplay that "doesn't interfere with it" and still runs.

  So on a touch screen, and on any screen under 768px, the rail is the
  browser's own horizontal scroller with scroll snapping, and the script only
  runs autoplay (useNativeRail below). The finger is then the browser's, as
  in the photo row of a native app: the browser's own gesture recogniser
  decides the axis, so a sideways swipe moves the cards at once and a
  vertical one scrolls the page; the throw carries on with the system's
  momentum and lands on a card (scroll-snap-type: x mandatory, a hard flick
  passes several); overscroll-behavior-x keeps a swipe at either end from
  becoming the back gesture. It all runs on the compositor's scroll thread,
  no script per frame. A rail driven by pointer events has to win the
  gesture from the page first, and on iOS that race is what was lost.

  With a mouse from 768px up, RailMotion keeps the rail as before.
*/
const NATIVE = "(max-width: 767px), (pointer: coarse)"
/*
  LANDING ROUND 6, THE OWNER: the swipe should feel like a native app's photo
  row, "smooth and clean", and autoplay must never yank the strip. Round 5
  counted the 4s back from the finger lifting, while the throw's momentum
  was still running, and could then scrollTo into a moving rail. Now every
  scroll the reader causes (a finger, its momentum, a trackpad, the keys)
  counts as reading: autoplay waits until idleMs after the last of them, never
  starts while the rail is still moving (settleMs of quiet first), and its own
  smooth scroll is told apart from the reader's.
*/
/** Autoplay on the native rail: a card every intervalMs, back only idleMs after the reader's last scroll, and never into a moving rail. */
export const SHOWCASE_NATIVE = { intervalMs: 4200, idleMs: 6000, settleMs: 220 } as const

/*
  LANDING ROUND, THE OWNER: pull to drag and swipe, with the mouse and the
  finger, "butter" smooth. The hand still holds the rail exactly; what
  changes is the letting go. The settle used to leave at up to half of the
  fastest speed a spring could take (a whole group at about 8,000px/s after
  a slow pull), a visible jolt. Now it glides on from the hand's own speed
  (glideCurve: no jump in speed, never past its place, about half a second
  for a whole group), and a hard flick on a phone carries on through up to
  three cards, as a native scroller would. Autoplay is unchanged.
*/
/*
  LANDING ROUND 4, THE OWNER: "when I just swipe a little bit, I don't have to
  swipe so long". A short flick is a whole step: a release faster than
  110px/s goes on in its own direction, and a drag of 6% of the step (10 to
  14px, about a third of the 40px it was) is enough on its own. The 6px before a
  press becomes a drag, and the vertical test there, are unchanged, so a
  finger moving down the page still scrolls it.
*/
export const SHOWCASE_RAIL: RailMotionConfig = {
  ...SHOWCASE_MOTION,
  swipeVelocity: 110,
  swipeDistanceRatio: 0.06,
  swipeDistanceMin: 10,
  swipeDistanceMax: 14,
  swipeMaxSteps: 3,
  glideSettle: { minMs: 280, maxMs: 520, msPerPx: 0.18, minLaunch: 0.7 },
}

type Hooks = { onFirstMove: () => void; setVisible: (fn: (visible: boolean) => void) => void }

/** The rail under a mouse from 768px: RailMotion, as before. Returns its cleanup. */
function startRail(el: HTMLDivElement, viewport: HTMLElement, hooks: Hooks): () => void {
  const phone = matchMedia(PHONE)
  const groups = () => [...el.querySelectorAll<HTMLElement>(".build-showcase-group")]
  const slides = () => [...el.querySelectorAll<HTMLElement>(".build-showcase-slide")]
  const parts = () => (phone.matches ? { items: slides(), snaps: slides() } : { items: groups(), snaps: groups() })

  /* Whatever the native scroller was moved to before the script came is undone, then it stops scrolling. */
  el.scrollLeft = 0
  el.dataset.railReady = "true"
  const { items, snaps } = parts()
  const motion = new RailMotion(el, items, snaps, SHOWCASE_RAIL, {
    /* Wave 13: nothing on the page restyles while the rail moves; the first move only lets the phone's left gutter show the card before. */
    onMoving: (moving) => {
      if (moving) hooks.onFirstMove()
    },
    onDragging: (dragging) => {
      if (dragging) el.dataset.dragging = "true"
      else delete el.dataset.dragging
    },
    onIndex: (index) => {
      el.dataset.showcaseIndex = String(index)
    },
  })
  hooks.setVisible((visible) => motion.setVisible(visible))

  /* Layout changes (a resize, images arriving) are measured once and never during motion. */
  let frame = 0
  const remeasure = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const next = parts()
      motion.measure(next.items, next.snaps)
    })
  }
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
  resize?.observe(viewport)
  phone.addEventListener("change", remeasure)

  return () => {
    cancelAnimationFrame(frame)
    resize?.disconnect()
    phone.removeEventListener("change", remeasure)
    motion.dispose()
    delete el.dataset.railReady
    delete el.dataset.dragging
  }
}

/**
 * The native rail on a touch screen or a phone width: the browser scrolls and snaps, this only plays autoplay and
 * steps aside for the reader. Nothing here runs per frame; card places are read once per layout change.
 */
function startNative(el: HTMLDivElement, viewport: HTMLElement, hooks: Hooks): () => void {
  el.dataset.showcaseNative = "true"
  const phone = matchMedia(PHONE)
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")
  const snapsOf = () => [...el.querySelectorAll<HTMLElement>(phone.matches ? ".build-showcase-slide" : ".build-showcase-group")]
  /* Each card's resting scrollLeft, read once per layout change (offsetLeft is from the rail's own padding box). */
  let stops: number[] = []
  const measure = () => {
    const pad = phone.matches ? parseFloat(getComputedStyle(el).scrollPaddingLeft) || 0 : 0
    const max = el.scrollWidth - el.clientWidth
    stops = snapsOf().map((s) => Math.min(max, Math.max(0, s.offsetLeft - pad)))
    stops = stops.filter((v, i) => i === 0 || v > stops[i - 1] + 1)
  }

  let visible = false
  let paused = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let touching = false
  /* performance.now() of the reader's last input or scroll, of the rail's last scroll of any kind, and of autoplay's last step. */
  let lastRead = -Infinity
  let lastMove = -Infinity
  let lastStep = performance.now()
  /* True from autoplay's scrollTo until the rail is quiet again: those scroll events are autoplay's, not the reader's. */
  let auto = false

  const canPlay = () => visible && !paused && !document.hidden && !reduce.matches && stops.length > 1
  /* One timer at most, rearmed only when it fires or the conditions change: nothing runs per scroll event but two numbers. */
  const schedule = (ms: number = SHOWCASE_NATIVE.intervalMs) => {
    clearTimeout(timer)
    timer = undefined
    if (!canPlay()) return
    timer = setTimeout(tick, Math.max(ms, 120))
  }
  const tick = () => {
    timer = undefined
    if (!canPlay()) return
    const now = performance.now()
    if (now - lastMove > SHOWCASE_NATIVE.settleMs) auto = false
    const due = Math.max(
      lastRead + SHOWCASE_NATIVE.idleMs,
      lastStep + SHOWCASE_NATIVE.intervalMs,
      lastMove + SHOWCASE_NATIVE.settleMs,
    )
    if (touching || due > now) return schedule(touching ? SHOWCASE_NATIVE.idleMs : due - now)
    step()
  }
  const step = () => {
    const x = el.scrollLeft
    /* The card the rail rests on now, then the next, or back to the first. */
    let at = 0
    for (let i = 0; i < stops.length; i++) if (Math.abs(stops[i] - x) < Math.abs(stops[at] - x)) at = i
    const next = at + 1 < stops.length ? at + 1 : 0
    auto = true
    lastStep = performance.now()
    el.scrollTo({ left: stops[next], behavior: "smooth" })
    schedule()
  }
  /* The reader has the rail: autoplay waits idleMs from now, and whatever autoplay was doing is theirs. */
  const hold = () => {
    hooks.onFirstMove()
    auto = false
    lastRead = performance.now()
    if (!timer) schedule(SHOWCASE_NATIVE.idleMs)
  }
  const onTouchStart = () => {
    touching = true
    hold()
  }
  const onTouchEnd = () => {
    touching = false
    hold()
  }
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "touch") return
    hold()
  }
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    hold()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault()
      paused = !paused
      el.dataset.autoplayPaused = String(paused)
      schedule()
      return
    }
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    e.preventDefault()
    hold()
    const x = el.scrollLeft
    const target = e.key === "ArrowRight" ? stops.find((s) => s > x + 2) : [...stops].reverse().find((s) => s < x - 2)
    if (target !== undefined) el.scrollTo({ left: target, behavior: reduce.matches ? "auto" : "smooth" })
  }
  /* The first sideways move by the reader lets the phone's left gutter show the card before (data-showcase-pristine). */
  const onScroll = () => {
    const now = performance.now()
    lastMove = now
    /* Not autoplay's own scroll: the reader's finger, its momentum, a trackpad or the keys. */
    if (!auto) lastRead = now
    if (el.scrollLeft > 4) hooks.onFirstMove()
  }

  /*
    A mouse on a narrow window (or a touch laptop's mouse) can still pull the rail: it scrolls it by hand with the
    snapping off, and on release the rail is handed the nearest card. A finger never comes here.
  */
  let drag: { id: number; x0: number; left: number; moved: boolean } | null = null
  const onMouseDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return
    drag = { id: e.pointerId, x0: e.clientX, left: el.scrollLeft, moved: false }
  }
  const onMouseMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const dx = e.clientX - drag.x0
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return
      drag.moved = true
      el.dataset.dragging = "true"
      el.style.scrollSnapType = "none"
      try {
        el.setPointerCapture(e.pointerId)
      } catch {}
    }
    el.scrollLeft = drag.left - dx
  }
  const onMouseUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const moved = drag.moved
    drag = null
    if (!moved) return
    delete el.dataset.dragging
    const x = el.scrollLeft
    /* The card in the direction pulled, once past a sixth of the way. */
    let at = 0
    for (let i = 0; i < stops.length; i++) if (Math.abs(stops[i] - x) < Math.abs(stops[at] - x)) at = i
    el.style.scrollSnapType = ""
    el.scrollTo({ left: stops[at] ?? 0, behavior: "smooth" })
    hold()
  }
  const onClick = (e: MouseEvent) => {
    if (el.dataset.dragging) e.preventDefault()
  }
  const onVisibility = () => schedule()
  const onReduce = () => schedule()

  measure()
  let frame = 0
  const remeasure = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
  resize?.observe(viewport)
  phone.addEventListener("change", remeasure)
  reduce.addEventListener("change", onReduce)

  const passive = { passive: true } as const
  el.addEventListener("touchstart", onTouchStart, passive)
  el.addEventListener("touchend", onTouchEnd, passive)
  el.addEventListener("touchcancel", onTouchEnd, passive)
  el.addEventListener("pointerdown", onPointerDown, passive)
  el.addEventListener("pointerdown", onMouseDown)
  el.addEventListener("pointermove", onMouseMove)
  el.addEventListener("pointerup", onMouseUp)
  el.addEventListener("pointercancel", onMouseUp)
  el.addEventListener("click", onClick, true)
  el.addEventListener("wheel", onWheel, passive)
  el.addEventListener("keydown", onKey)
  el.addEventListener("scroll", onScroll, passive)
  document.addEventListener("visibilitychange", onVisibility)
  hooks.setVisible((v) => {
    /* Coming on screen, the rail rests a whole interval before autoplay's first step. */
    if (v && !visible) lastStep = performance.now()
    visible = v
    schedule()
  })

  return () => {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    resize?.disconnect()
    phone.removeEventListener("change", remeasure)
    reduce.removeEventListener("change", onReduce)
    el.removeEventListener("touchstart", onTouchStart)
    el.removeEventListener("touchend", onTouchEnd)
    el.removeEventListener("touchcancel", onTouchEnd)
    el.removeEventListener("pointerdown", onPointerDown)
    el.removeEventListener("pointerdown", onMouseDown)
    el.removeEventListener("pointermove", onMouseMove)
    el.removeEventListener("pointerup", onMouseUp)
    el.removeEventListener("pointercancel", onMouseUp)
    el.removeEventListener("click", onClick, true)
    el.removeEventListener("wheel", onWheel)
    el.removeEventListener("keydown", onKey)
    el.removeEventListener("scroll", onScroll)
    document.removeEventListener("visibilitychange", onVisibility)
    el.style.scrollSnapType = ""
    delete el.dataset.showcaseNative
    delete el.dataset.dragging
  }
}

export function useShowcaseMotion() {
  const cleanup = useRef<(() => void) | null>(null)

  const attach = useCallback((el: HTMLDivElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!el) return
    const section = el.closest<HTMLElement>("[data-build-showcase]")
    const viewport = el.parentElement ?? el
    const native = matchMedia(NATIVE)

    /* Autoplay only while half the rail is on screen; the first sight of it plays the cards' entrance. */
    let visible = !("IntersectionObserver" in window)
    let onVisible: (visible: boolean) => void = () => {}
    const hooks: Hooks = {
      onFirstMove: () => {
        if (section?.hasAttribute("data-showcase-pristine")) section.removeAttribute("data-showcase-pristine")
      },
      setVisible: (fn) => {
        onVisible = fn
        fn(visible)
      },
    }
    let stop = (native.matches ? startNative : startRail)(el, viewport, hooks)
    /* A window resized across 768px, or a mouse plugged into a tablet: the other rail takes over from the start. */
    const swap = () => {
      stop()
      el.scrollLeft = 0
      stop = (native.matches ? startNative : startRail)(el, viewport, hooks)
    }
    native.addEventListener("change", swap)

    /*
      Wave 14: every card's picture is fetched and decoded as soon as the
      section comes on screen, not when its card is moved into view. The
      pictures are lazy in the markup (nothing off screen costs the page's
      first load), but a card brought in by a swipe or autoplay was still
      empty for a moment at 4x CPU while its picture loaded. Twelve small
      webps, decoded off the main thread (decoding="async", img.decode()).
    */
    let warmed = false
    const warm = () => {
      if (warmed) return
      warmed = true
      for (const img of el.querySelectorAll<HTMLImageElement>("img")) {
        img.loading = "eager"
        img.decode?.().catch(() => {})
      }
    }

    const seen =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                if (entry.isIntersecting) warm()
                if (entry.target === el) {
                  visible = entry.intersectionRatio >= 0.5
                  onVisible(visible)
                  if (entry.isIntersecting) viewport.setAttribute("data-showcase-entered", "")
                } else if (entry.isIntersecting) section?.setAttribute("data-showcase-entered", "")
              }
            },
            { threshold: [0, 0.1, 0.5] },
          )
        : null
    seen?.observe(el)
    const heading = section?.querySelector(".build-showcase-top")
    if (heading) seen?.observe(heading)
    if (!seen) warm()

    cleanup.current = () => {
      seen?.disconnect()
      native.removeEventListener("change", swap)
      stop()
    }
  }, [])

  useEffect(() => () => cleanup.current?.(), [])

  return attach
}
