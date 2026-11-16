"use client"

/*
  A FIELD OF FAINT DOTS FOR A DARK OR PURPLE GROUND.

  Landing round 4 drew a strict CSS grid of dots with a light drifting
  through it. Landing round 5, the owner: "smoother, dispersed, clean, and
  work with the mouse as I move, very smooth, in real time, more subtle".
  Landing round 7, the owner: the purple stretch and the closing call "had
  some patterns, smooth, flowing, following the mouse cursor and going auto
  there, very subtle": bring them back, more subtle and clean.

  So it is one <canvas>:

    dots     an even grid of `gap` px, centred in the box: clean, no clumps.
    flow     a soft wave of light flows slowly across the grid by itself,
             two long sine waves bent into each other, so the bands drift
             and curl like a current instead of marching. Each dot also
             rides the wave by under a pixel.
    pointer  where a mouse is, the dots within ~180px brighten a little and
             part around it. The pointer is followed with a lerp in the
             frame loop, so the light glides after the hand instead of
             jumping with it. When the mouse leaves, the light eases out.
    touch    no pointer to follow: the same soft light wanders very slowly
             on its own (a long Lissajous path), at half strength.
    fade     the field fades out toward the edges or the bottom (a static CSS
             mask on the box), so it never ends in a hard line.

  What it costs: one canvas the size of its box at no more than 1.5 device
  pixels per CSS pixel; the dots drawn in batches by alpha (24 fills a
  frame, no per-dot style changes). The loop runs only while the box is on
  screen and the tab is visible (an IntersectionObserver and
  visibilitychange). While a mouse is moving it draws at up to 60
  frames a second (a 120Hz screen draws every other frame, evenly); with no
  mouse, the flow and the wandering light move under a pixel a frame, so 30
  a second look the same and cost half. The pointer's lerp is timed by dt.
  Each dot's place in the two waves is worked out once, on resize, so a
  frame is two sines a dot.
  Nothing is React state: the loop writes the canvas and nothing else, and
  it reads no layout (the box's place on the page is read on resize and at
  most twice a second while the mouse moves). Reduced motion: one still
  frame.

  Landing round 8, the owner, of the closing call: the dots "a little more
  visible, just a little bit", "they can autoplay motion graphics alone,
  and also follow the mouse", and smoother and cleaner. So:

    visible  the dark tone rests at 0.19 (was 0.15) and lights to 0.46
             (was 0.4); the purple sheet's tone is unchanged.
    round    each dot is a small round dot (an arc), not a 1.25px square
             that read as a pixel, in 32 levels of brightness (was 24), so
             the bands of the flow shade smoothly.
    alone    the light wanders through the field by itself at 0.6 of its
             strength on every device, mouse or not, so the field moves
             with nobody touching it.
    mouse    while the mouse is over the field the light glides after it at
             full strength; when the mouse leaves the field (it is compared
             with the box's place, already known, never measured in the
             loop) the light glides back onto its own path. No jump either
             way: the same dt-timed lerp carries every change.
    even     it draws at up to 60 frames a second whenever it runs (a 120Hz
             screen draws every other frame, evenly), not 30 when only the
             flow moves: at 30 the wandering light stepped.
    close    fade="close" (the closing call): faded at the sides like
             "edges" and well before the bottom, so the section's dots are
             gone by the time the footer starts.

  Landing round 11, the owner, of the closing call: "the pattern dots
  should be more smooth and clean and more visible at the bottom as well"
  (the AI tools card got a still grid of the same dots, in its own file).
  So:

    visible  the dark tone rests at 0.34 (was 0.19) and lights to 0.68
             (was 0.46), and the trough of the flow keeps 45% of a
             dot (was 30%); the purple sheet's tone is unchanged.
    clean    each dot stands still on its point of the grid: the flow and
             the light change only its brightness (the parting under the
             light stays). A sub-pixel drift of a 0.8px dot is what read as
             shimmer. And the canvas is drawn at up to 2 device pixels per
             CSS pixel (was 1.5), so a dot is a round dot on a phone's
             screen, not a soft blur scaled up.
    bottom   fade="close" keeps the field to the section's foot: faded at
             the sides, clear down the middle to the bottom, and only the
             last 56px fade out, so no edge meets the footer's hairline.

  Put <DotField /> as the first child of a dark block that is a stacking
  context (position plus z-index, or isolation: isolate); it fills it,
  behind everything else (z-index -1, pointer-events: none). `style` can
  limit it, e.g. to the top of a tall block.

    <DotField />                      dots, edges faded
    <DotField fade="bottom" gap={16} tone="purple" />
*/

