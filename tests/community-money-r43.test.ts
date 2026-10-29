/**
 * ===========================================================================
 *  ROUND 43: A COMMUNITY'S MRR IS ONE FIGURE, IN THE COMMUNITY AND IN ANALYTICS
 * ===========================================================================
 * The owner: "in the community tabs the MRR shows $83.33 but Analytics shows
 * 0". The community list, its Overview and its money stats added the plans
 * up in whatever currency the first one was in; the Analytics report (the
 * community's own and /app/analytics' Community revenue card, which reads
 * the same answer) converted them to the store's currency and, with no
 * exchange rate kept for the week, left the plan's money out: $83.33 on one
 * screen, €0.00 on the other. A plan Stripe stopped (unpaid, paused) was
 * paying in Analytics and not on the list.
 *
 * One dataset, every screen computed from it by its real code:
 *
 *   list, Overview   lib/communities/server/membership-money communityMrr
 *   money stats      lib/communities/server/stats loadMoneyAndGrowth
 *   Analytics        lib/communities/server/analytics-report loadCommunityReport
 *   /app/analytics   lib/communities/membership-money moneyTotal of that answer
 *
 * for a store that chose euros with a $1,000 a year plan and:
 *   A  no exchange rate kept at all       every screen $83.33, in dollars
 *   B  only a rate twelve days old        every screen the same euros, at it
 *   C  a rate this week                   every screen the same euros
 * and an unpaid and a paused plan beside it, which no screen counts.
 *
 * Then the rest of round 43 on /app/analytics: several communities' answers
 * added up (lib/communities/report-total) for Communities chosen on their
 * own, the filters back to round 23's white pills, the expand button and the
 * centred window a report opens in, and Digital and Physical drawing their
 * downloads and refunds without being added.
 *
 *   npx tsx --conditions=react-server tests/community-money-r43.test.ts
 */
import { fakeDb } from "./_fake-db"
import { readFileSync } from "node:fs"
import { moneyTotal, payingAt } from "@/lib/communities/membership-money"
import { combineReports } from "@/lib/communities/report-total"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
type Row = Record<string, unknown>

const CID = "c4300000-0000-4000-8000-000000000001"
const STORE = "s4300000-0000-4000-8000-000000000001"
const YEARLY = "c4300000-0000-4000-8000-0000000000a1"
const NOW = Date.parse("2026-10-29T12:00:00Z")
/* Last 7 days, as /app/analytics asks it: to now. */
const SPAN = { start: Date.parse("2026-10-23T00:00:00Z"), end: NOW }

const plan = (id: string, status: string, extra: Row = {}): Row => ({ id, buyer_id: `u-${id}`, product_id: YEARLY, status, billing_interval: "year", amount_cents: 100_000, currency: "usd", created_at: "2026-08-01T10:00:00Z", started_at: "2026-08-01T10:00:00Z", canceled_at: null, ended_at: null, trial_end: null, ...extra })
const MEMBERSHIPS: Row[] = [plan("m1", "active"), plan("m2", "unpaid"), plan("m3", "paused")]

/* 1 € = 1.08 $ (so $1,000 a year is 925.93 € a year, 77.16 € a month). */
const RATE = { USD: 1.08, RON: 5, GBP: 0.86, JPY: 160, CHF: 0.95 }

function tables(fx: Row[]): Record<string, Row[]> {
  return {
    communities: [{ id: CID, owner_user_id: "owner", creator_id: STORE, created_at: "2026-06-01T00:00:00Z" }],
    store_settings: [{ creator_id: STORE, currency: "EUR" }],
    fx_rates: fx,
    community_members: [],
    community_activity: [],
    community_daily_stats: [],
    community_daily_traffic: [],
    community_view_days: [],
    community_feed_posts: [],
    community_events: [],
    community_tiers: [{ community_id: CID, product_id: YEARLY, billing: "recurring", kind: "paid", name: "Yearly" }],
    products: [],
    memberships: MEMBERSHIPS,
    orders: [],
    community_program_access: [],
    community_module_access: [],
    community_event_tickets: [],
    profiles: [],
  }
}

async function everyScreen(fx: Row[]) {
  const base = fakeDb(tables(fx))
  const db = { from: base.from, rpc: async () => ({ data: null, error: null }) }
  const { communityMrr } = await import("@/lib/communities/server/membership-money")
  const { loadMoneyAndGrowth } = await import("@/lib/communities/server/stats")
  const { loadCommunityReport } = await import("@/lib/communities/server/analytics-report")
  const list = await communityMrr(db as never, CID, NOW)
  const stats = (await loadMoneyAndGrowth(db as never, CID, 30, NOW)).revenue
  const report = await loadCommunityReport(db as never, tables(fx).communities[0] as never, { start: SPAN.start, end: SPAN.end, compare: null, timeZone: "UTC" }, NOW)
  const m = report.money
  const card = m ? moneyTotal([m]) : null
  return {
    list: { cents: list.cents, currency: list.currency, paying: list.paying },
    stats: stats ? { cents: stats.mrrCents, currency: stats.currency, paying: stats.activeSubscribers } : null,
    analytics: m ? { cents: m.figures.mrr.value, currency: m.currency, paying: m.figures.subscribers.value } : null,
    card: card ? { cents: card.mrr.value, currency: card.currency, paying: card.paying } : null,
  }
}

