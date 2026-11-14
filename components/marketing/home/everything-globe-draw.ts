/*
  THE "SELL ANYWHERE" GLOBE'S ENGINE.

  Everything the globe does per frame: the spin, the drag with its throw,
  the lean toward the mouse, the order shots, the landing pulses and when the
  order notification comes and goes. It runs in a worker that owns the canvas
  (everything-globe-worker.ts, shipped as a string built by
  scripts/build-globe-worker.mjs), so the page's own thread does nothing per
  frame but show or hide one notification; where a canvas cannot be handed to a worker,
  everything-globe.tsx runs this same engine on the page.

  Timing: every motion is advanced by the real time between two animation
  frames (capped, so a frame after a stall does not jump), on the engine's
  own clock, which stops while the globe is paused. So it turns at the same
  speed at 60, 120, 144 or 240Hz, only smoother, and a shot in flight picks
  up where it was when the globe scrolls back into view.

  Cost: device pixels capped at 2x. Nothing is allocated per frame: the
  land points and every order's arc are typed arrays made once. Land is a
  few thousand dots (small squares: a path of circles cost twice as much to
  raster) in ONE path and one fill a frame; the fade toward the rim, so the
  foreshortened rows there never clump, is a picture of the sphere itself
  with a soft hole in the middle, stamped over the dots (see paintStatic).
  The shaded sphere, its rim light and atmosphere are painted once per size.
  It draws only while the section is on screen, the tab visible and the
  globe in view, or while the visitor is turning it. Under reduced motion it
  stands still (one frame) and redraws only while dragged.

  LANDING ROUND 6 (the owner: "the whole globe thing is very laggy, make sure
  it doesn't cause lag on drag and movement"):
  - The real lag: after every drawn frame the loop started over with a
    frame that only set its time base, so the globe drew every OTHER
    display frame (30 a second on a 60Hz phone, dragging included). The
    tick now asks for its own next frame (see the end of tick).
  - The land is projected in one tight loop with the rotation inlined and
    the back of the ball culled before most of the arithmetic (about half
    the dots never get past three multiplications), straight into one path:
    no per dot depth buckets, no sorting pass, no scratch arrays.
  - A drag, and the coast after a throw, draw on every display frame (the
    ball sits under the finger at 90 or 120Hz); only the idle spin is held
    to about 60 a second.
  - The notification is placed where the shot landed (see showPill), told
    once per landing, never per frame.
*/

export type V3 = [number, number, number]
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

const AUTO_SPIN = 0.00012 /* radians per ms */
const BASE_PITCH = 0.42
const ORDER_EVERY = 2600
const ARC_MS = 1250
/** The tail leaves this long after the head, so the shot is a comet that shrinks into the landing point. */
const TAIL_LAG = 380
const PULSE_MS = 1400
const ARC_N = 96
/** Pieces of a shot's tail, each a little brighter and wider toward the head (14 in round 5; 8 reads the same at this size, at about half the strokes). */
const TRAIL_CHUNKS = 8
/*
  LANDING ROUND 6 (the owner: "the new order notifications should show where the laser landed, where the rocket
  landed"). Round 5 put the notification in a fixed corner because a pill re-aimed several times a second at a turning
  city jumped. Now it is told ONCE, when the shot lands: where the buyer's city is on the card (CSS pixels) and where
  the slow spin will have carried it when the notification leaves, PILL_SHOW_MS later. The page sets it there and lets
  one compositor animation carry it along that line (nothing re-aims it). Every frame the engine checks the city
  against that line; if the city turns toward the back of the ball, leaves the card, or a drag or a throw takes it
  off the line, the notification is told to leave early.
*/
const PILL_SHOW_MS = 2100
/** How far (CSS px) the city may wander from the line the notification travels before it leaves early. */
const PILL_DRIFT_PX = 16
/** The city must face the viewer at least this much (z on the unit sphere) for the notification to stay. */
const PILL_MIN_FACE = 0.18
/**
 * Cost on any phone (landing round 5, the owner: "works on any low end device without lag"). The globe draws at most
 * about 60 times a second, whatever the display's rate (a 120Hz phone does not pay twice for a slow spin). The time a
 * frame's drawing takes is watched: if it stays heavy, the canvas steps down to fewer device pixels (2x, 1.5x, 1x), and
 * if it is still heavy at 1x the idle spin draws at 30 frames a second (a drag stays at 60).
 */
