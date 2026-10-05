/**
 * ===========================================================================
 *  COMMUNITIES: THE CLASSROOM, VIDEOS AND EVENTS
 * ===========================================================================
 * Held from their inputs and against an in memory database:
 *
 *   CLASSROOM   the cards (lessons, real progress, locks in words), drip
 *               days, and the community grant the course player asks:
 *               yes for a member the rule lets in, no for another
 *               community's member, an expired member, a locked tier, a drip
 *               day not reached, a suspended community, the switch off.
 *   BUYERS      a buyer is answered from their purchase without the
 *               community being asked; nothing about a normal course changes.
 *   POINTS      finishing an attached course gives course_completed once.
 *   VIDEO       uploads checked before and after, the storage path rule,
 *               who may watch (cover, post, space, replay, staff, another
 *               community's video), providers not connected without keys,
 *               signed webhooks, each event applied once.
 *   EVENTS      lists and cursors, the 15 minute join window, capacity and
 *               the waitlist through community_rsvp, reminders queued once,
 *               reminder and fan out jobs, .ics and Google links.
 *   ROUTES      every route checks the switch first, then the member or the
 *               creator, and limits its writes; pages check for themselves.
 *   COPY        no em dash and no banned word anywhere in this work.
 *
 * Run with:  npm run test:push
 */
import { createHmac } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { memDb, serveStorage, type MemDb } from "./_classroom-db"
import { stripComments } from "./_source"
import { communityGrantsCourse, courseDenial, dripOpensAt, listClassroom, lockFor, onCourseProgress } from "@/lib/communities/server/classroom"
import { ownsProduct, productAccess, syncEnrollment } from "@/lib/courses/server"
import { lessonsLabel, opensOnLabel } from "@/components/community/classroom/model"
import {
  applyVideoWebhook,
  completeVideoUpload,
  mergeVideoPatch,
  prepareVideoUpload,
  readCommunityVideo,
  videoAccess,
  videoPlayback,
} from "@/lib/communities/server/videos"
import { activeProvider, hmacMatches, providerStates } from "@/lib/video/provider"
import { isCommunityMediaPath } from "@/lib/video/storage"
import { muxAdapter } from "@/lib/video/mux"
import { cloudflareAdapter } from "@/lib/video/cloudflare"
import { bunnyAdapter } from "@/lib/video/bunny"
import { MEMBER_VIDEO_MAX_BYTES, cleanDuration, videoClock } from "@/lib/video/types"
import { answerEvent, decodeEventCursor, encodeEventCursor, ensureReminders, eventDetail, listEvents, safeUrl } from "@/lib/communities/server/events"
import { alreadySent, eventReminder } from "@/lib/communities/server/jobs/event_reminder"
import { fanoutEvent } from "@/lib/communities/server/jobs/fanout_event"
import { JOB_HANDLERS } from "@/lib/communities/server/jobs/index"
import { JOIN_OPENS_MS, eventIcs, googleCalendarUrl, isOver, joinWindowOpen, monthGrid, monthRange } from "@/components/community/events/model"
import type { Viewer } from "@/lib/communities/server/context"
import type { CommunityRow, JobRow, MemberRow, Role } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const A = id(1) /* community A */
const B = id(2) /* community B */
const CREATOR = id(10)
const OWNER = id(11)
const ALICE = id(20) /* member of A, free tier */
const BOB = id(21) /* member of B only */
const CARL = id(22) /* expired member of A */
const DANA = id(23) /* moderator of A */
const ERIN = id(24) /* member of A on the Pro tier */
const BUYER = id(25) /* bought the course, in no community */
const COURSE = id(30)
const PRO_COURSE = id(31)
const DRIP_COURSE = id(32)
const LEVEL_COURSE = id(33)
const PLAIN_COURSE = id(34) /* not attached anywhere */
const FREE_TIER = id(40)
const PRO_TIER = id(41)
const NOW = Date.parse("2026-10-03T12:00:00Z")
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString()

function community(over: Partial<CommunityRow> = {}): CommunityRow {
  return {
    id: A, creator_id: CREATOR, owner_user_id: OWNER, slug: "makers", name: "Makers", tagline: null, description: null, logo_url: null, cover_url: null, cover_video_id: null,
    visibility: "public", access: "free", status: "published", category: null, language: "en", member_count: 4, post_count: 0, discovery_enabled: true, approval_required: false,
    default_role: "member", directory_enabled: true, classroom_enabled: true, events_enabled: true, chat_enabled: true, gamification_enabled: true, rules: [], faq: [], benefits: [], links: [],
    onboarding: {}, seo_title: null, seo_description: null, trending_score: 0, trending_at: null, platform_hidden: false, suspended_at: null, suspended_reason: null, archived_at: null,
    deleted_at: null, created_at: iso(NOW - 90 * DAY), updated_at: iso(NOW), ...over,
  }
}

function member(communityId: string, userId: string, over: Partial<MemberRow> = {}): MemberRow {
  return {
    id: `${communityId.slice(-4)}${userId.slice(-8)}`, community_id: communityId, user_id: userId, status: "active", role: "member", tier_id: FREE_TIER, source: "free",
    source_membership_id: null, source_product_id: null, source_order_id: null, invite_id: null, invited_by: null, request_note: null, requested_at: null, approved_by: null,
    joined_at: iso(NOW - 10 * DAY), last_active_at: null, expires_at: null, points: 0, level: 1, muted_until: null, ban_reason: null, banned_at: null, banned_by: null, removed_at: null,
    notify_level: "important", email_announcements: true, email_events: true, onboarded_at: null, bio: null, created_at: iso(NOW - 10 * DAY), updated_at: iso(NOW), ...over,
  }
}

function viewer(m: MemberRow | null, over: Partial<Viewer> = {}): Viewer {
  const active = m?.status === "active"
  return {
    userId: m?.user_id ?? null, member: m, role: active ? (m?.role as Role) : null, active, status: m?.status ?? null, tierId: m?.tier_id ?? null, ownedProductIds: [], level: m?.level ?? 1,
    points: m?.points ?? 0, isOwner: false, isCreatorAccount: false, banned: false, mutedUntil: null, ...over,
  }
}

const rsvpRpc = (args: Record<string, any>, db: MemDb) => {
  const events = db.tables.community_events
  const e = events.find((x) => x.id === args.p_event)
  if (!e) return { data: null, error: { code: "P0002", message: "no event" } }
  const rsvps = (db.tables.community_event_rsvps ??= [])
  const mine = rsvps.find((r) => r.event_id === args.p_event && r.user_id === args.p_user)
  const recount = () => (e.going_count = rsvps.filter((r) => r.event_id === e.id && r.status === "going").length)
  if (!args.p_going) {
    if (!mine || mine.status === "cancelled") return { data: "cancelled", error: null }
    const was = mine.status
    mine.status = "cancelled"
    mine.updated_at = new Date().toISOString()
    if (was === "going" && e.capacity && e.status === "scheduled") {
      const first = rsvps.filter((r) => r.event_id === e.id && r.status === "waitlist").sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))[0]
      if (first) first.status = "going"
    }
    recount()
    return { data: "cancelled", error: null }
  }
  if (e.status !== "scheduled") return { data: mine && mine.status !== "cancelled" ? mine.status : "cancelled", error: null }
  if (mine && (mine.status === "going" || mine.status === "waitlist")) return { data: mine.status, error: null }
  const going = rsvps.filter((r) => r.event_id === e.id && r.status === "going").length
  const status = !e.capacity || going < e.capacity ? "going" : "waitlist"
  if (mine) Object.assign(mine, { status, updated_at: new Date().toISOString() })
  else rsvps.push({ event_id: e.id, user_id: args.p_user, community_id: e.community_id, status, created_at: new Date().toISOString(), updated_at: new Date(Date.now() + rsvps.length).toISOString() })
  recount()
  return { data: status, error: null }
}