import { useEffect, useRef, type CSSProperties } from "react"

export const DOT_FIELD_CSS = `
.dotf{position:absolute;inset:0;z-index:-1;overflow:clip;pointer-events:none}
.dotf[data-fade="edges"]{-webkit-mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%);mask-image:radial-gradient(120% 90% at 50% 45%,#000 35%,transparent 80%)}
.dotf[data-fade="close"]{-webkit-mask-image:linear-gradient(#000 calc(100% - 56px),transparent),radial-gradient(120% 135% at 50% 42%,#000 42%,transparent 82%);-webkit-mask-composite:source-in;mask-image:linear-gradient(#000 calc(100% - 56px),transparent),radial-gradient(120% 135% at 50% 42%,#000 42%,transparent 82%);mask-composite:intersect}
.dotf[data-fade="bottom"]{-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%)}
.dotf canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .9s ease-out}
.dotf[data-drawn] canvas{opacity:1}
@media (prefers-reduced-motion:reduce){.dotf canvas{transition:none}}
`

/**
 * The dots' colour per ground, how bright they rest at the crest of the flow
 * and how bright the light makes them. Round 7: neutral white on the purple
 * too (the owner: nothing purple on the purple, not even light purple).
 * `r` is a dot's radius in CSS px; `ride` how far a dot rides the flow (1 is
 * under a pixel). Landing round 11, the owner, of the purple sheet: the dots
 * "more smooth, clean and more visible". So on purple they rest at 0.17 (was
 * 0.12) and light to 0.4 (was 0.32), a touch rounder (0.95px), and ride the
 * flow half as far, so a dot no longer shimmers as it crosses a device pixel;
 * the bands of light carry the motion. The dark tone is unchanged.
 */
export const DOT_FIELD_TONES = {
  /* Landing round 11: the closing call's dots a little more visible and standing on their points (ride 0); the purple sheet's brighter, rounder and steadier (its own track). */
  dark: { rgb: "255,255,255", rest: 0.34, lit: 0.68, r: 0.8, ride: 0 },
  purple: { rgb: "255,255,255", rest: 0.17, lit: 0.4, r: 0.95, ride: 0.5 },
} as const

/** Largest device pixel ratio the canvas is drawn at. */
export const DOT_FIELD_MAX_DPR = 2
/** Radius of the light around the pointer, in CSS px. */
const RADIUS = 180
/** How quickly the light follows the pointer, per 60Hz frame (0..1). */
const FOLLOW = 0.075
/** How far the dots part under the light, in CSS px. */
const PART = 6
const LEVELS = 32
/** How strong the light is on its own path, with no mouse over the field. */
const WANDER = 0.6
/** The darkest a dot gets in the trough of the flow, as a share of its crest (landing round 11: the dark tone 0.45, was 0.3; the purple sheet as it was). */
const TROUGH = { dark: 0.45, purple: 0.3 } as const

/** A repeatable random number in [0, 1) for a pair of integers. */
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}

/**
 * The dots for a box: x, y (CSS px), a brightness (0..1) and a phase, four
 * numbers per dot. An even grid of `gap` px, centred so the margins match.
 */
