/**
 * ===========================================================================
 *  ROUND 13: SMART PUSH, THE EMAIL BUDGET AND BROWSER PUSH
 * ===========================================================================
 * Held from their inputs:
 *
 *   THE CHOICE      the kinds (programs and owner posts added), per community
 *                   kinds, quiet hours, the time zone and the weekly digest
 *                   opt in, read and changed safely (push-kinds.ts).
 *   THE CLOCK       quiet hours across midnight in a real zone, the end and
 *                   start of a stretch, the daily summary's hour, Monday's
 *                   digest (push-budget.ts).
 *   PER EVENT       who gets the bell, the push and the email: a mention, a
 *                   reply, likes grouped, an owner's post and a member's, a
 *                   new event and one that moved, a new program, an
 *                   announcement.
 *   QUIET HOURS     nothing pushes inside them, one summary when they end.
 *   DAILY CAP       past the cap a like waits and a mention still goes; the
 *                   summary leaves out what already went.
 *   EMAIL BUDGET    the one list covers every type; a type that is never an
 *                   email plans nothing and is skipped; the account's cap on
 *                   budgeted email; essential email always goes.
 *   WEEKLY DIGEST   only when asked for; busiest first; a quiet week sends
 *                   nothing; the next week is queued.
 *   SETTINGS        the route and the screen: web push on and off from
 *                   Settings, the prompt after joining, the copy rules.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  COMMUNITY_KIND_KEYS,
  NOTIFY_META_KEY,
  PUSH_KIND_KEYS,
  applyNotifyChange,
  cleanTimeZone,
  communityKindStates,
  emailStates,
  emptyChoice,
  kindAllowed,
  pushKindOf,
  readNotifyChoice,
  type NotifyChoice,
} from "@/lib/notifications/push-kinds"
import { CAP_EXEMPT_KINDS, DAILY_PUSH_CAP, PUSH_DAY_BUCKET, budgetDecision, clockAt, dailySummaryAt, inQuietHours, nextWeeklyDigest, quietBeganAt, quietEndsAt, sentToday } from "@/lib/notifications/push-budget"
import { levelAllowsPush, pushPriority, runPushDigest, setPushBridgeDeps, summaryContent, summaryJob } from "@/lib/notifications/push-bridge"
import { notifyMember, notifyEventChanged, notifyProgramPublished, scheduleWeeklyDigest } from "@/lib/communities/server/notify"
import { fanoutAnnouncement, postLevels } from "@/lib/communities/server/jobs/fanout_announcement"
import { fanoutEvent, eventChangeTitle } from "@/lib/communities/server/jobs/fanout_event"
import { programTitle, programUrl } from "@/lib/communities/server/jobs/fanout_program"
import { runWeeklyDigest, weekLine, weeklyData } from "@/lib/communities/server/jobs/weekly_digest"
import { ACCOUNT_DAILY_EMAIL_CAP, BUDGETED_TYPES, EMAIL_POLICY, emailAllowed, emailClass } from "@/lib/notify/email-budget"
import { handle } from "@/lib/notify/orchestrator"
import { runWork, type EngineDeps } from "@/lib/notify/engine"
import { emailChannel } from "@/lib/notify/channels/email"
import { inAppChannel } from "@/lib/notify/channels/in-app"
import { DATA_KEYS, renderEmail, renderInApp } from "@/lib/notify/templates"
import { REGISTRY } from "@/lib/notify/registry"
import { NOTIFICATION_TYPES, type ChannelResult, type DomainEvent, type OutgoingEmail } from "@/lib/notify/types"
import type { JobRow } from "@/lib/communities/types"
import { promptAllowed, RECENT_DAYS, SNOOZE_DAYS } from "@/components/notifications/web-push-prompt"
import { MemoryNotifyStore } from "./notify-memory-store"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})`}`)
  }
}
const read = (f: string) => untt(readFileSync(f, "utf8"), f)
const code = (f: string) => stripComments(read(f))

/* The engine writes one JSON line per step: kept out of the way. */
const realLog = console.log
console.log = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("{")) return
  realLog(...a)
}
const realWarn = console.warn
console.warn = (...a: unknown[]) => {
  if (typeof a[0] === "string" && a[0].startsWith("{")) return
  realWarn(...a)
}

/* ── A small PostgREST stand in, with auth.admin for app_metadata ──────── */

type Row = Record<string, any>

