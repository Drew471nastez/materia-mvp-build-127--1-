/*
  A RAIL'S MOTION RUN BY THE PAGE, ONE TRANSFORM A FRAME (landing round 12).

  The owner, of the creators rail: "on touch, when the finger goes down to
  swipe, it glitches and stutters left and right before it swipes".

  Rounds 8 to 11 moved the rails' own motion (the drift, a throw's glide, a
  step to the next card) as Web Animations, drawn by the compositor. A
  finger coming down has to stop that motion where it is drawn, and the page
  cannot know where that is: it can only read where its own clock says the
  animation is. In Chromium the two are the same frame (measured, scripts/
  check-landing-r12-rails.mjs, by reading the screen itself). In WebKit the
  compositor runs in another process, ahead of the page's clock, so the
  place the page reads and writes back is behind what is on screen: the rail
  steps back against the swipe, by a throw's speed times that lead, and then
  goes the way of the finger. Round 11 paused the animation before reading
  it, which pins the page's clock, not the other process's.

  So on a touch screen the motion is the page's own: each frame it works out
  the place from the same curve the Web Animation had and writes it. What is
  on screen is then always the last place written, and a finger coming down
  stops the frames and keeps that place: nothing to read back, nothing to
  step. It costs one transform write a frame on a layer of its own (no
  layout, no paint), only while the rail is moving and on screen. A mouse
  keeps the compositor's animations, which no finger has to catch.
*/

/** One leg of motion, run by frames: the same controls as a Web Animation, and where it is now. */
export type FrameLeg = {
  pause(): void
  play(): void
  cancel(): void
  onfinish: (() => void) | null
  /** The place last written. */
  at(): number
}

/** A CSS cubic-bezier() as a function of progress (0 to 1). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (p: number) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    /* Newton first, bisection if the slope is flat. */
    let t = p
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - p
      if (Math.abs(e) < 1e-6) return sy(t)
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= e / d
    }
    let lo = 0
    let hi = 1
    t = p
    for (let i = 0; i < 24; i++) {
      const v = sx(t)
      if (Math.abs(v - p) < 1e-6) break
      if (v < p) lo = t
      else hi = t
      t = (lo + hi) / 2
    }
    return sy(t)
  }
}

/** "linear" or "cubic-bezier(a,b,c,d)" as a function of progress; anything else eases like CSS's own "ease". */
export function easingFunction(easing: string): (p: number) => number {
  if (easing === "linear") return (p) => Math.max(0, Math.min(1, p))
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(easing)
  return m ? cubicBezier(+m[1], +m[2], +m[3], +m[4]) : cubicBezier(0.25, 0.1, 0.25, 1)
}

/** The longest step one frame may take, ms: after a long task the rail goes on from where it was, rather than jumping. */
const MAX_FRAME_MS = 50

/**
 * A leg from `from` to `from + by` over `ms` along `easing` (`repeat`: over and over, linearly, as a drift), written
 * through `write` once a frame. It starts at once, on the next frame.
 */
export function frameLeg(from: number, by: number, ms: number, easing: string, write: (v: number) => void, repeat = false): FrameLeg {
  const ease = easingFunction(easing)
  let elapsed = 0
  let last = 0
  let raf = 0
  let running = false
  let done = false
  let place = from
  const leg: FrameLeg = {
    onfinish: null,
    at: () => place,
    pause() {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    },
    play() {
      if (running || done) return
      running = true
      /* The clock runs from now: a leg begun on a release carries on at once, with no frame standing still. */
      last = performance.now()
      raf = requestAnimationFrame(tick)
    },
    cancel() {
      done = true
      leg.pause()
    },
  }
  function tick(now: number) {
    raf = 0
    if (!running) return
    elapsed += Math.min(MAX_FRAME_MS, Math.max(0, now - last))
    last = Math.max(last, now)
    if (repeat) {
      place = from + by * ((elapsed % ms) / ms)
    } else {
      const p = Math.min(1, elapsed / ms)
      place = from + by * ease(p)
      if (p >= 1) {
        done = true
        running = false
        write(place)
        leg.onfinish?.()
        return
      }
    }
    write(place)
    raf = requestAnimationFrame(tick)
  }
  leg.play()
  return leg
}
