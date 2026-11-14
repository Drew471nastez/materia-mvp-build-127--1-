/*
  THE "SELL ANYWHERE" GLOBE'S ENGINE.

  Everything the globe does per frame: the spin, the drag with its throw,
  the lean toward the mouse, the order shots, the landing pulses and the
  pill's place. It runs in a worker that owns the canvas
  (everything-globe-worker.ts, shipped as a string built by
  scripts/build-globe-worker.mjs), so the page's own thread does nothing per
  frame but move one pill; where a canvas cannot be handed to a worker,
  everything-globe.tsx runs this same engine on the page.

  Timing: every motion is advanced by the real time between two animation
  frames (capped, so a frame after a stall does not jump), on the engine's
  own clock, which stops while the globe is paused. So it turns at the same
  speed at 60, 120, 144 or 240Hz, only smoother, and a shot in flight picks
  up where it was when the globe scrolls back into view.

  Cost: device pixels capped at 2x. Nothing is allocated per frame: the
  land's projected points, the depth buckets they are drawn in and every
  order's arc are typed arrays made once. Land is a few thousand dots (small
  squares: a path of circles cost twice as much to raster) in six batched
  paths by depth, fading out toward the rim so the
  foreshortened rows there never clump; the shaded sphere, its rim light and
  atmosphere are painted once per size. It draws only while the section is
  on screen, the tab visible and the globe in view, or while the visitor is
  turning it. Under reduced motion it stands still (one frame) and redraws
  only while dragged.
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
const TRAIL_CHUNKS = 14
const DEPTH_BUCKETS = 6
/** The pill only shows while its city faces the viewer this much (z of the unit vector). */
const PILL_MIN_Z = 0.16
/**
 * The pill is told where to go about four times a second (round 4: one message and one style change on the page's
 * thread per frame, each a commit of the whole page there, was what made dragging lag). Each glide is planned a little
 * longer than the gap, so the next one takes over mid-glide from where the pill really is.
 */
const PILL_EVERY = 240
const PILL_GLIDE = PILL_EVERY + 90
/** Faster than this (a drag, or a throw still coasting) the pill steps aside, and comes back once the globe has settled. */
const PILL_CALM_YAW = 0.0005
const PILL_CALM_PITCH = 0.00025

/**
 * Where the pill should be: the buyer's city in CSS pixels of the card, and whether it faces the viewer. While the
 * globe turns by itself, (x2, y2) is where the city will be `d` ms from now: the page glides the pill there with one
 * compositor animation, so it hears from the globe a few times a second instead of every frame. d = 0: set it there.
 */
export type GlobePill = { i: number; x: number; y: number; on: boolean; x2: number; y2: number; d: number }

