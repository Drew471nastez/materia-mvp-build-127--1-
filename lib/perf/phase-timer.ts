/**
 * ===========================================================================
 *  WHERE A SERVER RENDER ACTUALLY SPENDS ITS TIME
 * ===========================================================================
 * "Why does it take so much to load the product page."
 *
 * The product page is two thousand lines with a dozen queries in it, and the
 * honest answer to that question is a set of numbers rather than a reading of
 * the code. Guessing which query is slow and optimising that one is how an
 * afternoon goes into making something five percent faster.
 *
 * So: mark the phases, print one line per request. It goes to the platform's
 * runtime log, readable per deployment, and costs a `performance.now()` per
 * mark.
 *
 * DELIBERATELY NOT BEHIND A FLAG. A timing line that has to be switched on is
 * a timing line nobody has when they need it, and one log entry per render is
 * not a cost worth managing. It carries no personal data — a slug and some
 * durations.
 */

export interface PhaseTimer {
  /** Record the moment a phase finished, measured from the one before it. */
  mark: (name: string) => void
  /** Print the line. Safe to call twice; only the first prints. */
  done: (extra?: Record<string, string | number>) => void
}

export function startPhaseTimer(label: string, id: string): PhaseTimer {
  const t0 = performance.now()
  let last = t0
  const marks: string[] = []
  let printed = false

  return {
    mark(name) {
      const now = performance.now()
      marks.push(`${name}=${Math.round(now - last)}`)
      last = now
    },
    done(extra) {
      if (printed) return
      printed = true
      const total = Math.round(performance.now() - t0)
      const tail = extra ? " " + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ") : ""
      console.log(`[${label}] id=${id} total=${total} ${marks.join(" ")}${tail}`)
    },
  }
}
