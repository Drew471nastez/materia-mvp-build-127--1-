/**
 * ===========================================================================
 *  ONE MOTION SYSTEM FOR A HORIZONTAL RAIL
 * ===========================================================================
 * Round 60, the owner: the showcase under the hero should feel connected to
 * the hand while dragging, carry the right amount of momentum after release,
 * answer a reversal at once, and come to rest cleanly, quickly and without
 * bouncing. A generic slider gets most of that close and none of it right,
 * because three different systems fight over one position: the library's
 * drag, its release animation and an autoplay timer that starts a fixed-length
 * tween. Here there is one position and one owner of it.
 *
 * THE MODEL, IN THE ORDER A GESTURE MEETS IT
 *
 *   PRESS     whatever was moving stops where it is drawn, so a press during a
 *             settle or an autoplay step takes hold of the rail in place
 *   DRAG      the rail follows the pointer exactly: position = where it was at
 *             the press minus how far the pointer has travelled. No smoothing,
 *             no lerp, nothing between the hand and the cards
 *   RELEASE   the velocity of the last ~80ms of the drag (a least squares line
 *             through the samples, so one noisy event cannot fake a flick)
 *             decides where the rail comes to rest: where plain inertia with an
 *             exponential friction would stop, rounded to the nearest group,
 *             never further than one group past the one under the hand
 *   SETTLE    a critically damped spring starts from the rail's position AND
 *             its release velocity, so momentum and snapping are one motion,
 *             not two that hand over. The velocity it starts with is capped so
 *             a critically damped spring cannot pass its target: no overshoot,
 *             no bounce, no correction at the end
 *   WHEEL     a trackpad's two finger swipe is followed directly, delta by
 *             delta, coalesced into the frame. The operating system already
 *             adds its own momentum after the fingers lift, so nothing here
 *             adds a second one: when the events stop, the rail settles from
 *             where it is. A mouse wheel's notches step one group at a time.
 *             Vertical wheeling is never touched: the page scrolls
 *   AUTO      autoplay moves one group on a slow sine ease, and gives the rail
 *             back the moment anything presses, wheels or keys
 *
 * Every motion is a function of elapsed time, not of frames: the spring is
 * solved exactly at each frame's time and the autoplay ease is a curve over
 * real milliseconds, so the rail moves the same distance in the same time at
 * 60, 90 or 120Hz and after a dropped frame. Nothing is integrated, so
 * nothing drifts.
 *
 * LOOPING, WITHOUT COPIES. Each item is drawn at its own place in the loop:
 * its offset from the rail's position, wrapped into a window half a loop
 * either side of the start. Crossing the loop's end is therefore not an event
 * at all, and there are no duplicated cards for a screen reader or the tab key
 * to find twice.
 *
 * WAVE 13, THE OWNER: "a short drag or a flick should complete a full swipe
 * to the next card", and autoplay "lags a bit". So a release is decided by
 * chooseSwipeTarget (a flick, or a drag past a short distance, is a whole
 * step), the settle leaves at speed (an ease out, never past its place), and
 * every timed motion (the settle, a key or notch step, autoplay) is handed
 * to the compositor as one Web Animation per moving box, its keyframes
 * sampled from the same curve over time: nothing runs on the main thread
 * while it plays, and a press reads the curve to take hold where it is.
 * Only the hand's own motion (a drag, a trackpad swipe) is drawn by script.
 *
 * The pure parts (the spring, the target, the velocity, the wrap, the wheel)
 * are exported and tested on their own in tests/rail-motion.test.ts.
 */

/* ── The tuning, in one place ───────────────────────────────────────────── */

export interface RailMotionConfig {
  /** Pixels of rail per pixel of pointer travel. 1 is "the cards are under the finger". */
  dragSensitivity: number
  /** How far a press moves before it is a drag rather than a click, in px. */
  dragThreshold: number
  /** How much of the end of a drag decides the release velocity, in ms. */
  velocityWindowMs: number
  /** A drag that was held still this long before release has no velocity, in ms. */
  velocityStaleMs: number
  /** The fastest a flick is taken to be, in px/s. Anything faster is this. */
  maxFlickVelocity: number
  /** Below this a release has no direction of its own, in px/s. */
  minFlickVelocity: number
  /** The time constant of the friction a flick is projected with, in ms (velocity *= exp(-dt/decay)). */
  inertiaDecayMs: number
  /** How many snap points past the one under the hand a single flick may travel. */
  maxSnapSkip: number
  /** The settling spring. Damping is critical when it is 2 * sqrt(stiffness * mass). */
  springStiffness: number
  springDamping: number
  springMass: number
  /** A trackpad's pixels to the rail's pixels. */
  trackpadSensitivity: number
  /** How long the wheel has to be quiet before the rail settles, in ms. */
  wheelSettleMs: number
  /** One notch of a mouse wheel or one key press moves this many snap points. */
  stepSize: number
  /** Autoplay: how long a step takes and how long the rail rests between steps, in ms. 0 is no autoplay. */
  autoplayStepMs: number
  autoplayIntervalMs: number
  /** After the reader touches the rail, how long before autoplay starts again, in ms. */
  autoplayResumeMs: number
  /** Whether the rail wraps round. */
  loop: boolean
  /** How much a finite rail gives past its ends while dragging (0 none, 1 none of the resistance). */
  boundaryResistance: number
  /** Wave 13. A release this fast (px/s) is a swipe in its own direction, however short the drag. */
  swipeVelocity: number
  /** Wave 13. A drag this far (px) is a swipe to the next snap point: a share of the distance to it, kept between the two lengths. */
  swipeDistanceRatio: number
  swipeDistanceMin: number
  swipeDistanceMax: number
  /** Wave 13. A swipe's settle leaves at least this share of the fastest speed that cannot pass its target (an ease out). */
  swipeLaunch: number
  /** Wave 13. Timed motion runs as Web Animations on the compositor where the browser has them. */
  compositor: boolean
  /**
   * Landing round, optional. A fast flick may carry this many snap points past
   * where the drag started (where inertia would stop, never fewer than one).
   * Left out, a gesture is one step, as before.
   */
  swipeMaxSteps?: number
  /**
   * Landing round, optional. A release settles on a glide (glideCurve) instead
   * of the spring: it leaves at the hand's own speed, so letting go never
   * jolts, and comes to rest on time without passing its place. Left out, the
   * spring settles it, as before.
   */
  glideSettle?: GlideSettleConfig
}

