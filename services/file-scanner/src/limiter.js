/**
 * HOW MANY SCANS RUN AT ONCE.
 *
 * clamd has a fixed number of scanning threads (MaxThreads). Sending it more
 * streams than that only makes every one of them slower and holds more
 * uploads open, so the service keeps its own count: `max` at once, up to
 * `maxQueue` waiting in order, and a wait longer than `timeoutMs` is answered
 * "busy, try again" rather than left hanging.
 */
export class Busy extends Error {
  constructor(message) {
    super(message)
    this.name = "Busy"
  }
}

export function createConcurrency({ max, maxQueue, timeoutMs }) {
  let running = 0
  const queue = []

  function release() {
    running--
    while (queue.length > 0) {
      const next = queue.shift()
      if (next.settled) continue
      next.settled = true
      clearTimeout(next.timer)
      running++
      next.resolve(release)
      return
    }
  }

  /** Resolves with a release function once there is room. */
  function acquire() {
    if (running < max) {
      running++
      return Promise.resolve(once(release))
    }
    if (queue.length >= maxQueue) return Promise.reject(new Busy("Too many scans waiting"))
    return new Promise((resolve, reject) => {
      const entry = { settled: false, resolve: (r) => resolve(once(r)), timer: null }
      entry.timer = setTimeout(() => {
        if (entry.settled) return
        entry.settled = true
        reject(new Busy("Waited too long for a free scanner"))
      }, timeoutMs)
      queue.push(entry)
    })
  }

  return {
    acquire,
    running: () => running,
    waiting: () => queue.filter((e) => !e.settled).length,
  }
}

function once(fn) {
  let called = false
  return () => {
    if (called) return
    called = true
    fn()
  }
}
