/*
  A CHECK THAT SLOWS DOWN THE LONGER IT WAITS (round 54, Vercel cost).
  A domain whose certificate never comes (its DNS was never set) was asked
  about every 12 seconds for as long as its settings stayed open: about
  2,400 calls in an eight-hour day. Now: the first five minutes at the
  usual pace, where nearly every certificate arrives; then once a minute;
  after half an hour every five minutes. The caller still skips a tick
  while the tab is hidden.
*/

/** The delay before the next check, by how long it has been waiting. Pure. */
export function slowingDelay(waitedMs: number, first: number): number {
  if (waitedMs < 5 * 60_000) return first
  if (waitedMs < 30 * 60_000) return Math.max(first, 60_000)
  return Math.max(first, 5 * 60_000)
}

/** Runs `tick` after `first` ms, then slower and slower (slowingDelay). Returns the stop. */
export function slowingPoll(tick: () => void, first: number): () => void {
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const run = () => {
    if (stopped) return
    tick()
    timer = setTimeout(run, slowingDelay(Date.now() - started, first))
  }
  timer = setTimeout(run, first)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}
