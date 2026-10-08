/**
 * ===========================================================================
 *  NOTIFICATIONS, PUSH AND REPORTS (round 12, asks 27 to 29)
 * ===========================================================================
 * Held from their inputs:
 *
 *   WHO HEARS WHAT   a like tells the author, a new post tells the members
 *                    set to Everything who can see its space (never the
 *                    author, never a tier they lack), a follow tells the
 *                    person followed, a report tells the staff who review
 *                    reports (and opens their /app queue when they have one).
 *   LIKES            one bell row per post per window, "3 people liked your
 *                    post"; the first like pushes, the rest are held and
 *                    arrive as one push when the five minutes close.
 *   THE SWITCHES     each kind turned off is not pushed (likes, posts,
 *                    followers, mentions), the bell still has it; the main
 *                    switch still wins; a digest drops what is turned off.
 *   THE PERMISSION   asked only from a tap in the app: never on launch,
 *                    never on the web, never from the push init.
 *   REPORT EMAIL     at most one a day per moderator and community, none
 *                    when nothing new, never one per report.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import { PUSH_WINDOW_MS, runPushDigest, setPushBridgeDeps, levelAllowsPush, digestContent, readChoices } from "@/lib/notifications/push-bridge"
import { NOTIFY_META_KEY, PUSH_KIND_KEYS, applyNotifyChange, emptyChoice, kindAllowed, kindStates, pushKindOf, readNotifyChoice } from "@/lib/notifications/push-kinds"
import { REPORT_DIGEST_DELAY_MS, reportDigestData, reportDigestKey, reportDigestPlan, reportLine, utcDay } from "@/lib/notifications/report-digest"
import { LIKE_WINDOW_MS, likeKey, likeTitle, notifyMember, queueNewPost, queueReportDigest } from "@/lib/communities/server/notify"
import { fanoutAnnouncement } from "@/lib/communities/server/jobs/fanout_announcement"
import { runReportDigest } from "@/lib/communities/server/jobs/report_digest"
import { pushDigest } from "@/lib/communities/server/jobs/push_digest"
import { createReport } from "@/lib/communities/server/reports"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { askPushPermission, permissionFrom, readPushPermission, inNativeApp } from "@/lib/native-push"
import { communities as communitiesWorkflow } from "@/lib/notify/workflows/communities"
import { renderEmail } from "@/lib/notify/templates"
import { REGISTRY } from "@/lib/notify/registry"
import type { JobRow } from "@/lib/communities/types"

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
const read = (f: string) => readFileSync(f, "utf8")
const code = (f: string) => stripComments(read(f))

/* ── A small PostgREST stand in, with the account's app_metadata ──────── */

type Row = Record<string, any>
const DEFAULTS: Record<string, Row> = { community_reports: { status: "open" }, community_jobs: { state: "pending", attempts: 0 } }

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
        const row = { id: id(), created_at: new Date().toISOString(), read_at: null, ...(DEFAULTS[table] ?? {}), ...p }
        rows().push(row)
        made.push(row)
      }
      if (st.single) return { data: made[0] ? { ...made[0] } : null, error: null }
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
      reads: 0,
      async getUserById(uid: string) {
        auth.admin.reads++
        const u = users[uid]
        return { data: { user: u ? { id: uid, email: u.email ?? null, app_metadata: u.app_metadata ?? {} } : null }, error: null }
      },
      async updateUserById(uid: string, attrs: { app_metadata: Record<string, unknown> }) {
        users[uid] = { ...(users[uid] ?? {}), app_metadata: { ...(users[uid]?.app_metadata ?? {}), ...attrs.app_metadata } }
        return { error: null }
      },
    },
  }
  return { from, tables, users, auth, rpc: async () => ({ data: [], error: null }) }
}

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const S_OPEN = "00000000-0000-4000-c000-000000000001"
const S_TIER = "00000000-0000-4000-c000-000000000002"
const T1 = "00000000-0000-4000-d000-000000000001"
const MARA = U(1)
const BEN = U(2)
const IOANA = U(3)
const DAN = U(4)
const OWNER = U(5)
const MOD = U(6)
const EVE = U(7)

interface Sent { userId: string; title: string; body: string; data: Record<string, string> }
function sender(sent: Sent[]) {
  return async (userId: string, p: { title: string; body: string; data?: Record<string, string> }) => {
    sent.push({ userId, title: p.title, body: p.body, data: p.data ?? {} })
  }
}

