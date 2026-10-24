/**
 * The front page slider's geometry and timing (components/marketing/hero-carousel).
 *
 * A slide's pose is a function of its signed distance from the centre, in
 * slides: 0 is the centre slide, flat and full size; 1 and -1 its
 * neighbours, smaller and turned toward it; beyond that they fade out. The
 * distance across is in units of the slide's width, `--hc-w`, which CSS sets
 * per breakpoint, so the same string is right at every width.
 */

/** Centre to first neighbour, then to each one after, in slide widths. */
export const STEP_NEAR = 0.9
export const STEP_FAR = 0.74
export const TURN_DEG = 24
export const AUTOPLAY_MS = 3400
export const GLIDE_MS = 820
/** How far a flick carries, in ms of its own speed. */
export const MOMENTUM_MS = 260
export const DRAG_THRESHOLD_PX = 6

/** Signed distance from the centre, wrapped so the slider loops. */
export function wrap(d: number, n: number): number {
  const h = n / 2
  return ((((d + h) % n) + n) % n) - h
}

export function slidePose(d: number) {
  const a = Math.abs(d)
  const s = Math.sign(d)
  const near = Math.min(a, 1)
  const x = s * (a <= 1 ? a * STEP_NEAR : STEP_NEAR + (a - 1) * STEP_FAR)
  const scale = 1 - 0.15 * near - 0.08 * Math.max(0, Math.min(a, 2) - 1)
  const turn = -s * near * TURN_DEG
  const opacity = a <= 1.6 ? 1 : Math.max(0, 1 - (a - 1.6) / 0.6)
  return {
    transform: `translate3d(calc(var(--hc-w) * ${x.toFixed(4)}),0,0) perspective(1600px) rotateY(${turn.toFixed(3)}deg) scale(${scale.toFixed(4)})`,
    opacity,
    zIndex: 100 - Math.round(a * 10),
    dim: slideDim(a),
  }
}

/** How dark a slide's dimming layer is at `a` slides from the centre: none in the centre, DIM_NEAR beside it, DIM_FAR beyond. */
export const DIM_NEAR = 0.42
export const DIM_FAR = 0.56
export function slideDim(a: number): number {
  const near = Math.min(Math.abs(a), 1)
  /* Eased, so a slide brightens most as it settles into the centre rather than all at once on leaving the side. */
  const eased = near * near * (3 - 2 * near)
  const far = Math.max(0, Math.min(Math.abs(a), 2) - 1)
  return Number((eased * DIM_NEAR + far * (DIM_FAR - DIM_NEAR)).toFixed(4))
}

