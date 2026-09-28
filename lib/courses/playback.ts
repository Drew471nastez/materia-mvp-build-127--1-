/**
 * The player's arithmetic, apart from the player so it can be tested: the
 * speeds, where a skip lands, how much is buffered, and when the signed
 * video address is renewed. Pure and browser safe.
 */

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const

export const SKIP_SECONDS = 10

/** The player asks for a new address this long before the old one stops working. */
export const REFRESH_BEFORE_MS = 5 * 60 * 1000

/** Seconds the "Next lesson" card counts down before it plays the next one. */
export const NEXT_COUNTDOWN_SECONDS = 5

/** How often, while playing, the place is saved. */
export const SAVE_EVERY_MS = 15_000

export function speedLabel(rate: number): string {
  return rate === 1 ? "1x" : `${rate}x`
}

/** One step faster (dir 1) or slower (dir -1), staying on the list. */
export function stepSpeed(current: number, dir: 1 | -1): number {
  const at = SPEEDS.findIndex((s) => Math.abs(s - current) < 0.001)
  const from = at === -1 ? SPEEDS.indexOf(1) : at
  return SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, from + dir))]
}

/** Where a skip or a seek lands: never before the start, never past the end. */
export function clampTime(target: number, duration: number): number {
  if (!Number.isFinite(target)) return 0
  const end = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY
  return Math.min(Math.max(0, target), end)
}

/** The furthest point buffered without a gap from `at`, from a media element's `buffered` ranges. */
export function bufferedEnd(ranges: ReadonlyArray<readonly [number, number]>, at: number): number {
  for (const [start, end] of ranges) if (at >= start - 0.25 && at <= end) return end
  return at
}

/** When to ask for the next address, from now, in ms. */
export function refreshDelay(expiresAt: number, now: number): number {
  return Math.max(0, expiresAt - REFRESH_BEFORE_MS - now)
}

/**
 * WHEN A RENEWED ADDRESS REPLACES THE ONE PLAYING. Changing a video's source
 * reloads it, which is a visible hitch, so a renewed address waits: it goes
 * in while the video is paused (nobody sees it), or once the old address is
 * about to stop working, or at once when the old one has already failed. A
 * video that keeps playing on a connection it already has is left alone.
 */
export function swapNow(input: { hasFresh: boolean; paused: boolean; failed: boolean; expiresAt: number; now: number }): boolean {
  if (!input.hasFresh) return false
  return input.failed || input.paused || input.now >= input.expiresAt - 60_000
}

/** "Resume from 4:05" is worth saying only when it is not the start. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`
}
