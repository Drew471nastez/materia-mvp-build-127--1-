/**
 * ===========================================================================
 *  A MEMBER'S ACTIVITY BOARD: WHAT THE PROFILE PLACE IS HANDED
 * ===========================================================================
 * Round 18 (C18, item 11). Under a member's head on their profile inside a
 * community: a day grid of the last year (one square a day, shaded by how
 * much they did here that day: posts, comments and likes), their level and
 * points when the community counts points, and a few plain facts (joined,
 * posts, comments). Nothing is made up: a day is the count of what is in the
 * database for that member in this community on that day, and a new member's
 * board is empty.
 *
 * The server reads it (lib/communities/server/member-profile.ts memberBoard,
 * through SQL part 125's community_member_activity, one call however long
 * the member's history is); components/community/member/activity-board.tsx
 * draws it. Types and pure rules only, so a client bundle and a test can use
 * them.
 *
 * DAYS ARE THE VIEWER'S. The squares are counted in the time zone the
 * storelib_tz cookie names (lib/orders/time-zone), UTC when there is none, and
 * the board says which zone it was counted in, so the client draws exactly
 * the days the server counted and never shifts a square on hydration.
 */

/** How many weeks the grid covers, this one included. */
export const BOARD_WEEKS = 52
/** The oldest day the server will count, whatever it is asked: a year and a few weeks. */
export const BOARD_MAX_DAYS = 400

/** One day with anything on it: [YYYY-MM-DD, posts, comments, likes]. Days with nothing are not sent. */
export type BoardDay = [string, number, number, number]

export interface ActivityGrid {
  /** The time zone the days were counted in. */
  tz: string
  /** The first day on the grid (a Sunday), YYYY-MM-DD. */
  from: string
  /** Today in that zone, YYYY-MM-DD: the last square. */
  today: string
  /** Every day with something on it, oldest first. */
  days: BoardDay[]
}

export interface LevelStep {
  level: number
  name: string
  minPoints: number
}

/** Where a member stands in a community that counts points (gamification on). */
export interface MemberStanding {
  level: number
  /** The level's name in this community ("Contributor"), when it has one. */
  name: string | null
  points: number
  /** The points this level starts at. */
  floor: number
  /** The next level, or null at the top. */
  next: LevelStep | null
}

export interface MemberBoard {
  /** Null before SQL part 125 has run (the board then shows no grid, never an error), or when it could not be read. */
  grid: ActivityGrid | null
  /** Null when the community does not count points. */
  standing: MemberStanding | null
  /** When they joined this community. */
  joinedAt: string | null
  /** Their published posts here, all time. */
  posts: number | null
  /** Their published comments here, all time; null before part 125 (counting them needs its index). */
  comments: number | null
}

/* ── Days as plain YYYY-MM-DD, counted in UTC arithmetic so no zone moves them ── */

const DAY_MS = 86_400_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DAY.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDays(day: string, n: number): string {
  return dayOf(dayMs(day) + n * DAY_MS)
}

/** 0 for Sunday ... 6 for Saturday. */
export function weekday(day: string): number {
  return new Date(dayMs(day)).getUTCDay()
}

/** Today in `tz` as YYYY-MM-DD (UTC for a zone this engine does not know). */
export function zoneToday(now: number, tz: string): string {
  const fmt = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now))
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
  }
  try {
    const v = fmt(tz)
    if (isDay(v)) return v
  } catch {
    /* An unknown zone: UTC below. */
  }
  return dayOf(now)
}

/** The grid's first day: the Sunday that starts the week BOARD_WEEKS - 1 weeks before today's. */
export function boardFrom(today: string, weeks: number = BOARD_WEEKS): string {
  const back = addDays(today, -7 * (weeks - 1))
  return addDays(back, -weekday(back))
}

/* ── The answer of SQL part 125, checked ─────────────────────────────── */

const count = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * community_member_activity's jsonb as the board keeps it: only well formed
 * days inside [from, today], counts as whole non negative numbers, oldest
 * first. Null for anything that is not that answer.
 */
export function parseActivityAnswer(raw: unknown, today: string, from: string): { grid: ActivityGrid; posts: number; comments: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as { tz?: unknown; days?: unknown; posts?: unknown; comments?: unknown }
  if (!Array.isArray(r.days)) return null
  const days: BoardDay[] = []
  for (const d of r.days) {
    if (!Array.isArray(d) || !isDay(d[0]) || d[0] < from || d[0] > today) continue
    const row: BoardDay = [d[0], count(d[1]), count(d[2]), count(d[3])]
    if (row[1] + row[2] + row[3] > 0) days.push(row)
  }
  days.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return { grid: { tz: typeof r.tz === "string" && r.tz ? r.tz : "UTC", from, today, days }, posts: count(r.posts), comments: count(r.comments) }
}

