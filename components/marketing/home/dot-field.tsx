"use client"

/*
  A FIELD OF FAINT DOTS FOR A DARK OR PURPLE GROUND.

  Landing round 4 drew a strict CSS grid of dots with a light drifting
  through it. Landing round 5, the owner: "smoother, dispersed, clean, and
  work with the mouse as I move, very smooth, in real time, more subtle".

  So it is one <canvas> now:

    dots     scattered, not a grid: a grid of `gap` px with every dot nudged
             off its point, and whole patches thinned out by a smooth noise,
             so the field gathers and disperses like grain. Each dot breathes
             very slowly (its own phase) and sways by about a pixel.
    pointer  where a mouse is, the dots within ~170px brighten a little and
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
  visibilitychange), at 30 frames a second on a touch screen. Nothing is
  React state: the loop writes the canvas and nothing else, and it reads no
  layout (the box's place on the page is read on resize and at most twice a
  second while the mouse moves). Reduced motion: one still frame.

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
.dotf[data-fade="bottom"]{-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 45%,transparent 100%)}
.dotf canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .9s ease-out}
.dotf[data-drawn] canvas{opacity:1}
@media (prefers-reduced-motion:reduce){.dotf canvas{transition:none}}
`

/** The dots' colour per ground, and how bright they rest and how bright the light makes them. */
export const DOT_FIELD_TONES = {
  dark: { rgb: "255,255,255", rest: 0.1, lit: 0.34 },
  purple: { rgb: "237,233,254", rest: 0.11, lit: 0.36 },
} as const

/** Largest device pixel ratio the canvas is drawn at. */
export const DOT_FIELD_MAX_DPR = 1.5
/** Radius of the light around the pointer, in CSS px. */
const RADIUS = 170
/** How quickly the light follows the pointer, per 60Hz frame (0..1). */
const FOLLOW = 0.075
/** How far the dots part under the light, in CSS px. */
const PART = 7
const LEVELS = 24

/** A repeatable random number in [0, 1) for a pair of integers. */
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return h - Math.floor(h)
}
/** A smooth value noise in [0, 1). */
function noise(x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/**
 * The dots for a box: x, y (CSS px), a resting brightness (0..1) and a phase,
 * four numbers per dot. Scattered off a `gap` grid and thinned in patches.
 */
export function dotFieldPoints(width: number, height: number, gap: number): Float32Array {
  const out: number[] = []
  const cols = Math.ceil(width / gap) + 1
  const rows = Math.ceil(height / gap) + 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const patch = noise(c / 9, r / 9)
      /* Patches: dense where the noise is high, almost empty where it is low. */
      if (hash(c + 0.5, r + 0.25) > 0.18 + patch * 0.72) continue
      const x = (c + (hash(c, r + 7.1) - 0.5) * 0.7) * gap
      const y = (r + (hash(c + 3.3, r) - 0.5) * 0.7) * gap
      out.push(x, y, 0.45 + patch * 0.55, hash(c + 9.7, r + 1.3) * Math.PI * 2)
    }
  }
  return new Float32Array(out)
}

export function DotField({
  gap = 18,
  fade = "edges",
  tone = "dark",
  className,
  style,
}: {
  /** Distance between dots in CSS pixels, before they are scattered. Default 18. */
  gap?: number
  /** Where the field fades out: toward every edge, toward the bottom, or not at all. */
  fade?: "edges" | "bottom" | "none"
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
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const fine = typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches

    let w = 0
    let h = 0
    let dpr = 1
    let points = new Float32Array(0)
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
    const size = 1.15

    const draw = (t: number, dt: number) => {
      /* Where the light is: the mouse (followed), or a slow wander of its own. */
      let tx: number
      let ty: number
      let goal: number
      if (hasAim) {
        tx = aimX - pageX
        ty = aimY - pageY
        goal = 1
      } else {
        tx = w * (0.5 + 0.32 * Math.sin(t * 0.00011))
        ty = h * (0.42 + 0.26 * Math.sin(t * 0.000083 + 1.3))
        goal = fine ? 0.35 : 0.5
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
      const slow = t * 0.0006
      for (let i = 0; i < points.length; i += 4) {
        const phase = points[i + 3]
        let x = points[i] + Math.sin(slow + phase) * 0.9
        let y = points[i + 1] + Math.cos(slow * 0.8 + phase) * 0.9
        let a = colour.rest * points[i + 2] * (0.78 + 0.22 * Math.sin(slow * 1.7 + phase * 2))
        const dx = x - lightX
        const dy = y - lightY
        const d2 = dx * dx + dy * dy
        if (d2 < r2 && strength > 0.01) {
          const d = Math.sqrt(d2) || 1
          const f = (1 - d / RADIUS) * (1 - d / RADIUS) * strength
          a += (colour.lit - colour.rest) * f
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
        for (let j = 0; j < b.length; j += 2) ctx.rect(b[j] - size / 2, b[j + 1] - size / 2, size, size)
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
      place()
      draw(performance.now(), 16.67)
      box.setAttribute("data-drawn", "")
    }

    let raf = 0
    let last = 0
    let near = false
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min(64, t - last) : 16.67
      /* A touch screen has only the slow wander: 30 frames a second are plenty. */
      if (!fine && dt < 30) return
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