export interface GlideSettleConfig {
  /** The shortest and longest a settle takes, in ms, and how much longer each px of distance makes it. */
  minMs: number
  maxMs: number
  msPerPx: number
  /** The least a glide leaves with, as a share of its average speed (distance / duration). Below 1 it eases in a touch. */
  minLaunch: number
}

/*
  THE NUMBERS. The stiffness and damping put the settle at "a few tenths of a
  second": critically damped, ω = sqrt(360) ≈ 19 rad/s, so a whole group from
  a stand still is within 2px of its place in about 0.45s and sooner from a
  flick that already carries it there, and nothing ever passes its place. The
  320ms decay is the projection of where a flick would stop on its own, used
  only to pick the group; the motion itself is the spring.

  WAVE 13: a release is a swipe when it is faster than 180px/s or the drag
  went 20% of the way to the next point (at least 20px, at most 40px), so on
  a 1300px desktop group 40px of drag is a whole group, and on a phone 40px
  of a wide card or 22px of a OnePage. A swipe's settle starts at no less than half the
  fastest speed a critically damped spring can start with and not pass its
  place (ω times the distance), so it leaves at once and eases out: a whole
  group is 98% of the way there in about a quarter of a second.
*/
export const SHOWCASE_MOTION: RailMotionConfig = {
  dragSensitivity: 1,
  dragThreshold: 6,
  velocityWindowMs: 80,
  velocityStaleMs: 60,
  maxFlickVelocity: 6000,
  minFlickVelocity: 400,
  inertiaDecayMs: 320,
  maxSnapSkip: 1,
  springStiffness: 360,
  springDamping: 2 * Math.sqrt(360),
  springMass: 1,
  trackpadSensitivity: 1,
  wheelSettleMs: 140,
  stepSize: 1,
  autoplayStepMs: 1250,
  autoplayIntervalMs: 5200,
  autoplayResumeMs: 7000,
  loop: true,
  boundaryResistance: 0.35,
  swipeVelocity: 180,
  swipeDistanceRatio: 0.2,
  swipeDistanceMin: 20,
  swipeDistanceMax: 40,
  swipeLaunch: 0.5,
  compositor: true,
}

/* ── The pure parts ─────────────────────────────────────────────────────── */

/** `v` wrapped into [lo, lo + period). */
export function wrap(v: number, period: number, lo = 0): number {
  if (!(period > 0)) return v
  return ((((v - lo) % period) + period) % period) + lo
}

export interface SpringState {
  /** Position at the spring's start, relative to its target. */
  x0: number
  /** Velocity at the start, px/s. */
  v0: number
}

/**
 * Where a spring is `t` seconds after it starts, relative to its target, and
 * how fast it moves. Exact for the three regimes, so a frame at any time reads
 * the same curve.
 */
export function springAt(s: SpringState, t: number, stiffness: number, damping: number, mass = 1): { x: number; v: number } {
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  const { x0, v0 } = s
  if (Math.abs(zeta - 1) < 1e-4) {
    const e = Math.exp(-w0 * t)
    const b = v0 + w0 * x0
    return { x: (x0 + b * t) * e, v: (b - w0 * (x0 + b * t)) * e }
  }
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta)
    const e = Math.exp(-zeta * w0 * t)
    const b = (v0 + zeta * w0 * x0) / wd
    const c = Math.cos(wd * t)
    const sn = Math.sin(wd * t)
    const x = e * (x0 * c + b * sn)
    const v = e * (-zeta * w0 * (x0 * c + b * sn) + (-x0 * wd * sn + b * wd * c))
    return { x, v }
  }
  const r = w0 * Math.sqrt(zeta * zeta - 1)
  const r1 = -zeta * w0 + r
  const r2 = -zeta * w0 - r
  const c2 = (v0 - r1 * x0) / (r2 - r1)
  const c1 = x0 - c2
  return { x: c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t), v: c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t) }
}

/**
 * The velocity a spring may start with toward its target without passing it.
 * For a critically damped spring that is ω times the distance: anything more
 * and x(t) = (x0 + (v0 + ω x0) t) e^(-ωt) changes sign once, which is the
 * overshoot. A velocity away from the target is left as it is: the spring
 * turns it round.
 */
