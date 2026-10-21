/**
 * ===========================================================================
 *  ONE DRAFT WRITE AT A TIME, IN THE ORDER ASKED, THE NEWEST WINNING
 * ===========================================================================
 * The editor writes its draft from four places: autosave, Save, a page
 * switch and leaving. Each one sent its own PUTs the moment it was asked, so
 * an autosave still on its way when the next one started meant two writes of
 * the same row in flight, and whichever the server finished last was the
 * draft. That is not always the newer one: a slow first request lands after
 * a quick second one and puts the older page back (measured: two page saves
 * in flight at once with the routes answering in 700ms,
 * scripts/check-editor-sections.mjs).
 *
 * So every write goes through here:
 *
 *   ONE IN FLIGHT    a write asked for while another is going waits for it,
 *                    so the server receives them in the order they were made
 *   NEWEST WINS      a write waiting behind another for the same target (a
 *                    page) is replaced by a newer one, which alone is sent;
 *                    the older is answered with its result, since what it
 *                    held is in it
 *   NOTHING TWICE    a waiting write equal to the one just written (`equal`)
 *                    is answered with that result and never sent
 *
 * What a result means is the caller's: the editor's says whether the draft
 * was written, and why not.
 */
export interface SaveQueue<S, R> {
  /** Write `snapshot`, after whatever is being written now. */
  save: (snapshot: S) => Promise<R>
  /** Whether a write is going or waiting. */
  busy: () => boolean
  /** Resolves once nothing is going or waiting. */
  idle: () => Promise<void>
}

export interface SaveQueueOptions<S, R> {
  /** Two snapshots for the same target: the newer replaces the older while both wait. */
  sameTarget?: (a: S, b: S) => boolean
  /** Two snapshots that would write the same thing (by default, never). */
  equal?: (a: S, b: S) => boolean
  /** Whether a result is a write that went through, so an equal one after it need not be sent. */
  succeeded?: (r: R) => boolean
}

interface Waiting<S, R> {
  snapshot: S
  settle: Array<(r: R) => void>
  fail: Array<(e: unknown) => void>
}

export function createSaveQueue<S, R>(send: (snapshot: S) => Promise<R>, opts: SaveQueueOptions<S, R> = {}): SaveQueue<S, R> {
  const sameTarget = opts.sameTarget ?? (() => true)
  const equal = opts.equal ?? (() => false)
  const succeeded = opts.succeeded ?? (() => true)
  let going = false
  const waiting: Waiting<S, R>[] = []
  let last: { snapshot: S; result: R } | null = null
  let idleWaiters: Array<() => void> = []

  const pump = async () => {
    if (going) return
    going = true
    while (waiting.length) {
      const next = waiting.shift()!
      try {
        let result: R
        if (last && succeeded(last.result) && sameTarget(last.snapshot, next.snapshot) && equal(last.snapshot, next.snapshot)) {
          result = last.result
        } else {
          result = await send(next.snapshot)
          last = { snapshot: next.snapshot, result }
        }
        for (const s of next.settle) s(result)
      } catch (e) {
        last = null
        for (const f of next.fail) f(e)
      }
    }
    going = false
    const w = idleWaiters
    idleWaiters = []
    for (const f of w) f()
  }

  return {
    save(snapshot) {
      return new Promise<R>((resolve, reject) => {
        /*
          The newest for a target replaces the one waiting last, when it is for
          the same target; whoever asked for the older hears how the newer
          went. Only the last: the theme settings go with every page's write,
          so a newer write moved ahead of an older one for another page would
          let the older settings land after the newer.
        */
        const tail = waiting[waiting.length - 1]
        if (tail && sameTarget(tail.snapshot, snapshot)) {
          const w = tail
          w.snapshot = snapshot
          w.settle.push(resolve)
          w.fail.push(reject)
        } else {
          waiting.push({ snapshot, settle: [resolve], fail: [reject] })
        }
        void pump()
      })
    },
    busy: () => going || waiting.length > 0,
    idle: () => (going || waiting.length ? new Promise<void>((r) => idleWaiters.push(r)) : Promise.resolve()),
  }
}

/**
 * How long to wait before writing again after a save the server could not
 * take for a reason that passes (offline, a gateway down, too many at once):
 * 2s, 4s, 8s, 16s, then every 30s, until it goes through. Each try is the
 * whole draft again, so trying is always safe.
 */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt))
}