function tables(): Record<string, Row[]> {
  const everyone = [MARA, BEN, IOANA, DAN, OWNER, MOD, EVE]
  return {
    communities: [{ id: C1, name: "Film Loft", slug: "film-loft", status: "published", deleted_at: null, suspended_at: null, creator_id: "cr1" }],
    creators: [{ id: "cr1", user_id: OWNER, display_name: "Owen" }],
    push_tokens: everyone.map((u, i) => ({ id: `t${i}`, user_id: u, token: `tok-${i}`, platform: "ios" })),
    business_links: [],
    notification_preferences: [],
    notification_events: [],
    rate_limit_hits: [],
    community_jobs: [],
    community_spaces: [
      { id: S_OPEN, community_id: C1, kind: "feed", view_access: {}, archived_at: null },
      { id: S_TIER, community_id: C1, kind: "feed", view_access: { tierIds: [T1] }, archived_at: null },
    ],
    community_members: [
      { community_id: C1, user_id: MARA, status: "active", role: "member", tier_id: null, level: 1, notify_level: "all" },
      { community_id: C1, user_id: BEN, status: "active", role: "member", tier_id: T1, level: 1, notify_level: "all" },
      { community_id: C1, user_id: IOANA, status: "active", role: "member", tier_id: T1, level: 1, notify_level: "important" },
      { community_id: C1, user_id: DAN, status: "active", role: "member", tier_id: null, level: 1, notify_level: "all" },
      { community_id: C1, user_id: OWNER, status: "active", role: "owner", tier_id: null, level: 1, notify_level: "important" },
      { community_id: C1, user_id: MOD, status: "active", role: "moderator", tier_id: null, level: 1, notify_level: "important" },
      { community_id: C1, user_id: EVE, status: "active", role: "member", tier_id: T1, level: 1, notify_level: "mentions" },
    ],
    community_feed_posts: [],
    community_reactions: [],
    community_notifications: [],
    community_reports: [],
    user_notifications: [],
    profiles: [
      { id: MARA, display_name: "Mara Pop", username: "mara" },
      { id: BEN, display_name: "Ben Ionescu", username: "ben" },
    ],
  }
}

function job(payload: Record<string, unknown>, kind = "fanout_announcement"): JobRow {
  return { id: 1, kind, payload, state: "running", attempts: 1, run_at: new Date().toISOString(), lease_until: null, last_error: null, idempotency_key: "k", created_at: new Date().toISOString(), finished_at: null } as unknown as JobRow
}

const ctx = () => ({ deadline: Date.now() + 60_000, now: Date.now() })