export function capSpringVelocity(x0: number, v0: number, stiffness: number, mass = 1): number {
  const w0 = Math.sqrt(stiffness / mass)
  /* x0 is relative to the target, so moving toward it means v0 has the opposite sign to x0. */
  if (x0 === 0 || Math.sign(v0) !== -Math.sign(x0)) return v0
  const most = w0 * Math.abs(x0)
  return Math.abs(v0) > most ? -Math.sign(x0) * most : v0
}

/** Whether a spring has come to rest: within half a pixel and moving slower than anyone can see. */
export function springRested(x: number, v: number): boolean {
  return Math.abs(x) < 0.5 && Math.abs(v) < 20
}

export interface Sample {
  t: number
  x: number
}

/**
 * The velocity at the end of a drag, px/s: a least squares line through the
 * samples inside the last `windowMs` before `now`. Nought when there are fewer
 * than two, when they span almost no time, or when the hand had stopped for
 * `staleMs` before it let go (a held drag released in place has no flick).
 */
export function releaseVelocity(samples: readonly Sample[], now: number, windowMs: number, staleMs: number): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  if (now - last.t > staleMs) return 0
  const recent = samples.filter((s) => last.t - s.t <= windowMs)
  if (recent.length < 2) return 0
  const span = recent[recent.length - 1].t - recent[0].t
  if (span < 8) return 0
  const n = recent.length
  let mt = 0
  let mx = 0
  for (const s of recent) {
    mt += s.t
    mx += s.x
  }
  mt /= n
  mx /= n
  let num = 0
  let den = 0
  for (const s of recent) {
    num += (s.t - mt) * (s.x - mx)
    den += (s.t - mt) * (s.t - mt)
  }
  return den > 0 ? (num / den) * 1000 : 0
}

/**
 * Where a release comes to rest: the snap point nearest to where plain
 * inertia would stop, never more than `maxSkip` snap points past the one under
 * the hand, and, for a release with a real direction, never behind it.
 *
 * `snaps` are the positions of one loop's snap points, ascending, and `period`
 * the loop's length (0 for a finite rail). Returns an unbounded position, so a
 * looping rail settles the short way round.
 */
export function chooseTarget(x: number, v: number, snaps: readonly number[], period: number, cfg: Pick<RailMotionConfig, "inertiaDecayMs" | "maxSnapSkip" | "minFlickVelocity">): number {
  if (!snaps.length) return x
  const all = unboundedSnaps(snaps, period, x)
  const projected = x + v * (cfg.inertiaDecayMs / 1000)
  const nearestTo = (p: number) => all.reduce((best, s) => (Math.abs(s - p) < Math.abs(best - p) ? s : best), all[0])
  const here = nearestTo(x)
  const hereIndex = all.indexOf(here)
  let index = all.indexOf(nearestTo(projected))
  index = Math.max(hereIndex - cfg.maxSnapSkip, Math.min(hereIndex + cfg.maxSnapSkip, index))
  if (Math.abs(v) >= cfg.minFlickVelocity) {
    /* A flick goes on in its own direction: past the point under the hand if the hand had not reached it. */
    const ahead = v > 0 ? all.findIndex((s) => s > x + 0.5) : findLastIndex(all, (s) => s < x - 0.5)
    if (ahead >= 0 && (v > 0 ? index < ahead : index > ahead)) index = ahead
  }
  return all[Math.max(0, Math.min(all.length - 1, index))]
}

/**
 * WAVE 13. Where a released drag comes to rest, decided like a pager, from
 * the position the drag started at (`start`, which a press may have caught
 * between two points):
 *
 *   a flick (`swipeVelocity`) goes to the first point past the hand in its
 *   own direction, so a flick back against a drag returns, and a flick
 *   from rest goes on;
 *   a drag that went a short way (a fifth of the step, 20 to 40px) goes to
 *   the first point past the start in its direction;
 *   anything less settles at the point nearest the hand.
 *
 * Never further than the first point past the start in that direction: one
 * step a gesture.
 */
export function chooseSwipeTarget(
  start: number,
  x: number,
  v: number,
  snaps: readonly number[],
  period: number,
  cfg: Pick<RailMotionConfig, "swipeVelocity" | "swipeDistanceRatio" | "swipeDistanceMin" | "swipeDistanceMax"> & Partial<Pick<RailMotionConfig, "swipeMaxSteps" | "inertiaDecayMs">>,
): number {
  if (!snaps.length) return x
  const all = unboundedSnaps(snaps, period, start)
  const first = all[0]
  const last = all[all.length - 1]
  /* The first point strictly past `p` in direction `dir`, or the rail's end. */
  const past = (p: number, dir: number) => (dir > 0 ? all.find((s) => s > p + 0.5) ?? last : findLast(all, (s) => s < p - 0.5) ?? first)
  const nearest = (p: number) => all.reduce((best, s) => (Math.abs(s - p) < Math.abs(best - p) ? s : best), first)
  const moved = x - start
  if (Math.abs(v) >= cfg.swipeVelocity) {
    const dir = Math.sign(v)
    let target = past(x, dir)
    let limit = past(start, dir)
    /* Landing round: with swipeMaxSteps, a hard flick goes on to where inertia would stop, up to that many points past the start. */
    const steps = Math.max(1, Math.floor(cfg.swipeMaxSteps ?? 1))
    for (let k = 1; k < steps; k++) limit = past(limit, dir)
    if (steps > 1 && cfg.inertiaDecayMs) {
      const projected = nearest(x + v * (cfg.inertiaDecayMs / 1000))
      if (dir > 0 ? projected > target : projected < target) target = projected
    }
    return dir > 0 ? Math.min(target, limit) : Math.max(target, limit)
  }
  if (moved !== 0) {
    const dir = Math.sign(moved)
    const next = past(start, dir)
    const behind = past(next, -dir)
    const spacing = Math.abs(next - behind) || Infinity
    const threshold = Math.max(cfg.swipeDistanceMin, Math.min(cfg.swipeDistanceMax, spacing * cfg.swipeDistanceRatio))
    if (Math.abs(moved) >= threshold) return next
  }
  return nearest(x)
}

