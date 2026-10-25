/**
 * ===========================================================================
 *  CHANGES THAT ARRIVE IN THE OPEN EDITOR (round 14)
 * ===========================================================================
 * Storelib AI's run, a connected agent's writes and a push to GitHub all
 * land in an editor somebody is using: scrolling the canvas, typing in the
 * sidebar. The helpers the editor and the canvas take them in with.
 * Measured by scripts/check-wb-incoming-r14.mjs on the owner's Materia.
 */

/*
  ═══════════════════════════════════════════════════════════════════════════
   A RUN'S OPERATIONS, TAKEN IN A FEW AT A TIME
  ═══════════════════════════════════════════════════════════════════════════
  Storelib AI streams its operations as it makes them, often a dozen a
  second. Each was applied the moment it arrived: a render of the whole
  editor, and in the canvas of an imported theme a section drawn by the
  theme's Liquid and swapped in, where the theme's own scripts start again
  for it (the owner's Materia: 50 to 300ms each, a section with a slider
  more). Forty of them in three seconds kept the editor busy for most of
  those seconds, and typing in the sidebar meanwhile waited (scripts/
  check-wb-incoming-r14.mjs, ai-burst).

  So they are queued and taken in together: the first at once (the canvas
  answers the moment the run starts), the rest at most once every `gapMs`,
  and the gap grows with what the last batch cost, so a heavy theme is
  given room to breathe between two batches. Nothing is dropped or merged
  here: every operation is applied, in order, by the same applier; a section
  changed twice in one batch is drawn once, with its last value. `flush`
  takes in whatever is waiting now (the run ended, Undo was pressed).
*/
export interface BurstQueue<T> {
  push(item: T): void
  /** Applies everything waiting, now. */
  flush(): void
  /** Forgets what is waiting and has not been applied (the page it was for was left). */
  drop(): void
  readonly size: number
}

export function createBurstQueue<T>({
  apply,
  gapMs = 250,
  maxGapMs = 1000,
  now = () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  later = (fn, ms) => setTimeout(fn, ms) as unknown as number,
  cancel = (id) => clearTimeout(id),
}: {
  /** Takes in a batch, oldest first; `flushed` when asked for now (flush), not on the queue's own time. */
  apply: (items: T[], flushed: boolean) => void
  gapMs?: number
  maxGapMs?: number
  now?: () => number
  later?: (fn: () => void, ms: number) => number
  cancel?: (id: number) => void
}): BurstQueue<T> {
  let waiting: T[] = []
  let timer: number | null = null
  let lastAt = -Infinity
  let gap = gapMs
  const run = (flushed = false) => {
    timer = null
    if (!waiting.length) return
    const batch = waiting
    waiting = []
    const t0 = now()
    lastAt = t0
    try {
      apply(batch, flushed)
    } finally {
      /* What it cost, three times over, before the next: never less than gapMs, never more than maxGapMs. */
      gap = Math.min(maxGapMs, Math.max(gapMs, (now() - t0) * 3))
    }
  }
  return {
    push(item) {
      waiting.push(item)
      if (timer !== null) return
      const wait = Math.max(0, lastAt + gap - now())
      timer = later(() => run(false), wait)
    },
    flush() {
      if (timer !== null) cancel(timer)
      run(true)
    },
    drop() {
      if (timer !== null) cancel(timer)
      timer = null
      waiting = []
    },
    get size() {
      return waiting.length
    },
  }
}

