/**
 * ===========================================================================
 *  THE GLOBE WITHOUT WEBGL
 * ===========================================================================
 * For a browser that has no WebGL, or whose WebGL would run on the
 * processor (globe-gl.ts asks with `failIfMajorPerformanceCaveat`). The same
 * picture, drawn the cheapest way a 2D canvas allows:
 *
 *   the ball, its light and its atmosphere are painted once per size into
 *   a canvas of their own and copied in with one drawImage;
 *   the land is a round dot copied from a small sprite, one per brightness
 *   and size, painted once per size: a copy of a few pixels, where a circle
 *   filled as a path (what the old globe did, 1,500 times a frame) is a
 *   curve flattened and rasterised every time;
 *   colours are CSS strings made once, never per frame.
 */
import { landDots } from "./globe-land"
import type { GlobeRenderer } from "./globe-gl"
import {
  ARC_SAMPLES, DOT_RADIUS, GLOBE_RADIUS, LIGHT, MAX_ARCS, PALETTE, SPRITE_DISC, SPRITE_FLOATS, SPRITE_GLOW, SPRITE_RING, TRAIL_FLOATS,
  css, type Overlay, type Rgb,
} from "./globe-scene"

const LEVELS = 5
const SIZES = 3

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function create2dRenderer(canvas: HTMLCanvasElement): GlobeRenderer | null {
  const ctx = canvas.getContext("2d")
  if (!ctx) return null

  const land = landDots()
  const count = land.length / 3
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
  /* The dot sprites: LEVELS brightnesses by SIZES sizes (smaller towards the edge), in one strip. */
  let sprites: HTMLCanvasElement | null = null
  let cell = 1
  /* The overlay names its colours by value; these are the only ones it uses. */
  const named = new Map<number, string>()
  const keyOf = (r: number, g: number, b: number) => Math.round(r * 255) * 65536 + Math.round(g * 255) * 256 + Math.round(b * 255)
  for (const c of [PALETTE.pin, PALETTE.pulse, PALETTE.arc, PALETTE.head, PALETTE.ripple]) named.set(keyOf(c[0], c[1], c[2]), css(c))
  const arcColor = css(PALETTE.arc)

  let device = 1
  let dpr = 1
  let backdrop: HTMLCanvasElement | null = null

  /** The ball, its light, its rim and its atmosphere: the same every frame, so painted once per size. */
  const paintBackdrop = () => {
    backdrop = document.createElement("canvas")
    backdrop.width = device
    backdrop.height = device
    const b = backdrop.getContext("2d")
    if (!b) return
    const c = device / 2
    const R = GLOBE_RADIUS * device
    const halo = b.createRadialGradient(c, c, R * 0.98, c, c, R * 1.13)
    halo.addColorStop(0, css(PALETTE.halo, PALETTE.haloAlpha))
    halo.addColorStop(1, css(PALETTE.halo, 0))
    b.fillStyle = halo
    b.beginPath()
    b.arc(c, c, R * 1.13, 0, Math.PI * 2)
    b.fill()
    const lx = c + LIGHT[0] * R * 0.55
    const ly = c - LIGHT[1] * R * 0.55
    const body = b.createRadialGradient(lx, ly, R * 0.05, c, c, R)
    body.addColorStop(0, css(PALETTE.lit))
    body.addColorStop(0.7, css([(PALETTE.lit[0] + PALETTE.deep[0]) / 2, (PALETTE.lit[1] + PALETTE.deep[1]) / 2, (PALETTE.lit[2] + PALETTE.deep[2]) / 2]))
    body.addColorStop(1, css(PALETTE.deep))
    b.fillStyle = body
    b.beginPath()
    b.arc(c, c, R, 0, Math.PI * 2)
    b.fill()
    b.strokeStyle = css(PALETTE.rim, 0.28)
    b.lineWidth = Math.max(1, dpr)
    b.beginPath()
    b.arc(c, c, R - b.lineWidth / 2, 0, Math.PI * 2)
    b.stroke()
  }

  /** Every dot there can be, painted once per size: soft edged, as the WebGL ones are. */
  const paintSprites = () => {
    const R = GLOBE_RADIUS * device
    const radius = Math.max(0.75 * dpr, DOT_RADIUS * R)
    cell = Math.ceil(radius * 2 + 2)
    sprites = document.createElement("canvas")
    sprites.width = cell * LEVELS
    sprites.height = cell * SIZES
    const b = sprites.getContext("2d")
    if (!b) return
    for (let sz = 0; sz < SIZES; sz++) {
      const r = radius * (0.58 + (0.42 * (sz + 0.5)) / SIZES)
      for (let l = 0; l < LEVELS; l++) {
        b.fillStyle = levelColor[l]
        b.beginPath()
        b.arc(l * cell + cell / 2, sz * cell + cell / 2, r * 0.82, 0, Math.PI * 2)
        b.fill()
      }
    }
  }

  return {
    kind: "2d",
    resize(size, ratio) {
      dpr = ratio
      device = Math.max(1, Math.round(size * ratio))
      if (canvas.width !== device) canvas.width = device
      if (canvas.height !== device) canvas.height = device
      paintBackdrop()
      paintSprites()
    },
    draw(m, o) {
      const c = device / 2
      const R = GLOBE_RADIUS * device
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, device, device)
      if (backdrop) ctx.drawImage(backdrop, 0, 0)

      /* The land, turned here, each dot copied from the sprite for its brightness and size. */
      const dot = Math.max(0.75 * dpr, DOT_RADIUS * R)
      const half = cell / 2
      if (sprites) {
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
          const l = Math.min(LEVELS - 1, Math.floor(k * LEVELS))
          const sz = Math.min(SIZES - 1, Math.floor(zz * SIZES))
          ctx.drawImage(sprites, l * cell, sz * cell, cell, cell, c + xx * R - half, c - yy * R - half, cell, cell)
        }
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
    restore() {
      return true
    },
    dispose() {
      backdrop = null
    },
  }
}
