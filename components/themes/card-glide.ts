/**
 * The marketplace card's hover slide as numbers (components/themes/
 * marketplace-card.tsx, marketplace round 24): a position and a speed moved
 * toward a target each frame with a limited acceleration, so the slide down
 * the page, the way back and any change of mind between them are one
 * continuous motion. No React and no DOM here, so a test runs it frame by
 * frame (tests/theme-seo-r58.test.ts).
 */
/** CSS pixels a second the page slides at under a mouse: a long page in about ten seconds. */
export const CARD_PAN_SPEED = 210
/** How quickly it reaches that speed, and slows from it: about a third of a second either way. */
export const PAN_ACCEL = 650
/** The way back: no slower than this, whatever the distance. */
const RETURN_MIN_SPEED = 420
/** Seconds of cruising the way back aims for: a short way a little under half a second, a long way up to about a second and a half. */
const RETURN_BASE_S = 0.32
const RETURN_PER_PX_S = 1 / 2400
const RETURN_MAX_S = 1.35
/** The way back reaches its speed (and sheds it) in about this long. */
export const RETURN_RAMP_S = 0.22

/** How fast the way back cruises for a given distance to the top: further is faster, so the time grows gently with the distance. */
export function returnSpeedFor(distance: number): number {
  const seconds = Math.min(RETURN_MAX_S, RETURN_BASE_S + distance * RETURN_PER_PX_S)
  return Math.max(RETURN_MIN_SPEED, distance / seconds)
}

export type Glide = { y: number; v: number }

/**
 * One frame of the slide: the position y (0 the top, negative further down
 * the page, never outside lo..hi) and its speed v move toward `target`, the
 * speed never above `cruise` and never changing faster than `accel` a
 * second, slowing in time to stop exactly on the target. Moving away from
 * the target (the mouse came back while it was on its way up, or left on
 * its way down) it first sheds that speed, within about a fifth of a second
 * and always before the end it is heading for, then turns. Pure, so the
 * tests run it frame by frame. Returns true when it has arrived and stopped.
 */
export function glide(s: Glide, target: number, cruise: number, accel: number, dt: number, lo = -Infinity, hi = Infinity): boolean {
  const gap = target - s.y
  const dir = Math.sign(gap)
  if (Math.abs(gap) < 0.25 && Math.abs(s.v) < accel * dt * 1.5) {
    s.y = target
    s.v = 0
    return true
  }
  /* The fastest speed from which it can still stop on the target, and no faster than cruising. */
  const want = dir * Math.min(cruise, Math.sqrt(2 * accel * Math.abs(gap)))
  const dv = want - s.v
  let rate = accel
  if (s.v !== 0 && Math.sign(s.v) !== dir) {
    /* Going the wrong way: stop soon, and before the end behind it. */
    const room = Math.max(1, s.v > 0 ? hi - s.y : s.y - lo)
    rate = Math.max(2 * accel, Math.abs(s.v) / 0.2, (s.v * s.v) / (2 * room))
  } else if (Math.sign(dv) !== dir) {
    /* Braking for the target may need a little more than accel; never more than twice it, so it never lurches. */
    rate = 2 * accel
  }
  const limit = rate * dt
  s.v += Math.max(-limit, Math.min(limit, dv))
  let next = s.y + s.v * dt
  /* Never past the target while heading for it: the last step lands on it. */
  if (Math.sign(s.v) === dir && (target - next) * dir < 0) {
    s.y = target
    s.v = 0
    return true
  }
  if (next > hi || next < lo) {
    next = Math.min(hi, Math.max(lo, next))
    s.v = 0
  }
  s.y = next
  return false
}