function findLast<T>(xs: readonly T[], f: (x: T) => boolean): T | undefined {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return xs[i]
  return undefined
}

/**
 * WAVE 13. The velocity a swipe's settle starts with: the release velocity
 * toward the target, but never less than `launch` of ω times the distance
 * (ω|x0| is the most a critically damped spring can start with and not pass
 * its target, so this stays an ease out with no overshoot).
 */
export function launchVelocity(x0: number, v: number, stiffness: number, launch: number, mass = 1): number {
  if (x0 === 0) return v
  const toward = -Math.sign(x0)
  const least = launch * Math.sqrt(stiffness / mass) * Math.abs(x0)
  const along = v * toward
  return capSpringVelocity(x0, toward * Math.max(along, least), stiffness, mass)
}

/**
 * LANDING ROUND. A release's glide to its snap point: a cubic Hermite from
 * `from` to `to` over `duration` ms whose starting speed is the hand's own
 * speed toward the target (`v`, px/s), never less than `minLaunch` of the
 * average speed and never more than three times it. Up to three times the
 * average, a cubic Hermite that ends at rest never passes its end, so there
 * is no overshoot; and since it starts where the hand left it at the hand's
 * speed, letting go shows no jump in speed. A flick faster than that
 * shortens the glide instead (never below minMs). Returns the position at
 * `t` ms and the duration.
 */
export function glideCurve(from: number, to: number, v: number, cfg: GlideSettleConfig): { at: (t: number) => number; duration: number; launch: number } {
  const d = to - from
  const dist = Math.abs(d)
  if (dist < 0.5) return { at: () => to, duration: 0, launch: 0 }
  let duration = Math.min(cfg.maxMs, Math.max(cfg.minMs, cfg.minMs + dist * cfg.msPerPx))
  const toward = Math.max(0, v * Math.sign(d))
  /* The starting slope in units of the average speed: 1 is "carry on at the average speed". */
  let a = (toward * duration) / 1000 / dist
  if (a > 3) {
    duration = Math.max(cfg.minMs, (3 * dist * 1000) / toward)
    a = Math.min(3, (toward * duration) / 1000 / dist)
  }
  a = Math.max(cfg.minLaunch, Math.min(3, a))
  const at = (t: number) => {
    const s = Math.min(1, Math.max(0, t / duration))
    const s2 = s * s
    const s3 = s2 * s
    return from + d * (a * (s3 - 2 * s2 + s) + (3 * s2 - 2 * s3))
  }
  return { at, duration, launch: (a * dist * 1000) / duration }
}

/** How long a spring takes to come to rest (springRested), in seconds, at most `limit`. */
export function settleDuration(s: SpringState, stiffness: number, damping: number, mass = 1, limit = 3): number {
  for (let t = 0; t < limit; t += 1 / 240) {
    const p = springAt(s, t, stiffness, damping, mass)
    if (springRested(p.x, p.v)) return t
  }
  return limit
}

/** The snap points around `x`, a loop either side for a looping rail. */
function unboundedSnaps(snaps: readonly number[], period: number, x: number): number[] {
  if (!(period > 0)) return [...snaps]
  const base = Math.floor(x / period) * period
  const out: number[] = []
  for (const k of [-2, -1, 0, 1, 2]) for (const s of snaps) out.push(base + k * period + s)
  return out.sort((a, b) => a - b)
}

function findLastIndex<T>(xs: readonly T[], f: (x: T) => boolean): number {
  for (let i = xs.length - 1; i >= 0; i--) if (f(xs[i])) return i
  return -1
}

/** The snap point `steps` away from the one nearest `x`. */
export function stepTarget(x: number, steps: number, snaps: readonly number[], period: number): number {
  const all = unboundedSnaps(snaps, period, x)
  const here = all.reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), all[0])
  const i = all.indexOf(here) + steps
  return all[Math.max(0, Math.min(all.length - 1, i))]
}

export type WheelKind = "continuous" | "notch" | "vertical"

/**
 * What a wheel event is, and how far it moves the rail in px. A trackpad
 * sends many small pixel deltas; a mouse wheel sends lines or large steps. A
 * vertical event is the page's: it is never taken unless Shift turns it
 * sideways, as browsers do for a mouse.
 */
export function readWheel(e: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean }, pageWidth: number): { kind: WheelKind; dx: number } {
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? pageWidth : 1
  let dx = e.deltaX * scale
  const dy = e.deltaY * scale
  if (e.shiftKey && Math.abs(dx) < 0.01) dx = dy
  else if (Math.abs(dx) <= Math.abs(dy)) return { kind: "vertical", dx: 0 }
  const notch = e.deltaMode !== 0 || Math.abs(dx) >= 48
  return { kind: notch ? "notch" : "continuous", dx }
}

