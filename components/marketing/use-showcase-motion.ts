"use client"

import { useCallback, useEffect, useRef } from "react"
import { RAIL_AXIS, bindRailGesture } from "./rail-gesture"
import { frameLeg, type FrameLeg } from "./rail-frames"

/*
  THE SHOWCASE'S MOTION. LANDING ROUND 8, the owner: "I don't like the pull
  to swipe / pull to drag in that section. It doesn't initialize, especially
  on mobile devices, or on desktop and large screens ... I have to make the
  whole drag too long. Make it buttery like the 'Storelib is for creators'
  section." LANDING ROUND 9, after round 8: "still the drag is not smooth: I
  have to pull, press and swipe much longer to initialize the swipe", "it
  must not mistake scrolling down for swiping", "when I swipe through it, it
  lags a lot".

  One engine moves the rail on every screen, with a finger and with a mouse:

  - The rail is a transform. Whose a gesture is, the rail's or the page's
    scroll, is rail-gesture.ts (round 9): a touch is read from touch events,
    decided after 4px, across only under about 40 degrees from level, and the
    rail follows from that very point. A gesture going down is never
    cancelled, so the page scrolls. (The browser's own sideways scroller with
    snapping was measured again in round 9, scripts/check-landing-r9-rails.mjs:
    it is no smoother than this in WebKit, and it cannot be told that a short
    pull means the next card, which is what the owner asked for in round 8.)
  - On release the rail goes to a card chosen from the throw: a flick faster
    than flickVelocity, or a drag longer than flickDistance, moves at least
    one card in its direction, and a hard throw carries on through up to
    maxSteps cards (where its momentum would have taken it). A 60px flick is
    one card on a phone and one page of three on a desktop.
  - The glide to that card is a Web Animation on the compositor whose curve
    starts at the hand's own speed (glideEasing), so letting go has no jolt
    and nothing runs on the main thread per frame.
  - Autoplay steps a card every intervalMs while half the rail is on screen
    and the tab is visible; any touch, drag, wheel or key holds it, and it
    comes back idleMs after the reader's last input with a soft ease, never
    into a moving rail.
  - What a drag costs (round 9): one transform a frame on one layer. The
    rail's fading mask, the captions' own layers and the whole rail's fade
    are gone, and the pictures are decoded before they are needed.
*/
export const SHOWCASE_GESTURE = {
  /** px a pointer moves before the gesture is read as across (the rail's) or down (the page's): rail-gesture.ts, round 9. */
  axisSlop: RAIL_AXIS.slop,
  /** px/s: a release faster than this goes on to the next card in its direction. */
  flickVelocity: 160,
  /** A slow drag this long moves a card on its own: a share of the step, between min and max px. */
  flickDistanceRatio: 0.06,
  flickDistanceMin: 12,
  flickDistanceMax: 28,
  /** How far a throw would coast, in seconds of its release speed: where it lands decides how many cards it passes. */
  projectSeconds: 0.22,
  /** The most cards one throw passes (a phone; a desktop page of three passes one). */
  maxSteps: 3,
  /** Past either end the rail gives a third of the pull. */
  edgeResistance: 0.32,
  /** The glide to a card: base ms plus ms per px, clamped. */
  glideMinMs: 360,
  glideMaxMs: 760,
  glideMsPerPx: 0.32,
} as const

/** Autoplay: a card every intervalMs, back only idleMs after the reader's last input, its own step a slow soft ease. */
export const SHOWCASE_AUTOPLAY = { intervalMs: 4200, idleMs: 5000, stepMs: 900, rewindMs: 1300, easing: "cubic-bezier(.45,0,.2,1)" } as const

/** Landing round 11: the pictures are fetched and decoded from this far ahead of the section, this many at a time. */
export const SHOWCASE_PRELOAD = { marginPx: 1600, parallel: 3 } as const

const PHONE = "(max-width: 767px)"

