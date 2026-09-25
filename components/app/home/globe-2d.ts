/**
 * ===========================================================================
 *  THE GLOBE WITHOUT WEBGL
 * ===========================================================================
 * For a browser that has no WebGL, or whose WebGL would run on the
 * processor (globe-gl.ts asks with `failIfMajorPerformanceCaveat`). The same
 * picture, drawn the cheapest way a 2D canvas allows, measured against the
 * old globe by scripts/check-home-globe.mjs:
 *
 *   the ball, its light and its atmosphere are painted once per size into
 *   the still canvas under this one (`ball`), and never again;
 *   the land is small filled rectangles, grouped by brightness so the fill
 *   colour changes five times a frame. A rectangle is the one shape a 2D
 *   canvas fills without building a path; a circle filled as a path (the
 *   old globe, 1,500 a frame) is a curve flattened and rasterised each
 *   time, and a copy from a sprite canvas measured slower still;
 *   it draws at no more than 1.25 times the CSS size, and the browser's own
 *   smooth scaling rounds the rectangles into soft dots on a sharper
 *   screen: a quarter of the pixels of a 2x canvas, for a soft dotted ball
 *   that loses nothing by it;
 *   colours are CSS strings made once, never per frame.
 */
import { landDots } from "./globe-land"
import type { GlobeRenderer } from "./globe-gl"
import {
  ARC_SAMPLES, DOT_RADIUS, GLOBE_RADIUS, LIGHT, MAX_ARCS, PALETTE, SPRITE_DISC, SPRITE_FLOATS, SPRITE_GLOW, SPRITE_RING, TRAIL_FLOATS,
  css, paintBall, type Overlay, type Rgb,
} from "./globe-scene"