/* ── Levels ───────────────────────────────────────────────────────────── */

/** Where `points` and `level` stand on the community's levels (sorted or not). Pure. */
export function standingOf(level: number | null | undefined, points: number | null | undefined, steps: readonly LevelStep[]): MemberStanding {
  const sorted = [...steps].filter((s) => Number.isInteger(s.level) && s.level > 0).sort((a, b) => a.level - b.level)
  const lv = Number.isInteger(level) && (level as number) > 0 ? (level as number) : 1
  const pts = Math.max(0, Math.floor(Number(points) || 0))
  const here = sorted.find((s) => s.level === lv) ?? null
  const next = sorted.find((s) => s.level > lv) ?? null
  return { level: lv, name: here?.name?.trim() || null, points: pts, floor: Math.max(0, here?.minPoints ?? 0), next }
}

/** How far through this level, 0 to 1 (1 at the top level). */
export function levelProgress(s: MemberStanding): number {
  if (!s.next) return 1
  const span = s.next.minPoints - s.floor
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (s.points - s.floor) / span))
}

/* ── The grid as it is drawn ─────────────────────────────────────────── */

/** A day's shade: 0 nothing, then 1, 2 to 3, 4 to 6, 7 or more. Fixed steps, so a square means the same on every profile. */
export function shadeOf(total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0) return 0
  if (total === 1) return 1
  if (total <= 3) return 2
  if (total <= 6) return 3
  return 4
}

export interface BoardCell {
  day: string
  posts: number
  comments: number
  likes: number
  total: number
  shade: 0 | 1 | 2 | 3 | 4
  /** After today: drawn as nothing at all, not as an empty day. */
  future: boolean
}

export interface BoardWeek {
  /** Its Sunday. */
  start: string
  /** The month's short name when this week holds the 1st of a month (or it is the first week), else null. */
  month: string | null
  cells: BoardCell[]
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** The grid's weeks, oldest first, seven cells each (Sunday to Saturday). Pure. */
export function boardWeeks(grid: Pick<ActivityGrid, "from" | "today" | "days">): BoardWeek[] {
  const byDay = new Map(grid.days.map((d) => [d[0], d]))
  const weeks: BoardWeek[] = []
  let start = grid.from
  while (start <= grid.today) {
    const cells: BoardCell[] = []
    let month: string | null = null
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i)
      const d = byDay.get(day)
      const posts = d?.[1] ?? 0
      const comments = d?.[2] ?? 0
      const likes = d?.[3] ?? 0
      const total = posts + comments + likes
      cells.push({ day, posts, comments, likes, total, shade: shadeOf(total), future: day > grid.today })
      if (day.endsWith("-01") && day <= grid.today) month = MONTHS[Number(day.slice(5, 7)) - 1]
    }
    weeks.push({ start, month, cells })
    start = addDays(start, 7)
  }
  /* The first week names its month when no month starts in it or in the week after, so two labels never touch. */
  const [a, b] = weeks
  if (a && !a.month && !b?.month) a.month = MONTHS[Number(a.start.slice(5, 7)) - 1]
  return weeks
}

/** Totals over the grid. */
export function boardTotals(grid: Pick<ActivityGrid, "days">): { posts: number; comments: number; likes: number; total: number; activeDays: number } {
  let posts = 0
  let comments = 0
  let likes = 0
  for (const d of grid.days) {
    posts += d[1]
    comments += d[2]
    likes += d[3]
  }
  return { posts, comments, likes, total: posts + comments + likes, activeDays: grid.days.length }
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`

/** "Tue, Oct 7: 2 posts, 1 comment, 3 likes" or "Tue, Oct 7: nothing". */
export function cellLabel(c: Pick<BoardCell, "day" | "posts" | "comments" | "likes">): string {
  const date = new Date(dayMs(c.day)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
  const parts: string[] = []
  if (c.posts) parts.push(plural(c.posts, "post", "posts"))
  if (c.comments) parts.push(plural(c.comments, "comment", "comments"))
  if (c.likes) parts.push(plural(c.likes, "like", "likes"))
  return `${date}: ${parts.length ? parts.join(", ") : "nothing"}`
}

/** The line under the grid when no day is picked. */
export function boardSummary(grid: Pick<ActivityGrid, "days">): string {
  const t = boardTotals(grid)
  if (!t.total) return "Nothing here in the last year yet"
  const parts: string[] = []
  if (t.posts) parts.push(plural(t.posts, "post", "posts"))
  if (t.comments) parts.push(plural(t.comments, "comment", "comments"))
  if (t.likes) parts.push(plural(t.likes, "like", "likes"))
  return `${parts.join(", ")} in the last year`
}