/** Autoplay's ease: a sine in and out, whose fastest moment is only π/2 of its average speed. */
export function sineInOut(t: number): number {
  return 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2
}

/* ── The controller ─────────────────────────────────────────────────────── */

export interface RailMotionHooks {
  /** The rail started or stopped moving (for "browsing" styling and will-change). */
  onMoving?: (moving: boolean) => void
  /** A drag began or ended. */
  onDragging?: (dragging: boolean) => void
  /** The snap point now in front changed (index into one loop's snaps). */
  onIndex?: (index: number) => void
}

/**
 * A timed motion (a settle, a step, autoplay): `at` is the rail's position
 * `t` ms after `start`, ending at `target` after `duration` ms. `anims` are
 * its Web Animations on the compositor, or null when the frame loop draws it.
 */
type Curve = { kind: "curve"; at: (t: number) => number; target: number; start: number; duration: number; auto: boolean; anims: Animation[] | null; done: ReturnType<typeof setTimeout> | undefined }

type Phase = { kind: "idle" } | { kind: "drag" } | Curve | { kind: "wheel" }

/** Keyframes every 8ms: the compositor draws straight lines between them, finer than any screen's frame. */
const KEYFRAME_MS = 8

/**
 * The rail. `viewport` takes the gestures, `items` are moved, and `snapItems`
 * (a subset of items, or all of them) are where it comes to rest. `measure`
 * reports where each item sits with the rail at rest at the start, so the
 * controller never reads layout while it moves.
 */
export class RailMotion {
  private x = 0
  private phase: Phase = { kind: "idle" }
  private raf = 0
  private positions: number[] = []
  private snapPoints: number[] = []
  private period = 0
  private window = { lo: 0 }
  private viewWidth = 0
  private pointer: { id: number; x0: number; y0: number; railAt: number; started: boolean; samples: Sample[]; type: string } | null = null
  private suppressClick = false
  private wheelTimer: ReturnType<typeof setTimeout> | undefined
  private wheelPending = 0
  private notchUntil = 0
  private autoTimer: ReturnType<typeof setTimeout> | undefined
  private resumeAt = 0
  private visible = false
  private paused = false
  private keyboard = false
  private disposed = false
  private lastIndex = -1
  private moving = false
  private readonly reduce: MediaQueryList | null
  private readonly cleanup: (() => void)[] = []

  constructor(
    private readonly viewport: HTMLElement,
    private items: HTMLElement[],
    private snapItems: HTMLElement[],
    private readonly config: RailMotionConfig,
    private readonly hooks: RailMotionHooks = {},
  ) {
    this.reduce = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null
    this.measure()
    this.render()
    this.listen()
  }

  /* ── Layout ── */

  /**
   * Where everything sits, read once with every item at its own place and
   * again only when the layout changes (ResizeObserver). Positions are offsets
   * from the first snap item, so position 0 is "the first group in front".
   */
  measure(items?: HTMLElement[], snapItems?: HTMLElement[]) {
    if (items) this.items = items
    if (snapItems) this.snapItems = snapItems
    /* A timed motion is stopped where it is drawn first: its keyframes were measured on the old layout. */
    const moving = this.phase.kind === "curve"
    if (moving) this.hold()
    const keep = this.period > 0 && this.snapPoints.length ? this.x / this.period : null
    for (const el of this.items) el.style.transform = ""
    const origin = this.snapItems[0]?.offsetLeft ?? 0
    this.positions = this.items.map((el) => el.offsetLeft - origin)
    this.snapPoints = this.snapItems.map((el) => el.offsetLeft - origin)
    const last = this.items[this.items.length - 1]
    const gap = this.items.length > 1 ? this.items[1].offsetLeft - (this.items[0].offsetLeft + this.items[0].offsetWidth) : 0
    this.period = this.config.loop && last ? last.offsetLeft - origin + last.offsetWidth + Math.max(0, gap) - (this.items[0].offsetLeft - origin) : 0
    /* Items are wrapped into a window half a loop either side of the front, so the one before is always just behind it. */
    this.window = { lo: -this.period / 2 }
    this.viewWidth = this.viewport.clientWidth
    if (keep !== null) {
      /* A resize keeps the rail where it was as a share of the loop, and a moving rail carries on toward the same group. */
      this.x = keep * this.period
      if (moving) this.settle(0)
    }
    this.render()
  }

  /* ── Drawing ── */

  private render() {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1
    const at = this.phase.kind === "idle" ? Math.round(this.x * dpr) / dpr : this.x
    for (let i = 0; i < this.items.length; i++) {
      const base = this.positions[i] ?? 0
      let rel = base - at
      if (this.period > 0) rel = wrap(rel, this.period, this.window.lo)
      const dx = rel - base
      this.items[i].style.transform = dx === 0 ? "" : `translate3d(${dx}px,0,0)`
    }
    const index = this.indexAt(at)
    if (index !== this.lastIndex) {
      this.lastIndex = index
      this.hooks.onIndex?.(index)
    }
  }