const LEVELS = 5
/** The most this renderer draws at, whatever the screen. */
export const FALLBACK_MAX_DPR = 1.25

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** `canvas` is drawn every frame; `ball`, a 2D canvas under it, holds the still ball, painted once per size. */
export function create2dRenderer(canvas: HTMLCanvasElement, ball: HTMLCanvasElement): GlobeRenderer | null {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const land = landDots()
  const count = land.length / 3
  /* Where each dot facing the viewer lands this frame, reused every frame. */
  const px = new Float32Array(count)
  const py = new Float32Array(count)
  const ps = new Float32Array(count)
  const pl = new Uint8Array(count)
  /* One colour per brightness, from the far side of the light to the lit side. */
  const levelColor: string[] = []
  for (let l = 0; l < LEVELS; l++) {
    const k = (l + 0.5) / LEVELS
    const c: Rgb = [
      PALETTE.landDark[0] + (PALETTE.landLit[0] - PALETTE.landDark[0]) * k,
      PALETTE.landDark[1] + (PALETTE.landLit[1] - PALETTE.landDark[1]) * k,
      PALETTE.landDark[2] + (PALETTE.landLit[2] - PALETTE.landDark[2]) * k,
    ]
    levelColor.push(css(c, 0.3 + 0.7 * k))
  }
  /* The overlay names its colours by value; these are the only ones it uses. */
  const named = new Map<number, string>()
  const keyOf = (r: number, g: number, b: number) => Math.round(r * 255) * 65536 + Math.round(g * 255) * 256 + Math.round(b * 255)
  for (const c of [PALETTE.pin, PALETTE.pulse, PALETTE.arc, PALETTE.head, PALETTE.ripple]) named.set(keyOf(c[0], c[1], c[2]), css(c))
  const arcColor = css(PALETTE.arc)

  let device = 1
  let dpr = 1


  return {
    kind: "2d",
    resize(size, ratio) {
      dpr = Math.min(ratio, FALLBACK_MAX_DPR)
      device = Math.max(1, Math.round(size * dpr))
      if (canvas.width !== device) canvas.width = device
      if (canvas.height !== device) canvas.height = device
      /* The still ball is painted once, so it is painted sharp: at the screen's ratio, up to 2x. */
      const still = Math.max(1, Math.round(size * ratio))
      if (ball.width !== still) ball.width = still
      if (ball.height !== still) ball.height = still
      const b = ball.getContext("2d")
      if (b) paintBall(b, still, ratio)
    },
    draw(m, o) {
      const c = device / 2
      const R = GLOBE_RADIUS * device
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, device, device)

      /* The land, turned here: a rectangle about as big as the dot's disc, sorted into brightness levels. */
      const dot = Math.max(0.6, DOT_RADIUS * R)
      let n = 0
      for (let i = 0; i < count; i++) {
        const x = land[i * 3]
        const y = land[i * 3 + 1]
        const z = land[i * 3 + 2]
        const zz = m[2] * x + m[5] * y + m[8] * z
        if (zz <= 0.02) continue
        const xx = m[0] * x + m[3] * y + m[6] * z
        const yy = m[1] * x + m[4] * y + m[7] * z
        const lit = smooth(-0.25, 0.85, xx * LIGHT[0] + yy * LIGHT[1] + zz * LIGHT[2])
        const k = smooth(0.02, 0.32, zz) * (0.34 + 0.66 * lit)
        const side = Math.max(1, dot * 1.7 * (0.58 + 0.42 * zz))
        px[n] = c + xx * R - side / 2
        py[n] = c - yy * R - side / 2
        ps[n] = side
        pl[n] = Math.min(LEVELS - 1, Math.floor(k * LEVELS))
        n++
      }
      for (let l = 0; l < LEVELS; l++) {
        ctx.fillStyle = levelColor[l]
        for (let i = 0; i < n; i++) if (pl[i] === l) ctx.fillRect(px[i], py[i], ps[i], ps[i])
      }

      /* Sales in flight, in four stretches, fainter towards the tail. */
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.strokeStyle = arcColor
      ctx.lineWidth = dot * 2
      for (let a = 0; a < MAX_ARCS; a++) {
        const cnt = o.trailCounts[a]
        if (cnt < 2) continue
        const base = a * ARC_SAMPLES * TRAIL_FLOATS
        const parts = 4
        for (let p = 0; p < parts; p++) {
          const from = Math.floor((p * (cnt - 1)) / parts)
          const to = Math.floor(((p + 1) * (cnt - 1)) / parts)
          if (to <= from) continue
          ctx.globalAlpha = o.trails[base + to * TRAIL_FLOATS + 2]
          ctx.beginPath()
          for (let k = from; k <= to; k++) {
            const i = base + k * TRAIL_FLOATS
            const x = c + o.trails[i] * R
            const y = c - o.trails[i + 1] * R
            if (k === from) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      }

      /* Pins, pulses, heads and landings. */
      ctx.lineWidth = Math.max(1, 1.1 * dpr)
      for (let s = 0; s < o.spriteCount; s++) {
        const i = s * SPRITE_FLOATS
        const x = c + o.sprites[i] * R
        const y = c - o.sprites[i + 1] * R
        const r = o.sprites[i + 2] * R
        const kind = o.sprites[i + 4]
        const color = named.get(keyOf(o.sprites[i + 5], o.sprites[i + 6], o.sprites[i + 7])) ?? arcColor
        ctx.globalAlpha = o.sprites[i + 3] * (kind === SPRITE_GLOW ? 0.35 : 1)
        ctx.beginPath()
        ctx.arc(x, y, kind === SPRITE_GLOW ? r * 0.7 : r, 0, Math.PI * 2)
        if (kind === SPRITE_RING) {
          ctx.strokeStyle = color
          ctx.stroke()
        } else if (kind === SPRITE_DISC || kind === SPRITE_GLOW) {
          ctx.fillStyle = color
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    },
    pending() {
      return false
    },
    failed() {
      return false
    },
    restore() {
      return true
    },
    dispose() {
      /* the canvases go with the component */
    },
  }
}
