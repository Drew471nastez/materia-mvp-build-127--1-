// OnePage: when the published page next changes by itself
// Location: lib/onepage/schedule-clock.ts
//
// Round 40, the owner: "Scheduling actually works." The live page leaves a
// block out while it is outside its schedule (./extra-blocks isScheduledNow,
// ./public-shape drawnBlocks), and that answer is worked out once, when the
// page is drawn on the server. A visitor who opened the page at 5:58 for a
// link set to start at 6:00 never saw it arrive, and one set to end at 6:00
// stayed up for them until they left. So the page is told the next moment
// any block starts or ends (components/onepage/schedule-refresh.tsx) and
// asks the server for itself again at that moment, which draws it by the
// same rule as a fresh visit. Instants are compared as instants: the time
// zone a creator picked them in (./schedule) is already in the ISO string.

type Scheduled = { schedule?: { start_at?: string | null; end_at?: string | null } | null }

/** The first start or end after `now` of any block, in ms, or null when nothing will change by itself. */
export function nextScheduleChange(blocks: readonly unknown[] | null | undefined, now: number): number | null {
  let next: number | null = null
  for (const b of blocks || []) {
    /* A group's own blocks keep schedules too: their start or end changes the page as much as a block of its own. */
    const children = (b as { type?: unknown; data?: { children?: unknown } } | null)
    if (children?.type === "group" && Array.isArray(children.data?.children)) {
      const inner = nextScheduleChange(children.data!.children as unknown[], now)
      if (inner !== null && (next === null || inner < next)) next = inner
    }
    const s = (b as Scheduled | null)?.schedule
    if (!s) continue
    for (const iso of [s.start_at, s.end_at]) {
      if (!iso) continue
      const t = Date.parse(iso)
      if (Number.isNaN(t) || t <= now) continue
      if (next === null || t < next) next = t
    }
  }
  return next
}

/** The longest one wait is held for: a timer far off is set again on the next draw, never trusted for days. */
export const SCHEDULE_WAIT_CAP_MS = 6 * 60 * 60 * 1000
/** A little after the moment, so the server's clock is past it too. */
export const SCHEDULE_SLACK_MS = 1500

/** How long the page waits before it asks again, or null for never. */
export function scheduleWait(at: number | null, now: number): number | null {
  if (at === null) return null
  return Math.min(SCHEDULE_WAIT_CAP_MS, Math.max(0, at - now) + SCHEDULE_SLACK_MS)
}
