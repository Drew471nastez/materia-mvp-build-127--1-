/**
 * THE ABOUT PAGE'S FACTS, AS PLAIN VALUES: the month a community started and
 * the figures its page shows (sales-page.tsx draws them). Pure and without
 * any component, so the tests call them without loading the page's client
 * parts (the gallery's swipe engine brings a stylesheet).
 */
import type { StatCell } from "./stats-row"
import type { AboutExtras, CommunityStatsView } from "./types"

const SINCE = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" })

/** "Oct 2025", the month the community started, or null. */
export function sinceLabel(iso: string | null | undefined): string | null {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? SINCE.format(t) : null
}

/**
 * THE FIGURES (round 11, ask 23): the most telling real ones, at most four,
 * each left out when it is not above zero (members always): members, active
 * this week, posts in the last 30 days, courses; Online now fills a place
 * left empty, only when the heartbeat says someone is. Counted on the server
 * (lib/communities/server/about.ts, the member count trigger, the presence
 * heartbeat). Pure, so the tests call it.
 */
export function aboutFigures(stats: CommunityStatsView, extras: AboutExtras | null | undefined): StatCell[] {
  const out: StatCell[] = [{ key: "members", label: stats.members === 1 ? "Member" : "Members", value: Math.max(0, stats.members) }]
  const a = extras?.activity
  if (a?.active7) out.push({ key: "active", label: "Active this week", value: a.active7 })
  if (a?.posts30) out.push({ key: "posts", label: "Posts in 30 days", value: a.posts30 })
  if (extras?.classroom?.total) out.push({ key: "courses", label: extras.classroom.total === 1 ? "Course" : "Courses", value: extras.classroom.total })
  if (out.length < 4 && stats.online) out.push({ key: "online", label: "Online now", value: stats.online })
  return out.slice(0, 4)
}