/**
 * Where a released rail comes to rest. x: where it is now; moved: how far the pointer pulled it (positive: towards
 * later cards); v: the release speed, px/s, positive towards later cards; stops: the cards' resting places in order;
 * from: the card the gesture started on. Returns the index of the card to glide to.
 */
export function chooseShowcaseStop(x: number, moved: number, v: number, stops: readonly number[], from: number, maxSteps: number = SHOWCASE_GESTURE.maxSteps): number {
  if (stops.length === 0) return 0
  const last = stops.length - 1
  const step = stops.length > 1 ? Math.abs(stops[1] - stops[0]) : 1
  const nearest = (to: number) => {
    let at = 0
    for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i] - to) < Math.abs(stops[at] - to)) at = i
    return at
  }
  const g = SHOWCASE_GESTURE
  const distance = Math.max(g.flickDistanceMin, Math.min(g.flickDistanceMax, step * g.flickDistanceRatio))
  const flick = Math.abs(v) >= g.flickVelocity
  /* The way the reader meant: the throw's, or the pull's when there was no throw. */
  const dir = flick ? Math.sign(v) : Math.abs(moved) >= distance ? Math.sign(moved) : 0
  let target = nearest(x + v * g.projectSeconds)
  if (dir > 0) target = Math.max(target, from + 1)
  if (dir < 0) target = Math.min(target, from - 1)
  if (dir === 0) target = nearest(x)
  target = Math.max(from - maxSteps, Math.min(from + maxSteps, target))
  return Math.max(0, Math.min(last, target))
}

/**
 * A curve for a glide of `distance` px over `ms` that starts at `speed` px/s (along the glide) and eases to a stop:
 * its first control point's slope is the hand's own speed, so there is no jump in speed when the hand lets go.
 */
export function glideEasing(distance: number, speed: number, ms: number): string {
  const d = Math.abs(distance)
  if (d < 0.5 || speed <= 0) return "cubic-bezier(.3,.1,.2,1)"
  const slope = (speed * ms) / 1000 / d
  const x1 = Math.min(0.33, 1 / Math.max(slope, 0.001))
  const y1 = Math.min(1, slope * x1)
  return `cubic-bezier(${x1.toFixed(3)},${y1.toFixed(3)},.24,1)`
}

type Hooks = { onFirstMove: () => void; setVisible: (fn: (visible: boolean) => void) => void }

