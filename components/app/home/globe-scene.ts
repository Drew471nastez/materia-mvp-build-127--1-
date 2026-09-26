/**
 * ===========================================================================
 *  THE GLOBE'S SCENE: WHAT IS DRAWN, IN WHICH COLOURS, AND WHERE
 * ===========================================================================
 * Everything the two renderers share (components/app/home/globe-gl.ts, and
 * globe-2d.ts for a device without WebGL): the size of the globe in its
 * canvas, the light, the palette, the cities, and the few moving things on
 * top of the land (pins, sales in flight, the ring where a sale lands).
 *
 * The land is turned by the renderer (on the graphics card for WebGL). The
 * moving things are a few dozen points, turned here on the processor into
 * the arrays below, which are made once and written over every frame: a
 * frame allocates nothing.
 *
 * Positions come out in units of the globe's radius, x right and y up from
 * its centre, which is what both renderers draw from.
 */
import { toSphere } from "./globe-land"

export type Vec3 = [number, number, number]

/** The globe's radius as a share of its canvas: the rest is room for the glow and for sales arcing over the edge. */
export const GLOBE_RADIUS = 0.4
/** One land dot's radius, in radii of the globe. Pins, pulses and trails are sized from it. */
export const DOT_RADIUS = 0.0102
/** The drawing is never made sharper than this, whatever the screen: a soft dotted ball gains nothing from 3x, and costs 2.25 times the pixels. */
export const MAX_DPR = 2