export function dotFieldPoints(width: number, height: number, gap: number): Float32Array {
  const cols = Math.floor(width / gap) + 1
  const rows = Math.floor(height / gap) + 1
  const ox = (width - (cols - 1) * gap) / 2
  const oy = (height - (rows - 1) * gap) / 2
  const out = new Float32Array(cols * rows * 4)
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[i++] = ox + c * gap
      out[i++] = oy + r * gap
      out[i++] = 1
      out[i++] = hash(c + 9.7, r + 1.3) * Math.PI * 2
    }
  }
  return out
}

/**
 * The flow at a point and time, 0..1: two long waves, the second bending the
 * first, so the bright bands drift diagonally and curl slowly.
 */
export function dotFieldFlow(x: number, y: number, t: number): number {
  return flowAt(x * 0.0052 + y * 0.0033, y * 0.0041 - x * 0.0017, t)
}
/** The flow from a dot's two precomputed wave phases. */
function flowAt(a: number, b: number, t: number): number {
  return 0.5 + 0.5 * Math.sin(a - t * 0.00038 + 1.7 * Math.sin(b + t * 0.00016))
}

export function DotField({
  gap = 18,
  fade = "edges",
  tone = "dark",
  className,
  style,
}: {
  /** Distance between dots in CSS pixels. Default 18. */
  gap?: number
  /** Where the field fades out: toward every edge, toward the bottom, toward the sides and well before the bottom (the closing call), or not at all. */
  fade?: "edges" | "bottom" | "close" | "none"
  /** "dark" for a near-black ground, "purple" for the brand purple. */
  tone?: "dark" | "purple"
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const box = ref.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d", { alpha: true })
    if (!box || !canvas || !ctx) return
    const colour = DOT_FIELD_TONES[tone]
    const trough = TROUGH[tone]
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const fine = typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches

    let w = 0
    let h = 0
    let dpr = 1
    let points = new Float32Array(0)
    /* Each dot's phase in the two waves, two numbers per dot, from its place. */
    let waves = new Float32Array(0)
    /* The box's top left on the page (CSS px), read on resize and now and then while the mouse moves, never in the loop. */
    let pageX = 0
    let pageY = 0
    let placedAt = 0
    const place = () => {
      const r = box.getBoundingClientRect()
      pageX = r.left + window.scrollX
      pageY = r.top + window.scrollY
      placedAt = performance.now()
    }

    /* The pointer in page coordinates, where the hand is; the light glides after it. */
    let aimX = 0
    let aimY = 0
    let hasAim = false
    let lightX = 0
    let lightY = 0
    let strength = 0
    let started = false

    const buckets: number[][] = Array.from({ length: LEVELS }, () => [])

    const draw = (t: number, dt: number) => {
      /* Where the light is: the mouse (followed), or a slow wander of its own. */
      let tx: number
      let ty: number
      let goal: number
      /* The mouse, while it is over the field (its place is known: no layout read here). */
      const mx = aimX - pageX
      const my = aimY - pageY
      if (hasAim && mx > -40 && my > -40 && mx < w + 40 && my < h + 40) {
        tx = mx
        ty = my
        goal = 1
      } else {
        tx = w * (0.5 + 0.32 * Math.sin(t * 0.00011))
        ty = h * (0.42 + 0.26 * Math.sin(t * 0.000083 + 1.3))
        /* The purple sheet keeps a quieter wander (round 7), a little stronger since round 11; the closing call's light is out on its own. */
        goal = tone === "dark" ? WANDER : fine ? 0.45 : 0.55
      }
      const k = 1 - Math.pow(1 - FOLLOW, dt / 16.67)
      if (!started) {
        lightX = tx
        lightY = ty
        started = true
      } else {
        lightX += (tx - lightX) * k
        lightY += (ty - lightY) * k
      }
      strength += (goal - strength) * k * 0.6

      for (const b of buckets) b.length = 0
      const r2 = RADIUS * RADIUS
      for (let i = 0, j = 0; i < points.length; i += 4, j += 2) {
        const flow = flowAt(waves[j], waves[j + 1], t)
        /* Each dot rides the current by under a pixel on the purple; on the closing call it stands on its point (ride 0) and the flow is its brightness only. */
        let x = points[i] + (flow - 0.5) * 0.8 * colour.ride
        let y = points[i + 1] + (flow - 0.5) * 1.4 * colour.ride
        let a = colour.rest * points[i + 2] * (trough + (1 - trough) * flow * flow)
        const dx = x - lightX
        const dy = y - lightY
        const d2 = dx * dx + dy * dy
        if (d2 < r2 && strength > 0.01) {
          const d = Math.sqrt(d2) || 1
          const f = (1 - d / RADIUS) * (1 - d / RADIUS) * strength
          a += (colour.lit - colour.rest * trough) * f
          x += (dx / d) * PART * f
          y += (dy / d) * PART * f
        }
        if (x < -2 || y < -2 || x > w + 2 || y > h + 2) continue
        const level = Math.min(LEVELS - 1, Math.round((a / colour.lit) * (LEVELS - 1)))
        if (level <= 0) continue
        buckets[level].push(x, y)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      for (let l = 1; l < LEVELS; l++) {
        const b = buckets[l]
        if (!b.length) continue
        ctx.fillStyle = `rgba(${colour.rgb},${((l / (LEVELS - 1)) * colour.lit).toFixed(3)})`
        ctx.beginPath()
        for (let j = 0; j < b.length; j += 2) {
          ctx.moveTo(b[j] + colour.r, b[j + 1])
          ctx.arc(b[j], b[j + 1], colour.r, 0, Math.PI * 2)
        }
        ctx.fill()
      }
    }

    const resize = () => {
      const nw = box.clientWidth
      const nh = box.clientHeight
      if (!nw || !nh) return
      if (nw === w && nh === h) return
      w = nw
      h = nh
      dpr = Math.min(DOT_FIELD_MAX_DPR, window.devicePixelRatio || 1)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      points = dotFieldPoints(w, h, gap)
      waves = new Float32Array((points.length / 4) * 2)
      for (let i = 0, j = 0; i < points.length; i += 4, j += 2) {
        waves[j] = points[i] * 0.0052 + points[i + 1] * 0.0033
        waves[j + 1] = points[i + 1] * 0.0041 - points[i] * 0.0017
      }
      place()
      draw(performance.now(), 16.67)
      box.setAttribute("data-drawn", "")
    }

    let raf = 0
    let last = 0
    let near = false
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      /* At most 60 a second, always (a 120Hz screen draws every other frame, evenly): the light wanders on its own now, and at 30 it stepped. The first frame after a start always draws. */
      if (last && t - last < 12) return
      const dt = last ? Math.min(64, t - last) : 16.67
      last = t
      draw(t, dt)
    }
    const run = () => {
      const go = near && document.visibilityState !== "hidden" && !reduced
      if (go && !raf) {
        last = 0
        raf = requestAnimationFrame(frame)
      } else if (!go && raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      aimX = e.clientX + window.scrollX
      aimY = e.clientY + window.scrollY
      hasAim = true
      if (e.timeStamp - placedAt > 500) place()
    }
    const onLeave = () => {
      hasAim = false
    }

    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null
    ro?.observe(box)
    resize()

    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => {
            near = e.isIntersecting
            if (near) place()
            run()
          })
        : null
    if (io) io.observe(box)
    else {
      near = true
      run()
    }
    document.addEventListener("visibilitychange", run)
    if (fine && !reduced) {
      window.addEventListener("pointermove", onMove, { passive: true })
      document.documentElement.addEventListener("pointerleave", onLeave)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      io?.disconnect()
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("pointerleave", onLeave)
    }
  }, [gap, tone])

  return (
    <div ref={ref} className={`dotf${className ? ` ${className}` : ""}`} data-fade={fade === "none" ? undefined : fade} data-tone={tone} style={style} aria-hidden="true">
      <style href="dot-field" precedence="default">
        {DOT_FIELD_CSS}
      </style>
      <canvas ref={canvasRef} />
    </div>
  )
}