export type GlobePointer = { kind: "down" | "move" | "up"; x: number; y: number; t: number }

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
  const nPts = pts.length / 3
  /* Per frame scratch, made once: each land dot's screen place, size and depth bucket, and the dots sorted by bucket. */
  const px = new Float32Array(nPts)
  const py = new Float32Array(nPts)
  const pr = new Float32Array(nPts)
  const pb = new Int8Array(nPts)
  const order = new Int32Array(nPts)
  const bucketCount = new Int32Array(DEPTH_BUCKETS + 1)
  const bucketAlpha = [0.07, 0.16, 0.28, 0.42, 0.58, 0.78]
  const bucketStyle = bucketAlpha.map((a) => `rgba(236,233,255,${a})`)
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
    pillX: -1e9,
    pillY: -1e9,
    bg: null as AnyCanvas | null,
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
      /* The body, lit from the upper left. */
      const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.04, cx, cy, R)
      body.addColorStop(0, "#26252e")
      body.addColorStop(0.55, "#121116")
      body.addColorStop(1, "#08080a")
      g.fillStyle = body
      g.beginPath()
      g.arc(cx, cy, R, 0, Math.PI * 2)
      g.fill()
      /* Rim light: a thin violet glow along the inside of the edge. */
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
    st.bg = bg
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

  /*
    The pill rides on the latest buyer's city. A few times a second (not every frame) the page is told where the city
    is and where it will be a moment later, and glides it there on the compositor; it steps aside while the globe is
    dragged or still coasting from a throw, and when the city turns away.
  */
  let pillNext = 0
  const pillPlace = (yaw: number, pitch: number, c: V3) => {
    const cy0 = Math.cos(yaw)
    const sy0 = Math.sin(yaw)
    const cp0 = Math.cos(pitch)
    const sp0 = Math.sin(pitch)
    const x1 = c[0] * cy0 + c[2] * sy0
    const z1 = -c[0] * sy0 + c[2] * cy0
    rx = x1
    ry = c[1] * cp0 - z1 * sp0
    rz = c[1] * sp0 + z1 * cp0
  }
  const sendPill = (force: boolean) => {
    if (st.pill < 0) return
    const c = cities[st.pill]
    const calm = !st.dragging && Math.abs(st.vyaw - (st.reduced ? 0 : AUTO_SPIN)) < PILL_CALM_YAW && Math.abs(st.vpitch) < PILL_CALM_PITCH
    pillPlace(st.yaw + st.leanX, st.pitch + st.leanY, c)
    const on = calm && rz > PILL_MIN_Z
    const x = st.cx + rx * st.R
    const y = st.cy - ry * st.R
    if (!force && on === st.pillOn && (!on || st.clock < pillNext)) return
    let x2 = x
    let y2 = y
    let d = 0
    if (on && st.running) {
      /* Where the city will be PILL_GLIDE ms on: the spin carries on, the tilt and the lean keep easing home. */
      d = PILL_GLIDE
      const kp = 1 - Math.exp(-d / 1200)
      const kl = 1 - Math.exp(-d / 240)
      const leanX = st.leanX + (st.targetLeanX - st.leanX) * kl
      const leanY = st.leanY + (st.targetLeanY - st.leanY) * kl
      pillPlace(st.yaw + st.vyaw * d + leanX, st.pitch + (BASE_PITCH - st.pitch) * kp + leanY, c)
      x2 = st.cx + rx * st.R
      y2 = st.cy - ry * st.R
    }
    st.pillOn = on
    st.pillX = x
    st.pillY = y
    pillNext = st.clock + PILL_EVERY
    host.onPill({ i: st.pill, x, y, on, x2, y2, d })
  }

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

    /* Land: project every dot once, bucket by depth, then one path per bucket (squares: as many circles cost twice as much to raster). */
    const base = Math.max(0.8 * d, R * 0.0046)
    bucketCount.fill(0)
    for (let i = 0, k = 0; i < nPts; i++, k += 3) {
      rot(pts[k], pts[k + 1], pts[k + 2])
      if (rz <= 0.04) {
        pb[i] = -1
        continue
      }
      /* Fade toward the rim (where rows crowd together) and shrink a little with depth. */
      const f = rz < 0.7 ? rz / 0.7 : 1
      const b = Math.min(DEPTH_BUCKETS - 1, Math.floor(f * f * (3 - 2 * f) * DEPTH_BUCKETS))
      pb[i] = b
      px[i] = cx + rx * R
      py[i] = cy - ry * R
      pr[i] = base * (0.62 + 0.38 * rz)
      bucketCount[b + 1]++
    }
    for (let b = 1; b <= DEPTH_BUCKETS; b++) bucketCount[b] += bucketCount[b - 1]
    for (let i = 0; i < nPts; i++) {
      const b = pb[i]
      if (b >= 0) order[bucketCount[b]++] = i
    }
    /* bucketCount[b] now holds where bucket b ends. */
    let start = 0
    for (let b = 0; b < DEPTH_BUCKETS; b++) {
      const stop = bucketCount[b]
      if (stop > start) {
        ctx.beginPath()
        for (let j = start; j < stop; j++) {
          const i = order[j]
          const r = pr[i]
          ctx.rect(px[i] - r, py[i] - r, 2 * r, 2 * r)
        }
        ctx.fillStyle = bucketStyle[b]
        ctx.fill()
      }
      start = stop
    }

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

    sendPill(false)
    st.dirty = false
    if (!st.drawn) {
      st.drawn = true
      host.onDrawn()
    }
  }

  const showPill = (i: number) => {
    if (st.pill === i) return
    st.pill = i
    st.pillOn = false
    setRot()
    sendPill(true)
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
    }
    draw()
    sync()
  }

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
      /* Stopped: the pill's glide would carry on past the city, so it is set where the city is. */
      setRot()
      sendPill(true)
    }
  }

  return {
    /** The card's size in CSS pixels and the device pixel ratio (capped by the caller). */
    size(w: number, h: number, dpr: number) {
      if (!w || !h || (w === st.w && h === st.h && dpr === st.dpr)) return
      st.w = w
      st.h = h
      st.dpr = dpr
      st.R = Math.min(w * 0.45, h * 0.57)
      st.cx = w / 2
      st.cy = h * 0.53
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      paintStatic()
      draw()
      setRot()
      sendPill(true)
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
        setRot()
        sendPill(true)
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