/** The rail on every screen and pointer. Returns its cleanup. Nothing here reads layout per frame. */
function startRail(el: HTMLDivElement, viewport: HTMLElement, hooks: Hooks): () => void {
  const g = SHOWCASE_GESTURE
  const phone = matchMedia(PHONE)
  const reduce = matchMedia("(prefers-reduced-motion: reduce)")

  /* Whatever the native scroller (before the script) was moved to is undone, then the rail is a transform. */
  el.scrollLeft = 0
  el.dataset.railReady = "true"

  /* x: how far the rail has travelled left, px. stops: each card's (or, from 768px, each page's) resting x. */
  let x = 0
  let stops: number[] = [0]
  let index = 0
  let glide: Animation | FrameLeg | null = null
  /* The glide is the page's own frames (a touch screen) rather than a Web Animation. */
  let glideFrames = false
  const touch = matchMedia("(hover: none), (pointer: coarse)")
  let paintFrame = 0

  const paint = () => {
    paintFrame = 0
    el.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0)`
  }
  const schedulePaint = () => {
    if (!paintFrame) paintFrame = requestAnimationFrame(paint)
  }
  const setIndex = (i: number) => {
    index = i
    el.dataset.showcaseIndex = String(i)
  }

  /* Read once per layout change (a resize, a font, the phone breakpoint), never while the rail moves. */
  const measure = () => {
    const items = [...el.querySelectorAll<HTMLElement>(phone.matches ? ".build-showcase-slide" : ".build-showcase-group")]
    if (!items.length) return
    const pad = phone.matches ? parseFloat(getComputedStyle(el).paddingLeft) || 0 : 0
    const lastItem = items[items.length - 1]
    const end = lastItem.offsetLeft + lastItem.offsetWidth + pad
    const max = Math.max(0, end - el.clientWidth)
    const next = items.map((s) => Math.min(max, Math.max(0, s.offsetLeft - pad)))
    stops = next.filter((v, i) => i === 0 || v > next[i - 1] + 1)
    const at = Math.min(index, stops.length - 1)
    stopGlide()
    x = stops[at]
    setIndex(at)
    paint()
  }

  /*
    The rail's place this moment, and the glide let go (a gesture's start).
    Landing round 12: on a touch screen the glide is the page's own frames
    (rail-frames.ts), so its place is the one last written, which is what is
    drawn; a Web Animation's place is read off the style, which in WebKit can
    be behind what its compositor has drawn, and the rail stepped back under
    the finger.
  */
  const stopGlide = () => {
    if (!glide) return
    if (glideFrames) {
      x = (glide as FrameLeg).at()
    } else {
      glide.pause()
      const m = getComputedStyle(el).transform
      if (m && m !== "none") x = -new DOMMatrixReadOnly(m).m41
    }
    glide.cancel()
    glide = null
    paint()
  }

  const glideTo = (i: number, ms: number, easing: string) => {
    stopGlide()
    const to = stops[i] ?? 0
    setIndex(i)
    if (Math.abs(to - x) < 0.5 || reduce.matches || typeof el.animate !== "function") {
      x = to
      paint()
      return
    }
    const from = x
    glideFrames = touch.matches
    if (glideFrames) {
      const leg = frameLeg(from, to - from, ms, easing, (v) => {
        x = v
        paint()
      })
      glide = leg
      leg.onfinish = () => {
        if (glide === leg) glide = null
      }
      return
    }
    const anim = el.animate([{ transform: `translate3d(${(-from).toFixed(2)}px,0,0)` }, { transform: `translate3d(${(-to).toFixed(2)}px,0,0)` }], { duration: ms, easing })
    glide = anim
    /* The end is written to the style first, then the animation goes: nothing flashes between them. */
    x = to
    paint()
    anim.onfinish = () => {
      if (glide === anim) glide = null
      anim.cancel()
    }
  }
  const settle = (i: number, speed: number) => {
    const to = stops[i] ?? 0
    const d = Math.abs(to - x)
    const ms = Math.round(Math.max(g.glideMinMs, Math.min(g.glideMaxMs, g.glideMinMs + d * g.glideMsPerPx - Math.min(160, Math.abs(speed) * 0.04))))
    /* The hand's speed counts only if it was going the glide's way. */
    const along = Math.sign(to - x) === Math.sign(speed) ? Math.abs(speed) : 0
    glideTo(i, ms, glideEasing(d, along, ms))
  }
  const moving = () => !!glide

  /* ---------- autoplay ---------- */
  let visible = false
  let paused = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastInput = -Infinity
  let lastStep = performance.now()
  let holding = false
  const canPlay = () => visible && !paused && !document.hidden && !reduce.matches && stops.length > 1
  const schedule = (ms: number = SHOWCASE_AUTOPLAY.intervalMs) => {
    clearTimeout(timer)
    timer = undefined
    if (!canPlay()) return
    timer = setTimeout(tick, Math.max(ms, 120))
  }
  const tick = () => {
    timer = undefined
    if (!canPlay()) return
    const now = performance.now()
    const due = Math.max(lastInput + SHOWCASE_AUTOPLAY.idleMs, lastStep + SHOWCASE_AUTOPLAY.intervalMs)
    if (holding || drag || moving() || due > now) return schedule(holding || drag ? SHOWCASE_AUTOPLAY.idleMs : Math.max(240, due - now))
    lastStep = now
    const next = index + 1 < stops.length ? index + 1 : 0
    glideTo(next, next === 0 ? SHOWCASE_AUTOPLAY.rewindMs : SHOWCASE_AUTOPLAY.stepMs, SHOWCASE_AUTOPLAY.easing)
    schedule()
  }
  /* The reader has the rail: autoplay waits idleMs from their last input. */
  const read = () => {
    lastInput = performance.now()
    if (!timer) schedule(SHOWCASE_AUTOPLAY.idleMs)
  }

  /* ---------- the pointer: a finger, a pen or a mouse (rail-gesture.ts decides whose the gesture is) ---------- */
  let drag: { fromX: number; from: number } | null = null
  const max = () => stops[stops.length - 1] ?? 0
  /* Past either end the rail gives less than the pull. */
  const resist = (to: number) => (to < 0 ? to * g.edgeResistance : to > max() ? max() + (to - max()) * g.edgeResistance : to)
  /* The card nearest where the rail is: the one a gesture starts from. */
  const nearest = () => {
    let from = 0
    for (let i = 1; i < stops.length; i++) if (Math.abs(stops[i] - x) < Math.abs(stops[from] - x)) from = i
    return from
  }
  const gesture = bindRailGesture(el, {
    press: () => {
      /* Caught where it is: a glide stops under the finger. */
      stopGlide()
      holding = true
      read()
      drag = { fromX: x, from: nearest() }
    },
    start: () => {
      el.dataset.dragging = "true"
      hooks.onFirstMove()
      if (drag) drag.fromX = x
    },
    move: (dx) => {
      if (!drag) return
      /* 1:1 with the pointer, drawn once a frame and only in a frame it moved. */
      x = resist(drag.fromX - dx)
      schedulePaint()
    },
    release: ({ dragged, speed }) => {
      const d = drag
      drag = null
      holding = false
      delete el.dataset.dragging
      read()
      if (!d) return
      if (!dragged) {
        /* Handed to the page's scroll, or a tap: the rail goes back to rest where it was caught. */
        if (Math.abs(x - (stops[d.from] ?? 0)) > 0.5) settle(d.from, 0)
        return
      }
      if (paintFrame) {
        cancelAnimationFrame(paintFrame)
        paint()
      }
      const v = Math.max(-4000, Math.min(4000, speed))
      settle(chooseShowcaseStop(x, x - d.fromX, v, stops, d.from, phone.matches ? g.maxSteps : 1), v)
    },
  })

  /* ---------- a trackpad's sideways swipe or a sideways wheel ---------- */
  let wheel: { fromX: number; from: number; sum: number; quiet: ReturnType<typeof setTimeout> | undefined } | null = null
  let wheelLockUntil = 0
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
    e.preventDefault()
    read()
    const now = performance.now()
    /* A trackpad's own momentum after the rail has already gone on to its card is not a new swipe. */
    if (now < wheelLockUntil) {
      wheelLockUntil = now + 160
      return
    }
    if (!wheel) {
      stopGlide()
      wheel = { fromX: x, from: nearest(), sum: 0, quiet: undefined }
      hooks.onFirstMove()
    }
    const px = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX
    wheel.sum += px
    x = resist(wheel.fromX + wheel.sum)
    schedulePaint()
    clearTimeout(wheel.quiet)
    /* A swipe that has gone a card's flick distance goes on at once; a slow one settles when the wheel goes quiet. */
    const step = stops.length > 1 ? Math.abs(stops[1] - stops[0]) : 1
    const enough = Math.abs(wheel.sum) >= Math.max(g.flickDistanceMin, Math.min(g.flickDistanceMax * 2, step * 0.12))
    const finish = () => {
      if (!wheel) return
      const w = wheel
      wheel = null
      clearTimeout(w.quiet)
      wheelLockUntil = performance.now() + 160
      settle(chooseShowcaseStop(x, w.sum, 0, stops, w.from, 1), 0)
    }
    if (enough) finish()
    else wheel.quiet = setTimeout(finish, 140)
  }

  /* ---------- keys ---------- */
  const onKey = (e: KeyboardEvent) => {
    if (e.key === " ") {
      e.preventDefault()
      paused = !paused
      el.dataset.autoplayPaused = String(paused)
      schedule()
      return
    }
    const to = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? stops.length - 1 : null
    if (to === null) return
    e.preventDefault()
    read()
    hooks.onFirstMove()
    settle(Math.max(0, Math.min(stops.length - 1, to)), 0)
  }
  const onVisibility = () => schedule()
  const onReduce = () => schedule()

  /* Wave 13 perf: the first measure comes from the ResizeObserver's first report, after layout, not as the section mounts. */
  let frame = 0
  const remeasure = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(measure)
  }
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
  resize?.observe(viewport)
  if (!resize) measure()
  phone.addEventListener("change", remeasure)
  reduce.addEventListener("change", onReduce)

  el.addEventListener("wheel", onWheel, { passive: false })
  el.addEventListener("keydown", onKey)
  document.addEventListener("visibilitychange", onVisibility)
  hooks.setVisible((v) => {
    /* Coming on screen, the rail rests a whole interval before autoplay's first step. */
    if (v && !visible) lastStep = performance.now()
    visible = v
    schedule()
  })

  return () => {
    clearTimeout(timer)
    clearTimeout(wheel?.quiet)
    cancelAnimationFrame(frame)
    cancelAnimationFrame(paintFrame)
    glide?.cancel()
    resize?.disconnect()
    phone.removeEventListener("change", remeasure)
    reduce.removeEventListener("change", onReduce)
    gesture.destroy()
    el.removeEventListener("wheel", onWheel)
    el.removeEventListener("keydown", onKey)
    document.removeEventListener("visibilitychange", onVisibility)
    el.style.transform = ""
    delete el.dataset.railReady
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
    const stop = startRail(el, viewport, hooks)

    /*
      THE PICTURES, LANDING ROUND 9. The owner: "as I scroll down on mobile,
      the images appear very stutterish and too direct instead of smooth; they
      take too much performance." Wave 14 fetched and decoded all twelve at
      once, at full size, the moment the section touched the screen. Now the
      files are the size they are drawn at (build-showcase.tsx), the first two
      are in the page's first load, and the rest are fetched and decoded two
      at a time, off the main thread, from a screen before the section
      arrives. A picture is shown only once it is decoded, with a short fade
      (data-shown, the stylesheet); its card holds its place and its ground
      meanwhile, so nothing moves and nothing flashes half drawn.
    */
    const pictures = [...el.querySelectorAll<HTMLImageElement>("img")]
    const pending: HTMLImageElement[] = []
    for (const img of pictures) {
      /* Already there when the script arrived (the first two, or a cached visit): shown as it is, no fade. */
      if (img.complete && img.naturalWidth > 0) img.setAttribute("data-shown", "now")
      else pending.push(img)
    }
    let warmed = false
    const next = (): void => {
      const img = pending.shift()
      if (!img) return
      img.loading = "eager"
      const shown = () => {
        img.setAttribute("data-shown", "")
        next()
      }
      /* decode() waits for the file and its decoding; a browser without it shows the picture on load. */
      if (typeof img.decode === "function") img.decode().then(shown, shown)
      else if (img.complete) shown()
      else img.addEventListener("load", shown, { once: true })
    }
    /*
      Landing round 11 (the owner: "as I scroll down, the images of this
      section appear too abruptly and glitchy"): the decoding starts two
      screens ahead (SHOWCASE_PRELOAD.marginPx), three at a time, so by the
      time the rail is on screen its pictures are ready and each one eases in
      (opacity and a 2.5% zoom settling, the stylesheet) rather than popping.
    */
    const warm = () => {
      if (warmed) return
      warmed = true
      for (let i = 0; i < SHOWCASE_PRELOAD.parallel; i++) next()
    }
    const near = typeof IntersectionObserver === "function" ? new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && warm(), { rootMargin: `${SHOWCASE_PRELOAD.marginPx}px 0px` }) : null
    if (section) near?.observe(section)

    const seen =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
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
    if (!near || !section) warm()

    cleanup.current = () => {
      near?.disconnect()
      pending.length = 0
      seen?.disconnect()
      stop()
    }
  }, [])

  useEffect(() => () => cleanup.current?.(), [])

  return attach
}