  private indexAt(x: number) {
    if (!this.snapPoints.length) return 0
    const p = this.period > 0 ? wrap(x, this.period) : x
    let best = 0
    for (let i = 1; i < this.snapPoints.length; i++) if (Math.abs(this.snapPoints[i] - p) < Math.abs(this.snapPoints[best] - p)) best = i
    if (this.period > 0 && Math.abs(this.period - p) < Math.abs(this.snapPoints[best] - p)) best = 0
    return best
  }

  private setMoving(on: boolean) {
    if (on === this.moving) return
    this.moving = on
    this.hooks.onMoving?.(on)
  }

  /* ── The frame loop: one, and only while something moves ── */

  private kick() {
    this.setMoving(true)
    if (this.raf) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = 0
    if (this.disposed) return
    const ph = this.phase
    if (ph.kind === "curve") {
      /* Only where the compositor cannot run it (no Web Animations): the same curve, read at this frame's time. */
      if (ph.anims) return
      const t = Math.max(0, now - ph.start)
      if (t >= ph.duration) {
        this.finish(ph)
        return
      }
      this.x = ph.at(t)
    } else if (ph.kind === "wheel") {
      if (this.wheelPending) {
        this.x = this.bounded(this.x + this.wheelPending)
        this.wheelPending = 0
      }
    } else {
      /* Idle, or a drag: a drag is drawn by its own pointer events, which the browser already lines up with frames. */
      return
    }
    this.render()
    this.raf = requestAnimationFrame(this.frame)
  }

  private rest() {
    this.phase = { kind: "idle" }
    if (this.period > 0) this.x = wrap(this.x, this.period)
    this.render()
    this.setMoving(false)
    this.schedule()
  }

  /** A finite rail gives a little past its ends while dragged, and none once let go. */
  private bounded(x: number) {
    if (this.period > 0 || !this.snapPoints.length) return x
    const lo = this.snapPoints[0]
    const hi = this.snapPoints[this.snapPoints.length - 1]
    if (x < lo) return lo - (lo - x) * this.config.boundaryResistance
    if (x > hi) return hi + (x - hi) * this.config.boundaryResistance
    return x
  }

  /* ── Motion ── */

  /** Stop whatever is moving where it is drawn (a timed motion is read off its curve at this moment). */
  private hold() {
    const ph = this.phase
    this.phase = { kind: "idle" }
    clearTimeout(this.autoTimer)
    if (ph.kind === "curve") {
      clearTimeout(ph.done)
      /* The compositor's own clock where it runs the motion (its first frame starts a beat after play()), so a press takes hold exactly where the boxes are drawn. */
      const played = ph.anims?.[0]?.currentTime
      const t = typeof played === "number" ? played : performance.now() - ph.start
      this.x = ph.at(Math.min(ph.duration, Math.max(0, t)))
      if (ph.anims) {
        /* The boxes take their place from script first, then the animations let go: the same frame, so nothing flickers. */
        this.render()
        for (const a of ph.anims) a.cancel()
      }
    }
  }

  /** Come to rest from here, carrying `v`, at the group the release picks (or `target`); a swipe leaves at speed (launchVelocity). */
  settle(v: number, target?: number, swipe = false) {
    const to = target ?? chooseTarget(this.x, v, this.snapPoints, this.period, this.config)
    const { springStiffness: k, springDamping: d, springMass: m } = this.config
    if (this.still() || Math.abs(this.x - to) < 0.5) {
      this.x = to
      this.rest()
      return
    }
    const x0 = this.x - to
    const limited = Math.max(-this.config.maxFlickVelocity, Math.min(this.config.maxFlickVelocity, v))
    if (this.config.glideSettle) {
      const g = glideCurve(this.x, to, limited, this.config.glideSettle)
      this.play(g.at, to, g.duration, false)
      return
    }
    const v0 = swipe ? launchVelocity(x0, limited, k, this.config.swipeLaunch, m) : capSpringVelocity(x0, limited, k, m)
    const s: SpringState = { x0, v0 }
    const duration = settleDuration(s, k, d, m) * 1000
    this.play((t) => to + springAt(s, t / 1000, k, d, m).x, to, duration, false)
  }

  /**
   * Run a timed motion. Where the browser has Web Animations, each moving box
   * gets one animation whose keyframes are this curve sampled every 8ms, so
   * the compositor plays it with no work on the main thread; a box's path is
   * its offset at the start plus the rail's travel, continuous, and it is
   * wrapped back into the loop when the motion ends (only ever off screen:
   * the loop's seam is half a loop from the front, further than any motion
   * travels). Elsewhere the frame loop reads the same curve.
   */
  private play(at: (t: number) => number, target: number, duration: number, auto: boolean) {
    const start = performance.now()
    const ph: Curve = { kind: "curve", at, target, start, duration, auto, anims: null, done: undefined }
    this.phase = ph
    this.setMoving(true)
    const x0 = this.x
    const travel = Math.abs(target - x0)
    const canAnimate =
      this.config.compositor &&
      typeof Element !== "undefined" &&
      typeof Element.prototype.animate === "function" &&
      (this.period <= 0 || travel < this.period / 2 - this.viewWidth)
    if (canAnimate) {
      try {
        const n = Math.max(2, Math.ceil(duration / KEYFRAME_MS))
        const xs: number[] = []
        for (let k = 0; k <= n; k++) xs.push(k === n ? target : at((duration * k) / n))
        const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1
        const end = Math.round(target * dpr) / dpr
        ph.anims = this.items.map((el, i) => {
          const base = this.positions[i] ?? 0
          let rel = base - x0
          if (this.period > 0) rel = wrap(rel, this.period, this.window.lo)
          const frames = xs.map((x, k) => ({ transform: `translate3d(${rel - ((k === n ? end : x) - x0) - base}px,0,0)` }))
          return el.animate(frames, { duration, easing: "linear", fill: "forwards" })
        })
        /* The end is one event on the main thread: the frames between are the compositor's. */
        ph.anims[0].onfinish = () => this.finish(ph)
        /* And a timer behind it, for a tab that throttles animation events. */
        ph.done = setTimeout(() => this.finish(ph), duration + 500)
        return
      } catch {
        for (const a of ph.anims ?? []) a.cancel()
        ph.anims = null
      }
    }
    this.kick()
  }