function pg(tables: Record<string, Row[]>, users: Record<string, { email?: string; app_metadata?: Record<string, unknown> }> = {}) {
  let serial = 0
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st = { op: "select", preds: [] as ((r: Row) => boolean)[], order: [] as [string, boolean][], limit: null as number | null, head: false, count: false, payload: null as any, single: false, conflict: "", ignore: false, returning: false }
    const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0)
    const rows = () => (tables[table] ??= [])
    const run = () => {
      const hit = rows().filter((r) => st.preds.every((p) => p(r)))
      if (st.op === "select") {
        let out = [...hit]
        if (st.order.length) out.sort((x, y) => { for (const [c, asc] of st.order) { const d = cmp(x[c], y[c]); if (d) return asc ? d : -d } return 0 })
        if (st.limit !== null) out = out.slice(0, st.limit)
        if (st.head) return { data: null, error: null, count: hit.length }
        if (st.single) return { data: out[0] ? { ...out[0] } : null, error: null }
        return { data: out.map((r) => ({ ...r })), error: null, count: st.count ? hit.length : null }
      }
      if (st.op === "update") {
        for (const r of hit) Object.assign(r, st.payload)
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null }
      }
      const list = Array.isArray(st.payload) ? st.payload : [st.payload]
      const made: Row[] = []
      for (const p of list) {
        const keys = st.conflict ? st.conflict.split(",") : []
        const had = keys.length ? rows().find((r) => keys.every((k) => r[k] === p[k])) : undefined
        if (had) {
          if (!st.ignore) Object.assign(had, p)
          continue
        }
        const row = { id: id(), created_at: new Date().toISOString(), read_at: null, ...p }
        rows().push(row)
        made.push(row)
      }
      return { data: st.returning ? made.map((r) => ({ ...r })) : null, error: null }
    }
    const q: any = {
      select(_c?: string, o?: { count?: string; head?: boolean }) {
        if (st.op === "select") { st.head = !!o?.head; st.count = !!o?.count } else st.returning = true
        return q
      },
      eq(c: string, v: unknown) { st.preds.push((r) => r[c] === v); return q },
      neq(c: string, v: unknown) { st.preds.push((r) => r[c] !== v); return q },
      in(c: string, v: unknown[]) { st.preds.push((r) => v.includes(r[c])); return q },
      is(c: string, v: unknown) { st.preds.push((r) => (v === null ? r[c] == null : r[c] === v)); return q },
      gt(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) > 0); return q },
      gte(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) >= 0); return q },
      lt(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) < 0); return q },
      lte(c: string, v: unknown) { st.preds.push((r) => cmp(r[c], v) <= 0); return q },
      order(c: string, o?: { ascending?: boolean }) { st.order.push([c, o?.ascending !== false]); return q },
      limit(n: number) { st.limit = n; return q },
      maybeSingle() { st.single = true; return q },
      single() { st.single = true; return q },
      update(p: Row) { st.op = "update"; st.payload = p; return q },
      insert(p: Row | Row[]) { st.op = "insert"; st.payload = p; return q },
      upsert(p: Row | Row[], o: { onConflict: string; ignoreDuplicates?: boolean }) { st.op = "upsert"; st.payload = p; st.conflict = o.onConflict; st.ignore = !!o.ignoreDuplicates; return q },
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) { try { resolve(run()) } catch (e) { reject(e) } },
    }
    return q
  }
  const auth = {
    admin: {
      getUserById: async (uid: string) => ({ data: { user: users[uid] ? { id: uid, email: users[uid].email ?? null, app_metadata: users[uid].app_metadata ?? {} } : null }, error: null }),
      updateUserById: async (uid: string, attrs: { app_metadata: Record<string, unknown> }) => {
        users[uid] = { ...(users[uid] ?? {}), app_metadata: { ...(users[uid]?.app_metadata ?? {}), ...attrs.app_metadata } }
        return { error: null }
      },
    },
  }
  return { from, tables, users, auth, rpc: async () => ({ data: [], error: null }) }
}

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const C2 = "00000000-0000-4000-b000-000000000002"
const OWNER = U(1)
const MARA = U(2)
const BEN = U(3)
const IOANA = U(4)
const DAN = U(5)
const POST = "00000000-0000-4000-c000-000000000001"
const SPACE = "00000000-0000-4000-d000-000000000001"
const EVENT = "00000000-0000-4000-e000-000000000001"

interface Sent { userId: string; title: string; body: string; data: Record<string, string>; collapseKey?: string }
function deps(sent: Sent[]) {
  setPushBridgeDeps({
    sender: async (userId, p) => {
      sent.push({ userId, title: p.title, body: p.body, data: p.data ?? {}, collapseKey: p.collapseKey })
    },
    communitiesOn: async () => true,
    defer: (task) => task(),
  })
}

function world(levels: Record<string, string> = {}) {
  const people = [OWNER, MARA, BEN, IOANA, DAN]
  return {
    communities: [
      { id: C1, name: "Film Loft", slug: "film-loft", status: "published", deleted_at: null, suspended_at: null },
      { id: C2, name: "Clay Club", slug: "clay-club", status: "published", deleted_at: null, suspended_at: null },
    ],
    push_tokens: people.map((u, i) => ({ id: `t${i}`, user_id: u, token: `tok-${i}`, platform: "ios" })),
    business_links: [],
    notification_preferences: [],
    rate_limit_hits: [],
    community_jobs: [],
    community_members: [
      ...people.map((u) => ({ community_id: C1, user_id: u, status: "active", role: u === OWNER ? "owner" : "member", tier_id: null, level: 1, notify_level: levels[u] ?? "important", email_announcements: true, email_events: true, last_active_at: "2026-10-01T00:00:00Z" })),
      { community_id: C2, user_id: MARA, status: "active", role: "member", tier_id: null, level: 1, notify_level: "all", email_announcements: true, email_events: true, last_active_at: "2026-09-01T00:00:00Z" },
    ],
    community_notifications: [],
    user_notifications: [],
    community_spaces: [{ id: SPACE, community_id: C1, kind: "feed", view_access: {}, archived_at: null }],
    community_feed_posts: [],
    community_events: [],
    community_event_rsvps: [],
    profiles: [
      { id: OWNER, display_name: "Owen Hart", username: "owen" },
      { id: MARA, display_name: "Mara Pop", username: "mara" },
      { id: BEN, display_name: "Ben Ionescu", username: "ben" },
    ],
  } as Record<string, Row[]>
}

const job = (kind: string, payload: Record<string, unknown>): JobRow => ({ id: 1, kind, payload, state: "running", attempts: 1, run_at: new Date().toISOString(), lease_until: null, idempotency_key: "k", last_error: null, created_at: new Date().toISOString(), finished_at: null } as unknown as JobRow)
const ctx = () => ({ deadline: Date.now() + 60_000, now: Date.now() })
const meta = (c: Partial<NotifyChoice> & Record<string, unknown>) => ({ app_metadata: { [NOTIFY_META_KEY]: c } })