const pointsRpc = (args: Record<string, any>, db: MemDb) => {
  const rows = (db.tables.community_point_events ??= [])
  if (rows.some((r) => r.community_id === args.p_community && r.user_id === args.p_user && r.source_key === args.p_source_key)) return { data: false, error: null }
  rows.push({ community_id: args.p_community, user_id: args.p_user, points: args.p_points, reason: args.p_reason, source_key: args.p_source_key })
  const m = db.tables.community_members.find((x) => x.community_id === args.p_community && x.user_id === args.p_user)
  if (m) m.points += args.p_points
  return { data: true, error: null }
}

function classroomDb(extra: Record<string, any[]> = {}) {
  return memDb(
    {
      communities: [community(), community({ id: B, slug: "other", name: "Other", creator_id: id(12), owner_user_id: id(13) })],
      community_members: [
        member(A, ALICE),
        member(B, BOB),
        member(A, CARL, { status: "expired" }),
        member(A, DANA, { role: "moderator" }),
        member(A, ERIN, { tier_id: PRO_TIER, level: 3 }),
      ],
      community_tiers: [
        { id: FREE_TIER, community_id: A, name: "Members" },
        { id: PRO_TIER, community_id: A, name: "Pro" },
      ],
      community_courses: [
        { community_id: A, product_id: COURSE, position: 0, access: {}, drip_days: null, added_at: iso(NOW - 30 * DAY) },
        { community_id: A, product_id: PRO_COURSE, position: 1, access: { tierIds: [PRO_TIER] }, drip_days: null, added_at: iso(NOW - 30 * DAY) },
        { community_id: A, product_id: DRIP_COURSE, position: 2, access: {}, drip_days: 21, added_at: iso(NOW - 30 * DAY) },
        { community_id: A, product_id: LEVEL_COURSE, position: 3, access: { minLevel: 3 }, drip_days: null, added_at: iso(NOW - 30 * DAY) },
      ],
      products: [COURSE, PRO_COURSE, DRIP_COURSE, LEVEL_COURSE, PLAIN_COURSE].map((p, i) => ({ id: p, title: `Course ${i + 1}`, slug: `course-${i + 1}`, status: "published", type: "course", creator_id: CREATOR, thumbnail_url: `https://img.test/${i}.jpg` })),
      creators: [{ id: CREATOR, user_id: OWNER, slug: "maker", display_name: "Maker", subscription_plan_id: "pro" }],
      courses: [{ id: id(50), product_id: COURSE }, { id: id(51), product_id: PRO_COURSE }, { id: id(52), product_id: DRIP_COURSE }, { id: id(53), product_id: LEVEL_COURSE }, { id: id(54), product_id: PLAIN_COURSE }],
      course_modules: [{ id: id(60), course_id: id(50), position: 0 }, { id: id(61), course_id: id(51), position: 0 }, { id: id(64), course_id: id(54), position: 0 }],
      course_lessons: [
        { id: id(70), module_id: id(60), position: 0, duration_seconds: 600, title: "One" },
        { id: id(71), module_id: id(60), position: 1, duration_seconds: 300, title: "Two" },
        { id: id(72), module_id: id(60), position: 2, duration_seconds: null, title: "Three" },
        { id: id(73), module_id: id(61), position: 0, duration_seconds: 120, title: "Pro one" },
        { id: id(74), module_id: id(64), position: 0, duration_seconds: 60, title: "Plain one" },
      ],
      course_enrollments: [{ buyer_id: ALICE, course_id: id(50), product_id: COURSE, percent: 33, completed_lessons: 1, completed_at: null, last_lesson_id: id(71) }],
      entitlements: [{ id: id(80), buyer_id: BUYER, product_id: PLAIN_COURSE }],
      orders: [{ id: id(81), buyer_id: BUYER, product_id: COURSE, status: "completed" }],
      ...extra,
    },
    { rpc: { community_award_points: pointsRpc, community_rsvp: rsvpRpc, get_creator_storage_usage: () => ({ data: 0, error: null }) } },
  )
}