/** The sun, fixed to the viewer: up, left and in front, so the lit side faces the banner's text. Unit length. */
export const LIGHT: Vec3 = normalize([-0.5, 0.62, 0.6])

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Colours as 0..1 channels (for WebGL) and a CSS string (for the 2D fallback). */
export type Rgb = readonly [number, number, number]
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
export const css = (c: Rgb, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`

/**
 * THE PALETTE. A light grey globe on the banner's light grey, lit from the
 * upper left: land in a quiet darker grey, the sea a shade lighter than the
 * banner, a white rim where the light catches it. It was an ink ball with a
 * violet cast, the one dark thing in the banner, and it drew the eye away
 * from what the banner says: "the globe has too much visual weight; make it
 * light grey, incorporated, without drawing too much attention, but still
 * detailed and real." The sales in flight keep a hint of Storelib's violet.
 */
export const PALETTE = {
  /** The body, in shadow and in the light. */
  deep: rgb("#e1e4e9"),
  lit: rgb("#fbfbfc"),
  /** The rim the light catches at the edge. */
  rim: rgb("#ffffff"),
  /** The thin atmosphere outside the edge. */
  halo: rgb("#aab0bd"),
  haloAlpha: 0.1,
  /** Land, on the lit side and on the far side of the light. */
  landLit: rgb("#969ca8"),
  landDark: rgb("#c2c6ce"),
  /** Cities, their pulse, a sale in flight and where it lands. */
  pin: rgb("#8a90a0"),
  pulse: rgb("#9a8fd0"),
  arc: rgb("#9b90cf"),
  head: rgb("#7c6fd0"),
  ripple: rgb("#8f84c9"),
} as const

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

/**
 * THE STILL BALL. A ball lit from a light fixed to the viewer looks the same
 * however it is turned, so its body, its rim, its shine and its atmosphere
 * are painted once per size into a 2D canvas under the moving one, by both
 * renderers alike, and never again. Gradients, not a shader: no program to
 * compile for it, and nothing to read back from the graphics card.
 *   the atmosphere, a thin glow outside the edge, stronger towards the light
 *   the body, from the lit colour where the light falls to the deep one
 *   the rim, a crescent of light along the lit edge, and a trace all round
 *   the shine, a faint soft spot where the light would reflect
 */
export function paintBall(b: CanvasRenderingContext2D, device: number, dpr: number) {
  const TAU = Math.PI * 2
  const c = device / 2
  const R = GLOBE_RADIUS * device
  /* Towards the light, on the screen (y down). */
  const lx = LIGHT[0]
  const ly = -LIGHT[1]
  b.setTransform(1, 0, 0, 1, 0, 0)
  b.clearRect(0, 0, device, device)

  const halo = b.createRadialGradient(c + lx * R * 0.06, c + ly * R * 0.06, R * 0.96, c, c, R * 1.14)
  halo.addColorStop(0, css(PALETTE.halo, PALETTE.haloAlpha))
  halo.addColorStop(0.4, css(PALETTE.halo, PALETTE.haloAlpha * 0.38))
  halo.addColorStop(1, css(PALETTE.halo, 0))
  b.fillStyle = halo
  b.beginPath()
  b.arc(c, c, R * 1.14, 0, TAU)
  b.fill()

  const body = b.createRadialGradient(c + lx * R * 0.5, c + ly * R * 0.5, R * 0.02, c + lx * R * 0.12, c + ly * R * 0.12, R * 1.1)
  body.addColorStop(0, css(PALETTE.lit))
  body.addColorStop(0.42, css(mix(PALETTE.lit, PALETTE.deep, 0.5)))
  body.addColorStop(1, css(PALETTE.deep))
  b.fillStyle = body
  b.beginPath()
  b.arc(c, c, R, 0, TAU)
  b.fill()

  b.save()
  b.beginPath()
  b.arc(c, c, R, 0, TAU)
  b.clip()
  const trace = b.createRadialGradient(c, c, R * 0.8, c, c, R)
  trace.addColorStop(0, css(PALETTE.rim, 0))
  trace.addColorStop(1, css(PALETTE.deep, 0.25))
  b.fillStyle = trace
  b.fillRect(0, 0, device, device)
  /* Centred away from the light, so only the lit edge is far enough out to catch it. */
  const crescent = b.createRadialGradient(c - lx * R * 0.24, c - ly * R * 0.24, R * 0.92, c - lx * R * 0.24, c - ly * R * 0.24, R * 1.24)
  crescent.addColorStop(0, css(PALETTE.rim, 0))
  crescent.addColorStop(1, css(PALETTE.rim, 0.5))
  b.fillStyle = crescent
  b.fillRect(0, 0, device, device)
  const sx = c + lx * R * 0.44
  const sy = c + ly * R * 0.44
  const shine = b.createRadialGradient(sx, sy, 0, sx, sy, R * 0.34)
  shine.addColorStop(0, "rgba(255,255,255,0.35)")
  shine.addColorStop(1, "rgba(255,255,255,0)")
  b.fillStyle = shine
  b.fillRect(0, 0, device, device)
  b.restore()

  const edge = Math.max(1, dpr * 0.75)
  b.strokeStyle = "rgba(120,127,142,0.14)"
  b.lineWidth = edge
  b.beginPath()
  b.arc(c, c, R - edge / 2, 0, TAU)
  b.stroke()
}

/** Where sales fly between. Bucharest is where Storelib is made. */
export const CITY_LATLON: readonly [number, number][] = [
  [44.43, 26.1], [40.71, -74.0], [51.5, -0.12], [48.85, 2.35], [52.52, 13.4],
  [59.33, 18.07], [41.9, 12.5], [40.42, -3.7], [34.05, -118.24], [37.77, -122.42],
  [43.65, -79.38], [19.43, -99.13], [-23.55, -46.63], [-34.6, -58.38], [6.52, 3.37],
  [-26.2, 28.04], [30.04, 31.24], [25.2, 55.27], [19.07, 72.88], [1.35, 103.82],
  [35.68, 139.69], [37.57, 126.98], [-33.87, 151.2], [22.32, 114.17],
]
export const CITIES: readonly Vec3[] = CITY_LATLON.map(([lat, lon]) => toSphere(lat, lon))

/* ─── Turning ──────────────────────────────────────────────────────────── */

/**
 * The turn, as a 3x3 matrix, column major (as WebGL reads it): yaw about
 * the vertical axis, then tilt towards the viewer. Written into `out`.
 */
export function rotation(yaw: number, tilt: number, out: Float32Array): Float32Array {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  /* rows: [c, 0, s], [st*s, ct, -st*c], [-ct*s, st, ct*c] */
  out[0] = c; out[1] = st * s; out[2] = -ct * s
  out[3] = 0; out[4] = ct; out[5] = st
  out[6] = s; out[7] = -st * c; out[8] = ct * c
  return out
}

/* ─── The moving things ────────────────────────────────────────────────── */

/** A sale in flight: a curve from one city to another, drawn out and let go. */
export interface Arc {
  active: boolean
  from: Vec3
  to: Vec3
  /** The angle between the two, and its sine, for the great circle between them. */
  omega: number
  sinOmega: number
  /** How far above the surface the middle of the curve rises, in radii. */
  lift: number
  born: number
  life: number
  landed: boolean
}
/** Where a sale lands, a ring that grows and fades. */
export interface Ripple {
  active: boolean
  at: Vec3
  born: number
}

export const MAX_ARCS = 3
export const MAX_RIPPLES = 4
/** Points along an arc's curve. */
export const ARC_SAMPLES = 40
export const RIPPLE_MS = 1000

export function makeArcs(): Arc[] {
  return Array.from({ length: MAX_ARCS }, () => ({ active: false, from: CITIES[0], to: CITIES[1], omega: 0, sinOmega: 1, lift: 0, born: 0, life: 1, landed: false }))
}
export function makeRipples(): Ripple[] {
  return Array.from({ length: MAX_RIPPLES }, () => ({ active: false, at: CITIES[0], born: 0 }))
}

/**
 * A SPRITE: a round thing drawn at one point. Eight floats each:
 * x, y (radii, y up), radius (radii), alpha, kind, r, g, b.
 * Kinds: 0 a soft disc, 1 a ring, 2 a glow.
 */
export const SPRITE_FLOATS = 8
export const SPRITE_DISC = 0
export const SPRITE_RING = 1
export const SPRITE_GLOW = 2
export const MAX_SPRITES = CITIES.length * 2 + MAX_ARCS * 2 + MAX_RIPPLES

/** A curve: ARC_SAMPLES points per arc, three floats each: x, y (radii), alpha. */
export const TRAIL_FLOATS = 3

export interface Overlay {
  sprites: Float32Array
  spriteCount: number
  trails: Float32Array
  /** Points written for each arc, 0 for an arc not drawn. */
  trailCounts: Int32Array
}

export function makeOverlay(): Overlay {
  return {
    sprites: new Float32Array(MAX_SPRITES * SPRITE_FLOATS),
    spriteCount: 0,
    trails: new Float32Array(MAX_ARCS * ARC_SAMPLES * TRAIL_FLOATS),
    trailCounts: new Int32Array(MAX_ARCS),
  }
}

export interface OverlayInput {
  m: Float32Array
  now: number
  arcs: readonly Arc[]
  ripples: readonly Ripple[]
  /** The cities breathe; off with reduced motion. */
  pulse: boolean
  /** The size of one land dot, in radii, which everything else is scaled from. */
  dot: number
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

function sprite(o: Overlay, x: number, y: number, r: number, a: number, kind: number, c: Rgb) {
  if (o.spriteCount >= MAX_SPRITES || a <= 0.003) return
  const i = o.spriteCount++ * SPRITE_FLOATS
  const s = o.sprites
  s[i] = x; s[i + 1] = y; s[i + 2] = r; s[i + 3] = a; s[i + 4] = kind
  s[i + 5] = c[0]; s[i + 6] = c[1]; s[i + 7] = c[2]
}

/**
 * The cities, the sales in flight and the rings where they land, turned by
 * `m` and written into `o`. Called once a frame; allocates nothing.
 * Returns true when an arc has just arrived (so the caller can start its
 * ripple).
 */
export function buildOverlay(o: Overlay, input: OverlayInput, onLanded: (arc: Arc) => void) {
  const { m, now, arcs, ripples, pulse, dot } = input
  o.spriteCount = 0

  /* Cities facing the viewer: a small bright pin, and a slow pulse around it. */
  for (let i = 0; i < CITIES.length; i++) {
    const p = CITIES[i]
    const z = m[2] * p[0] + m[5] * p[1] + m[8] * p[2]
    if (z <= 0.08) continue
    const x = m[0] * p[0] + m[3] * p[1] + m[6] * p[2]
    const y = m[1] * p[0] + m[4] * p[1] + m[7] * p[2]
    const face = Math.min(1, (z - 0.08) / 0.3)
    sprite(o, x, y, dot * 1.25, 0.95 * face, SPRITE_DISC, PALETTE.pin)
    if (pulse && z > 0.3) {
      const phase = (((now / 2800 + i * 0.37) % 1) + 1) % 1
      sprite(o, x, y, dot * (1.6 + phase * 4.2), 0.42 * (1 - phase) * face, SPRITE_RING, PALETTE.pulse)
    }
  }

  /* Sales in flight: the curve between two cities, lifted over the surface, from its tail to its head. */
  for (let a = 0; a < arcs.length; a++) {
    const arc = arcs[a]
    o.trailCounts[a] = 0
    if (!arc.active) continue
    const u = (now - arc.born) / arc.life
    if (u >= 1) {
      arc.active = false
      continue
    }
    const head = easeOut(Math.min(1, u / 0.62))
    const tail = easeOut(Math.max(0, (u - 0.34) / 0.66))
    const fade = u > 0.82 ? (1 - u) / 0.18 : 1
    let n = 0
    const base = a * ARC_SAMPLES * TRAIL_FLOATS
    let hx = 0
    let hy = 0
    let headShown = false
    for (let k = 0; k < ARC_SAMPLES; k++) {
      const t = tail + ((head - tail) * k) / (ARC_SAMPLES - 1)
      const fa = Math.sin((1 - t) * arc.omega) / arc.sinOmega
      const fb = Math.sin(t * arc.omega) / arc.sinOmega
      const lift = 1 + arc.lift * Math.sin(Math.PI * t)
      const px = (arc.from[0] * fa + arc.to[0] * fb) * lift
      const py = (arc.from[1] * fa + arc.to[1] * fb) * lift
      const pz = (arc.from[2] * fa + arc.to[2] * fb) * lift
      const x = m[0] * px + m[3] * py + m[6] * pz
      const y = m[1] * px + m[4] * py + m[7] * pz
      const z = m[2] * px + m[5] * py + m[8] * pz
      /* Behind the globe only when it is both on the far side and inside the outline. */
      if (z < 0 && x * x + y * y < 1) {
        if (n > 0) break
        continue
      }
      const w = base + n * TRAIL_FLOATS
      o.trails[w] = x
      o.trails[w + 1] = y
      /* Faint at the tail, full at the head. */
      o.trails[w + 2] = fade * (0.12 + 0.88 * (k / (ARC_SAMPLES - 1)))
      n++
      if (k === ARC_SAMPLES - 1) {
        hx = x
        hy = y
        headShown = true
      }
    }
    o.trailCounts[a] = n
    if (headShown && u < 0.62) {
      sprite(o, hx, hy, dot * 2.6, 0.55 * fade, SPRITE_GLOW, PALETTE.arc)
      sprite(o, hx, hy, dot * 0.95, fade, SPRITE_DISC, PALETTE.head)
    }
    if (head >= 1 && !arc.landed) {
      arc.landed = true
      onLanded(arc)
    }
  }

  /* Where a sale lands. */
  for (let r = 0; r < ripples.length; r++) {
    const rip = ripples[r]
    if (!rip.active) continue
    const u = (now - rip.born) / RIPPLE_MS
    if (u >= 1) {
      rip.active = false
      continue
    }
    const p = rip.at
    const z = m[2] * p[0] + m[5] * p[1] + m[8] * p[2]
    if (z <= 0.05) continue
    const x = m[0] * p[0] + m[3] * p[1] + m[6] * p[2]
    const y = m[1] * p[0] + m[4] * p[1] + m[7] * p[2]
    sprite(o, x, y, dot * (1.8 + easeOut(u) * 7), 0.85 * (1 - u), SPRITE_RING, PALETTE.ripple)
  }
}