async function main() {
  /* ── The choice ──────────────────────────────────────────────────────── */
  console.log("\nThe choice a person makes, read and changed safely")
  check("nine kinds: mentions, replies, owner posts, member posts, events, programs, likes, messages, followers", PUSH_KIND_KEYS.join(",") === "mentions,comments,admin_posts,posts,events,programs,likes,messages,followers")
  check("a community can switch every kind but followers", COMMUNITY_KIND_KEYS.length === 8 && !(COMMUNITY_KIND_KEYS as readonly string[]).includes("followers"))
  check("an owner's post sits under its own switch, a program under Programs", pushKindOf("admin_post") === "admin_posts" && pushKindOf("post") === "posts" && pushKindOf("course_available") === "programs")
  const stored = readNotifyChoice({ [NOTIFY_META_KEY]: { pushOff: ["likes", "nonsense", "likes"], emailOff: ["report_digest"], emailOn: ["weekly_digest", "spam"], communities: { [C1]: ["likes", "followers", "x"], "not-an-id": ["likes"] }, quiet: { from: 1320, to: 480 }, tz: "Europe/Bucharest" } })
  check("a stored choice is read safely: unknown words, ids and kinds dropped", JSON.stringify(stored) === JSON.stringify({ pushOff: ["likes"], emailOff: ["report_digest"], emailOn: ["weekly_digest"], communities: { [C1]: ["likes"] }, quiet: { from: 1320, to: 480 }, tz: "Europe/Bucharest" }), stored)
  check("nothing stored is everything on, no quiet hours, no digest", JSON.stringify(readNotifyChoice({})) === JSON.stringify(emptyChoice()) && emailStates(emptyChoice()).weekly_digest === false && emailStates(emptyChoice()).report_digest === true)
  check("a bad zone or equal quiet ends are nothing", readNotifyChoice({ [NOTIFY_META_KEY]: { tz: "Mars/Olympus", quiet: { from: 60, to: 60 } } }).tz === null && readNotifyChoice({ [NOTIFY_META_KEY]: { quiet: { from: 60, to: 60 } } }).quiet === null && cleanTimeZone("UTC") === "UTC")
  const c1 = applyNotifyChange(emptyChoice(), { community: { id: C1, push: { likes: false, events: false, followers: false } } })
  check("a community's kinds are kept for that community alone", JSON.stringify(c1?.communities) === JSON.stringify({ [C1]: ["events", "likes"] }) && c1?.pushOff.length === 0)
  check("a like is off in Film Loft and still on in Clay Club", !kindAllowed(c1, "reaction", C1) && kindAllowed(c1, "reaction", C2) && kindAllowed(c1, "reply", C1))
  const back = applyNotifyChange(c1!, { community: { id: C1, push: { likes: true, events: true } } })
  check("turning them back on forgets the community", JSON.stringify(back?.communities) === "{}")
  const q = applyNotifyChange(emptyChoice(), { quiet: { from: 1380, to: 420 }, tz: "America/New_York", email: { weekly_digest: true } })
  check("quiet hours, the zone and the weekly digest are saved", JSON.stringify(q?.quiet) === '{"from":1380,"to":420}' && q?.tz === "America/New_York" && q?.emailOn.includes("weekly_digest") === true)
  check("quiet null turns them off; a bad zone is refused", applyNotifyChange(q!, { quiet: null })?.quiet === null && applyNotifyChange(emptyChoice(), { tz: "<script>" }) === null)
  check("Settings reads one community's kinds", communityKindStates(c1!, C1).likes === false && communityKindStates(c1!, C1).mentions === true)

  /* ── The clock ───────────────────────────────────────────────────────── */
  console.log("\nQuiet hours, the cap and the digests on the person's own clock")
  const BUC = "Europe/Bucharest"
  const lateNight = Date.parse("2026-10-05T21:30:20Z") /* 00:30 in Bucharest */
  const night = { from: 22 * 60, to: 8 * 60 }
  check("the person's midnight and minute", clockAt(lateNight, BUC).minutes === 30 && new Date(clockAt(lateNight, BUC).dayStart).toISOString() === "2026-10-05T21:00:00.000Z" && clockAt(lateNight, BUC).day === "2026-10-06")
  check("00:30 is inside 22:00 to 08:00, noon is not", inQuietHours(night, lateNight, BUC) && !inQuietHours(night, Date.parse("2026-10-06T09:00:00Z"), BUC))
  check("this stretch began at 22:00 and ends at 08:00 their time", new Date(quietBeganAt(night, lateNight, BUC)).toISOString() === "2026-10-05T19:00:00.000Z" && new Date(quietEndsAt(night, lateNight, BUC)).toISOString() === "2026-10-06T05:00:00.000Z")
  check("quiet hours inside one day work too", inQuietHours({ from: 13 * 60, to: 14 * 60 }, Date.parse("2026-10-06T10:30:00Z"), BUC) && !inQuietHours({ from: 13 * 60, to: 14 * 60 }, Date.parse("2026-10-06T11:30:00Z"), BUC))
  check("the cap's summary goes at 18:00 their time", new Date(dailySummaryAt(Date.parse("2026-10-06T09:00:00Z"), BUC, night)).toISOString() === "2026-10-06T15:00:00.000Z")
  check("after 18:00 an hour later; never inside quiet hours", new Date(dailySummaryAt(Date.parse("2026-10-06T17:30:00Z"), BUC, night)).toISOString() === "2026-10-06T18:30:00.000Z" && new Date(dailySummaryAt(Date.parse("2026-10-06T18:40:00Z"), BUC, night)).toISOString() === "2026-10-07T05:00:00.000Z")
  check("without quiet hours, late at night it waits for the morning", new Date(dailySummaryAt(Date.parse("2026-10-06T19:30:00Z"), BUC, null)).toISOString() === "2026-10-07T05:00:00.000Z")
  check("in quiet hours everything waits, even a mention", budgetDecision({ kind: "mention", quiet: night, tz: BUC, sentToday: 0, now: lateNight }) === "quiet")
  check("past the cap a like waits; a mention, a reply and a message still go", DAILY_PUSH_CAP === 10 && budgetDecision({ kind: "reaction", quiet: null, tz: BUC, sentToday: 10, now: lateNight }) === "daily" && ["mention", "reply", "dm"].every((k) => budgetDecision({ kind: k, quiet: null, tz: BUC, sentToday: 25, now: lateNight }) === "send") && CAP_EXEMPT_KINDS.includes("membership"))
  check("the day is counted from their midnight", sentToday(["2026-10-05T20:59:00Z", "2026-10-05T21:01:00Z", "2026-10-05T21:20:00Z"], lateNight, BUC) === 2)
  const monday = nextWeeklyDigest(Date.parse("2026-10-07T10:00:00Z"), BUC)
  check("the weekly digest is next Monday at 09:00 their time", monday.week === "2026-10-12" && new Date(monday.at).toISOString() === "2026-10-12T06:00:00.000Z")
  check("on a Monday before 09:00 it is that morning", nextWeeklyDigest(Date.parse("2026-10-12T04:00:00Z"), BUC).week === "2026-10-12" && nextWeeklyDigest(Date.parse("2026-10-12T07:00:00Z"), BUC).week === "2026-10-19")
  const qj = summaryJob({ userId: MARA, hold: "quiet" }, { ...emptyChoice(), quiet: night, tz: BUC }, lateNight)
  check("a quiet summary job: one per stretch, after it ends, covering it", qj?.payload.group === "z:quiet" && qj.key === `push_summary:${MARA}:quiet:2026-10-06T05:00:00.000Z` && qj.runAt === Date.parse("2026-10-06T05:01:00Z"))
  check("a daily summary job: one per person per their day", summaryJob({ userId: MARA, hold: "daily" }, { ...emptyChoice(), tz: BUC }, lateNight)?.key === `push_summary:${MARA}:daily:2026-10-06`)

  /* ── Who hears what ─────────────────────────────────────────────────── */
  console.log("\nPer event: the bell, the push, the email")
  check("an owner's post reaches Everything and the default level; a member's only Everything", JSON.stringify(postLevels(true)) === '["all","important"]' && JSON.stringify(postLevels(false)) === '["all"]' && levelAllowsPush("important", "admin_post") && !levelAllowsPush("important", "post") && levelAllowsPush("all", "post") && !levelAllowsPush("mentions", "admin_post"))
  check("an event you are going to that moved pushes at once; a new event waits its turn", pushPriority("event", `event_change:${EVENT}:moved:x:${MARA}`) === "now" && pushPriority("event", `event_new:${EVENT}:${MARA}`) === "coalesce" && pushPriority("course_available") === "coalesce")
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world())
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "mention", actorId: BEN, title: "Ben Ionescu mentioned you", body: "@mara look", url: "/community/film-loft/post/p1", dedupeKey: "mention:p1:mara" })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "reply", actorId: IOANA, title: "Ioana replied to you", body: "agreed", url: "/community/film-loft/post/p1", dedupeKey: "reply:c1:mara" })
    check("a mention and a reply: one bell row each and a push each, at once", db.tables.community_notifications.length === 2 && sent.length === 2 && sent.every((s) => s.userId === MARA))
    check("and no email for either", !(db.tables.notification_events ?? []).length)
    check("each push is counted for the day", db.tables.rate_limit_hits.filter((r) => r.bucket === PUSH_DAY_BUCKET && r.subject === MARA).length === 2)
  }
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [MARA]: "all" }))
    db.tables.community_reactions = [{ id: "r1", target_type: "post", target_id: POST, user_id: BEN, created_at: new Date().toISOString() }, { id: "r2", target_type: "post", target_id: POST, user_id: IOANA, created_at: new Date().toISOString() }]
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "reaction", actorId: BEN, target: { type: "post", id: POST }, title: "Ben Ionescu liked your post", url: "/community/film-loft/post/p1", dedupeKey: "x" })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "reaction", actorId: IOANA, target: { type: "post", id: POST }, title: "Ioana liked your post", url: "/community/film-loft/post/p1", dedupeKey: "y" })
    check("two likes are one bell row that says how many", db.tables.community_notifications.length === 1 && db.tables.community_notifications[0].title === "2 people liked your post")
    check("the first like pushes, the second waits for the five minute digest", sent.length === 1 && db.tables.community_jobs.some((j) => j.kind === "push_digest" && j.payload.group === `c:${C1}`))
  }
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [MARA]: "all", [BEN]: "important", [IOANA]: "mentions" }))
    db.tables.community_feed_posts.push({ id: POST, community_id: C1, space_id: SPACE, author_id: OWNER, title: "Workshop on Friday", body_text: "Bring a roll of film.", status: "published", created_at: new Date().toISOString() })
    await fanoutAnnouncement(db as any, job("fanout_announcement", { communityId: C1, postId: POST, actorId: OWNER, reason: "post", after: null }), ctx())
    const to = sent.map((s) => s.userId).sort()
    check("the owner's post pushes to Everything and the default level, not to mentions only, never the owner", JSON.stringify(to) === JSON.stringify([MARA, BEN, DAN].sort()), to)
    check("and writes no bell row and no email", db.tables.community_notifications.length === 0 && !(db.tables.notification_events ?? []).length)

    const sent2: Sent[] = []
    deps(sent2)
    const db2 = pg(world({ [MARA]: "all", [BEN]: "important" }))
    db2.tables.community_feed_posts.push({ id: POST, community_id: C1, space_id: SPACE, author_id: DAN, title: "My first roll", body_text: "", status: "published", created_at: new Date().toISOString() })
    await fanoutAnnouncement(db2 as any, job("fanout_announcement", { communityId: C1, postId: POST, actorId: DAN, reason: "post", after: null }), ctx())
    check("a member's post pushes only to members at Everything", JSON.stringify(sent2.map((s) => s.userId)) === JSON.stringify([MARA]), sent2.map((s) => s.userId))

    const sent3: Sent[] = []
    deps(sent3)
    const db3 = pg(world({ [MARA]: "all", [BEN]: "important" }), { [BEN]: meta({ pushOff: ["admin_posts"] }), [MARA]: meta({ communities: { [C1]: ["admin_posts"] } }) })
    db3.tables.community_feed_posts.push({ id: POST, community_id: C1, space_id: SPACE, author_id: OWNER, title: "Workshop", body_text: "", status: "published", created_at: new Date().toISOString() })
    await fanoutAnnouncement(db3 as any, job("fanout_announcement", { communityId: C1, postId: POST, actorId: OWNER, reason: "post", after: null }), ctx())
    check("turned off everywhere, or in this community alone: no push", !sent3.some((s) => s.userId === BEN || s.userId === MARA) && sent3.some((s) => s.userId === DAN))
  }
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world())
    db.tables.community_feed_posts.push({ id: POST, community_id: C1, space_id: SPACE, author_id: OWNER, title: "Big news", body_text: "We moved.", status: "published", created_at: new Date().toISOString() })
    await fanoutAnnouncement(db as any, job("fanout_announcement", { communityId: C1, postId: POST, actorId: OWNER, reason: "announcement", after: null }), ctx())
    check("an announcement: a bell row and a push for every member who hears it", db.tables.community_notifications.length === 4 && sent.length === 4)
    check("and never an email (it is not on the email list)", !(db.tables.notification_events ?? []).length && !emailAllowed("COMMUNITY_ANNOUNCEMENT"))
  }
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [IOANA]: "mentions" }))
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString()
    db.tables.community_events.push({ id: EVENT, community_id: C1, title: "Darkroom night", starts_at: start, ends_at: null, timezone: "UTC", status: "scheduled", access: {}, created_by: OWNER, location: "Studio", meeting_url: null, livestream_url: null })
    await fanoutEvent(db as any, job("fanout_event", { eventId: EVENT, communityId: C1 }), ctx())
    check("a new event: a bell row and a push for members who hear events, not the one who made it", db.tables.community_notifications.length === 3 && sent.length === 3 && !sent.some((s) => s.userId === OWNER || s.userId === IOANA))

    db.tables.community_event_rsvps.push({ event_id: EVENT, user_id: MARA, status: "going" }, { event_id: EVENT, user_id: BEN, status: "not_going" })
    const moved = new Date(Date.now() + 4 * 86_400_000).toISOString()
    db.tables.community_events[0].starts_at = moved
    await notifyEventChanged(db as any, { eventId: EVENT, communityId: C1, change: "moved", startsAt: moved, actorId: OWNER })
    await notifyEventChanged(db as any, { eventId: EVENT, communityId: C1, change: "moved", startsAt: moved, actorId: OWNER })
    const queued = db.tables.community_jobs.filter((j) => j.kind === "fanout_event")
    check("a move is queued once, however often it is saved", queued.length === 1)
    const before = sent.length
    await fanoutEvent(db as any, job("fanout_event", queued[0].payload), ctx())
    const told = sent.slice(before)
    check("a move: only the people going hear it, at once", told.length === 1 && told[0].userId === MARA && /Event moved: Darkroom night/.test(told[0].body), told)
    check("its title says what changed", eventChangeTitle("cancelled", "Darkroom night") === "Event cancelled: Darkroom night")
  }
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [IOANA]: "mentions", [DAN]: "none" }))
    db.tables.community_members.find((m) => m.user_id === BEN)!.level = 3
    db.tables.community_members.find((m) => m.user_id === MARA)!.level = 1
    await notifyProgramPublished(db as any, { communityId: C1, programId: "night-photo", title: "Night photography", url: "/community/film-loft/learn/night-photo", actorId: OWNER, access: { minLevel: 2 } })
    await notifyProgramPublished(db as any, { communityId: C1, programId: "night-photo", title: "Night photography", url: "/community/film-loft/learn/night-photo", actorId: OWNER, access: { minLevel: 2 } })
    const queued = db.tables.community_jobs.filter((j) => j.idempotency_key.startsWith("fanout_program:"))
    check("a program is queued once", queued.length === 1)
    await fanoutAnnouncement(db as any, job("fanout_announcement", queued[0].payload), ctx())
    const rows = db.tables.community_notifications
    check("a new program: a bell row and a push for the members it is open to who hear it", rows.length === 1 && rows[0].user_id === BEN && rows[0].kind === "course_available" && rows[0].title === "New program: Night photography" && sent.length === 1 && sent[0].userId === BEN, rows.map((r) => r.user_id))
    check("a lesson says which program", programTitle({ title: "Night photography", lessonTitle: "Long exposures", lessonId: "l1" }) === "New lesson in Night photography: Long exposures")
    check("a link outside the community tells nobody", programUrl("https://evil.example/x", "film-loft") === null && programUrl("/community/other/learn/x", "film-loft") === null && programUrl("/community/film-loft/learn/x", "film-loft") === "/community/film-loft/learn/x")
    check("and never an email", !(db.tables.notification_events ?? []).length && emailClass("COMMUNITY_COURSE_AVAILABLE") === "never")
  }

  /* ── Quiet hours and the cap, end to end ────────────────────────────── */
  console.log("\nQuiet hours: nothing pushes, one summary when they end")
  {
    const sent: Sent[] = []
    deps(sent)
    const m = clockAt(Date.now(), "UTC").minutes
    const quiet = { from: (m + 1440 - 60) % 1440, to: (m + 120) % 1440 }
    const db = pg(world({ [MARA]: "all" }), { [MARA]: meta({ quiet, tz: "UTC" }) })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "mention", actorId: BEN, title: "Ben mentioned you", url: "/community/film-loft/post/p1", dedupeKey: "m1" })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "comment", actorId: IOANA, title: "Ioana commented on your post", url: "/community/film-loft/post/p1", dedupeKey: "c1" })
    check("inside quiet hours nothing pushes, the bell still has both", sent.length === 0 && db.tables.community_notifications.length === 2)
    const summaries = db.tables.community_jobs.filter((j) => j.payload?.group === "z:quiet")
    check("one summary is queued, for when they end", summaries.length === 1 && Date.parse(summaries[0].run_at) > Date.now() + 100 * 60_000)
    const later = Date.parse(summaries[0].run_at) + 1000
    const out = await runPushDigest(db as any, summaries[0].payload, Date.now())
    check("run early (the person moved their hours), it waits for their end", !!out && typeof out === "object" && "again" in out && sent.length === 0)
    db.users[MARA].app_metadata = { [NOTIFY_META_KEY]: { tz: "UTC" } }
    setPushBridgeDeps({ sender: async (userId, p) => { sent.push({ userId, title: p.title, body: p.body, data: p.data ?? {} }) }, communitiesOn: async () => true, defer: (t) => t() })
    await runPushDigest(db as any, summaries[0].payload, later)
    check("when they end: one push, the community's name and what waited", sent.length === 1 && sent[0].title === "Film Loft" && sent[0].body === "While you were away: 1 mention and 1 new comment" && sent[0].data.url === "/community/film-loft/notifications", sent)
  }
  console.log("\nThe daily cap: low priority waits, addressed things go")
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [MARA]: "all" }), { [MARA]: meta({ tz: "UTC" }) })
    const today = new Date().toISOString()
    for (let i = 0; i < DAILY_PUSH_CAP; i++) db.tables.rate_limit_hits.push({ id: `h${i}`, bucket: PUSH_DAY_BUCKET, subject: MARA, created_at: today })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "comment", actorId: BEN, title: "Ben commented on your post", url: "/community/film-loft/post/p1", dedupeKey: "c2" })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "mention", actorId: BEN, title: "Ben mentioned you", url: "/community/film-loft/post/p2", dedupeKey: "m2" })
    check("past the cap the comment waits and the mention goes", sent.length === 1 && /mentioned/.test(sent[0].body))
    const daily = db.tables.community_jobs.filter((j) => j.payload?.group === "z:daily")
    check("one daily summary is queued", daily.length === 1)
    const sent2: Sent[] = []
    deps(sent2)
    await runPushDigest(db as any, daily[0].payload, Date.parse(daily[0].run_at) + 1000)
    check("the summary counts what waited and leaves out the mention that went", sent2.length === 1 && sent2[0].body === "Today so far: 1 new comment", sent2)
    check("a summary across communities says so", summaryContent([{ kind: "reaction", url: "/a", communityId: C1 }, { kind: "reaction", url: "/b", communityId: C1 }, { kind: "event", url: "/c", communityId: C2 }], new Map([[C1, { name: "Film Loft", slug: "film-loft" }], [C2, { name: "Clay Club", slug: "clay-club" }]]), "daily")?.title === "Your communities")
  }
  console.log("\nPer community kinds")
  {
    const sent: Sent[] = []
    deps(sent)
    const db = pg(world({ [MARA]: "all" }), { [MARA]: meta({ communities: { [C1]: ["comments"] } }) })
    await notifyMember(db as any, { userId: MARA, communityId: C1, kind: "comment", actorId: BEN, title: "Ben commented", url: "/community/film-loft/post/p1", dedupeKey: "c3" })
    await notifyMember(db as any, { userId: MARA, communityId: C2, kind: "comment", actorId: BEN, title: "Ben commented", url: "/community/clay-club/post/p1", dedupeKey: "c4" })
    check("comments off in Film Loft: the bell has both, only Clay Club's pushes", db.tables.community_notifications.length === 2 && sent.length === 1 && sent[0].title === "Clay Club")
  }

  /* ── The email budget ───────────────────────────────────────────────── */
  console.log("\nThe email list and the account's daily cap")
  check("every notification type is on the list", NOTIFICATION_TYPES.every((t) => ["essential", "budgeted", "never"].includes(EMAIL_POLICY[t])) && Object.keys(EMAIL_POLICY).length === NOTIFICATION_TYPES.length)
  check("money, memberships, cancellations, refunds and security are essential", ["MEMBERSHIP_STARTED", "MEMBERSHIP_PAYMENT_FAILED", "MEMBERSHIP_CANCELED", "CUSTOMER_REFUND_PROCESSED", "REFUND_CREATED", "PASSWORD_CHANGED", "EMAIL_CHANGED", "PAYOUT_FAILED", "COMMUNITY_WELCOME"].every((t) => emailClass(t) === "essential"))
  check("the report summary and the weekly digest are budgeted; announcements, reminders and programs are never emails", emailClass("COMMUNITY_REPORT_DIGEST") === "budgeted" && emailClass("COMMUNITY_WEEKLY_DIGEST") === "budgeted" && ["COMMUNITY_ANNOUNCEMENT", "COMMUNITY_EVENT_REMINDER", "COMMUNITY_COURSE_AVAILABLE"].every((t) => !emailAllowed(t)) && emailClass("SOMETHING_NEW") === "never")
  const ev = (name: DomainEvent["name"], payload: Record<string, unknown>): DomainEvent => ({ name, key: `${name}:k`, payload, occurredAt: "2026-10-01T09:00:00Z", userId: MARA, entityType: "community", entityId: C1 })
  check("the engine plans no job for an announcement or a reminder", handle(ev("community.announcement", { recipientEmail: "mara@example.com" }), { now: Date.now(), userId: MARA, creatorId: null }).jobs.length === 0 && handle(ev("community.event_reminder", { recipientEmail: "mara@example.com" }), { now: Date.now(), userId: MARA, creatorId: null }).jobs.length === 0)
  check("but plans the report summary and the weekly digest to the person", handle(ev("community.report_digest", { recipientEmail: "mara@example.com" }), { now: Date.now(), userId: MARA, creatorId: null }).jobs[0]?.type === "COMMUNITY_REPORT_DIGEST" && handle(ev("community.weekly_digest", { recipientEmail: "mara@example.com" }), { now: Date.now(), userId: MARA, creatorId: null }).jobs[0]?.recipientUserId === MARA)
  {
    const store = new MemoryNotifyStore()
    store.users.set(MARA, { email: "mara@example.com", name: "Mara" })
    const sentMail: OutgoingEmail[] = []
    const provider = { name: "fake", async send(e: OutgoingEmail): Promise<ChannelResult> { sentMail.push(e); return { status: "sent", providerMessageId: `<m${sentMail.length}@x>` } } }
    const engine: EngineDeps = {
      store,
      providerName: "fake",
      worker: "w1",
      now: () => store.clock.now,
      email: emailChannel({ provider, render: renderEmail, baseUrl: () => "https://storelib.com", unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`, preferencesUrl: () => "https://storelib.com/account/settings", messageDomain: "x" }),
      inApp: inAppChannel(store, { render: renderInApp, baseUrl: () => "https://storelib.com", now: () => store.clock.now }),
    }
    const communities = Array.from({ length: ACCOUNT_DAILY_EMAIL_CAP + 1 }, (_, i) => `00000000-0000-4000-b100-00000000000${i}`)
    for (const c of communities) {
      await store.insertEvent({ name: "community.report_digest", key: `rd:${c}`, userId: MARA, entityType: "community", entityId: c, payload: { recipientEmail: "mara@example.com", communityId: c, communityName: "Club", reportCount: 1, line1: "A post, reported as spam" }, occurredAt: new Date(store.clock.now).toISOString() })
    }
    await store.insertEvent({ name: "membership.payment_failed", key: "mpf", userId: MARA, entityType: "membership", entityId: "m1", payload: { buyerEmail: "mara@example.com", recipientEmail: "mara@example.com", membershipId: "m1", membershipTitle: "Film Loft", amountCents: 900, currency: "usd" }, occurredAt: new Date(store.clock.now).toISOString() })
    await runWork(engine, 10_000)
    const digests = sentMail.filter((m) => m.tags?.includes("COMMUNITY_REPORT_DIGEST"))
    const capped = store.jobs.filter((j) => j.type === "COMMUNITY_REPORT_DIGEST" && j.skip_reason === "DAILY_CAP")
    check(`at most ${ACCOUNT_DAILY_EMAIL_CAP} budgeted emails an account a day; the rest wait in the bell`, digests.length === ACCOUNT_DAILY_EMAIL_CAP && capped.length === 1, { digests: digests.length, capped: capped.length })
    const essential = store.jobs.filter((j) => j.type === "MEMBERSHIP_PAYMENT_FAILED")
    check("an essential email still goes past the cap", essential.length === 0 || essential.every((j) => j.state === "sent"), essential.map((j) => j.state))
    check("BUDGETED_TYPES is what the cap counts", BUDGETED_TYPES.includes("COMMUNITY_REPORT_DIGEST") && !BUDGETED_TYPES.includes("MEMBERSHIP_PAYMENT_FAILED"))
    const s2 = new MemoryNotifyStore()
    s2.users.set(MARA, { email: "mara@example.com", name: "Mara" })
    await s2.insertJobs([{ type: "COMMUNITY_ANNOUNCEMENT", recipientType: "customer", recipientUserId: null, recipientEmail: "mara@example.com", creatorId: null, entityType: "community", entityId: C1, idempotencyKey: "a1", step: null, workflow: null, runAt: new Date(s2.clock.now).toISOString(), expiresAt: null, data: {}, condition: null, maxAttempts: 5 } as any])
    await runWork({ ...engine, store: s2, now: () => s2.clock.now, inApp: null }, 10_000)
    check("an announcement job left from before is skipped as not an email", s2.jobs[0]?.state === "skipped" && s2.jobs[0]?.skip_reason === "EMAIL_BUDGET", s2.jobs[0])
  }
  check("the weekly digest has a registry entry and its template keys", REGISTRY.COMMUNITY_WEEKLY_DIGEST?.category === "tips" && DATA_KEYS.COMMUNITY_WEEKLY_DIGEST.includes("c1Line"))
  const weekly = renderEmail("COMMUNITY_WEEKLY_DIGEST", { weekOf: "2026-10-12", c1Name: "Film Loft", c1Slug: "film-loft", c1Line: "12 new posts and 2 events coming up", c1Top: "Fog at dawn", c2Name: "Clay Club", c2Slug: "clay-club", c2Line: "3 new posts" }, { baseUrl: "https://storelib.com", recipientName: "Mara" } as any)
  check("the weekly email names each community and its week", /This week in your communities/.test(weekly.subject) && /Film Loft: 12 new posts and 2 events coming up/.test(weekly.text) && /Most liked: "Fog at dawn"/.test(weekly.text) && /\/community\/film-loft/.test(weekly.html), weekly.subject)

  /* ── The weekly digest job ──────────────────────────────────────────── */
  console.log("\nThe weekly digest")
  check("its line and its data: busiest first, quiet ones left out", weekLine({ posts: 1, events: 0 }) === "1 new post" && weekLine({ posts: 3, events: 2 }) === "3 new posts and 2 events coming up" && weeklyData([{ name: "A", slug: "a", posts: 1, events: 0, top: null }, { name: "B", slug: "b", posts: 5, events: 1, top: "x" }, { name: "C", slug: "c", posts: 0, events: 0, top: null }], "2026-10-12")?.c1Name === "B" && weeklyData([{ name: "C", slug: "c", posts: 0, events: 0, top: null }], "w") === null)
  {
    const db = pg(world(), { [MARA]: { email: "mara@example.com", ...meta({ emailOn: ["weekly_digest"], tz: BUC }) }, [BEN]: { email: "ben@example.com" } })
    await scheduleWeeklyDigest(db as any, MARA, BUC)
    await scheduleWeeklyDigest(db as any, MARA, BUC)
    const w = db.tables.community_jobs.filter((j) => j.payload?.weekly === true)
    check("turning it on queues the coming Monday's, once", w.length === 1 && /^weekly_digest:/.test(w[0].idempotency_key))
    db.tables.community_feed_posts.push({ id: POST, community_id: C1, space_id: SPACE, author_id: OWNER, title: "Fog at dawn", body_text: "", status: "published", reaction_count: 7, created_at: new Date().toISOString() })
    /* The test was stale against the clock: it ran a fixed week ("2026-10-12") at the real Date.now(), so from 13 October the next week it queued was the one already queued above. It runs the week that was queued instead, as the cron does. */
    const queuedWeek = String(w[0]?.payload?.week ?? "")
    const out = await runWeeklyDigest(db as any, { weekly: true, userId: MARA, week: queuedWeek }, Date.now(), { enabled: true })
    const evs = db.tables.notification_events ?? []
    check("it sends one email through the engine with the week's figures", out === "sent" && evs.length === 1 && evs[0].name === "community.weekly_digest" && evs[0].payload.c1Name === "Film Loft" && evs[0].payload.c1Line === "1 new post" && evs[0].payload.c1Top === "Fog at dawn", { out, evs })
    check("and queues the next week", db.tables.community_jobs.filter((j) => j.payload?.weekly === true).length === 2)
    check("not asked for: nothing", (await runWeeklyDigest(db as any, { weekly: true, userId: BEN, week: "2026-10-12" }, Date.now(), { enabled: true })) === "not_asked")
    db.tables.notification_preferences.push({ user_id: MARA, category: "tips", channel: "email", enabled: false })
    check("the unsubscribe link ends it", (await runWeeklyDigest(db as any, { weekly: true, userId: MARA, week: "2026-10-19" }, Date.now(), { enabled: true })) === "unsubscribed")
  }

  /* ── Settings, the route and the prompt ─────────────────────────────── */
  console.log("\nSettings, the route and the prompt")
  const route = code("app/api/me/push/route.ts")
  check("GET answers the kinds, emails, quiet hours, zone and communities", /kinds: kindStates\(choice\), emails: emailStates\(choice\), moderates, quiet: choice\.quiet, tz: choice\.tz, communities/.test(route))
  check("communities are only listed while communities are on", /const communities = on \? await myCommunities/.test(route))
  check("turning the weekly digest on queues it and turns its email category back on", /setPreference\(db, userId, "tips", "email", true, "settings"\)/.test(route) && /scheduleWeeklyDigest\(db, userId, next\.tz\)/.test(route))
  const settings = code("components/account/notification-settings.tsx")
  check("Settings turns this browser on and off with the web push client", /enableWebPush\(\)/.test(settings) && /disableWebPush\(\)/.test(settings) && /readWebPush\(\)/.test(settings))
  check("the web push client subscribes with POST and forgets with DELETE", /method: "POST"/.test(code("lib/push/web-client.ts")) && /method: "DELETE"/.test(code("lib/push/web-client.ts")))
  check("a community's level saves through its own route, its kinds through /api/me/push", /\/api\/community\/\$\{encodeURIComponent\(c\.id\)\}\/me/.test(settings) && /community: \{ id: communityId, push: \{ \[kind\]: v \} \}/.test(settings))
  check("the browser's zone is saved quietly when it differs", /zone !== v\.tz\) void saveKinds\(\{ tz: zone \}\)/.test(settings))
  const now = Date.now()
  check("the prompt: only a recent member, an unanswered browser that can, not snoozed", promptAllowed({ supported: true, permission: "default", joinedAt: new Date(now - 86_400_000).toISOString(), snoozedAt: null, now }) && !promptAllowed({ supported: false, permission: "default", joinedAt: new Date(now).toISOString(), snoozedAt: null, now }) && !promptAllowed({ supported: true, permission: "denied", joinedAt: new Date(now).toISOString(), snoozedAt: null, now }) && !promptAllowed({ supported: true, permission: "granted", joinedAt: new Date(now).toISOString(), snoozedAt: null, now }) && !promptAllowed({ supported: true, permission: "default", joinedAt: new Date(now - (RECENT_DAYS + 1) * 86_400_000).toISOString(), snoozedAt: null, now }) && !promptAllowed({ supported: true, permission: "default", joinedAt: new Date(now).toISOString(), snoozedAt: now - 86_400_000, now }) && promptAllowed({ supported: true, permission: "default", joinedAt: new Date(now).toISOString(), snoozedAt: now - (SNOOZE_DAYS + 1) * 86_400_000, now }))
  const prompt = code("components/notifications/web-push-prompt.tsx")
  check("the prompt asks the browser only from the Turn on tap", /onClick=\{\(\) => void turnOn\(\)\}/.test(prompt) && !/useEffect\([^)]*enableWebPush/.test(prompt) && (prompt.match(/enableWebPush\(/g) ?? []).length === 1)
  for (const f of ["components/account/notification-settings.tsx", "components/notifications/web-push-prompt.tsx"]) {
    const src = read(f)
    check(`${f} is a client module with no server imports`, src.startsWith('"use client"') && !/from "(next\/headers|server-only|@\/lib\/communities\/server[^"]*|@\/lib\/notifications\/push-bridge)"/.test(src))
  }
  for (const f of ["lib/notifications/push-kinds.ts", "lib/notifications/push-budget.ts", "lib/notify/email-budget.ts"]) {
    check(`${f} stays pure (Settings imports it)`, !/^import .*from "(server-only|next\/|@\/lib\/supabase)/m.test(read(f)) && !/^import "server-only"/m.test(read(f)))
  }
  const banned = /—|\b(unlock|elevate|seamless|powerful|effortless|effortlessly|supercharge|transform)\b/i
  for (const f of ["components/account/notification-settings.tsx", "components/notifications/web-push-prompt.tsx", "lib/notifications/push-kinds.ts", "lib/notifications/push-budget.ts", "lib/notifications/push-bridge.ts", "lib/notify/email-budget.ts", "lib/communities/server/jobs/fanout_program.ts", "lib/communities/server/jobs/weekly_digest.ts", "lib/communities/server/jobs/fanout_event.ts", "app/api/me/push/route.ts"]) {
    check(`${f}: no em dashes, none of the banned words`, !banned.test(read(f)), (read(f).match(banned) ?? [])[0])
  }

  setPushBridgeDeps(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:\n" + failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