  /** A timed motion reached its end: the boxes are put there by script and the animations let go. */
  private finish(ph: Curve) {
    if (this.phase !== ph || this.disposed) return
    clearTimeout(ph.done)
    if (ph.anims?.[0]) ph.anims[0].onfinish = null
    this.x = ph.target
    this.rest()
    for (const a of ph.anims ?? []) a.cancel()
  }

  /** Move `steps` snap points along, by key, wheel notch or code. */
  step(steps: number) {
    this.interact()
    this.settle(0, stepTarget(this.x, steps, this.snapPoints, this.period))
  }

  /** Back to the first group. */
  home() {
    this.interact()
    const p = this.period
    const target = p > 0 ? Math.round(this.x / p) * p : this.snapPoints[0] ?? 0
    this.settle(0, target)
  }

  private still() {
    return !!this.reduce?.matches
  }

  /* ── Autoplay ── */

  private eligible() {
    return (
      !this.disposed &&
      this.config.autoplayStepMs > 0 &&
      this.visible &&
      !document.hidden &&
      !this.still() &&
      !this.paused &&
      this.phase.kind === "idle" &&
      !this.pointer &&
      !(this.keyboard && this.viewport.matches(":focus-within"))
    )
  }

  private schedule() {
    clearTimeout(this.autoTimer)
    if (!this.eligible()) return
    const wait = Math.max(this.config.autoplayIntervalMs, this.resumeAt - performance.now())
    this.autoTimer = setTimeout(() => {
      if (!this.eligible()) return
      const from = this.x
      const to = stepTarget(from, 1, this.snapPoints, this.period)
      const duration = this.config.autoplayStepMs
      this.play((t) => from + (to - from) * sineInOut(t / duration), to, duration, true)
    }, wait)
  }

  private interact() {
    this.resumeAt = performance.now() + this.config.autoplayResumeMs
    clearTimeout(this.autoTimer)
  }

  setVisible(visible: boolean) {
    const was = this.visible
    this.visible = visible
    /* Out of sight nothing new starts; a step already under way is the compositor's and simply ends. */
    if (!visible) clearTimeout(this.autoTimer)
    else if (!was) this.schedule()
  }

  togglePause(): boolean {
    this.paused = !this.paused
    if (this.paused) clearTimeout(this.autoTimer)
    else this.schedule()
    return this.paused
  }

  /* ── Input ── */

