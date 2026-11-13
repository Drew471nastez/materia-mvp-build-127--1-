/*
  THE "SELL TO FANS ANYWHERE" GLOBE'S ENGINE (wave 13 perf).

  Everything the globe does per frame: the spin, the drag with its throw,
  the lean toward the mouse, the order arcs, the rings and the pill's place.
  It runs in a worker that owns the canvas (everything-globe-worker.ts,
  shipped as a string built by scripts/build-globe-worker.mjs), so the
  page's own thread does nothing per frame; where a canvas cannot be handed
  to a worker, everything-globe.tsx runs this same engine on the page.

  Cost: device pixels capped at 1.5x, a few thousand dots filled as three
  batched paths by depth, the shaded sphere painted once per size. It draws
  only while the section is on screen, the tab visible and the globe in
  view, or while the visitor is turning it. Under reduced motion it stands
  still (one frame) and redraws only while dragged.
*/

export type V3 = [number, number, number]
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

const AUTO_SPIN = 0.00013 /* radians per ms */
const BASE_PITCH = 0.42
const ORDER_EVERY = 2300
const ARC_MS = 1500
const TAIL_LAG = 520
const RING_MS = 1300
/** Between interactions the pill's place is sent this often; the page glides it there (a CSS transition as long). */
export const GLOBE_PILL_EVERY_MS = 100

type Arc = { pts: Float32Array; t0: number; order: number; landed?: boolean }
type Ring = { order: number; t0: number }

/** Where the pill should be: the buyer's city in CSS pixels of the card, and whether it faces the viewer. */
export type GlobePill = { i: number; x: number; y: number; on: boolean; now: boolean }

