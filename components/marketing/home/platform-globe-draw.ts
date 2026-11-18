/*
  THE GLOBE'S DRAWING, shared by the page and the globe's worker
  (platform-globe.tsx, platform-globe-worker.ts): no React and no DOM, only a
  2D context, so the same strokes are drawn wherever the canvas lives.
*/

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type Backdrop = CanvasImageSource

export type GlobePulse = { s: number; t0: number }

/** Unit vectors of the pulse spots, [x, y, z] per spot. */
export type GlobeSpots = ReadonlyArray<readonly [number, number, number]>

/**
 * The shaded sphere and its halo, painted once per size onto a canvas of the
 * globe's own size. Wave 13: a light globe for the light section, a pale
 * violet sphere lit from the top left, with violet land.
 */
export function paintGlobeBackdrop(g: Ctx2D, W: number) {
  const R = W * 0.44
  const halo = g.createRadialGradient(W / 2, W / 2, R * 0.92, W / 2, W / 2, R * 1.2)
  halo.addColorStop(0, "rgba(124,58,237,0.14)")
  halo.addColorStop(1, "rgba(124,58,237,0)")
  g.fillStyle = halo
  g.fillRect(0, 0, W, W)
  const body = g.createRadialGradient(W * 0.38, W * 0.32, R * 0.05, W / 2, W / 2, R)
  body.addColorStop(0, "#ffffff")
  body.addColorStop(0.65, "#f6f2ff")
  body.addColorStop(1, "#e9e1fd")
  g.fillStyle = body
  g.beginPath()
  g.arc(W / 2, W / 2, R, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = "rgba(124,58,237,0.16)"
  g.lineWidth = Math.max(1, W * 0.0015)
  g.stroke()
}

/**
 * One frame: the backdrop, the near half of the land dots as three batched
 * paths by depth (three fill calls, no per-dot state changes), then the
 * pulses. Returns the pulses still alive.
 */
export function drawGlobe(ctx: Ctx2D, W: number, bg: Backdrop, pts: Float32Array, angle: number, pulses: GlobePulse[], spots: GlobeSpots, now: number): GlobePulse[] {
  const R = W * 0.44
  const cx = W / 2
  const cy = W / 2
  ctx.clearRect(0, 0, W, W)
  ctx.drawImage(bg, 0, 0)
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  const tilt = 0.32
  const ct = Math.cos(tilt)
  const sinT = Math.sin(tilt)
  const dot = Math.max(1, W * 0.0042)
  const paths = [new Path2D(), new Path2D(), new Path2D()]
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i]
    const y = pts[i + 1]
    const z = pts[i + 2]
    const x1 = x * ca + z * sa
    const z1 = -x * sa + z * ca
    const y2 = y * ct - z1 * sinT
    const z2 = y * sinT + z1 * ct
    if (z2 <= 0.02) continue
    const b = z2 > 0.62 ? 2 : z2 > 0.3 ? 1 : 0
    const r = dot * (0.55 + 0.45 * z2)
    paths[b].rect(cx + x1 * R - r / 2, cy - y2 * R - r / 2, r, r)
  }
  ctx.fillStyle = "rgba(124,58,237,0.16)"
  ctx.fill(paths[0])
  ctx.fillStyle = "rgba(124,58,237,0.36)"
  ctx.fill(paths[1])
  ctx.fillStyle = "rgba(109,40,217,0.66)"
  ctx.fill(paths[2])

  /* Pulses: a bright core and a ring that widens and fades over 2.2s. */
  const life = 2200
  const alive = pulses.filter((p) => now - p.t0 < life)
  for (const p of alive) {
    const [x, y, z] = spots[p.s]
    const x1 = x * ca + z * sa
    const z1 = -x * sa + z * ca
    const y2 = y * ct - z1 * sinT
    const z2 = y * sinT + z1 * ct
    if (z2 <= 0.05) continue
    const k = (now - p.t0) / life
    const px = cx + x1 * R
    const py = cy - y2 * R
    ctx.globalAlpha = (1 - k) * Math.min(1, z2 * 1.6)
    ctx.strokeStyle = "#7c3aed"
    ctx.lineWidth = W * 0.0028
    ctx.beginPath()
    ctx.arc(px, py, W * (0.006 + 0.045 * k), 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = "#6d28d9"
    ctx.beginPath()
    ctx.arc(px, py, W * 0.0062, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  return alive
}

/**
 * The turning and the pulses, advanced by one frame: the angle moves with the
 * time since the last frame, and a new pulse starts every 0.4 to 0.9s,
 * preferring a spot on the near side so most are seen. Returns the spot of a
 * pulse that started this frame, if any.
 */
export function stepGlobe(st: { angle: number; pulses: GlobePulse[]; nextPulse: number }, spots: GlobeSpots, now: number, dt: number): number | null {
  st.angle += dt * 0.00011
  if (now < st.nextPulse) return null
  let s = Math.floor(Math.random() * spots.length)
  for (let tries = 0; tries < 6; tries++) {
    const [x, , z] = spots[s]
    if (-x * Math.sin(st.angle) + z * Math.cos(st.angle) > 0.25) break
    s = Math.floor(Math.random() * spots.length)
  }
  st.pulses.push({ s, t0: now })
  st.nextPulse = now + 380 + Math.random() * 520
  return s
}

/** The still frame's pulses (reduced motion). */
export const stillPulses = (now: number): GlobePulse[] => [3, 9, 13, 21, 25].map((s, i) => ({ s, t0: now - 300 - i * 120 }))