async function main() {
  /* ── The kinds, pure ─────────────────────────────────────────────────── */
  console.log("\nThe kinds a person can switch")
  /* Round 13 added owners' posts and programs, and put what is addressed to the person first (tests/communities-notify-budget.test.ts holds the rest). */
  check("nine kinds, in the order Settings shows them", PUSH_KIND_KEYS.join(",") === "mentions,comments,admin_posts,posts,events,programs,likes,messages,followers")
  check("each notification kind sits under its switch", pushKindOf("post") === "posts" && pushKindOf("comment") === "comments" && pushKindOf("reply") === "comments" && pushKindOf("reaction") === "likes" && pushKindOf("mention") === "mentions" && pushKindOf("dm") === "messages" && pushKindOf("event") === "events" && pushKindOf("event_reminder") === "events" && pushKindOf("new_follower") === "followers")
  check("announcements, approvals and admin messages answer only to the main switch", pushKindOf("announcement") === null && pushKindOf("membership") === null && pushKindOf("admin_message") === null)
  const choice = readNotifyChoice({ [NOTIFY_META_KEY]: { pushOff: ["likes", "nonsense", "likes", 7], emailOff: ["report_digest", "x"] } })
  check("a stored choice is read safely: unknown words dropped, each once", JSON.stringify(choice.pushOff) === '["likes"]' && JSON.stringify(choice.emailOff) === '["report_digest"]')
  check("nothing stored is everything on", JSON.stringify(readNotifyChoice({})) === JSON.stringify(emptyChoice()) && JSON.stringify(readNotifyChoice(null)) === JSON.stringify(emptyChoice()) && emptyChoice().pushOff.length === 0)
  check("a kind turned off is refused, the rest allowed", !kindAllowed(choice, "reaction") && kindAllowed(choice, "reply") && kindAllowed(choice, "announcement") && kindAllowed(null, "reaction"))
  const changed = applyNotifyChange({ ...emptyChoice(), pushOff: ["likes"] }, { push: { likes: true, posts: false, bogus: false }, email: { report_digest: false } })
  check("a change turns kinds on and off and keeps the order", JSON.stringify(changed?.pushOff) === '["posts"]' && JSON.stringify(changed?.emailOff) === '["report_digest"]')
  check("a change that names nothing it may change is refused", applyNotifyChange(emptyChoice(), { push: { likes: "no" } }) === null && applyNotifyChange(emptyChoice(), null) === null)
  check("Settings reads every kind with its state", JSON.stringify(kindStates({ ...emptyChoice(), pushOff: ["posts"] })) === JSON.stringify({ mentions: true, comments: true, admin_posts: true, posts: false, events: true, programs: true, likes: true, messages: true, followers: true }))

  console.log("\nA community's own level")
  /* Round 13: a member's post pushes only at Everything; the owner's and admins' posts also at the default level. */
  check("a member's post pushes at Everything only; an owner's or admin's also at the default, never at mentions only or nothing", levelAllowsPush("all", "post") && !levelAllowsPush("important", "post") && !levelAllowsPush(null, "post") && levelAllowsPush("important", "admin_post") && levelAllowsPush(null, "admin_post") && !levelAllowsPush("mentions", "post") && !levelAllowsPush("mentions", "admin_post") && !levelAllowsPush("none", "admin_post"))

  /* ── Likes, grouped ──────────────────────────────────────────────────── */
  console.log("\nLikes: one notification per post per window")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const db = pg(tables())
    let base = Date.now()
    if (base % LIKE_WINDOW_MS > LIKE_WINDOW_MS - 30_000) base += 60_000
    const like = async (actor: string, name: string, i: number) => {
      const now = base + i * 1000
      db.tables.community_reactions.push({ community_id: C1, target_type: "post", target_id: "p1", user_id: actor, kind: "like", created_at: new Date(now).toISOString() })
      return notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reaction", actorId: actor, target: { type: "post", id: "p1" }, title: `${name} liked your post`, body: "Our first roll of Portra", url: "/community/film-loft/post/p1", dedupeKey: `reaction:post:p1:${actor}`, now })
    }
    check("the first like writes one row in its own words", (await like(MARA, "Mara Pop", 1)) === "sent" && db.tables.community_notifications.length === 1 && db.tables.community_notifications[0].title === "Mara Pop liked your post")
    check("  and pushes at once", sent.length === 1 && sent[0].userId === BEN && sent[0].body.startsWith("Mara Pop liked your post"))
    db.tables.community_notifications[0].read_at = new Date().toISOString()
    await like(IOANA, "Ioana", 2)
    await like(DAN, "Dan", 3)
    const rows = db.tables.community_notifications
    check("three likes are still one row, which counts them", rows.length === 1 && rows[0].title === "3 people liked your post", rows.map((r) => r.title))
    check("  unread again, at the top, keyed by post and window", rows[0].read_at === null && rows[0].dedupe_key === likeKey(BEN, { type: "post", id: "p1" }, base + 3000) && rows[0].created_at === new Date(base + 3000).toISOString())
    const digests = db.tables.community_jobs.filter((j) => j.kind === "push_digest")
    check("the likes after the first are held for ONE push when the window closes", sent.length === 1 && digests.length === 1, { sent: sent.length, digests: digests.length })
    await runPushDigest(db as any, digests[0].payload, Date.now() + PUSH_WINDOW_MS + 10_000)
    check("  which says how many", sent.length === 2 && sent[1].title === "Film Loft" && sent[1].body.startsWith("3 people liked your post"), sent[1])
    check("the liker's own like on their own post tells nobody", (await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reaction", actorId: BEN, target: { type: "post", id: "p1" }, title: "Ben liked your post", url: "/community/film-loft/post/p1", dedupeKey: "x" })) === "skipped")
    check("the next window is a new row", (await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reaction", actorId: MARA, target: { type: "post", id: "p1" }, title: "Mara Pop liked your post", url: "/community/film-loft/post/p1", dedupeKey: "y", now: base + LIKE_WINDOW_MS })) === "sent" && db.tables.community_notifications.length === 2)
    check("the words: one by name, more as a count", likeTitle(1, "Mara Pop", "post") === "Mara Pop liked your post" && likeTitle(7, "Mara Pop", "comment") === "7 people liked your comment" && likeTitle(1, "", "post") === "A member liked your post")
    const ioanaDb = pg(tables())
    check("a member whose level is Everything but likes gets no row at all", (await notifyMember(ioanaDb as any, { userId: IOANA, communityId: C1, kind: "reaction", actorId: MARA, target: { type: "post", id: "p2" }, title: "Mara Pop liked your post", url: "/community/film-loft/post/p2", dedupeKey: "z" })) === "skipped" && ioanaDb.tables.community_notifications.length === 0)
  }

  /* ── The switches ────────────────────────────────────────────────────── */
  console.log("\nThe switches really switch")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const db = pg(tables(), { [BEN]: { app_metadata: { [NOTIFY_META_KEY]: { pushOff: ["likes", "mentions"] } } } })
    db.tables.community_reactions.push({ community_id: C1, target_type: "post", target_id: "p9", user_id: MARA, kind: "like", created_at: new Date().toISOString() })
    await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reaction", actorId: MARA, target: { type: "post", id: "p9" }, title: "Mara Pop liked your post", url: "/community/film-loft/post/p9", dedupeKey: "a" })
    check("likes off: the bell has it, the phone does not", db.tables.community_notifications.length === 1 && sent.length === 0)
    await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "mention", actorId: MARA, title: "Mara Pop mentioned you", url: "/community/film-loft/post/p9", dedupeKey: "mention:post:p9:ben" })
    check("mentions off: not pushed either", db.tables.community_notifications.length === 2 && sent.length === 0)
    await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reply", actorId: MARA, title: "Mara Pop replied to your comment", url: "/community/film-loft/post/p9#c-1", dedupeKey: "reply:c1:ben" })
    check("comments and replies still on: the reply pushes", sent.length === 1 && sent[0].userId === BEN)
    db.tables.notification_preferences.push({ user_id: BEN, category: "social", channel: "push", enabled: false })
    await notifyMember(db as any, { userId: BEN, communityId: C1, kind: "reply", actorId: DAN, title: "Dan replied to your comment", url: "/community/film-loft/post/p9#c-2", dedupeKey: "reply:c2:ben" })
    check("the main switch off wins over every kind", sent.length === 1)

    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const fdb = pg(tables(), { [MARA]: { app_metadata: { [NOTIFY_META_KEY]: { pushOff: ["followers"] } } } })
    await notifyUser(fdb as any, { userId: BEN, kind: "new_follower", source: "following", actorId: MARA, title: "Mara Pop followed you", url: "/@mara", dedupeKey: "follow:mara:ben" } as any)
    check("a follow tells the person followed, on their phone", sent.length === 2 && sent[1].userId === BEN && /followed you/.test(sent[1].title))
    await notifyUser(fdb as any, { userId: MARA, kind: "new_follower", source: "following", actorId: BEN, title: "Ben Ionescu followed you", url: "/@ben", dedupeKey: "follow:ben:mara" } as any)
    check("  new followers off: in the bell, not on the phone", sent.length === 2 && fdb.tables.user_notifications.length === 2)

    const rows = [
      { kind: "reaction", title: "Ana liked your post", body: null, url: "/community/film-loft/post/p1" },
      { kind: "comment", title: "Ana commented", body: null, url: "/community/film-loft/post/p2" },
    ]
    check("a digest is built from what is left after the switches", digestContent(rows.filter((r) => kindAllowed({ ...emptyChoice(), pushOff: ["likes"] }, r.kind)), { group: `c:${C1}`, communityName: "Film Loft", communitySlug: "film-loft" })?.body.startsWith("Ana commented") === true)
    const cdb = pg(tables(), { [IOANA]: { app_metadata: { [NOTIFY_META_KEY]: { pushOff: ["likes"] } } } })
    const r0 = cdb.auth.admin.reads
    await readChoices(cdb as any, [IOANA, IOANA, DAN])
    await readChoices(cdb as any, [IOANA, DAN])
    check("the bridge reads each account once for a page, then remembers it a moment", cdb.auth.admin.reads - r0 === 2)
  }

  /* ── New posts ───────────────────────────────────────────────────────── */
  console.log("\nA new post: Everything and the default level, the space's own audience, never the author")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    /* Round 13: a member's post reaches only Everything, so this audience is an admin's post (Mara is an admin here). */
    const asAdmin = (t: Record<string, any[]>) => {
      t.community_members.find((m) => m.user_id === MARA).role = "admin"
      return t
    }
    const memberDb = pg(tables())
    memberDb.tables.community_feed_posts.push({ id: "00000000-0000-4000-e000-000000000009", community_id: C1, space_id: S_TIER, author_id: MARA, title: "A member's post", body_text: "x", status: "published" })
    await fanoutAnnouncement(memberDb as any, job({ communityId: C1, postId: "00000000-0000-4000-e000-000000000009", actorId: MARA, reason: "post", after: null }), ctx())
    check("a member's post: only Everything with the tier (Ben); the default level does not hear it", JSON.stringify(sent.map((x) => x.userId)) === JSON.stringify([BEN]), sent.map((x) => x.userId))
    sent.length = 0
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const db = pg(asAdmin(tables()))
    db.tables.community_feed_posts.push({ id: "00000000-0000-4000-e000-000000000001", community_id: C1, space_id: S_TIER, author_id: MARA, title: "Night shoot on Friday", body_text: "Bring a tripod.", status: "published" })
    check("an ordinary post is queued once", (await queueNewPost(db as any, { communityId: C1, postId: "00000000-0000-4000-e000-000000000001", actorId: MARA })) === "queued" && (await queueNewPost(db as any, { communityId: C1, postId: "00000000-0000-4000-e000-000000000001", actorId: MARA })) === "exists")
    const queued = db.tables.community_jobs[0]
    check("  as the fan out with reason post", queued.kind === "fanout_announcement" && queued.payload.reason === "post")
    await fanoutAnnouncement(db as any, job(queued.payload), ctx())
    const to = sent.map((s) => s.userId).sort()
    check("in a tier space: Ben (Everything) and Ioana (the default level) with the tier, and the staff; not Mara (author), Dan (no tier), Eve (mentions only)", JSON.stringify(to) === JSON.stringify([BEN, IOANA, OWNER, MOD].sort()), to)
    check("  it says who posted and what, and opens the post", sent.length > 0 && sent[0]?.title === "Film Loft" && sent[0]?.body.startsWith("Mara Pop posted") && sent[0]?.body.includes("Night shoot on Friday") && sent[0]?.data.url === "/community/film-loft/post/00000000-0000-4000-e000-000000000001")
    check("  and writes nothing in anybody's bell", db.tables.community_notifications.length === 0)
    db.tables.community_feed_posts.push({ id: "00000000-0000-4000-e000-000000000002", community_id: C1, space_id: S_OPEN, author_id: MARA, title: "Second", body_text: "x", status: "published" })
    await fanoutAnnouncement(db as any, job({ communityId: C1, postId: "00000000-0000-4000-e000-000000000002", actorId: MARA, reason: "post", after: null }), ctx())
    const heldFor = db.tables.community_jobs.filter((j) => j.kind === "push_digest" && j.payload.group === `p:${C1}`).map((j) => j.payload.userId).sort()
    check("a second post inside five minutes is held for the four who just heard one (one window per community), and Dan (open space) hears it", sent.length === 5 && sent[4].userId === DAN && JSON.stringify(heldFor) === JSON.stringify([BEN, IOANA, OWNER, MOD].sort()), { sent: sent.map((s) => s.userId), heldFor })
    const held = db.tables.community_jobs.find((j) => j.kind === "push_digest" && j.payload.userId === BEN)!
    for (const p of db.tables.community_feed_posts) p.created_at = new Date(Date.now() + 1000).toISOString()
    await runPushDigest(db as any, held.payload, Date.now() + PUSH_WINDOW_MS + 10_000)
    check("  and Ben's digest counts the new posts he can see", sent.length === 6 && sent[5].userId === BEN && sent[5].body === "2 new posts" && sent[5].data.url === "/community/film-loft", sent[5])
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const off = pg(asAdmin(tables()), { [BEN]: { app_metadata: { [NOTIFY_META_KEY]: { pushOff: ["admin_posts"] } } }, [DAN]: {} })
    off.tables.community_feed_posts.push({ id: "00000000-0000-4000-e000-000000000003", community_id: C1, space_id: S_OPEN, author_id: MARA, title: "Third", body_text: "x", status: "published" })
    const before = sent.length
    await fanoutAnnouncement(off as any, job({ communityId: C1, postId: "00000000-0000-4000-e000-000000000003", actorId: MARA, reason: "post", after: null }), ctx())
    const heard = sent.slice(before).map((s) => s.userId).sort()
    check("new posts turned off: Ben hears nothing; Ioana, Dan and the staff still do; Eve (mentions only) never", JSON.stringify(heard) === JSON.stringify([IOANA, DAN, OWNER, MOD].sort()), heard)
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => false, defer: (task) => task() })
    const n = sent.length
    await fanoutAnnouncement(pg(tables()) as any, job({ communityId: C1, postId: "00000000-0000-4000-e000-000000000003", actorId: MARA, reason: "post", after: null }), ctx())
    check("communities switched off: no post pushes", sent.length === n)
    const feed = code("lib/communities/server/feed.ts")
    check("createPost queues it for an ordinary post, and an announcement or @everyone keeps its own fan out", /queueEveryone\([\s\S]*?\}\s*else\s*\{\s*await queueNewPost\(db, \{ communityId: community\.id, postId: post\.id, actorId: viewer\.userId \}\)/.test(feed))
  }

  /* ── Reports ─────────────────────────────────────────────────────────── */
  console.log("\nA report reaches the staff, and their queue")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const db = pg(tables(), { [OWNER]: { email: "owen@example.com" }, [MOD]: { email: "mod@example.com" } })
    const community = { id: C1, slug: "film-loft", name: "Film Loft", status: "published" } as any
    const viewer = { userId: MARA, role: "member", active: true, tierId: null, ownedProductIds: [], level: 1 } as any
    const r1 = await createReport({ db, community, viewer } as any, { targetType: "member", targetId: DAN, reason: "spam", note: "selling followers" })
    check("the report lands in the queue", r1.ok && db.tables.community_reports.length === 1 && db.tables.community_reports[0].status === "open")
    const bell = db.tables.community_notifications.filter((n) => n.kind === "report")
    check("the owner and the moderator each have a bell row; members do not", JSON.stringify(bell.map((b) => b.user_id).sort()) === JSON.stringify([OWNER, MOD].sort()), bell.map((b) => b.user_id))
    check("  the owner's opens the /app moderation queue; a moderator without a store opens the reported member", bell.find((b) => b.user_id === OWNER)?.url === `/app/community/${C1}/moderation` && bell.find((b) => b.user_id === MOD)?.url === `/community/film-loft/members/${DAN}`)
    const digests = db.tables.community_jobs.filter((j) => j.payload?.report === true)
    check("one email is planned per moderator for today, an hour on", digests.length === 2 && digests.every((j) => j.kind === "push_digest" && j.idempotency_key === reportDigestKey(C1, j.payload.userId, Date.now()) && Math.abs(Date.parse(j.run_at) - Math.min(Date.now() + REPORT_DIGEST_DELAY_MS, Math.floor(Date.now() / 86_400_000) * 86_400_000 + 86_340_000)) < 5_000))
    await createReport({ db, community, viewer: { ...viewer, userId: BEN } } as any, { targetType: "member", targetId: DAN, reason: "abuse", note: null })
    await createReport({ db, community, viewer: { ...viewer, userId: IOANA } } as any, { targetType: "member", targetId: DAN, reason: "harassment", note: null })
    check("more reports that day plan nothing new (never one email per report)", db.tables.community_jobs.filter((j) => j.payload?.report === true).length === 2 && db.tables.community_notifications.filter((n) => n.kind === "report").length === 6)

    const ownerJob = db.tables.community_jobs.find((j) => j.payload?.report === true && j.payload.userId === OWNER)!
    const out = await runReportDigest(db as any, ownerJob.payload, Date.now(), { enabled: true })
    const events = db.tables.notification_events.filter((e) => e.name === "community.report_digest")
    check("when it runs: one email event, to the owner, counting the three", out === "sent" && events.length === 1 && events[0].user_id === OWNER && events[0].payload.reportCount === 3 && events[0].payload.recipientEmail === "owen@example.com", { out, events: events.length })
    await runReportDigest(db as any, ownerJob.payload, Date.now(), { enabled: true })
    check("  run again the same day: the outbox refuses a second", db.tables.notification_events.filter((e) => e.name === "community.report_digest").length === 1)
    ownerJob.state = "done"
    await createReport({ db, community, viewer: { ...viewer, userId: DAN } } as any, { targetType: "member", targetId: MARA, reason: "spam", note: null })
    const tomorrow = db.tables.community_jobs.find((j) => j.payload?.report === true && j.payload.userId === OWNER && j.payload.day !== utcDay(Date.now()))
    check("a report after today's email went waits for tomorrow's", !!tomorrow && tomorrow.payload.day === utcDay(Date.now() + 86_400_000) && Date.parse(tomorrow.run_at) === Math.floor(Date.now() / 86_400_000) * 86_400_000 + 86_400_000 + REPORT_DIGEST_DELAY_MS)
    for (const r of db.tables.community_reports) r.status = "resolved"
    const modJob = db.tables.community_jobs.find((j) => j.payload?.report === true && j.payload.userId === MOD)!
    check("nothing new (all dealt with meanwhile): no email at all", (await runReportDigest(db as any, modJob.payload, Date.now(), { enabled: true })) === "nothing_new" && db.tables.notification_events.filter((e) => e.name === "community.report_digest").length === 1)
    setPushBridgeDeps({ sender: sender(sent), communitiesOn: async () => true, defer: (task) => task() })
    const off = pg(tables(), { [OWNER]: { email: "owen@example.com", app_metadata: { [NOTIFY_META_KEY]: { emailOff: ["report_digest"] } } } })
    off.tables.community_reports.push({ id: "r", community_id: C1, reporter_id: MARA, target_type: "post", target_id: "x", reason: "spam", status: "open", created_at: new Date().toISOString() })
    check("the email turned off in Settings: none", (await runReportDigest(off as any, { report: true, userId: OWNER, communityId: C1, since: new Date(Date.now() - 60_000).toISOString(), day: utcDay(Date.now()) }, Date.now(), { enabled: true })) === "turned_off")
    const gone = pg(tables())
    gone.tables.community_members = gone.tables.community_members.map((m) => (m.user_id === MOD ? { ...m, role: "member" } : m))
    check("no longer staff: none", (await runReportDigest(gone as any, { report: true, userId: MOD, communityId: C1, since: new Date().toISOString(), day: utcDay(Date.now()) }, Date.now(), { enabled: true })) === "not_staff")
    check("the push_digest job hands report: true to the report email, the rest to the push digest", /payload as Record<string, unknown> \| null\)\?\.report === true[\s\S]*runReportDigest/.test(code("lib/communities/server/jobs/push_digest.ts")) && typeof pushDigest === "function")
    check("reports.ts plans the email, never sends one itself", /queueReportDigest\(db/.test(code("lib/communities/server/reports.ts")) && !/sendCommunityEmail/.test(code("lib/communities/server/reports.ts")))
  }

  console.log("\nWhen the report email goes, pure")
  {
    const day = Date.UTC(2026, 9, 5)
    const at9 = day + 9 * 3600_000
    const p = reportDigestPlan(at9, null)
    check("the first report of a quiet day: that day's email, an hour later", p?.day === "2026-10-05" && p?.runAt === at9 + REPORT_DIGEST_DELAY_MS)
    check("late at night it still goes on its own day", reportDigestPlan(day + 23.5 * 3600_000, null)?.runAt === day + 86_400_000 - 60_000)
    check("today's still waiting: nothing new (it will include this one)", reportDigestPlan(at9, "pending") === null)
    const t = reportDigestPlan(at9, "done")
    check("today's already went (or is going): tomorrow's, an hour into it", t?.day === "2026-10-06" && t?.runAt === day + 86_400_000 + REPORT_DIGEST_DELAY_MS && reportDigestPlan(at9, "running")?.day === "2026-10-06")
    check("the key is the community, the person and the day", reportDigestKey(C1, OWNER, at9) === `report_digest:${C1}:${OWNER}:2026-10-05`)
    check("a line says what and why, never who reported", reportLine({ target_type: "post", reason: "spam", note: "selling   followers" }) === 'A post, reported as spam: "selling followers"' && reportLine({ target_type: "member", reason: "off_topic" }) === "A member, reported as off topic" && reportLine({ target_type: "comment", reason: "abuse", note: "x".repeat(400) }).length <= 140)
    const data = reportDigestData(Array.from({ length: 7 }, () => ({ target_type: "post", reason: "spam" })))
    check("five lines at most, and how many more", data.reportCount === 7 && !!data.line5 && !("line6" in data) && data.moreCount === 2)
    const event = { id: "e", key: "k", name: "community.report_digest", userId: OWNER, creatorId: null, entityType: "community", entityId: C1, payload: { recipientEmail: "owen@example.com", dedupeKey: "report_digest:2026-10-05", communityId: C1 }, occurredAt: new Date().toISOString() } as any
    const planned = communitiesWorkflow(event, { now: Date.now(), userId: OWNER, creatorId: null })
    check("the engine plans it to the person, as a creator email (it opens /app)", planned?.jobs.length === 1 && planned.jobs[0].type === "COMMUNITY_REPORT_DIGEST" && planned.jobs[0].recipientType === "creator" && planned.jobs[0].recipientUserId === OWNER && REGISTRY.COMMUNITY_REPORT_DIGEST.recipient === "creator")
    const email = renderEmail("COMMUNITY_REPORT_DIGEST", { communityId: C1, communityName: "Film Loft", communitySlug: "film-loft", ...reportDigestData([{ target_type: "post", reason: "spam", note: "selling followers" }, { target_type: "comment", reason: "abuse" }]) }, { baseUrl: "https://storelib.com", recipientName: "Owen" } as any)
    check("the email: the count in the subject, the lines, one button to the queue", email.subject === "2 new reports in Film Loft" && email.text.includes('A post, reported as spam: "selling followers"') && email.text.includes(`https://storelib.com/app/community/${C1}/moderation`), email.subject)
  }

  /* ── The phone's permission ──────────────────────────────────────────── */
  console.log("\nThe permission prompt: only in the app")
  {
    check("off the app nothing is asked or read", !inNativeApp() && (await askPushPermission()) === "unsupported" && (await readPushPermission()) === "unsupported")
    check("the plugin's words as ours (Android 13's rationale is still a question)", permissionFrom("granted") === "granted" && permissionFrom("denied") === "denied" && permissionFrom("prompt") === "prompt" && permissionFrom("prompt-with-rationale") === "prompt" && permissionFrom(undefined) === "unsupported")
    const init = code("lib/push/client.ts")
    check("the push init only reads the permission; the ask lives in one place", !/requestPermissions/.test(init) && /checkPermissions\(\)/.test(init) && /if \(permResult\.receive !== "granted"\)[\s\S]*?return[\s\S]*?await registerDevice\(\)/.test(init))
    const nativePush = code("lib/native-push.ts")
    check("asking checks for the app before it touches the plugin", /export async function askPushPermission\(\)[^{]*\{\s*if \(!inNativeApp\(\)\) return "unsupported"/.test(nativePush) && (nativePush.match(/requestPermissions\(\)/g) || []).length === 1)
    const settings = code("components/account/notification-settings.tsx")
    check("Settings asks only from the Allow tap or turning push on", /onClick=\{phone\.ask\}/.test(settings) && /onTurnedOn=\{phone\.askIfNeeded\}/.test(settings) && (settings.match(/askPushPermission\(/g) || []).length === 1 && /const ask = useCallback\(\(\) => \{\s*if \(!inApp \|\| asking\) return/.test(settings))
    check("  turning push on asks straight from the switch's own tap", /if \(v\) onTurnedOn\?\.\(\)/.test(code("components/account/push-switch-row.tsx")))
    check("  a no says where to turn it on, and opens the phone's settings", /Notifications are off for Storelib on this phone/.test(settings) && /phoneSettingsPath\(platform\)/.test(settings) && /Check again/.test(settings) && /openPhoneSettings\(\)/.test(settings))
    const launchAsks = ["components/native-push-init.tsx", "components/app/app-layout-wrapper.tsx", "app/layout.tsx"].filter((f) => /askPushPermission|requestPermissions/.test(code(f)))
    check("the launch ask is the one sheet (components/platform/notifications-ask.tsx), not the layouts", launchAsks.length === 0 && /askPushPermission\(\)/.test(code("components/platform/notifications-ask.tsx")))
  }

  /* ── Settings and the route ──────────────────────────────────────────── */
  console.log("\nSettings, Notifications")
  {
    const route = code("app/api/me/push/route.ts")
    check("GET says the switch, the devices, every kind, the report email and whether they moderate", /NextResponse\.json\(\{ enabled, devices, kinds: kindStates\(choice\), emails: emailStates\(choice\), moderates,/.test(route))
    check("PATCH { push, email } changes only the person's own choice, rate limited like the switch", /if \(body\.push !== undefined \|\| body\.email !== undefined/.test(route) && /saveChoice\(db, userId, next\)/.test(route) && route.indexOf("rateLimit(") < route.indexOf("body.push !== undefined"))
    const page = read("components/account/account-settings.tsx")
    check("a Notifications section between Privacy and Preferences", /\{ key: "privacy", label: "Privacy" \},\s*\{ key: "notifications", label: "Notifications" \},\s*\{ key: "preferences", label: "Preferences" \}/.test(page) && /notifications: \(\) => <NotificationSettings \/>/.test(page))
    check("?section=notifications opens it", /SECTION_KEYS = \["profile", "account", "privacy", "notifications", "preferences"\]/.test(read("app/account/settings/page.tsx")))
    const settings = code("components/account/notification-settings.tsx")
    check("the kinds are live only while push is on, and save one at a time", /checked=\{live && s\.value\} disabled=\{!live\}/.test(settings) && /chain = run\.catch/.test(settings))
    check("the report email is offered only to someone who moderates", /initial\.moderates \? <EmailRow/.test(settings))
    for (const f of ["components/account/notification-settings.tsx", "components/account/push-switch-row.tsx", "lib/notifications/push-kinds.ts", "lib/notifications/report-digest.ts", "lib/native-push.ts", "lib/communities/server/jobs/report_digest.ts"]) {
      const t = read(f)
      check(`${f}: no em dashes, none of the banned words`, !/[—–]/.test(t) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(t))
    }
    for (const f of ["components/account/notification-settings.tsx", "lib/native-push.ts", "lib/notifications/push-kinds.ts"]) {
      check(`${f} imports nothing server only`, !/server-only|next\/headers|lib\/communities\/server|push-bridge/.test(code(f)))
    }
  }

  setPushBridgeDeps(null)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