export type GlobePointer = { kind: "down" | "move" | "up"; x: number; y: number; t: number }

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** 48 points along the great circle from a to b, lifted off the surface toward the middle. */
function arcPoints(a: V3, b: V3): Float32Array {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const w = Math.acos(dot)
  const s = Math.sin(w) || 1
  const lift = 0.1 + 0.38 * (w / Math.PI)
  const N = 48
  const out = new Float32Array((N + 1) * 3)
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const ka = Math.sin((1 - t) * w) / s
    const kb = Math.sin(t * w) / s
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

export function createGlobeEngine(host: GlobeEngineHost, pts: Float32Array, cities: V3[], home: V3) {
  const { canvas, ctx } = host
  const st = {
    w: 0,
    h: 0,
    dpr: 1,
    R: 0,
    cx: 0,
    cy: 0,
    yaw: 1.05,
    pitch: BASE_PITCH,
    vyaw: AUTO_SPIN,
    leanX: 0,
    leanY: 0,
    targetLeanX: 0,
    targetLeanY: 0,
    drag: null as null | { x: number; y: number; t: number },
    arcs: [] as Arc[],
    rings: [] as Ring[],
    next: 0,
    order: 0,
    pill: -1,
    pillOn: false,
    pillSent: 0,
    bg: null as AnyCanvas | null,
    glow: null as AnyCanvas | null,
    frame: 0,
    last: 0,
    running: false,
    want: false,
    reduced: false,
    drawn: false,
  }

  /* The shaded sphere and its soft halo, and the glow sprite city lights are stamped with: painted once per size. */
  const paintStatic = () => {
    const W = canvas.width
    const H = canvas.height
    const R = st.R * st.dpr
    const cx = st.cx * st.dpr
    const cy = st.cy * st.dpr
    const bg = host.makeCanvas(W, H)
    const g = bg?.getContext("2d") as Ctx2D | null | undefined
    if (g) {
      const halo = g.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.16)
      halo.addColorStop(0, "rgba(167,139,250,0.20)")
      halo.addColorStop(1, "rgba(167,139,250,0)")
      g.fillStyle = halo
      g.fillRect(0, 0, W, H)
      const body = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R)
      body.addColorStop(0, "#2a2a31")
      body.addColorStop(0.55, "#141418")
      body.addColorStop(1, "#070709")
      g.fillStyle = body
      g.beginPath()
      g.arc(cx, cy, R, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = "rgba(255,255,255,0.10)"
      g.lineWidth = Math.max(1, st.dpr)
      g.stroke()
    }
    st.bg = bg
    const s = Math.round(28 * st.dpr)
    const glow = host.makeCanvas(s, s)
    const gg = glow?.getContext("2d") as Ctx2D | null | undefined
    if (gg) {
      const r = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
      r.addColorStop(0, "rgba(255,255,255,1)")
      r.addColorStop(0.14, "rgba(255,255,255,0.95)")
      r.addColorStop(0.3, "rgba(237,233,254,0.35)")
      r.addColorStop(1, "rgba(237,233,254,0)")
      gg.fillStyle = r
      gg.fillRect(0, 0, s, s)
    }
    st.glow = glow
  }

  /* Rotation of a unit vector into view space: yaw about the axis, then pitch toward the viewer. */
  let cY = 1
  let sY = 0
  let cP = 1
  let sP = 0
  const setRot = () => {
    const yaw = st.yaw + st.leanX
    const pitch = st.pitch + st.leanY
    cY = Math.cos(yaw)
    sY = Math.sin(yaw)
    cP = Math.cos(pitch)
    sP = Math.sin(pitch)
  }
  const out: V3 = [0, 0, 0]
  const rot = (x: number, y: number, z: number) => {
    const x1 = x * cY + z * sY
    const z1 = -x * sY + z * cY
    out[0] = x1
    out[1] = y * cP - z1 * sP
    out[2] = y * sP + z1 * cP
    return out
  }
  const hidden = (x: number, y: number, z: number) => z < 0 && x * x + y * y < 1

  /* The pill rides on the latest buyer's city, and steps aside when it turns away; its place is sent every frame while the visitor is turning the globe, else every GLOBE_PILL_EVERY_MS. */
  const sendPill = (now: number, force: boolean) => {
    if (st.pill < 0) return
    setRot()
    const c = cities[st.pill]
    const p = rot(c[0], c[1], c[2])
    const on = p[2] > 0.12
    const interacting = !!st.drag || Math.abs(st.leanX - st.targetLeanX) + Math.abs(st.leanY - st.targetLeanY) > 0.002
    if (!force && on === st.pillOn && !interacting && now - st.pillSent < GLOBE_PILL_EVERY_MS) return
    st.pillOn = on
    st.pillSent = now
    host.onPill({ i: st.pill, x: st.cx + p[0] * st.R, y: st.cy - p[1] * st.R, on, now: interacting || force })
  }

  const draw = (now: number) => {
    if (!st.bg || !st.glow) return
    setRot()
    const d = st.dpr
    const R = st.R * d
    const cx = st.cx * d
    const cy = st.cy * d
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(st.bg, 0, 0)

    /* Land: three batched paths by depth. */
    const dot = Math.max(1, R * 0.0085)
    const far = new Path2D()
    const mid = new Path2D()
    const near = new Path2D()
    for (let i = 0; i < pts.length; i += 3) {
      const p = rot(pts[i], pts[i + 1], pts[i + 2])
      const z = p[2]
      if (z <= 0.04) continue
      const r = dot * (0.5 + 0.5 * z)
      const px = cx + p[0] * R - r / 2
      const py = cy - p[1] * R - r / 2
      ;(z > 0.6 ? near : z > 0.28 ? mid : far).rect(px, py, r, r)
    }
    ctx.fillStyle = "rgba(255,255,255,0.20)"
    ctx.fill(far)
    ctx.fillStyle = "rgba(255,255,255,0.44)"
    ctx.fill(mid)
    ctx.fillStyle = "rgba(255,255,255,0.72)"
    ctx.fill(near)

    /* City lights. */
    const gs = st.glow.width
    for (let i = 0; i <= cities.length; i++) {
      const c = i < cities.length ? cities[i] : home
      const p = rot(c[0], c[1], c[2])
      if (p[2] <= 0.05) continue
      ctx.globalAlpha = Math.min(1, p[2] * 1.8) * (i === cities.length ? 1 : 0.85)
      const size = gs * (i === cities.length ? 1.25 : 0.8)
      ctx.drawImage(st.glow, cx + p[0] * R - size / 2, cy - p[1] * R - size / 2, size, size)
    }
    ctx.globalAlpha = 1

    /* Order arcs: a comet from the studio to the buyer. */
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const N = 48
    st.arcs = st.arcs.filter((a) => now - a.t0 < ARC_MS + TAIL_LAG + 80)
    for (const a of st.arcs) {
      const head = ease(Math.min(1, (now - a.t0) / ARC_MS))
      const tail = ease(Math.max(0, Math.min(1, (now - a.t0 - TAIL_LAG) / ARC_MS)))
      const i0 = Math.floor(tail * N)
      const i1 = Math.ceil(head * N)
      if (i1 <= i0) continue
      ctx.beginPath()
      let pen = false
      let hx = 0
      let hy = 0
      let hv = false
      for (let i = i0; i <= i1; i++) {
        const p = rot(a.pts[i * 3], a.pts[i * 3 + 1], a.pts[i * 3 + 2])
        const x = cx + p[0] * R
        const y = cy - p[1] * R
        if (hidden(p[0], p[1], p[2])) {
          pen = false
          hv = false
          continue
        }
        if (pen) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
        pen = true
        hx = x
        hy = y
        hv = true
      }
      /* A soft glow under a bright line. */
      ctx.strokeStyle = "rgba(167,139,250,0.22)"
      ctx.lineWidth = 6 * d
      ctx.stroke()
      ctx.strokeStyle = "rgba(221,214,254,0.95)"
      ctx.lineWidth = Math.max(1.4, 1.8 * d)
      ctx.stroke()
      if (hv && head < 1) {
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.arc(hx, hy, 3 * d, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    /* The buyer's city rings as the order lands. */
    st.rings = st.rings.filter((r) => now - r.t0 < RING_MS)
    for (const r of st.rings) {
      const c = cities[r.order]
      const p = rot(c[0], c[1], c[2])
      if (p[2] <= 0.05) continue
      const k = (now - r.t0) / RING_MS
      ctx.globalAlpha = (1 - k) * Math.min(1, p[2] * 1.6)
      ctx.strokeStyle = "#c4b5fd"
      ctx.lineWidth = 1.5 * d
      ctx.beginPath()
      ctx.arc(cx + p[0] * R, cy - p[1] * R, (3 + 22 * ease(k)) * d, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    sendPill(now, false)
    if (!st.drawn) {
      st.drawn = true
      host.onDrawn()
    }
  }

  const showPill = (i: number, now: number) => {
    if (st.pill === i) return
    st.pill = i
    st.pillOn = false
    sendPill(now, true)
  }

  /* The next order: the next buyer in the list whose city faces the viewer. */
  const launch = (now: number) => {
    setRot()
    for (let tries = 0; tries < cities.length; tries++) {
      const i = st.order
      st.order = (st.order + 1) % cities.length
      const c = cities[i]
      if (rot(c[0], c[1], c[2])[2] > 0.3) {
        st.arcs.push({ pts: arcPoints(home, c), t0: now, order: i })
        return
      }
    }
  }

  const tick = (now: number) => {
    st.frame = 0
    const dt = Math.min(48, now - st.last)
    st.last = now
    if (!st.drag) {
      st.vyaw += (AUTO_SPIN - st.vyaw) * (1 - Math.exp(-dt / 900))
      st.yaw += st.vyaw * dt
      st.pitch += (BASE_PITCH - st.pitch) * (1 - Math.exp(-dt / 1100))
    }
    const kl = 1 - Math.exp(-dt / 260)
    st.leanX += (st.targetLeanX - st.leanX) * kl
    st.leanY += (st.targetLeanY - st.leanY) * kl
    if (!st.reduced) {
      if (now >= st.next) {
        launch(now)
        st.next = now + ORDER_EVERY
      }
      for (const a of st.arcs) {
        if (!a.landed && now - a.t0 >= ARC_MS) {
          a.landed = true
          st.rings.push({ order: a.order, t0: now })
          showPill(a.order, now)
        }
      }
    }
    draw(now)
    sync()
  }

  const sync = () => {
    const interacting = !!st.drag || Math.abs(st.leanX - st.targetLeanX) + Math.abs(st.leanY - st.targetLeanY) > 0.002
    st.running = (st.want && !st.reduced) || interacting
    if (st.running && !st.frame) {
      if (!st.last || performance.now() - st.last > 100) st.last = performance.now()
      st.frame = host.raf(tick)
    } else if (!st.running && st.frame) {
      host.caf(st.frame)
      st.frame = 0
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
      const now = performance.now()
      draw(now)
      sendPill(now, true)
    },
    /** On screen, the tab visible, the globe in view, motion allowed. */
    run(want: boolean) {
      st.want = want
      sync()
    },
    reduced(on: boolean) {
      st.reduced = on
      if (on && st.pill < 0) {
        st.yaw = -0.35
        showPill(0, performance.now())
      }
      sync()
      if (!st.running) draw(performance.now())
    },
    /** Drag to turn (with momentum); `t` is the event's timeStamp. */
    pointer(e: GlobePointer) {
      if (e.kind === "down") {
        st.drag = { x: e.x, y: e.y, t: e.t }
        st.vyaw = 0
      } else if (e.kind === "move") {
        const dr = st.drag
        if (!dr) return
        const dx = e.x - dr.x
        const dy = e.y - dr.y
        const dt = Math.max(1, e.t - dr.t)
        const k = 1 / Math.max(80, st.R)
        st.yaw += dx * k
        st.pitch = Math.max(-0.3, Math.min(1.05, st.pitch + dy * k))
        /* Velocity, smoothed so one jittery event does not decide the throw. */
        st.vyaw = st.vyaw * 0.6 + ((dx * k) / dt) * 0.4
        dr.x = e.x
        dr.y = e.y
        dr.t = e.t
        if (st.reduced && !st.frame) draw(performance.now())
      } else {
        if (!st.drag) return
        /* A throw that ended with a pause keeps no momentum. */
        if (e.t - st.drag.t > 90) st.vyaw = 0
        st.vyaw = Math.max(-0.006, Math.min(0.006, st.vyaw))
        st.drag = null
        sendPill(performance.now(), true)
      }
      sync()
    },
    /** Lean toward a hovering mouse (fractions of the card, -0.5 to 0.5), or back to 0. */
    lean(fx: number, fy: number) {
      if (st.reduced) return
      st.targetLeanX = fx * 0.28
      st.targetLeanY = fy * 0.22
      sync()
    },
    stop() {
      if (st.frame) host.caf(st.frame)
      st.frame = 0
      st.want = false
      st.drag = null
    },
  }
}

export type GlobeEngine = ReturnType<typeof createGlobeEngine>