  private listen() {
    const on = <E extends Event>(el: HTMLElement | Document, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts))
    }
    on(this.viewport, "pointerdown", this.onDown)
    on(this.viewport, "pointermove", this.onMove)
    on(this.viewport, "pointerup", this.onUp)
    on(this.viewport, "pointercancel", this.onCancel)
    on(this.viewport, "lostpointercapture", this.onLost)
    on(this.viewport, "wheel", this.onWheel, { passive: false })
    on(this.viewport, "click", this.onClick, { capture: true })
    on(this.viewport, "keydown", this.onKey)
    on(this.viewport, "focusout", () => {
      this.keyboard = false
      this.schedule()
    })
    on(document, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.pointer?.started) this.cancelDrag()
    })
    on(document, "visibilitychange", () => {
      if (document.hidden) clearTimeout(this.autoTimer)
      else this.schedule()
    })
    if (this.reduce) {
      const sync = () => this.schedule()
      this.reduce.addEventListener("change", sync)
      this.cleanup.push(() => this.reduce?.removeEventListener("change", sync))
    }
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.isPrimary) return
    this.keyboard = false
    this.interact()
    /* Take hold of a moving rail where it is drawn: a press stops it. */
    if (this.phase.kind !== "idle") {
      this.hold()
      this.render()
    }
    clearTimeout(this.wheelTimer)
    this.wheelPending = 0
    this.pointer = { id: e.pointerId, x0: e.clientX, y0: e.clientY, railAt: this.x, started: false, samples: [{ t: e.timeStamp, x: this.x }], type: e.pointerType }
    this.suppressClick = false
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pointer
    if (!p || e.pointerId !== p.id) return
    const dx = e.clientX - p.x0
    const dy = e.clientY - p.y0
    if (!p.started) {
      if (Math.abs(dx) < this.config.dragThreshold) return
      /* Mostly vertical: the page's, not ours. A finger's vertical is already the browser's (touch-action: pan-y). */
      if (Math.abs(dy) > Math.abs(dx)) {
        this.pointer = null
        this.settleIfStopped()
        return
      }
      p.started = true
      /* The threshold is not a dead zone: the rail starts from the press, so it does not jump by the threshold. */
      p.railAt = this.x
      try {
        this.viewport.setPointerCapture(p.id)
      } catch {
        /* A pointer that is already gone: the next move or up ends it. */
      }
      this.phase = { kind: "drag" }
      this.suppressClick = true
      this.hooks.onDragging?.(true)
      this.setMoving(true)
    }
    /* Every sample the browser coalesced, so the release velocity is measured on the hand and not on the frame rate. */
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : []
    for (const ev of events.length ? events : [e]) {
      const x = this.bounded(p.railAt - (ev.clientX - p.x0) * this.config.dragSensitivity)
      p.samples.push({ t: ev.timeStamp, x })
    }
    if (p.samples.length > 64) p.samples.splice(0, p.samples.length - 64)
    this.x = p.samples[p.samples.length - 1].x
    this.render()
  }

  private onUp = (e: PointerEvent) => {
    const p = this.pointer
    if (!p || e.pointerId !== p.id) return
    this.pointer = null
    if (!p.started) {
      this.settleIfStopped()
      return
    }
    this.hooks.onDragging?.(false)
    const v = releaseVelocity(p.samples, e.timeStamp, this.config.velocityWindowMs, this.config.velocityStaleMs)
    /* Wave 13: a flick or a short drag is a whole step (chooseSwipeTarget), and the settle leaves at speed. */
    this.settle(v, chooseSwipeTarget(p.railAt, this.x, v, this.snapPoints, this.period, this.config), true)
  }

  private onCancel = (e: PointerEvent) => {
    const p = this.pointer
    if (!p || e.pointerId !== p.id) return
    this.pointer = null
    if (p.started) this.hooks.onDragging?.(false)
    this.settle(0)
  }

  /*
    Only the rail's own capture ending counts. A finger is captured implicitly
    by the card it lands on, and taking that capture onto the rail fires a
    lostpointercapture from the card, which bubbles here: read as the rail's,
    it ended every touch drag on its first move.
  */
  private onLost = (e: PointerEvent) => {
    if (e.target !== this.viewport) return
    if (this.pointer && e.pointerId === this.pointer.id && this.pointer.started) this.onCancel(e)
  }

  /** A press that took hold of a moving rail and never dragged: it settles from where it was stopped. */
  private settleIfStopped() {
    if (this.phase.kind === "idle" && this.snapPoints.length) {
      const target = chooseTarget(this.x, 0, this.snapPoints, this.period, this.config)
      if (Math.abs(target - this.x) > 0.5) this.settle(0, target)
      else this.schedule()
    }
  }

  /** A release after a drag is not a click on whatever is under it. */
  private onClick = (e: MouseEvent) => {
    if (!this.suppressClick) return
    this.suppressClick = false
    e.preventDefault()
    e.stopPropagation()
  }

  private onWheel = (e: WheelEvent) => {
    const w = readWheel(e, this.viewport.clientWidth)
    if (w.kind === "vertical") return
    /* Ours: the page does not move sideways, and the browser does not take it as a swipe back. */
    e.preventDefault()
    this.keyboard = false
    this.interact()
    if (w.kind === "notch") {
      if (performance.now() < this.notchUntil) return
      this.notchUntil = performance.now() + 280
      this.step(w.dx > 0 ? this.config.stepSize : -this.config.stepSize)
      return
    }
    if (this.phase.kind !== "wheel") {
      this.hold()
      this.phase = { kind: "wheel" }
    }
    this.wheelPending += w.dx * this.config.trackpadSensitivity
    this.kick()
    clearTimeout(this.wheelTimer)
    /*
      The operating system's own momentum arrives as more of these events after
      the fingers lift, and the rail follows them. When they stop, the rail
      settles from where it is with no velocity of its own: a second momentum
      on top of the system's is the long, floaty glide this replaces.
    */
    this.wheelTimer = setTimeout(() => {
      if (this.phase.kind !== "wheel") return
      if (this.wheelPending) {
        this.x = this.bounded(this.x + this.wheelPending)
        this.wheelPending = 0
      }
      this.settle(0)
    }, this.config.wheelSettleMs)
  }

  private onKey = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", " "].includes(e.key)) return
    e.preventDefault()
    this.keyboard = true
    if (e.key === " ") {
      this.viewport.dataset.autoplayPaused = String(this.togglePause())
      return
    }
    if (e.key === "Home") this.home()
    else this.step(e.key === "ArrowRight" ? this.config.stepSize : -this.config.stepSize)
  }

  /** Escape while dragging lets go of the rail where the drag began. */
  cancelDrag() {
    const p = this.pointer
    if (!p?.started) return
    this.pointer = null
    try {
      this.viewport.releasePointerCapture(p.id)
    } catch {
      /* Already released. */
    }
    this.hooks.onDragging?.(false)
    this.settle(0, chooseTarget(p.railAt, 0, this.snapPoints, this.period, this.config))
  }

  get position() {
    return this.x
  }

  get snaps() {
    return this.snapPoints
  }

  get loopLength() {
    return this.period
  }

  dispose() {
    if (this.phase.kind === "curve") {
      clearTimeout(this.phase.done)
      for (const a of this.phase.anims ?? []) a.cancel()
    }
    this.disposed = true
    cancelAnimationFrame(this.raf)
    clearTimeout(this.autoTimer)
    clearTimeout(this.wheelTimer)
    for (const fn of this.cleanup) fn()
    for (const el of this.items) el.style.transform = ""
  }
}