const FRAME_MIN_MS = 15
const SLOW_FRAME_MS = 7
const SLOW_FRAME_IDLE_MS = 30

/**
 * The order notification: which order landed, and whether it is showing. When it comes on it also says where the city
 * is on the card (x0, y0, CSS pixels from the card's top left) and where it will be `ms` later (x1, y1).
 */
export type GlobePill = { i: number; on: boolean; x0?: number; y0?: number; x1?: number; y1?: number; ms?: number }

export type GlobePointer = { kind: "down" | "move" | "up"; x: number; y: number; t: number }

/** The land's light before the rim fade, and its fill. */
const LAND_ALPHA = 0.78
const LAND_STYLE = `rgba(236,233,255,${LAND_ALPHA})`
/** Round 5's six depth buckets, by a smoothstep of depth: now the points a smooth curve runs through. */
const LAND_STEPS = [0.07, 0.16, 0.28, 0.42, 0.58, LAND_ALPHA]
/** A dot's light at depth z (z of the unit sphere toward the viewer): each old bucket's value at its middle, joined by straight lines. */
function landFade(z: number): number {
  const f = z < 0.7 ? z / 0.7 : 1
  const u = f * f * (3 - 2 * f) * LAND_STEPS.length - 0.5
  if (u <= 0) return LAND_STEPS[0]
  if (u >= LAND_STEPS.length - 1) return LAND_ALPHA
  const b = Math.floor(u)
  return LAND_STEPS[b] + (LAND_STEPS[b + 1] - LAND_STEPS[b]) * (u - b)
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** ARC_N + 1 points along the great circle from a to b, lifted off the surface toward the middle. */
function arcPoints(a: V3, b: V3): Float32Array {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const w = Math.acos(dot)
  const s = Math.sin(w) || 1
  const lift = 0.06 + 0.32 * (w / Math.PI)
  const out = new Float32Array((ARC_N + 1) * 3)
  for (let i = 0; i <= ARC_N; i++) {
    const t = i / ARC_N
    const ka = w ? Math.sin((1 - t) * w) / s : 1 - t
    const kb = w ? Math.sin(t * w) / s : t
    const h = 1 + lift * Math.sin(Math.PI * t)
    out[i * 3] = (ka * a[0] + kb * b[0]) * h
    out[i * 3 + 1] = (ka * a[1] + kb * b[1]) * h
    out[i * 3 + 2] = (ka * a[2] + kb * b[2]) * h
  }
  return out
}

export type GlobeEngineHost = {
  canvas: AnyCanvas
  ctx: Ctx2D
  /** A scratch canvas for the parts painted once per size. */
  makeCanvas: (w: number, h: number) => AnyCanvas | null
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  /** The pill moved, appeared or turned away. */
  onPill: (p: GlobePill) => void
  /** The first frame is on the canvas. */
  onDrawn: () => void
}

const MAX_SHOTS = 3
const POINTER_SAMPLES = 8

export function createGlobeEngine(host: GlobeEngineHost, pts: Float32Array, cities: V3[], home: V3) {
  const { canvas, ctx } = host
  const nPts3 = pts.length - (pts.length % 3)
  /* Every order's arc, made once (the studio and the cities never move). */
  const arcs = cities.map((c) => arcPoints(home, c))

  /* Shots in flight and landing pulses: a fixed pool, no objects made per frame. */
  const shotCity = new Int16Array(MAX_SHOTS).fill(-1)
  const shotT0 = new Float64Array(MAX_SHOTS)
  const shotLanded = new Uint8Array(MAX_SHOTS)

  /* The last few pointer moves, for the throw's speed. */
  const sampX = new Float64Array(POINTER_SAMPLES)
  const sampY = new Float64Array(POINTER_SAMPLES)
  const sampT = new Float64Array(POINTER_SAMPLES)
  let sampN = 0

  const st = {
    w: 0,
    h: 0,
    dpr: 1,
    R: 0,
    cx: 0,
    cy: 0,
    /* The Atlantic in front (longitude -yaw), the studio and Europe both in view; the spin then carries it west. */
    yaw: 0.4,
    pitch: BASE_PITCH,
    vyaw: AUTO_SPIN,
    vpitch: 0,
    leanX: 0,
    leanY: 0,
    targetLeanX: 0,
    targetLeanY: 0,
    dragging: false,
    dragX: 0,
    dragY: 0,
    /** The engine's clock: real milliseconds of motion, standing still while paused. */
    clock: 0,
    next: 600,
    order: 0,
    pill: -1,
    pillOn: false,
    pillOff: 0,
    /** Where the notification's city was when it landed, and where the spin was to carry it (CSS px), and when. */
    pillX0: 0,
    pillY0: 0,
    pillX1: 0,
    pillY1: 0,
    pillT0: 0,
    /** The display's last frame time that was drawn, a running average of a frame's drawing cost, and the frames it covers. */
    drawnAt: 0,
    cost: 0,
    costN: 0,
    /** The device pixel ratio asked for, and the one in use after any step down. */
    askedDpr: 1,
    dprCeil: 4,
    slow: false,
    bg: null as AnyCanvas | null,
    fade: null as AnyCanvas | null,
    glow: null as AnyCanvas | null,
    frame: 0,
    last: 0,
    running: false,
    want: false,
    reduced: false,
    drawn: false,
    dirty: true,
  }

  /* The shaded sphere, its rim light and atmosphere, and the glow sprite city lights and shot heads are stamped with: painted once per size. */
  const paintStatic = () => {
    const W = canvas.width
    const H = canvas.height
    const R = st.R * st.dpr
    const cx = st.cx * st.dpr
    const cy = st.cy * st.dpr
    /* The body, lit from the upper left, with a thin violet rim light along the inside of the edge. */
    const sphere = (g: Ctx2D) => {
      const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.04, cx, cy, R)
      body.addColorStop(0, "#26252e")
      body.addColorStop(0.55, "#121116")
      body.addColorStop(1, "#08080a")
      g.fillStyle = body
      g.beginPath()
      g.arc(cx, cy, R, 0, Math.PI * 2)
      g.fill()
      const rim = g.createRadialGradient(cx, cy, R * 0.86, cx, cy, R)
      rim.addColorStop(0, "rgba(167,139,250,0)")
      rim.addColorStop(0.8, "rgba(167,139,250,0.05)")
      rim.addColorStop(1, "rgba(196,181,253,0.20)")
      g.fillStyle = rim
      g.fill()
      g.strokeStyle = "rgba(221,214,254,0.16)"
      g.lineWidth = st.dpr
      g.beginPath()
      g.arc(cx, cy, R - st.dpr / 2, 0, Math.PI * 2)
      g.stroke()
    }
    const bg = host.makeCanvas(W, H)
    const g = bg?.getContext("2d") as Ctx2D | null | undefined
    if (g) {
      /* Atmosphere: a soft violet haze just outside the rim. */
      const halo = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.14)
      halo.addColorStop(0, "rgba(139,92,246,0.22)")
      halo.addColorStop(0.35, "rgba(139,92,246,0.08)")
      halo.addColorStop(1, "rgba(139,92,246,0)")
      g.fillStyle = halo
      g.beginPath()
      g.arc(cx, cy, R * 1.14, 0, Math.PI * 2)
      g.fill()
      sphere(g)
    }
    st.bg = bg
    /*
      The rim fade (round 6), in place of six depth buckets drawn one by one: the land is filled at LAND_ALPHA in one
      path, then this picture of the same sphere is stamped over it, clear in the middle and more and more opaque
      toward the edge. Over bare sphere it paints the pixels already there, so only the dots change: a dot keeps
      LAND_ALPHA times (1 - the stamp's alpha) of its light, which is the old buckets' fade as a smooth curve.
    */
    const fade = host.makeCanvas(W, H)
    const f = fade?.getContext("2d") as Ctx2D | null | undefined
    if (f) {
      sphere(f)
      const mask = f.createRadialGradient(cx, cy, 0, cx, cy, R)
      /* Stops crowd toward the edge, where depth changes fastest across the picture. */
      for (let k = 0; k <= 24; k++) {
        const dd = 1 - (1 - k / 24) * (1 - k / 24)
        mask.addColorStop(dd, `rgba(0,0,0,${(1 - landFade(Math.sqrt(Math.max(0, 1 - dd * dd))) / LAND_ALPHA).toFixed(3)})`)
      }
      f.globalCompositeOperation = "destination-in"
      f.fillStyle = mask
      f.fillRect(0, 0, W, H)
      f.globalCompositeOperation = "source-over"
    }
    st.fade = fade
    const s = Math.round(32 * st.dpr)
    const glow = host.makeCanvas(s, s)
    const gg = glow?.getContext("2d") as Ctx2D | null | undefined
    if (gg) {
      const r = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      r.addColorStop(0, "rgba(255,255,255,1)")
      r.addColorStop(0.12, "rgba(255,255,255,0.95)")
      r.addColorStop(0.28, "rgba(221,214,254,0.45)")
      r.addColorStop(0.6, "rgba(167,139,250,0.12)")
      r.addColorStop(1, "rgba(167,139,250,0)")
      gg.fillStyle = r
      gg.fillRect(0, 0, s, s)
    }
    st.glow = glow
  }

  /* Rotation of a unit vector into view space: yaw about the axis, then pitch toward the viewer. Results land in rx, ry, rz. */
  let cY = 1
  let sY = 0
  let cP = 1
  let sP = 0
  let rx = 0
  let ry = 0
  let rz = 0
  const setRot = (extraYaw = 0) => {
    const yaw = st.yaw + st.leanX + extraYaw
    const pitch = st.pitch + st.leanY
    cY = Math.cos(yaw)
    sY = Math.sin(yaw)
    cP = Math.cos(pitch)
    sP = Math.sin(pitch)
  }
  const rot = (x: number, y: number, z: number) => {
    const x1 = x * cY + z * sY
    const z1 = -x * sY + z * cY
    rx = x1
    ry = y * cP - z1 * sP
    rz = y * sP + z1 * cP
  }
  /** A point of a shot is hidden while it is behind the ball. */
  const behind = () => rz < 0 && rx * rx + ry * ry < 1

  /* One point along a shot at fractional index f, rotated: sets rx, ry, rz. */
  const arcAt = (a: Float32Array, f: number) => {
    const i = Math.min(ARC_N - 1, Math.floor(f))
    const u = f - i
    const k = i * 3
    rot(a[k] + (a[k + 3] - a[k]) * u, a[k + 1] + (a[k + 4] - a[k + 1]) * u, a[k + 2] + (a[k + 5] - a[k + 2]) * u)
  }

  /* Strokes the part of a shot between fractional indexes f0 and f1, lifting the pen behind the ball. */
  let pen = false
  const spanPoint = (a: Float32Array, f: number, cx: number, cy: number, R: number) => {
    arcAt(a, f)
    if (behind()) {
      pen = false
      return
    }
    const x = cx + rx * R
    const y = cy - ry * R
    if (pen) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
    pen = true
  }
  const strokeSpan = (a: Float32Array, f0: number, f1: number, cx: number, cy: number, R: number) => {
    ctx.beginPath()
    pen = false
    spanPoint(a, f0, cx, cy, R)
    for (let i = Math.floor(f0) + 1; i < f1; i++) spanPoint(a, i, cx, cy, R)
    spanPoint(a, f1, cx, cy, R)
    ctx.stroke()
  }

  const draw = () => {
    if (!st.bg || !st.glow) return
    const now = st.clock
    setRot()
    const d = st.dpr
    const R = st.R * d
    const cx = st.cx * d
    const cy = st.cy * d
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = "source-over"
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(st.bg, 0, 0)

    /*
      Land: every dot facing the viewer, in one path and one fill (squares: as many circles cost twice as much to
      raster). The rotation is inlined with the depth worked out first, so a dot on the back of the ball costs a few
      multiplications before it is skipped. Dots shrink a little with depth; the fade toward the rim is the stamp
      drawn right after.
    */
    const base = Math.max(0.8 * d, R * 0.0046)
    const qc = cY
    const qs = sY
    const pc = cP
    const ps = sP
    const s0 = base * 0.62
    const s1 = base * 0.38
    ctx.beginPath()
    for (let k = 0; k < nPts3; k += 3) {
      const x = pts[k]
      const z = pts[k + 2]
      const z1 = z * qc - x * qs
      const y = pts[k + 1]
      const depth = y * ps + z1 * pc
      if (depth <= 0.04) continue
      const r = s0 + s1 * depth
      ctx.rect(cx + (x * qc + z * qs) * R - r, cy - (y * pc - z1 * ps) * R - r, 2 * r, 2 * r)
    }
    ctx.fillStyle = LAND_STYLE
    ctx.fill()
    if (st.fade) ctx.drawImage(st.fade, 0, 0)

    /* City lights, the studio brightest. */
    const gs = st.glow.width
    for (let i = 0; i <= cities.length; i++) {
      const c = i < cities.length ? cities[i] : home
      rot(c[0], c[1], c[2])
      if (rz <= 0.04) continue
      ctx.globalAlpha = Math.min(1, rz * 2) * (i === cities.length ? 1 : 0.7)
      const size = gs * (i === cities.length ? 1.1 : 0.62)
      ctx.drawImage(st.glow, cx + rx * R - size / 2, cy - ry * R - size / 2, size, size)
    }
    ctx.globalAlpha = 1

    /* Shots: a comet from the studio to the buyer, head eased along the great circle, tail fading behind it. */
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    for (let s = 0; s < MAX_SHOTS; s++) {
      const ci = shotCity[s]
      if (ci < 0) continue
      const t = now - shotT0[s]
      const a = arcs[ci]
      const head = easeInOut(clamp01(t / ARC_MS)) * ARC_N
      const tail = easeInOut(clamp01((t - TAIL_LAG) / ARC_MS)) * ARC_N
      /* The route, a faint line that fades as the tail arrives. */
      const fade = 1 - clamp01((t - ARC_MS) / (TAIL_LAG + 200))
      if (head > 0.01) {
        ctx.globalAlpha = 0.16 * fade
        ctx.strokeStyle = "#c4b5fd"
        ctx.lineWidth = d
        strokeSpan(a, 0, head, cx, cy, R)
      }
      if (head - tail > 0.02) {
        const span = head - tail
        for (let c = 0; c < TRAIL_CHUNKS; c++) {
          const f0 = tail + (span * c) / TRAIL_CHUNKS
          const f1 = tail + (span * (c + 1)) / TRAIL_CHUNKS + 0.001
          const k = (c + 1) / TRAIL_CHUNKS
          /* Glow under a bright core, both growing toward the head. */
          ctx.globalAlpha = 0.22 * k * k
          ctx.strokeStyle = "#8b5cf6"
          ctx.lineWidth = (3 + 5 * k) * d
          strokeSpan(a, f0, f1, cx, cy, R)
          ctx.globalAlpha = 0.15 + 0.85 * k * k
          ctx.strokeStyle = "#ede9fe"
          ctx.lineWidth = (0.6 + 1.4 * k) * d
          strokeSpan(a, f0, f1, cx, cy, R)
        }
      }
      if (t < ARC_MS) {
        arcAt(a, head)
        if (!behind()) {
          const hx = cx + rx * R
          const hy = cy - ry * R
          const size = gs * 0.95
          ctx.globalAlpha = 1
          ctx.drawImage(st.glow, hx - size / 2, hy - size / 2, size, size)
          ctx.fillStyle = "#fff"
          ctx.beginPath()
          ctx.arc(hx, hy, 1.9 * d, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (t < ARC_MS + PULSE_MS) {
        /* The landing: a flash and two rings, drawn flat on the surface (ellipses foreshortened toward the rim). */
        const c = cities[ci]
        rot(c[0], c[1], c[2])
        if (rz > 0.04) {
          const x = cx + rx * R
          const y = cy - ry * R
          const ang = Math.atan2(-ry, rx)
          const face = Math.min(1, rz * 1.6)
          const k = (t - ARC_MS) / PULSE_MS
          const flash = 1 - clamp01(k * 3)
          if (flash > 0) {
            const size = gs * (0.7 + 0.8 * flash)
            ctx.globalAlpha = flash * face
            ctx.drawImage(st.glow, x - size / 2, y - size / 2, size, size)
          }
          ctx.strokeStyle = "#c4b5fd"
          for (let ring = 0; ring < 2; ring++) {
            const kr = clamp01(k * 1.25 - ring * 0.25)
            if (kr <= 0 || kr >= 1) continue
            const rr = (2 + 24 * easeOut(kr)) * d
            ctx.globalAlpha = (1 - kr) * (1 - kr) * face * (ring ? 0.6 : 1)
            ctx.lineWidth = (1.6 - 0.6 * kr) * d
            ctx.beginPath()
            ctx.ellipse(x, y, rr * Math.max(0.12, rz), rr, ang, 0, Math.PI * 2)
            ctx.stroke()
          }
        }
      } else if (t > ARC_MS + TAIL_LAG + 220) {
        shotCity[s] = -1
      }
    }
    ctx.globalAlpha = 1

    st.dirty = false
    if (!st.drawn) {
      st.drawn = true
      host.onDrawn()
    }
  }

  /** Where city i is on the card (CSS px) with the ball turned `ahead` radians further; its depth is left in rz. */
  let cityX = 0
  let cityY = 0
  const cityAt = (i: number, ahead: number) => {
    setRot(ahead)
    const c = cities[i]
    rot(c[0], c[1], c[2])
    cityX = st.cx + rx * st.R
    cityY = st.cy - ry * st.R
  }
  /*
    The notification comes on where the shot landed. Told once: the city now, and where the spin carries it by the time
    the notification leaves (no spin while dragged or under reduced motion: it stays put).
  */
  const showPill = (i: number) => {
    st.pill = i
    st.pillOn = true
    st.pillT0 = st.clock
    st.pillOff = st.clock + PILL_SHOW_MS
    const spin = st.dragging || st.reduced ? 0 : st.vyaw * PILL_SHOW_MS
    cityAt(i, spin)
    st.pillX1 = cityX
    st.pillY1 = cityY
    cityAt(i, 0)
    st.pillX0 = cityX
    st.pillY0 = cityY
    const r1 = (v: number) => Math.round(v * 10) / 10
    host.onPill({ i, on: true, x0: r1(st.pillX0), y0: r1(st.pillY0), x1: r1(st.pillX1), y1: r1(st.pillY1), ms: spin ? PILL_SHOW_MS : 0 })
  }
  /** Still where the notification says: facing the viewer, on the card, and within PILL_DRIFT_PX of its line. */
  const pillHolds = () => {
    cityAt(st.pill, 0)
    if (rz < PILL_MIN_FACE) return false
    if (cityX < 0 || cityY < 0 || cityX > st.w || cityY > st.h) return false
    const k = Math.min(1, (st.clock - st.pillT0) / PILL_SHOW_MS)
    const ex = st.pillX0 + (st.pillX1 - st.pillX0) * k - cityX
    const ey = st.pillY0 + (st.pillY1 - st.pillY0) * k - cityY
    return ex * ex + ey * ey <= PILL_DRIFT_PX * PILL_DRIFT_PX
  }
  const hidePill = () => {
    if (!st.pillOn) return
    st.pillOn = false
    host.onPill({ i: st.pill, on: false })
  }

  /* Fewer device pixels when drawing stays heavy (see FRAME_MIN_MS). */
  const resizeCanvas = () => {
    canvas.width = Math.round(st.w * st.dpr)
    canvas.height = Math.round(st.h * st.dpr)
    paintStatic()
  }
  const watchCost = (ms: number) => {
    st.cost = st.costN ? st.cost * 0.9 + ms * 0.1 : ms
    st.costN++
    if (st.costN < 24 || st.cost < SLOW_FRAME_MS) return
    if (st.dpr > 1) {
      st.dpr = st.dprCeil = Math.max(1, st.dpr - 0.5)
      resizeCanvas()
    } else st.slow = true
    st.costN = 0
  }

  /* The next order: the next buyer in the list whose city will face the viewer when the shot lands. */
  const launch = (now: number) => {
    let slot = -1
    for (let s = 0; s < MAX_SHOTS; s++) if (shotCity[s] < 0) slot = s
    if (slot < 0) return
    setRot(st.vyaw * ARC_MS)
    for (let tries = 0; tries < cities.length; tries++) {
      const i = st.order
      st.order = (st.order + 1) % cities.length
      const c = cities[i]
      rot(c[0], c[1], c[2])
      if (rz > 0.4) {
        shotCity[slot] = i
        shotT0[slot] = now
        shotLanded[slot] = 0
        return
      }
    }
  }

  const tick = (t: number) => {
    st.frame = 0
    /*
      The idle spin draws at most about 60 frames a second, 30 on a device that cannot keep up. A drag and the coast
      after a throw draw every display frame (round 6), so the ball stays under the finger on a 90 or 120Hz screen.
    */
    if (!st.dragging && !coasting() && t - st.drawnAt < (st.slow ? SLOW_FRAME_IDLE_MS : FRAME_MIN_MS)) {
      st.frame = host.raf(tick)
      return
    }
    st.drawnAt = t
    /* Real time since the last frame, capped so a stall never jumps the globe. */
    const dt = Math.max(0, Math.min(50, t - st.last))
    st.last = t
    st.clock += dt
    const now = st.clock
    if (!st.dragging) {
      /* The throw coasts and settles back into the slow spin; the tilt springs back. */
      st.vyaw += ((st.reduced ? 0 : AUTO_SPIN) - st.vyaw) * (1 - Math.exp(-dt / 1100))
      st.yaw += st.vyaw * dt
      st.vpitch *= Math.exp(-dt / 260)
      st.pitch += st.vpitch * dt
      st.pitch += (BASE_PITCH - st.pitch) * (1 - Math.exp(-dt / 1200))
      st.pitch = Math.max(-0.35, Math.min(1.1, st.pitch))
    }
    const kl = 1 - Math.exp(-dt / 240)
    st.leanX += (st.targetLeanX - st.leanX) * kl
    st.leanY += (st.targetLeanY - st.leanY) * kl
    if (!st.reduced) {
      if (now >= st.next) {
        launch(now)
        st.next = now + ORDER_EVERY
      }
      for (let s = 0; s < MAX_SHOTS; s++) {
        if (shotCity[s] >= 0 && !shotLanded[s] && now - shotT0[s] >= ARC_MS) {
          shotLanded[s] = 1
          showPill(shotCity[s])
        }
      }
      if (st.pillOn && (now >= st.pillOff || !pillHolds())) hidePill()
    }
    const t0 = performance.now()
    draw()
    watchCost(performance.now() - t0)
    /*
      LANDING ROUND 6: the next frame is asked for here, by the tick itself. Before, a drawn frame left no frame asked
      for, so sync() started over with its "first frame only sets the time base" frame, and every drawn frame was
      followed by one that drew nothing: the globe turned at half the display's rate (30 a second on a 60Hz phone,
      dragging included), which is the lag the owner felt.
    */
    if ((st.want && !st.reduced) || interacting()) st.frame = host.raf(tick)
    sync()
  }

  /** Still carried by a throw (or settling back from one), as opposed to the slow spin. */
  const coasting = () => Math.abs(st.vyaw - (st.reduced ? 0 : AUTO_SPIN)) > 0.00004 || Math.abs(st.vpitch) > 0.00002

  const interacting = () => st.dragging || Math.abs(st.leanX - st.targetLeanX) + Math.abs(st.leanY - st.targetLeanY) > 0.002

  const sync = () => {
    st.running = (st.want && !st.reduced) || interacting()
    if (st.running && !st.frame) {
      st.last = performance.now()
      st.frame = host.raf((t) => {
        /* The first frame after a pause only sets the time base. */
        st.last = t
        st.frame = host.raf(tick)
      })
    } else if (!st.running && st.frame) {
      host.caf(st.frame)
      st.frame = 0
      if (st.dirty) draw()
      /* Paused off screen: the notification would no longer be where its city is when the globe comes back. */
      if (!st.reduced) hidePill()
    }
  }

  return {
    /** The card's size in CSS pixels and the device pixel ratio (capped by the caller). */
    size(w: number, h: number, dpr: number) {
      if (!w || !h || (w === st.w && h === st.h && dpr === st.askedDpr)) return
      st.w = w
      st.h = h
      st.askedDpr = dpr
      /* A step down already taken holds across a resize. */
      st.dpr = Math.min(dpr, st.dprCeil)
      st.R = Math.min(w * 0.45, h * 0.57)
      st.cx = w / 2
      st.cy = h * 0.53
      resizeCanvas()
      draw()
      /* A new size moves every city: the still notification under reduced motion is placed again, a moving one leaves. */
      if (st.pillOn) {
        if (st.reduced) showPill(st.pill)
        else hidePill()
      }
    },
    /** On screen, the tab visible, the globe in view, motion allowed. */
    run(want: boolean) {
      st.want = want
      sync()
    },
    reduced(on: boolean) {
      st.reduced = on
      if (on) {
        /* A still globe with the Atlantic in front and one order shown. */
        for (let s = 0; s < MAX_SHOTS; s++) shotCity[s] = -1
        st.yaw = 0.4
        st.vyaw = 0
        st.vpitch = 0
        st.leanX = st.targetLeanX = 0
        st.leanY = st.targetLeanY = 0
        if (st.pill < 0) showPill(0)
      } else {
        st.vyaw = AUTO_SPIN
      }
      st.dirty = true
      sync()
      if (!st.running) draw()
    },
    /** Drag to turn (with momentum); `t` is the event's timeStamp. */
    pointer(e: GlobePointer) {
      const k = 1 / Math.max(80, st.R)
      if (e.kind === "down") {
        st.dragging = true
        st.dragX = e.x
        st.dragY = e.y
        st.vyaw = 0
        st.vpitch = 0
        sampN = 0
        sampX[0] = e.x
        sampY[0] = e.y
        sampT[0] = e.t
        sampN = 1
      } else if (e.kind === "move") {
        if (!st.dragging) return
        const dx = e.x - st.dragX
        const dy = e.y - st.dragY
        st.yaw += dx * k
        st.pitch = Math.max(-0.35, Math.min(1.1, st.pitch + dy * k))
        st.dragX = e.x
        st.dragY = e.y
        const j = sampN % POINTER_SAMPLES
        sampX[j] = e.x
        sampY[j] = e.y
        sampT[j] = e.t
        sampN++
        st.dirty = true
        if (st.reduced) {
          setRot()
          draw()
        }
      } else {
        if (!st.dragging) return
        st.dragging = false
        /* The throw: the pointer's speed over its last ~100ms; a release after a pause throws nothing. */
        const lastJ = (sampN - 1) % POINTER_SAMPLES
        const tLast = sampT[lastJ]
        let firstJ = lastJ
        for (let n = 1; n < Math.min(sampN, POINTER_SAMPLES); n++) {
          const j = (sampN - 1 - n) % POINTER_SAMPLES
          if (tLast - sampT[j] > 100) break
          firstJ = j
        }
        const span = tLast - sampT[firstJ]
        if (span > 8 && e.t - tLast < 80) {
          st.vyaw = Math.max(-0.008, Math.min(0.008, ((sampX[lastJ] - sampX[firstJ]) * k) / span))
          st.vpitch = Math.max(-0.004, Math.min(0.004, ((sampY[lastJ] - sampY[firstJ]) * k) / span))
        } else {
          st.vyaw = 0
          st.vpitch = 0
        }
        if (st.reduced) {
          st.vyaw = 0
          st.vpitch = 0
        }
      }
      sync()
    },
    /** Lean toward a hovering mouse (fractions of the card, -0.5 to 0.5), or back to 0. */
    lean(fx: number, fy: number) {
      if (st.reduced) return
      st.targetLeanX = fx * 0.26
      st.targetLeanY = fy * 0.2
      sync()
    },
    stop() {
      if (st.frame) host.caf(st.frame)
      st.frame = 0
      st.want = false
      st.dragging = false
    },
  }
}

export type GlobeEngine = ReturnType<typeof createGlobeEngine>