async function main() {
  /* ── Classroom: pure rules ───────────────────────────────────────────── */
  console.log("\nClassroom rules")
  check("no drip days: open at once", dripOpensAt(iso(NOW), null) === null && dripOpensAt(iso(NOW), 0) === null)
  check("drip opens the given days after joining", dripOpensAt("2026-10-01T00:00:00.000Z", 21) === "2026-10-22T00:00:00.000Z")
  const lv = (over: Partial<{ role: Role | null; tierId: string | null; level: number; joinedAt: string | null; active: boolean }> = {}) => ({ role: "member" as Role | null, active: true, tierId: FREE_TIER, ownedProductIds: [], level: 1, joinedAt: iso(NOW - 10 * DAY), ...over })
  check("an open course is open to an active member", courseDenial({ access: {}, dripDays: null }, lv(), NOW) === null)
  check("a tier course is locked for another tier, with the tier named", courseDenial({ access: { tierIds: [PRO_TIER] }, dripDays: null }, lv(), NOW)?.reason === "tier")
  check("a level course is locked below the level", courseDenial({ access: { minLevel: 3 }, dripDays: null }, lv(), NOW)?.reason === "level" && courseDenial({ access: { minLevel: 3 }, dripDays: null }, lv({ level: 3 }), NOW) === null)
  check("a drip course is locked until its day, then open", courseDenial({ access: {}, dripDays: 21 }, lv(), NOW)?.reason === "drip" && courseDenial({ access: {}, dripDays: 5 }, lv(), NOW) === null)
  check("staff are held by neither rule nor drip", courseDenial({ access: { tierIds: [PRO_TIER] }, dripDays: 365 }, lv({ role: "moderator" }), NOW) === null)
  check("a visitor is never let in", courseDenial({ access: {}, dripDays: null }, lv({ role: null, active: false }), NOW)?.reason === "not_member")
  const names = { tier: new Map([[PRO_TIER, "Pro"]]), product: new Map([[COURSE, "The Course"]]) }
  check('a tier lock reads "Pro members"', lockFor({ reason: "tier", need: PRO_TIER }, names).label === "Pro members")
  check('a tier already called "Members" is not "Members members"', lockFor({ reason: "tier", need: "x" }, { tier: new Map([["x", "Inner circle members"]]), product: new Map() }).label === "Inner circle members")
  check('a level lock reads "Level 3"', lockFor({ reason: "level", need: "3" }, names).label === "Level 3")
  check('a drip lock reads "Opens on Oct 22"', lockFor({ reason: "drip", opensAt: "2026-10-22T12:00:00.000Z" }, names, "UTC").label === "Opens on Oct 22")
  check('a product lock names the product', lockFor({ reason: "product", need: COURSE }, names).label === "Owners of The Course")
  check("lessons read naturally", lessonsLabel(0) === "No lessons yet" && lessonsLabel(1) === "1 lesson" && lessonsLabel(12) === "12 lessons")
  check("the drip date is in the viewer's zone", opensOnLabel("2026-10-22T02:00:00.000Z", "America/Los_Angeles") === "Opens on Oct 21")

  /* ── Classroom: the cards ────────────────────────────────────────────── */
  console.log("\nClassroom cards")
  {
    const db = classroomDb()
    const alice = viewer(db.tables.community_members.find((m) => m.user_id === ALICE) as MemberRow)
    const cards = await listClassroom(db, community(), alice, { now: NOW, timeZone: "UTC" })
    const by = (p: string) => cards.find((c) => c.productId === p)!
    check("every attached course is on the shelf, in the creator's order", cards.map((c) => c.productId).join() === [COURSE, PRO_COURSE, DRIP_COURSE, LEVEL_COURSE].join(), cards.map((c) => c.title))
    check("a course not attached is not there", !cards.some((c) => c.productId === PLAIN_COURSE))
    check("lessons are counted from the course's own lessons", by(COURSE).lessons === 3 && by(PRO_COURSE).lessons === 1 && by(DRIP_COURSE).lessons === 0)
    check("progress is the member's own course row", by(COURSE).percent === 33 && by(COURSE).completedLessons === 1 && by(COURSE).status === "in_progress")
    check("a course they have not started is 0%", by(PRO_COURSE).percent === 0 && by(PRO_COURSE).status === "not_started")
    check("an in progress course opens on their last lesson", by(COURSE).href === `/community/makers/learn/${COURSE}?lesson=${id(71)}`)
    check("the Pro course is locked for a free member, in words", by(PRO_COURSE).locked?.label === "Pro members", by(PRO_COURSE).locked)
    check("the drip course says when it opens", by(DRIP_COURSE).locked?.reason === "drip" && by(DRIP_COURSE).locked?.label === "Opens on Oct 14", by(DRIP_COURSE).locked)
    check("the level course says the level", by(LEVEL_COURSE).locked?.label === "Level 3")
    check("the total length is the lessons' lengths", by(COURSE).totalSeconds === 900)
    const erin = viewer(db.tables.community_members.find((m) => m.user_id === ERIN) as MemberRow)
    const erinCards = await listClassroom(db, community(), erin, { now: NOW })
    check("a Pro member at level 3 has the Pro and level courses open", !erinCards.find((c) => c.productId === PRO_COURSE)?.locked && !erinCards.find((c) => c.productId === LEVEL_COURSE)?.locked)
    const reads = db.log.filter((l) => l.op === "select").length
    check("the shelf is a fixed handful of reads, not one per course", reads <= 2 * 12, reads)
  }

  /* ── The community grant, and buyers ─────────────────────────────────── */
  console.log("\nThe community grant")
  {
    const db = classroomDb()
    check("an active member gets an open attached course", await communityGrantsCourse(db, ALICE, COURSE, { enabled: true, now: NOW }))
    check("CROSS COMMUNITY: a member of another community gets nothing", !(await communityGrantsCourse(db, BOB, COURSE, { enabled: true, now: NOW })))
    check("an expired member gets nothing", !(await communityGrantsCourse(db, CARL, COURSE, { enabled: true, now: NOW })))
    check("a free member does not get the Pro course", !(await communityGrantsCourse(db, ALICE, PRO_COURSE, { enabled: true, now: NOW })))
    check("a Pro member does", await communityGrantsCourse(db, ERIN, PRO_COURSE, { enabled: true, now: NOW }))
    check("a drip course before its day: no", !(await communityGrantsCourse(db, ALICE, DRIP_COURSE, { enabled: true, now: NOW })))
    check("a drip course on its day: yes", await communityGrantsCourse(db, ALICE, DRIP_COURSE, { enabled: true, now: NOW + 12 * DAY }))
    check("a moderator is not held by the rule", await communityGrantsCourse(db, DANA, PRO_COURSE, { enabled: true, now: NOW }))
    check("a course attached nowhere: no", !(await communityGrantsCourse(db, ALICE, PLAIN_COURSE, { enabled: true, now: NOW })))
    check("communities switched off: no", !(await communityGrantsCourse(db, ALICE, COURSE, { enabled: false, now: NOW })))
    db.tables.communities[0].suspended_at = iso(NOW)
    check("a suspended community: no", !(await communityGrantsCourse(db, ALICE, COURSE, { enabled: true, now: NOW })))
    const broken = memDb({}, { failWith: { community_courses: { code: "42P01", message: "relation does not exist" } } })
    check("before part 81 (no table): no, and no throw", !(await communityGrantsCourse(broken, ALICE, COURSE, { enabled: true })))
  }
  {
    const db = classroomDb()
    check("BUYERS: an entitlement owns the course", await ownsProduct(db as never, BUYER, PLAIN_COURSE))
    check("BUYERS: a completed order owns the course", await ownsProduct(db as never, BUYER, COURSE))
    check("BUYERS: a buyer is answered without the community being asked", !db.log.some((l) => l.table.startsWith("community_")), db.log.map((l) => l.table))
    check("BUYERS: a buyer is an owner to the player", (await productAccess(db as never, BUYER, PLAIN_COURSE)).level === "owner")
    check("BUYERS: the creator is still the creator", (await productAccess(db as never, OWNER, COURSE)).level === "creator")
    check("a stranger to a published course is still a visitor", (await productAccess(db as never, id(99), PLAIN_COURSE)).level === "public")
    /* In the suite the switch reads as off (no database to read it from): the grant must then say no. */
    check("with the switch unreadable, a member is not let in through the player", !(await ownsProduct(db as never, ALICE, COURSE)))
    const ownsSrc = code("lib/courses/server.ts")
    check("ownsProduct asks the community only after the purchase checks", /if \(\(\(ent\.data[\s\S]*?return true\s*\n\s*return communityGrant\(db, userId, productId\)/.test(ownsSrc))
    check("the grant is loaded on demand and can never throw into the player", /await import\("@\/lib\/communities\/server\/classroom"\)[\s\S]*?catch \{\s*return false/.test(ownsSrc))
    const before = JSON.stringify(db.tables.community_point_events ?? [])
    await syncEnrollment(db as never, { userId: BUYER, courseId: id(54), productId: PLAIN_COURSE, outline: [{ id: id(64), title: "M", lessons: [{ id: id(74), moduleId: id(64), title: "Plain one", durationSeconds: 60, isPreview: false, kind: "text" }] }], activity: true })
    check("BUYERS: finishing a course outside any community writes nothing to communities", JSON.stringify(db.tables.community_point_events ?? []) === before && !db.log.some((l) => l.op !== "select" && l.table.startsWith("community_")))
  }

  /* ── Points for finishing ────────────────────────────────────────────── */
  console.log("\nFinishing a course")
  {
    const db = classroomDb()
    const first = await onCourseProgress(db, { userId: ALICE, productId: COURSE, lessonsBefore: 2, lessonsNow: 3, finished: true }, { enabled: true })
    check("finishing an attached course gives course_completed once", first.awarded === 1 && (db.tables.community_point_events ?? []).filter((p) => p.source_key === `course:${COURSE}` && p.reason === "course_completed").length === 1)
    check("the points land on the member", db.tables.community_members.find((m) => m.user_id === ALICE)!.points === 10)
    check("the finish and the lesson are activity", (db.tables.community_activity ?? []).some((a) => a.kind === "course_completed") && (db.tables.community_activity ?? []).some((a) => a.kind === "lesson_completed"))
    const again = await onCourseProgress(db, { userId: ALICE, productId: COURSE, lessonsBefore: 2, lessonsNow: 3, finished: true }, { enabled: true })
    check("finishing again gives nothing more", again.awarded === 0 && db.tables.community_members.find((m) => m.user_id === ALICE)!.points === 10)
    const bob = await onCourseProgress(db, { userId: BOB, productId: COURSE, lessonsBefore: 0, lessonsNow: 1, finished: true }, { enabled: true })
    check("a member of another community gets nothing here", bob.communities === 0 && bob.awarded === 0)
    const off = await onCourseProgress(db, { userId: ERIN, productId: COURSE, lessonsBefore: 0, lessonsNow: 1, finished: true }, { enabled: false })
    check("switched off: nothing", off.awarded === 0)
  }

  /* ── Video: rules and providers ──────────────────────────────────────── */
  console.log("\nVideo rules")
  const VID = id(90)
  check("a stored path is the creator's, in the community folder, in the video's own folder", isCommunityMediaPath(`${CREATOR}/community-media/${VID}/1-abc.mp4`, CREATOR, VID))
  check("another creator's path is refused", !isCommunityMediaPath(`${id(12)}/community-media/${VID}/1-abc.mp4`, CREATOR, VID))
  check("another video's folder is refused", !isCommunityMediaPath(`${CREATOR}/community-media/${id(91)}/1-abc.mp4`, CREATOR, VID))
  check("climbing out is refused", !isCommunityMediaPath(`${CREATOR}/community-media/${VID}/../x.mp4`, CREATOR, VID) && !isCommunityMediaPath(`${CREATOR}/course-media/${VID}/1-abc.mp4`, CREATOR, VID))
  check("a length from the browser is kept only when it makes sense", cleanDuration(61.4) === 61 && cleanDuration(-1) === null && cleanDuration(90_000) === null && cleanDuration("x") === null)
  check("video clock", videoClock(65) === "1:05" && videoClock(3729) === "1:02:09")
  check("storage is the default", activeProvider({}) === "storage")
  check("a service named without its keys is not used: storage instead", activeProvider({ VIDEO_PROVIDER: "mux" }) === "storage")
  const muxEnv = { VIDEO_PROVIDER: "mux", MUX_TOKEN_ID: "i", MUX_TOKEN_SECRET: "s", MUX_WEBHOOK_SECRET: "whsec", MUX_SIGNING_KEY_ID: "k", MUX_SIGNING_KEY: "p" }
  check("a service with its keys is used", activeProvider(muxEnv) === "mux")
  const states = providerStates({ VIDEO_PROVIDER: "bunny", BUNNY_STREAM_API_KEY: "secret-value" })
  check("not connected services say which keys they need, by name", states.find((s) => s.name === "bunny")!.connected === false && states.find((s) => s.name === "bunny")!.missing.includes("BUNNY_STREAM_LIBRARY_ID"))
  check("no key's value is ever in the states", !JSON.stringify(states).includes("secret-value"))
  check("storage is connected and active when nothing else is", states.find((s) => s.name === "storage")!.connected && states.find((s) => s.name === "storage")!.active)
  check("hmac compares in constant time and refuses junk", hmacMatches("k", "m", createHmac("sha256", "k").update("m").digest("hex")) && !hmacMatches("k", "m", "zz") && !hmacMatches("", "m", "00"))

  console.log("\nVideo webhooks are signed")
  {
    const t = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ id: "evt_1", type: "video.asset.ready", data: { id: "asset_1", passthrough: VID, status: "ready", duration: 12.4, playback_ids: [{ id: "pb", policy: "signed" }], static_renditions: { status: "ready" } } })
    const sig = createHmac("sha256", "whsec").update(`${t}.${body}`).digest("hex")
    const good = await muxAdapter.webhook(body, new Headers({ "mux-signature": `t=${t},v1=${sig}` }), new URL("https://storelib.com/x"), muxEnv)
    check("a Mux webhook with its signature is read", Array.isArray(good) && good[0].videoId === VID && good[0].patch.status === "ready" && good[0].patch.duration_seconds === 12)
    const bad = await muxAdapter.webhook(body, new Headers({ "mux-signature": `t=${t},v1=${"0".repeat(64)}` }), new URL("https://storelib.com/x"), muxEnv)
    check("a Mux webhook with a wrong signature is refused", bad === "bad_signature")
    const old = String(Math.floor(Date.now() / 1000) - 3600)
    const stale = await muxAdapter.webhook(body, new Headers({ "mux-signature": `t=${old},v1=${createHmac("sha256", "whsec").update(`${old}.${body}`).digest("hex")}` }), new URL("https://storelib.com/x"), muxEnv)
    check("a Mux webhook an hour old is refused (no replays)", stale === "bad_signature")
    const cfEnv = { CLOUDFLARE_STREAM_WEBHOOK_SECRET: "cfsec" }
    const cfBody = JSON.stringify({ uid: "u1", readyToStream: false, status: { state: "inprogress" }, meta: { videoId: VID } })
    const cfSig = createHmac("sha256", "cfsec").update(`${t}.${cfBody}`).digest("hex")
    const cf = await cloudflareAdapter.webhook(cfBody, new Headers({ "webhook-signature": `time=${t},sig1=${cfSig}` }), new URL("https://storelib.com/x"), cfEnv)
    check("a Cloudflare webhook with its signature is read", Array.isArray(cf) && cf[0].assetId === "u1" && cf[0].patch.status === "processing")
    check("a Cloudflare webhook without one is refused", (await cloudflareAdapter.webhook(cfBody, new Headers(), new URL("https://storelib.com/x"), cfEnv)) === "bad_signature")
    const bEnv = { BUNNY_STREAM_WEBHOOK_SECRET: "bsec", BUNNY_STREAM_LIBRARY_ID: "7" }
    const bBody = JSON.stringify({ VideoLibraryId: 7, VideoGuid: "g1", Status: 5 })
    check("a Bunny webhook needs the secret in its address", (await bunnyAdapter.webhook(bBody, new Headers(), new URL("https://storelib.com/x?secret=nope"), bEnv)) === "bad_signature")
    const bOk = await bunnyAdapter.webhook(bBody, new Headers(), new URL("https://storelib.com/x?secret=bsec"), bEnv)
    check("with it, a failed video is failed", Array.isArray(bOk) && bOk[0].patch.status === "failed")
  }

  console.log("\nVideo uploads")
  {
    const db = classroomDb({ media_videos: [] })
    const c = community()
    const huge = await prepareVideoUpload(db, { community: c, staff: false, fileName: "big.mp4", contentType: "video/mp4", fileSize: MEMBER_VIDEO_MAX_BYTES + 1, origin: null, env: {} })
    check("a member's video over 500 MB is refused before a byte moves", !huge.ok && (huge as any).status === 413)
    const notVideo = await prepareVideoUpload(db, { community: c, staff: true, fileName: "x.exe", contentType: "application/x-msdownload", fileSize: 1000, origin: null, env: {} })
    check("a program is refused", !notVideo.ok && (notVideo as any).status === 415)
    const made = await prepareVideoUpload(db, { community: c, staff: true, fileName: "Intro Video.mp4", contentType: "video/mp4", fileSize: 4096, origin: null, env: {} })
    check("a video gets a signed storage upload for a path the server chose", made.ok && made.ticket.method === "storage" && !!made.ticket.token && isCommunityMediaPath(made.ticket.path, CREATOR, made.ticket.videoId), made)
    if (made.ok) {
      const row = db.tables.media_videos.find((v) => v.id === made.ticket.videoId)!
      check("the row is the community's and the creator's, uploading, on storage", row.community_id === A && row.creator_id === CREATOR && row.status === "uploading" && row.provider === "storage")
      const restore = serveStorage(db)
      const early = await completeVideoUpload(db, { community: c, staff: true, videoId: made.ticket.videoId, durationSeconds: 42.2 })
      check("complete before the file arrived: not ready", !early.ok && (early as any).status === 400)
      const mp4 = new Uint8Array(4096)
      mp4.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32], 0)
      db.put("digital-products", made.ticket.path!, mp4)
      const other = await completeVideoUpload(db, { community: community({ id: B }), staff: true, videoId: made.ticket.videoId })
      check("CROSS COMMUNITY: another community cannot complete it", !other.ok && (other as any).status === 404)
      const done = await completeVideoUpload(db, { community: c, staff: true, videoId: made.ticket.videoId, durationSeconds: 42.2, width: 1920, height: 1080 })
      check("checked where it landed, it is ready with the length the browser read", done.ok && done.video.status === "ready" && done.video.duration_seconds === 42 && done.video.size_bytes === 4096 && done.video.width === 1920)
      const play = done.ok ? await videoPlayback(db, done.video) : null
      check("playback is a signed address for an hour, never a public one", !!play && play.url.startsWith("https://storage.test/sign/digital-products/") && play.url.includes("expires=3600") && play.expiresAt > Date.now() + 3_500_000)
      const exe = await prepareVideoUpload(db, { community: c, staff: true, fileName: "fake.mp4", contentType: "video/mp4", fileSize: 200, origin: null, env: {} })
      if (exe.ok) {
        const mz = new Uint8Array(200)
        mz.set([0x4d, 0x5a, 0x90, 0], 0)
        db.put("digital-products", exe.ticket.path!, mz)
        const refused = await completeVideoUpload(db, { community: c, staff: true, videoId: exe.ticket.videoId })
        check("a program dressed as a video is refused where it landed, and removed", !refused.ok && !db.files.has(`digital-products/${exe.ticket.path}`) && db.tables.media_videos.find((v) => v.id === exe.ticket.videoId)!.status === "failed")
      }
      restore()
    }
    const quotaDb = classroomDb({ media_videos: [{ id: id(95), creator_id: CREATOR, community_id: A, provider: "storage", status: "ready", size_bytes: 101 * 1024 ** 3, created_at: iso(NOW - DAY) }] })
    const over = await prepareVideoUpload(quotaDb, { community: c, staff: true, fileName: "v.mp4", contentType: "video/mp4", fileSize: 1024, origin: null, env: {} })
    check("a video over the plan's storage is refused", !over.ok && (over as any).status === 403)
  }

  console.log("\nWho may watch")
  {
    const SPACE_OPEN = id(100)
    const SPACE_PRO = id(101)
    const EVENT = id(110)
    const v = (n: number, over: Record<string, unknown> = {}) => ({ id: id(n), creator_id: CREATOR, community_id: A, provider: "storage", status: "ready", storage_path: `${CREATOR}/community-media/${id(n)}/1-a.mp4`, mime: "video/mp4", duration_seconds: 10, captions_path: null, ...over })
    const db = classroomDb({
      media_videos: [v(120), v(121), v(122), v(123), v(124), v(125, { community_id: B })],
      community_spaces: [
        { id: SPACE_OPEN, community_id: A, view_access: {}, archived_at: null },
        { id: SPACE_PRO, community_id: A, view_access: { tierIds: [PRO_TIER] }, archived_at: null },
      ],
      community_feed_posts: [
        { id: id(130), community_id: A, space_id: SPACE_OPEN, status: "published", media: [{ type: "video", videoId: id(120) }] },
        { id: id(131), community_id: A, space_id: SPACE_PRO, status: "published", media: [{ type: "video", videoId: id(121) }] },
        { id: id(132), community_id: A, space_id: SPACE_OPEN, status: "removed", media: [{ type: "video", videoId: id(124) }] },
      ],
      community_events: [{ id: EVENT, community_id: A, access: {}, starts_at: iso(NOW + DAY), ends_at: iso(NOW + DAY + 3_600_000), status: "scheduled", replay_video_id: id(122) }],
    })
    const c = community({ cover_video_id: id(123) })
    const alice = viewer(db.tables.community_members.find((m) => m.user_id === ALICE) as MemberRow)
    const erin = viewer(db.tables.community_members.find((m) => m.user_id === ERIN) as MemberRow)
    const dana = viewer(db.tables.community_members.find((m) => m.user_id === DANA) as MemberRow)
    const nobody = viewer(null)
    const vid = async (n: number) => (await readCommunityVideo(db, A, id(n)))!
    check("the cover video of a public community is for anyone", (await videoAccess(db, c, nobody, await vid(123), NOW)).ok)
    check("a post's video in an open space is for members", (await videoAccess(db, c, alice, await vid(120), NOW)).ok)
    check("a visitor cannot watch a post's video", !(await videoAccess(db, c, nobody, await vid(120), NOW)).ok)
    check("a post's video in a Pro space is not for a free member", !(await videoAccess(db, c, alice, await vid(121), NOW)).ok)
    check("and is for a Pro member", (await videoAccess(db, c, erin, await vid(121), NOW)).ok)
    const early = await videoAccess(db, c, alice, await vid(122), NOW)
    check("an event's replay waits for the event to be over", !early.ok && (early as any).reason === "not_yet")
    check("then plays", (await videoAccess(db, c, alice, await vid(122), NOW + 2 * DAY)).ok)
    check("a video from a removed post plays for nobody but staff", !(await videoAccess(db, c, alice, await vid(124), NOW)).ok)
    check("staff may watch everything in their community", (await videoAccess(db, c, dana, await vid(124), NOW)).ok)
    check("CROSS COMMUNITY: another community's video is never found", (await readCommunityVideo(db, A, id(125))) === null)
    const expired = viewer(db.tables.community_members.find((m) => m.user_id === CARL) as MemberRow)
    check("an expired member cannot watch", !(await videoAccess(db, c, expired, await vid(120), NOW)).ok)
    check("an unready video has no address", (await videoPlayback(db, { ...(await vid(120)), status: "processing" } as never)) === null)
  }

  console.log("\nVideo webhooks apply once")
  {
    const db = classroomDb({ media_videos: [{ id: id(140), creator_id: CREATOR, community_id: A, provider: "mux", status: "processing", provider_asset_id: "asset_9" }], media_video_events: [] }) as MemDb
    ;(db as unknown as { tables: Record<string, unknown[]> }).tables.media_video_events = []
    const opts = { unique: { media_video_events: [["provider", "event_id"]] } }
    const udb = memDb(db.tables, opts)
    const ready = { eventId: "evt_ready", videoId: id(140), assetId: null, patch: { status: "ready" as const, duration_seconds: 30, playback_id: "pb" } }
    const r1 = await applyVideoWebhook(udb, "mux", [ready])
    const r2 = await applyVideoWebhook(udb, "mux", [ready])
    check("the first delivery applies", r1.applied === 1 && udb.tables.media_videos[0].status === "ready")
    check("the same event again changes nothing", r2.applied === 0 && r2.duplicates === 1)
    await applyVideoWebhook(udb, "mux", [{ eventId: "evt_late", videoId: null, assetId: "asset_9", patch: { status: "processing" } }])
    check("a late 'processing' never moves a ready video back", udb.tables.media_videos[0].status === "ready")
    check("an unknown asset is left alone", (await applyVideoWebhook(udb, "mux", [{ eventId: "evt_x", videoId: null, assetId: "nope", patch: { status: "ready" } }])).unmatched === 1)
    check("a patch only touches what a service may set", Object.keys(mergeVideoPatch({ status: "processing" }, { status: "ready", community_id: B, creator_id: id(1) } as never)).join() === "status,error")
  }

  /* ── Events ──────────────────────────────────────────────────────────── */
  console.log("\nEvent rules")
  const start = "2026-10-08T17:00:00.000Z"
  const ev = { startsAt: start, endsAt: "2026-10-08T18:00:00.000Z" }
  const s = Date.parse(start)
  check("the join link is shut 16 minutes before", !joinWindowOpen(ev, s - 16 * 60_000))
  check("and open 15 minutes before", joinWindowOpen(ev, s - JOIN_OPENS_MS) && joinWindowOpen(ev, s + 30 * 60_000))
  check("and shut once it ends", !joinWindowOpen(ev, Date.parse(ev.endsAt)))
  check("an event with no end is over an hour after it starts", !isOver({ startsAt: start, endsAt: null }, s + 59 * 60_000) && isOver({ startsAt: start, endsAt: null }, s + 60 * 60_000))
  const grid = monthGrid(2026, 9, "2026-10-03")
  check("the month grid is 42 days, Monday first", grid.length === 42 && grid[0].key === "2026-09-28" && grid.find((c) => c.today)?.key === "2026-10-03" && grid.filter((c) => c.inMonth).length === 31)
  const range = monthRange(2026, 9)
  check("the month's events are read with room for every zone", range.from < "2026-09-28" && range.to > "2026-11-08")
  const g = googleCalendarUrl({ title: "AMA, live", startsAt: start, endsAt: null, details: "Bring questions", location: null })
  check("the Google Calendar link has UTC times and the right length", g.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE") && g.includes("dates=20261008T170000Z%2F20261008T180000Z"))
  const ics = eventIcs({ id: id(110), title: "Q&A; with commas, and\nnewlines", startsAt: start, endsAt: ev.endsAt, description: "x".repeat(200), location: null, url: "https://storelib.com/community/makers/events/1", updatedAt: start, cancelled: false }, s)
  check(".ics lines end in CRLF and are folded at 75 octets", ics.includes("\r\n") && ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75))
  check(".ics escapes text", ics.includes("SUMMARY:Q&A\\; with commas\\, and\\nnewlines"))
  check(".ics has the times and the page", ics.includes("DTSTART:20261008T170000Z") && ics.includes("DTEND:20261008T180000Z") && ics.includes("LOCATION:Online"))
  check("cursors round trip and refuse junk", decodeEventCursor(encodeEventCursor(start, id(1)))?.id === id(1) && decodeEventCursor("bm9wZQ") === null && decodeEventCursor(null) === null)
  check("only http(s) links are ever handed out", safeUrl("javascript:alert(1)") === null && safeUrl("https://zoom.us/j/1") === "https://zoom.us/j/1")

  console.log("\nEvents for members")
  {
    const E_SOON = id(150)
    const E_PRO = id(151)
    const E_PAST = id(152)
    const E_FULL = id(153)
    const E_B = id(154)
    const e = (n: string, over: Record<string, unknown>) => ({
      id: n, community_id: A, title: "Event", description: "<p>Hi</p><script>x()</script>", cover_url: null, kind: "online", timezone: "Europe/London", location: null,
      meeting_url: "https://zoom.us/j/123", livestream_url: null, capacity: null, going_count: 0, access: {}, host_id: OWNER, replay_video_id: null, status: "scheduled",
      reminder_24h_at: null, reminder_1h_at: null, created_by: OWNER, created_at: iso(NOW - DAY), updated_at: iso(NOW - DAY), ...over,
    })
    const db = classroomDb({
      community_events: [
        e(E_SOON, { title: "Soon", starts_at: iso(NOW + 2 * 3_600_000), ends_at: iso(NOW + 3 * 3_600_000) }),
        e(E_PRO, { title: "Pro only", starts_at: iso(NOW + 5 * 60_000), ends_at: iso(NOW + 3_600_000), access: { tierIds: [PRO_TIER] } }),
        e(E_PAST, { title: "Last week", starts_at: iso(NOW - 7 * DAY), ends_at: iso(NOW - 7 * DAY + 3_600_000), replay_video_id: id(160) }),
        e(E_FULL, { title: "Small", starts_at: iso(NOW + DAY), ends_at: null, capacity: 1 }),
        e(E_B, { community_id: B, title: "Elsewhere", starts_at: iso(NOW + DAY), ends_at: null }),
      ],
      community_event_rsvps: [],
      profiles: [{ id: OWNER, display_name: "Host", username: "host", avatar_url: null, email: "host@test" }, { id: ALICE, display_name: "Alice", email: "alice@test" }, { id: ERIN, display_name: "Erin", email: "erin@test" }],
      community_jobs: [],
      community_notifications: [],
    })
    const c = community()
    const alice = viewer(db.tables.community_members.find((m) => m.user_id === ALICE) as MemberRow)
    const erin = viewer(db.tables.community_members.find((m) => m.user_id === ERIN) as MemberRow)
    const dana = viewer(db.tables.community_members.find((m) => m.user_id === DANA) as MemberRow)
    const up = await listEvents(db, c, alice, { when: "upcoming", now: NOW })
    check("Upcoming is this community's events not over, soonest first", up.events.map((x) => x.id).join() === [E_PRO, E_SOON, E_FULL].join(), up.events.map((x) => x.title))
    const past = await listEvents(db, c, alice, { when: "past", now: NOW })
    check("Past is the ones over, with their replay noted", past.events.length === 1 && past.events[0].id === E_PAST && past.events[0].hasReplay)
    const p1 = await listEvents(db, c, alice, { when: "upcoming", now: NOW, limit: 2 })
    const p2 = await listEvents(db, c, alice, { when: "upcoming", now: NOW, limit: 2, cursor: p1.nextCursor })
    check("a page at a time by cursor, nothing twice, nothing missed", p1.events.length === 2 && !!p1.nextCursor && p2.events.length === 1 && p2.events[0].id === E_FULL && p2.nextCursor === null)
    check("the Pro event is listed for a free member with its reason", up.events.find((x) => x.id === E_PRO)?.locked?.label === "Pro members")
    check("no meeting link is in any list", !JSON.stringify(up).includes("zoom.us"))

    const soon = await eventDetail(db, c, alice, E_SOON, NOW)
    check("two hours before, the meeting link is not handed out", soon?.meetingUrl === null && soon?.joinOpensAt === iso(NOW + 2 * 3_600_000 - JOIN_OPENS_MS))
    const inWindow = await eventDetail(db, c, alice, E_SOON, NOW + 2 * 3_600_000 - 10 * 60_000)
    check("ten minutes before, it is", inWindow?.meetingUrl === "https://zoom.us/j/123")
    const after = await eventDetail(db, c, alice, E_SOON, NOW + 4 * 3_600_000)
    check("after the end it is gone again", after?.meetingUrl === null)
    check("staff who run events see it early", (await eventDetail(db, community(), viewer(member(A, OWNER, { role: "admin" })), E_SOON, NOW))?.meetingUrl === "https://zoom.us/j/123")
    const locked = await eventDetail(db, c, alice, E_PRO, NOW)
    check("a member the rule leaves out never gets the link, even in the window", locked?.meetingUrl === null && locked?.joinOpensAt === null && !!locked?.locked)
    check("a Pro member in the window does", (await eventDetail(db, c, erin, E_PRO, NOW))?.meetingUrl === "https://zoom.us/j/123")
    check("the description is sanitized", !!soon?.description && !/script/i.test(soon.description))
    check("CROSS COMMUNITY: another community's event is not found", (await eventDetail(db, c, alice, E_B, NOW)) === null)
    check("the replay is handed out only once it is over", (await eventDetail(db, c, alice, E_PAST, NOW))?.replayVideoId === id(160))

    const a1 = await answerEvent(db, c, alice, E_FULL, true, NOW)
    const a2 = await answerEvent(db, c, erin, E_FULL, true, NOW)
    check("capacity 1: the first is going", a1.ok && a1.status === "going" && a1.goingCount === 1)
    check("the second is on the waitlist", a2.ok && a2.status === "waitlist")
    check("answering going records the activity", (db.tables.community_activity ?? []).some((x) => x.kind === "rsvp" && x.user_id === ALICE))
    const keys = db.tables.community_jobs.map((j) => j.idempotency_key).sort()
    check("going queues the 24 hour and 1 hour reminders, once", keys.length === 2 && keys[0].startsWith(`event_reminder:${E_FULL}:1h:`) && keys[1].startsWith(`event_reminder:${E_FULL}:24h:`), keys)
    await answerEvent(db, c, alice, E_FULL, true, NOW)
    check("answering again queues nothing more", db.tables.community_jobs.length === 2)
    const cancel = await answerEvent(db, c, alice, E_FULL, false, NOW)
    check("when the person going cancels, the first waiting moves up", cancel.ok && db.tables.community_event_rsvps.find((r) => r.event_id === E_FULL && r.user_id === ERIN)?.status === "going")
    check("and is told", db.tables.community_notifications.some((n) => n.user_id === ERIN && String(n.dedupe_key).startsWith(`event_promoted:${E_FULL}:${ERIN}`)))
    const lockedAnswer = await answerEvent(db, c, alice, E_PRO, true, NOW)
    check("a locked event cannot be answered", !lockedAnswer.ok && lockedAnswer.status === 403)
    const otherAnswer = await answerEvent(db, c, alice, E_B, true, NOW)
    check("CROSS COMMUNITY: another community's event cannot be answered", !otherAnswer.ok && otherAnswer.status === 404)
    const overAnswer = await answerEvent(db, c, alice, E_PAST, true, NOW)
    check("an event that is over takes no new going", !overAnswer.ok && overAnswer.status === 409)
    check("twenty minutes before, only the 1 hour reminder is queued", (await ensureReminders(memDb({ community_jobs: [] }), { id: id(170), starts_at: iso(NOW + 20 * 60_000), status: "scheduled" }, NOW)) === 1)

    /* The reminder job. */
    db.tables.community_event_rsvps.push({ event_id: E_SOON, user_id: ALICE, community_id: A, status: "going", created_at: iso(NOW), updated_at: iso(NOW) })
    db.tables.community_event_rsvps.push({ event_id: E_SOON, user_id: CARL, community_id: A, status: "going", created_at: iso(NOW), updated_at: iso(NOW) })
    const job = (payload: Record<string, unknown>): JobRow => ({ id: 1, kind: "event_reminder", payload, run_at: iso(NOW), state: "running", attempts: 1, last_error: null, lease_until: null, idempotency_key: "k", created_at: iso(NOW), finished_at: null })
    const soonStart = iso(NOW + 2 * 3_600_000)
    await eventReminder(db, job({ eventId: E_SOON, window: "1h", startsAt: soonStart }), { deadline: Date.now() + 30_000, now: NOW + 3_600_000 })
    const reminders = db.tables.community_notifications.filter((n) => n.kind === "event_reminder" && n.target_id === E_SOON)
    check("the 1 hour reminder reaches the active member going", reminders.length === 1 && reminders[0].user_id === ALICE && reminders[0].title === "Starting in 1 hour: Soon")
    check("not an expired member", !reminders.some((n) => n.user_id === CARL))
    check("the event says the reminder went", !!db.tables.community_events.find((x) => x.id === E_SOON)?.reminder_1h_at)
    const profileReads = db.log.filter((l) => l.table === "profiles").length
    await eventReminder(db, job({ eventId: E_SOON, window: "1h", startsAt: soonStart, cursor: null }), { deadline: Date.now() + 30_000, now: NOW + 3_600_000 })
    check("run again, nobody is told twice and no email goes twice", db.tables.community_notifications.filter((n) => n.kind === "event_reminder" && n.target_id === E_SOON).length === 1 && db.log.filter((l) => l.table === "profiles").length === profileReads)
    db.tables.community_events.find((x) => x.id === E_SOON)!.reminder_1h_at = null
    const moved = await eventReminder(db, job({ eventId: E_SOON, window: "1h", startsAt: iso(NOW + 9 * 3_600_000) }), { deadline: Date.now() + 30_000, now: NOW + 3_600_000 })
    check("a job for a start time the event no longer has sends nothing", moved === undefined && db.tables.community_notifications.filter((n) => n.kind === "event_reminder").length === 1)
    check("a reminder sent for an earlier start does not count for a moved event", !alreadySent({ reminder_24h_at: iso(NOW - 3 * DAY), reminder_1h_at: null }, "24h", NOW + 2 * DAY))

    /* The fan out. */
    const fan: JobRow = { ...job({ eventId: E_PRO, communityId: A }), kind: "fanout_event" }
    db.tables.community_events.find((x) => x.id === E_PRO)!.starts_at = iso(Date.now() + DAY)
    await fanoutEvent(db, fan, { deadline: Date.now() + 30_000, now: Date.now() })
    const told = db.tables.community_notifications.filter((n) => n.kind === "event" && n.target_id === E_PRO).map((n) => n.user_id).sort()
    check("a new event reaches the members it is for: the Pro member and staff", told.join() === [DANA, ERIN].sort().join(), told)
    await fanoutEvent(db, fan, { deadline: Date.now() + 30_000, now: Date.now() })
    check("and only once", db.tables.community_notifications.filter((n) => n.kind === "event" && n.target_id === E_PRO).length === 2)
    void dana
  }
  check("the three jobs are registered", typeof JOB_HANDLERS.event_reminder === "function" && typeof JOB_HANDLERS.fanout_event === "function" && typeof JOB_HANDLERS.video_poll === "function")

  /* ── Routes and pages ────────────────────────────────────────────────── */
  console.log("\nRoutes and pages")
  const routes = [
    ...walk("app/api/community").filter((f) => /\/(classroom|events|videos)\//.test(f)),
    ...walk("app/api/app/community").filter((f) => f.includes("/videos/")),
  ].filter((f) => f.endsWith("route.ts"))
  /* Round 13 added the composer's status route (videos/[videoId]/route.ts); round 14 adds the four
     an event's tickets need (checkout, its confirm, the holder's ticket and the free invite), so this
     counts at least the eleven that were here and checks every one it finds. */
  check("all my routes are there", routes.length >= 15, routes)
  for (const f of routes) {
    const src = code(f)
    const handlers = [...src.matchAll(/export async function (GET|POST|PATCH|DELETE)\([^)]*\)[^{]*\{\s*([^\n]+)\n\s*([^\n]+)/g)]
    check(`${f}: every handler checks the switch first`, handlers.length > 0 && handlers.every((h) => /const off = await requireCommunitiesOn\(\)/.test(h[2]) && /if \(off\) return off/.test(h[3])))
    check(`${f}: asks requireMember or requireCreatorCommunity`, /requireMember\(|requireCreatorCommunity\(/.test(src))
    check(`${f}: compares no role strings`, !/role\s*===?\s*"(owner|admin|moderator|member)"/.test(src))
    if (/export async function (POST|PATCH|DELETE)/.test(src)) check(`${f}: limits its writes`, /rateLimit\(|uploadRateLimit\(/.test(src))
  }
  const play = code("app/api/community/[communityId]/videos/[videoId]/play/route.ts")
  check("play: the video is read within the community, then videoAccess decides", /readCommunityVideo\(db, community\.id, videoId\)/.test(play) && /videoAccess\(db, community, viewer, video\)/.test(play))
  check("play: only the public cover video skips the member gate", /community\.cover_video_id !== video\.id\)\s*\{\s*const gate = await requireMember/.test(play))
  const hook = code("app/api/webhooks/video/[provider]/route.ts")
  check("webhook: switch first, signature checked before anything is applied", /requireCommunitiesOn\(\)[\s\S]*adapter\.webhook\([\s\S]*bad_signature[\s\S]*applyVideoWebhook/.test(hook))
  check("webhook: a service not connected answers 404", /if \(!adapter\.connected\(\)\)/.test(hook))
  const pages = walk("app/(marketing)/community/[slug]/(member)").filter((f) => f.endsWith("page.tsx") && /\/(learn|events)\//.test(f))
  check("four pages", pages.length === 4, pages)
  check("every page checks for itself (openMemberPage), not only the layout", pages.every((f) => /await openMemberPage\(db, slug, "(classroom|events)"/.test(code(f))))
  const gate = code("lib/communities/server/classroom.ts")
  check("the page gate: switch, community, section, sign in, active member", /if \(!\(await on\(\)\)\) return notFound\(\)[\s\S]*communityOpen\(community\)[\s\S]*classroom_enabled[\s\S]*pageUser\([\s\S]*if \(!viewer\.active\) return redirect/.test(gate))
  /* Round 13: the course page is Learn's program page (tests/communities-learn.test.ts holds the rest). */
  const coursePage = code("app/(marketing)/community/[slug]/(member)/learn/[programId]/page.tsx")
  check("the program page finds only a program of this community, and shows a lock before the player", /programCard\(db, community, viewer, programId\)[\s\S]*if \(!card \|\| !row\) notFound\(\)[\s\S]*if \(card\.locked\)[\s\S]*loadCoursePlayer\(/.test(coursePage))
  const clients = [...walk("components/community/classroom"), ...walk("components/community/events"), ...walk("components/video"), "lib/video/upload-client.ts", "lib/video/types.ts"].filter((f) => /\.tsx?$/.test(f))
  check("nothing a browser loads imports server code", clients.every((f) => !/server-only|next\/headers|lib\/communities\/server|lib\/supabase\/(server|admin)|lib\/video\/(provider|storage|mux|cloudflare|bunny)/.test(code(f))), clients.filter((f) => /server-only|next\/headers|lib\/communities\/server/.test(code(f))))
  const servers = ["lib/video/provider.ts", "lib/video/storage.ts", "lib/video/mux.ts", "lib/video/cloudflare.ts", "lib/video/bunny.ts", "lib/communities/server/classroom.ts", "lib/communities/server/events.ts", "lib/communities/server/videos.ts", ...walk("lib/communities/server/jobs").filter((f) => /(event_reminder|fanout_event|video_poll)\.ts$/.test(f))]
  check("every server module says server-only", servers.every((f) => /^import "server-only"/m.test(read(f))))

  /* ── Copy ────────────────────────────────────────────────────────────── */
  console.log("\nCopy")
  const mine = [...servers, ...clients, ...routes, ...pages, "app/api/webhooks/video/[provider]/route.ts"].filter((f) => existsSync(f))
  const banned = /\b(unlock\w*|elevate\w*|seamless\w*|powerful\w*|effortless\w*|supercharge\w*|transform\w*)\b/i
  const offenders = mine.filter((f) => /—/.test(read(f)) || banned.test(read(f)))
  check("no em dash and no banned word, in copy, comments or names", offenders.length === 0, offenders)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
