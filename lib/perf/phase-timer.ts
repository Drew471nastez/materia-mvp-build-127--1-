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

import { logEvent } from "@/lib/net/log"

/** A render at least this long is logged as a warning. */
export const PHASE_SLOW_MS = 3_000

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
      /*
        One JSON line (lib/net/log.ts), so Vercel's log can be searched and
        grouped by phase. It is the most frequent line in production (one per
        product page render): info, and a warning only when the render took
        PHASE_SLOW_MS or more, so a slow page shows among the warnings.
      */
      const phases: Record<string, number> = {}
      for (const m of marks) {
        const [k, v] = m.split("=")
        phases[k] = Number(v)
      }
      logEvent(total >= PHASE_SLOW_MS ? "warn" : "info", "phase_timing", { ...phases, ...(extra ?? {}), label, id, total })
    },
  }
}