const agree = (s: Awaited<ReturnType<typeof everyScreen>>, want: { cents: number; currency: string; paying: number }) =>
  [s.list, s.stats, s.analytics, s.card].every((x) => !!x && x.cents === want.cents && x.currency === want.currency && x.paying === want.paying)

async function main() {
  console.log("\nStripe's stopped plans pay nothing")
  check("an unpaid or a paused plan is not paying, an active one is", payingAt(MEMBERSHIPS[0] as never, NOW) && !payingAt(MEMBERSHIPS[1] as never, NOW) && !payingAt(MEMBERSHIPS[2] as never, NOW))

  console.log("\nA. A store that chose euros, no exchange rate kept at all")
  const a = await everyScreen([])
  console.log("  ", JSON.stringify(a))
  check("the list, the stats, the community's Analytics and /app/analytics all say $83.33 from one paying member", agree(a, { cents: 8333, currency: "usd", paying: 1 }), a)

  console.log("\nB. Only a rate twelve days old (the daily job missed a week)")
  const b = await everyScreen([{ as_of: "2026-10-17", rates: RATE }])
  /* $1,000 is 925.93 € a year, a twelfth of it a month. */
  const euros = Math.round(Math.round(100_000 / 1.08) / 12)
  console.log("  ", JSON.stringify(b), "want", euros)
  check("every screen the same euros, at the newest rate kept, never €0.00", agree(b, { cents: euros, currency: "eur", paying: 1 }), b)

  console.log("\nC. A rate this week")
  const c = await everyScreen([{ as_of: "2026-10-28", rates: RATE }])
  console.log("  ", JSON.stringify(c))
  check("every screen the same euros", agree(c, { cents: euros, currency: "eur", paying: 1 }), c)
  check("  the same figure whichever week's rate it was taken at, here the same rate", c.list.cents === b.list.cents, { b: b.list.cents, c: c.list.cents })

  await combined()
  sources()

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

/* ── /app/analytics with Communities chosen: several communities' answers, added up ── */

const fig = (value: number | null, previous: number | null = null) => ({ value, previous })
const line = (current: number[], previous: number[] | null = null) => ({ current, previous })
function report(o: { members: number[]; joined: number[]; left: number[]; churn: number | null; active: number; posts: number; money?: { currency: string; revenue: number; mrr: number; paying: number } | null; spaces?: { id: string; name: string; posts: number; comments: number }[] }) {
  const flat = (v: number | null) => fig(v, null)
  return {
    version: 2, grain: "day", buckets: o.members.length, firstDay: "2026-01-01",
    figures: { members: flat(o.members[o.members.length - 1]), joined: flat(o.joined.reduce((a, b) => a + b, 0)), left: flat(o.left.reduce((a, b) => a + b, 0)), churn: flat(o.churn), visits: flat(0), prospects: flat(0), joinRate: flat(null), active: flat(o.active), posts: flat(o.posts), comments: flat(0), reactions: flat(0), engagement: flat(null), rsvps: flat(0), lessons: flat(0) },
    lines: { members: line(o.members), joined: line(o.joined), left: line(o.left), churn: line([]), visits: line([]), prospects: line([]), joinRate: line([]), active: line([]), posts: line([]), comments: line([]), reactions: line([]), engagement: line([]), rsvps: line([]), lessons: line([]) },
    counted: { visits: true, visitsByHour: true, active: true, engagement: true, detail: true }, countedSince: { visits: null, active: null },
    live: { members: o.members[o.members.length - 1], active1: 0, active7: 0, active30: 0, stickiness: null }, activeSplit: null, leaveReasons: [], people: { posters: 0, commenters: 0, reactors: 0 },
    money: o.money ? { currency: o.money.currency, figures: { revenue: flat(o.money.revenue), mrr: flat(o.money.mrr), subscribers: flat(o.money.paying), newPaid: flat(0), cancellations: flat(0) }, lines: { revenue: line([0, o.money.revenue]), mrr: line([o.money.mrr, o.money.mrr]), subscribers: line([o.money.paying, o.money.paying]), newPaid: line([0, 0]), cancellations: line([0, 0]) }, upgrades: 0, churnRate: null, refunds: { count: 0, totalCents: 0 }, bySource: [{ key: "memberships", cents: o.money.revenue }], byPlan: [], reasons: [] } : null,
    traffic: null, joins: { bySource: [], invites: [] }, topPosts: [], topSpaces: (o.spaces ?? []).map((x) => ({ ...x, slug: x.id })), contributors: [], cohorts: [], programs: [], events: [], eventMoney: null, ga: { id: null, seenAt: null }, at: NOW,
  } as never
}

async function combined() {
  console.log("\nSeveral communities added up, from each one's own answer")
  /* A: 10 members at the start, 2 joined, 1 of the 10 left: churn 10%. B: 30 at the start, 3 of them left: 10%. */
  const a = report({ members: [11, 11], joined: [2, 0], left: [1, 0], churn: 10, active: 4, posts: 6, money: { currency: "usd", revenue: 1500, mrr: 8333, paying: 1 }, spaces: [{ id: "s1", name: "General", posts: 3, comments: 1 }] })
  const b = report({ members: [27, 27], joined: [0, 0], left: [3, 0], churn: 10, active: 9, posts: 2, money: { currency: "usd", revenue: 900, mrr: 900, paying: 1 }, spaces: [{ id: "s2", name: "Wins", posts: 5, comments: 2 }] })
  const t = combineReports([{ id: "a", name: "Studio", report: a }, { id: "b", name: "Club", report: b }])
  check("members, joins, leaves, active members and posts are each community's added", !!t && t.figures.members.value === 38 && t.figures.joined.value === 2 && t.figures.left.value === 4 && t.figures.active.value === 13 && t.figures.posts.value === 8, t?.figures)
  check("churn is the leaves of members there at the start over those members, 4 of 40: 10%", t?.figures.churn.value === 10, t?.figures.churn)
  check("payments received and MRR are added in one currency, MRR the list's own $83.33 plus $9.00", !!t?.money && t.money.revenue.value === 2400 && t.money.mrr.value === 9233 && t.money.subscribers.value === 2 && t.money.currency === "usd", t?.money)
  check("the busiest spaces of both, each named with its community", t?.topSpaces.map((x) => `${x.label}/${x.community}`).join() === "Wins/Club,General/Studio", t?.topSpaces)
  check("each community's own figures, for its list and its report", t?.each.map((e) => `${e.name}:${e.members}:${e.mrr}`).join() === "Studio:11:8333,Club:27:900", t?.each)
  const mixed = combineReports([{ id: "a", name: "Studio", report: a }, { id: "c", name: "Paris", report: report({ members: [5, 5], joined: [0, 0], left: [0, 0], churn: null, active: 1, posts: 0, money: { currency: "eur", revenue: 100, mrr: 100, paying: 1 } }) }])
  check("communities in two currencies are never added together: no money, both currencies named", !!mixed && mixed.money === null && mixed.currencies.join() === "usd,eur", mixed && { money: mixed.money, currencies: mixed.currencies })
  check("nothing to add is nothing", combineReports([]) === null)
}

function sources() {
  const read = (p: string) => readFileSync(p, "utf8")
  console.log("\nThe filters, the way into a report, and Communities on their own")
  const css = read("app/globals.css")
  const client = read("app/app/analytics/analytics-client.tsx")
  check("the filters are the round white pills again: no Emails chip rules, no data-filter-chips on the row", !/\[data-filter-chips\]/.test(css) && !/data-filter-chips=""/.test(client) && /\[data-analytics-controls\] button\[aria-haspopup="dialog"\] \{[^}]*border-radius: 999px/.test(css))
  check("  the type is still ONE picker", /<KindPicker options=\{kindPills\}/.test(client) && !/SegmentedPills/.test(client))
  const detail = read("app/app/analytics/report-detail.tsx")
  const button = detail.slice(detail.indexOf("export function ViewReport"), detail.indexOf("/* ─── The panel"))
  check("a card's way in is an icon button with its name for a screen reader and a tooltip, not the words", /<Maximize2/.test(button) && /aria-label=\{name\}/.test(button) && /<TooltipContent/.test(button) && !/\{tt\("View report"\)\}\s*<\/button>/.test(button))
  check("a report opens in the middle of the screen on a computer, not from the right edge", !/left-auto right-0 top-0/.test(detail) && /w-\[min\(720px,calc\(100vw-48px\)\)\]/.test(detail) && /<BottomSheet/.test(detail) && /analytics-detail-in \{\s*from \{ opacity: 0; transform: translateY\(8px\) scale\(0\.97\); \}/.test(css))
  check("Communities chosen: the communities' figures and chart take the store's place, every card behind it", /\{communitiesOnly \? null : \(/.test(client) && /<CommunityReports communities=\{communities\} span=\{safeSpan\} compare=\{against\} timeZone=\{timeZone\} refresh=\{tick\} full /.test(client))
  const reports = read("app/app/analytics/community-reports.tsx")
  check("  members, new members, active members, posts, payments received, MRR; growth, activity, revenue, spaces, posts, joins, each opening its report", ["\"members\"", "\"joined\"", "\"active\"", "\"posts\"", "\"revenue\"", "\"mrr\""].every((k) => reports.includes(`key: ${k}`)) && ["growth", "activity", "revenue", "spaces", "posts", "joins", "communities"].every((id) => reports.includes(`detail={{ id: "${id}" }}`) || reports.includes(`{ id: "${id}" }`)) && ["metric:members", "metric:mrr", "growth", "activity", "spaces", "joins"].every((id) => reports.includes(`case "${id}":`)))
  check("Digital and Physical draw what they need without adding it: downloads and refunds, refunds", /shownView === "digital" \? \["downloads", "refunds"\] : \["refunds"\]/.test(client) && /standing=\{standingReports\}/.test(client))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
