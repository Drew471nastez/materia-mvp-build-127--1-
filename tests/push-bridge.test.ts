/**
 * ===========================================================================
 *  FROM A NEW NOTIFICATION TO THE PERSON'S PHONE
 * ===========================================================================
 * Held from their inputs (lib/notifications/push-bridge.ts and its callers):
 *
 *   THE RULES      which kinds push at once and which are held, what each
 *                  notify_level lets through, the summary line, what a push
 *                  says and where its tap goes.
 *   ONE ROW        a new community row or inbox row pushes once, a duplicate
 *                  never; never the person who acted; never with the switch
 *                  off, no device, communities off, or a level that says no.
 *   FIVE MINUTES   the first like pushes, the next ones in the window are held
 *                  as one push_digest job, a reply still goes at once, and the
 *                  digest says "3 new likes and 2 new comments".
 *   FAN OUTS       a page of members pushed ten at a time; what does not fit
 *                  before the deadline goes back in the job's payload and is
 *                  sent first next run; a page run again pushes nobody twice.
 *   MESSAGES       the other person, at once, a link that opens the
 *                  conversation; never the sender.
 *   THE APP        a tap opens data.url inside the app for any page on
 *                  storelib.com, and still the sale and payout pages.
 *   THE SWITCH     GET and PATCH /api/me/push, part 86 as run-now wants it.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"

import { stripComments } from "./_source"
import {
  ADDRESSED_KINDS,
  IMMEDIATE_KINDS,
  PUSH_CONCURRENCY,
  PUSH_GATE_BUCKET,
  PUSH_SEND_MARGIN_MS,
  PUSH_WINDOW_MS,
  communityPushContent,
  digestContent,
  directMessageContent,
  drainPushes,
  levelAllowsPush,
  payloadOf,
  pushCommunityRow,
  pushDirectMessage,
  pushFanout,
  pushPriority,
  pushUserRow,
  readPushEnabled,
  readPushLeft,
  runPushDigest,
  safePushUrl,
  setPushBridgeDeps,
  setPushEnabled,
  summaryLine,
  userPushItem,
  type PushItem,
} from "@/lib/notifications/push-bridge"
import { pushTapTarget, inboxTapTarget } from "@/lib/push/tap"
import { notifyMember } from "@/lib/communities/server/notify"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { fanoutAnnouncement } from "@/lib/communities/server/jobs/fanout_announcement"
import { JOB_HANDLERS } from "@/lib/communities/server/jobs/index"
import { JOB_KINDS, PLATFORM_JOB_KINDS, type JobRow } from "@/lib/communities/types"
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

/* ── A small PostgREST stand in ──────────────────────────────────────────── */

type Row = Record<string, any>

function pg(tables: Record<string, Row[]>, opts: { refuse?: Record<string, { code: string; message: string }> } = {}) {
  let serial = 0
  const id = () => `00000000-0000-4000-9000-${String(++serial).padStart(12, "0")}`
  function from(table: string) {
    const st = { op: "select", preds: [] as ((r: Row) => boolean)[], order: [] as [string, boolean][], limit: null as number | null, head: false, count: false, payload: null as any, single: false, conflict: "", ignore: false, returning: false }
    const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0)
    const rows = () => (tables[table] ??= [])
    const run = () => {
      const refused = opts.refuse?.[table]
      if (refused && st.op !== "select") return { data: null, error: refused }
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
      not(c: string, op: string, v: unknown) { if (op === "is" && v === null) st.preds.push((r) => r[c] != null); return q },
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
  return { from, tables, rpc: async () => ({ data: [], error: null }) }
}

/* The five minute windows alone (round 13 also counts each push for the day, bucket "push-day"). */
const gates = (db: { tables: Record<string, Row[]> }) => db.tables.rate_limit_hits.filter((r) => r.bucket === PUSH_GATE_BUCKET)

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`
const C1 = "00000000-0000-4000-b000-000000000001"
const MARA = U(1)
const BEN = U(2)
const IOANA = U(3)

interface Sent { userId: string; title: string; body: string; data: Record<string, string>; collapseKey?: string }
function fakeSender(sent: Sent[], delayMs = 0) {
  let inFlight = 0
  let maxInFlight = 0
  const sender = async (userId: string, p: { title: string; body: string; data?: Record<string, string>; collapseKey?: string }) => {
    inFlight++
    maxInFlight = Math.max(maxInFlight, inFlight)
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    sent.push({ userId, title: p.title, body: p.body, data: p.data ?? {}, collapseKey: p.collapseKey })
    inFlight--
  }
  return { sender, max: () => maxInFlight }
}

function baseTables(): Record<string, Row[]> {
  return {
    communities: [{ id: C1, name: "Film Loft", slug: "film-loft", status: "published", deleted_at: null, suspended_at: null }],
    push_tokens: [MARA, BEN, IOANA].map((u, i) => ({ id: `t${i}`, user_id: u, token: `tok-${i}`, platform: "ios" })),
    business_links: [],
    notification_preferences: [],
    rate_limit_hits: [],
    community_jobs: [],
    community_members: [MARA, BEN, IOANA].map((u) => ({ community_id: C1, user_id: u, status: "active", notify_level: "all", email_announcements: false })),
    community_notifications: [],
    user_notifications: [],
    profiles: [
      { id: MARA, display_name: "Mara Pop", username: "mara" },
      { id: BEN, display_name: "Ben Ionescu", username: "ben" },
    ],
  }
}

async function main() {
  /* ── The rules ────────────────────────────────────────────────────────── */
  console.log("\nWhich kinds push at once, and which are held")
  /* Round 14 adds a ticket for a paid event: their seat and their money, so it goes at once too. */
  check("mentions, replies, messages, announcements, event reminders, approvals, admin messages and a ticket go at once", ["mention", "reply", "dm", "announcement", "event_reminder", "membership", "admin_message", "ticket"].every((k) => pushPriority(k) === "now") && IMMEDIATE_KINDS.length === 8)
  check("a waitlist spot opening is about the person alone: at once", pushPriority("event", "event_promoted:e1:u1:2026") === "now" && pushPriority("event", "event_new:e1:u1") === "coalesce")
  check("likes, comments, new events, level ups, new followers and followed creators' products are held", ["reaction", "comment", "event", "level_up", "course_available", "join_request", "report", "new_follower", "followed_new_product", "followed_new_community", "purchased_creator_new_product", "membership_post"].every((k) => pushPriority(k) === "coalesce"))
  check("the window is five minutes", PUSH_WINDOW_MS === 300_000)

  console.log("\nnotify_level")
  check("none never pushes, not even a mention or a message", !levelAllowsPush("none", "mention") && !levelAllowsPush("none", "dm") && !levelAllowsPush("none", "announcement"))
  check("mentions: only a mention, a reply, an admin message, their membership and a message", ADDRESSED_KINDS.every((k) => levelAllowsPush("mentions", k)) && !levelAllowsPush("mentions", "reaction") && !levelAllowsPush("mentions", "comment") && !levelAllowsPush("mentions", "announcement") && !levelAllowsPush("mentions", "event_reminder"))
  check("important: everything but likes (the default when unset)", levelAllowsPush("important", "announcement") && !levelAllowsPush("important", "reaction") && !levelAllowsPush(null, "reaction") && levelAllowsPush(null, "comment"))
  check("all: everything", levelAllowsPush("all", "reaction") && levelAllowsPush("all", "event"))

  console.log("\nWhat a push says")
  check("one kind: \"3 new likes\"", summaryLine(["reaction", "reaction", "reaction"]) === "3 new likes")
  check("two: \"3 new likes and 2 new comments\", the bigger first", summaryLine(["comment", "reaction", "reaction", "comment", "reaction"]) === "3 new likes and 2 new comments")
  check("three: commas, then and; one is singular", summaryLine(["reaction", "reaction", "comment", "event"]) === "2 new likes, 1 new comment and 1 new event")
  check("followers and products from both lists count as products", summaryLine(["new_follower", "followed_new_product", "purchased_creator_new_product"]) === "2 new products and 1 new follower")
  const announce = communityPushContent({ kind: "announcement", title: "Film Loft: Workshop on Friday", body: "Bring a roll of film.", url: "/community/film-loft/post/p1" }, "Film Loft")
  check("a community push: its name on top, the line without the name again, the words under it", announce?.title === "Film Loft" && announce?.body === "Workshop on Friday\nBring a roll of film.", announce)
  check("a long body is cut, never past 180", (communityPushContent({ kind: "reply", title: "Ana replied to your comment", body: "x".repeat(900), url: "/community/a/post/p" }, "A")?.body.length ?? 999) <= 180)
  check("only a path on storelib.com is ever a push's link", safePushUrl("/community/a") === "/community/a" && safePushUrl("https://evil.example") === null && safePushUrl("//evil.example") === null && safePushUrl("/\\evil") === null && safePushUrl("javascript:alert(1)") === null && safePushUrl("/a b") === null && communityPushContent({ kind: "reply", title: "x", url: "https://evil.example" }, "A") === null)
  const p1 = payloadOf({ title: "T", body: "B", url: "/community/film-loft/post/p1", kind: "reply" })
  check("the deep link rides in data: type inbox, the kind, data.url", p1.data?.type === "inbox" && p1.data?.kind === "reply" && p1.data?.url === "/community/film-loft/post/p1")
  const dm = directMessageContent({ senderName: "Mara Pop", text: "See you at the shoot", communitySlug: "film-loft", senderId: MARA, conversationId: "c-1" })
  check("a message: who, what, and the link that opens that conversation; one banner per conversation", dm?.title === "Mara Pop" && dm?.body === "See you at the shoot" && dm?.url === `/community/film-loft?dm=${MARA}` && dm?.collapseKey === "dm:c-1")
  const oneHeld = digestContent([{ kind: "reaction", title: "Ben liked your post", body: null, url: "/community/film-loft/post/p1" }], { group: `c:${C1}`, communityName: "Film Loft", communitySlug: "film-loft" })
  check("a window with one held row reads as that row", oneHeld?.title === "Film Loft" && oneHeld?.body === "Ben liked your post" && oneHeld?.kind === "reaction")
  const samePost = digestContent([1, 2, 3].map(() => ({ kind: "reaction", title: "x liked your post", body: null, url: "/community/film-loft/post/p1" })), { group: `c:${C1}`, communityName: "Film Loft", communitySlug: "film-loft" })
  check("three likes on one post open that post", samePost?.body === "3 new likes" && samePost?.url === "/community/film-loft/post/p1" && samePost?.collapseKey === `digest:c:${C1}`)
  const mixed = digestContent([{ kind: "reaction", title: "a", body: null, url: "/community/film-loft/post/p1" }, { kind: "comment", title: "b", body: null, url: "/community/film-loft/post/p2" }], { group: `c:${C1}`, communityName: "Film Loft", communitySlug: "film-loft" })
  check("on different posts, the community's notifications", mixed?.url === "/community/film-loft/notifications" && mixed?.body === "1 new like and 1 new comment")

  console.log("\nWhere a tap opens, in the app")
  check("a community or inbox push opens its own page, anywhere on storelib.com", pushTapTarget({ type: "inbox", url: "/community/film-loft/post/p1" }) === "/community/film-loft/post/p1" && pushTapTarget({ type: "inbox", url: `/community/film-loft?dm=${MARA}` }) === `/community/film-loft?dm=${MARA}` && pushTapTarget({ type: "inbox", url: "/mara/presets" }) === "/mara/presets")
  check("the payout and sale pushes still open their pages", pushTapTarget({ type: "sale", orderId: "o1" }) === "/app/sales" && pushTapTarget({ type: "payout_available" }) === "/app/payouts" && pushTapTarget({ type: "notification", url: "/app/payouts" }) === "/app/payouts" && pushTapTarget({ type: "notification", url: "/community/x" }) === "/app")
  check("never another host, a script, or the launch gate", inboxTapTarget("https://evil.example") === null && inboxTapTarget("//evil.example") === null && inboxTapTarget("javascript:alert(1)") === null && inboxTapTarget("/native-start") === null && inboxTapTarget("/a\\b") === null && pushTapTarget({ type: "inbox" }) === null && pushTapTarget({}) === null)

  /* ── One row ──────────────────────────────────────────────────────────── */
  console.log("\nOne new community row")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true })
    const db = pg(baseTables())
    const row = { userId: BEN, communityId: C1, kind: "reply" as const, actorId: MARA, title: "Mara Pop replied to your comment", body: "Agreed", url: "/community/film-loft/post/p1#c-1", dedupeKey: "reply:c1:ben", level: "all" as const }
    check("never the person who acted", (await pushCommunityRow(db, { ...row, userId: MARA })) === "skipped" && sent.length === 0)
    check("a reply goes at once, with its link", (await pushCommunityRow(db, row)) === "sent" && sent.length === 1 && sent[0].userId === BEN && sent[0].title === "Film Loft" && sent[0].data.url === "/community/film-loft/post/p1#c-1" && sent[0].data.type === "inbox")
    check("level none: nothing", (await pushCommunityRow(db, { ...row, level: "none" })) === "skipped" && sent.length === 1)
    check("mentions only: a like is not pushed, a reply is", (await pushCommunityRow(db, { ...row, kind: "reaction", level: "mentions" })) === "skipped" && (await pushCommunityRow(db, { ...row, level: "mentions" })) === "sent" && sent.length === 2)
    db.tables.push_tokens = db.tables.push_tokens.filter((t) => t.user_id !== IOANA)
    check("nobody with a device: nothing is decided or counted", (await pushCommunityRow(db, { ...row, userId: IOANA, kind: "reaction" })) === "skipped" && !db.tables.rate_limit_hits.some((r) => r.subject.startsWith(IOANA)))
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => false })
    check("communities switched off: nothing (the link would 404)", (await pushCommunityRow(db, row)) === "skipped" && sent.length === 2)
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true })
    db.tables.notification_preferences.push({ user_id: BEN, category: "social", channel: "push", enabled: false })
    check("the person turned push off: nothing", (await pushCommunityRow(db, row)) === "skipped" && sent.length === 2)
  }

  console.log("\nFive minutes per community for low priority kinds")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true })
    const db = pg(baseTables())
    const like = (n: number) => ({ userId: BEN, communityId: C1, kind: "reaction" as const, actorId: U(10 + n), title: `Member ${n} liked your post`, body: null, url: "/community/film-loft/post/p1", dedupeKey: `reaction:post:p1:${n}`, level: "all" as const })
    check("the first like pushes at once and opens a window", (await pushCommunityRow(db, like(1))) === "sent" && sent.length === 1 && gates(db).length === 1 && gates(db)[0].subject === `${BEN}|c:${C1}`)
    const second = await pushCommunityRow(db, like(2))
    const third = await pushCommunityRow(db, like(3))
    const digests = db.tables.community_jobs.filter((j) => j.kind === "push_digest")
    check("the next likes in the window are held, as ONE digest job", second === "held" && third === "held" && sent.length === 1 && digests.length === 1, { second, third, digests: digests.length })
    const opened = Date.parse(db.tables.rate_limit_hits[0].created_at)
    check("the digest runs when the window closes", Math.abs(Date.parse(digests[0].run_at) - (opened + PUSH_WINDOW_MS + 5_000)) < 2_000 && digests[0].payload.userId === BEN && digests[0].payload.group === `c:${C1}`)
    check("a reply in the same minute still goes at once", (await pushCommunityRow(db, { ...like(4), kind: "reply", title: "Ana replied", dedupeKey: "reply:x" })) === "sent" && sent.length === 2)
    const other = "00000000-0000-4000-b000-000000000002"
    db.tables.communities.push({ id: other, name: "Darkroom", slug: "darkroom" })
    check("another community has its own window", (await pushCommunityRow(db, { ...like(5), communityId: other, url: "/community/darkroom/post/p9" })) === "sent" && sent.length === 3)
    db.tables.rate_limit_hits.forEach((h) => (h.created_at = new Date(Date.now() - PUSH_WINDOW_MS - 60_000).toISOString()))
    check("after five minutes the next like pushes again", (await pushCommunityRow(db, like(6))) === "sent" && sent.length === 4)

    /* The digest, when the window closes. */
    const since = new Date(Date.now() - PUSH_WINDOW_MS - 10_000).toISOString()
    const later = (s: number) => new Date(Date.parse(since) + s * 1000).toISOString()
    const db2 = pg(baseTables())
    db2.tables.community_notifications.push(
      ...[1, 2, 3].map((n) => ({ id: `r${n}`, user_id: BEN, community_id: C1, kind: "reaction", actor_id: U(20 + n), title: `M${n} liked your post`, body: null, url: "/community/film-loft/post/p1", read_at: null, created_at: later(n) })),
      ...[1, 2].map((n) => ({ id: `c${n}`, user_id: BEN, community_id: C1, kind: "comment", actor_id: U(30 + n), title: `M${n} commented on your post`, body: "nice", url: "/community/film-loft/post/p2", read_at: null, created_at: later(10 + n) })),
      { id: "old", user_id: BEN, community_id: C1, kind: "reaction", actor_id: U(40), title: "before", body: null, url: "/community/film-loft/post/p1", read_at: null, created_at: new Date(Date.parse(since) - 1000).toISOString() },
      { id: "seen", user_id: BEN, community_id: C1, kind: "reaction", actor_id: U(41), title: "read in the bell", body: null, url: "/community/film-loft/post/p1", read_at: later(30), created_at: later(20) },
      { id: "reply", user_id: BEN, community_id: C1, kind: "reply", actor_id: U(42), title: "pushed at once already", body: null, url: "/community/film-loft/post/p1", read_at: null, created_at: later(21) },
    )
    const before = sent.length
    const out = await runPushDigest(db2, { userId: BEN, group: `c:${C1}`, since })
    const d = sent[sent.length - 1]
    check("the digest: \"3 new likes and 2 new comments\" under the community's name", !out && sent.length === before + 1 && d.title === "Film Loft" && d.body === "3 new likes and 2 new comments" && d.data.url === "/community/film-loft/notifications" && d.data.kind === "digest", d)
    check("and it opens a new window", gates(db2).length === 1)
    db2.tables.rate_limit_hits[0].created_at = new Date(Date.now() - 1000).toISOString()
    const again = await runPushDigest(db2, { userId: BEN, group: `c:${C1}`, since })
    check("a newer window opened since: it waits for that one instead of pushing", !!again && "again" in again && sent.length === before + 1 && (again as any).again.payload.anchor === db2.tables.rate_limit_hits[0].created_at)
    const db3 = pg(baseTables())
    db3.tables.community_members[1].notify_level = "mentions"
    db3.tables.community_notifications.push({ id: "r", user_id: BEN, community_id: C1, kind: "reaction", actor_id: MARA, title: "x", body: null, url: "/community/film-loft/post/p1", read_at: null, created_at: later(2) })
    await runPushDigest(db3, { userId: BEN, group: `c:${C1}`, since })
    check("a member who switched to mentions only gets no digest of likes", sent.length === before + 1)
    const db4 = pg(baseTables())
    db4.tables.user_notifications.push(...[1, 2].map((n) => ({ id: `f${n}`, user_id: BEN, source: "following", kind: "new_follower", actor_id: U(50 + n), title: `P${n} followed you`, body: null, url: `/@p${n}`, read_at: null, created_at: later(n) })), { id: "p", user_id: BEN, source: "following", kind: "followed_new_product", actor_id: MARA, title: "Mara Pop published a new product", body: "Presets", url: "/mara/presets", read_at: null, created_at: later(5) })
    await runPushDigest(db4, { userId: BEN, group: "s:following", since })
    check("the inbox's own sources have windows too: \"2 new followers and 1 new product\"", sent[sent.length - 1].body === "2 new followers and 1 new product" && sent[sent.length - 1].title === "Storelib", sent[sent.length - 1])
    check("a payload that is not ours is refused", await runPushDigest(db4, { userId: "x", group: "c:1", since: "now" }).then(() => false, () => true))
  }

  console.log("\nThrough notifyMember and notifyUser: new rows only")
  {
    const sent: Sent[] = []
    /* In a request the push waits for the response (after()); here it runs in place so it can be seen. */
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true, defer: (task) => task() })
    const db = pg(baseTables())
    const n = { userId: BEN, communityId: C1, kind: "mention" as const, actorId: MARA, title: "Mara Pop mentioned you", body: "@ben look", url: "/community/film-loft/post/p1", dedupeKey: "mention:post:p1:ben" }
    check("a new row: written and pushed", (await notifyMember(db, n)) === "sent" && sent.length === 1 && sent[0].userId === BEN)
    check("the same key again: a duplicate, never a second push", (await notifyMember(db, n)) === "duplicate" && sent.length === 1)
    check("about their own action: neither", (await notifyMember(db, { ...n, userId: MARA, dedupeKey: "mention:self" })) === "skipped" && sent.length === 1)
    db.tables.community_members[1].notify_level = "none"
    check("notify_level none: no row, no push", (await notifyMember(db, { ...n, dedupeKey: "mention:p2" })) === "skipped" && sent.length === 1)
    const f = { userId: BEN, kind: "new_follower" as const, source: "following" as const, actorId: MARA, title: "Mara Pop followed you", url: "/@mara", dedupeKey: `follow:${MARA}:${BEN}` }
    check("a new follower: a row and a push that opens the follower's profile", (await notifyUser(db, f)) === "sent" && sent.length === 2 && sent[1].title === "Mara Pop followed you" && sent[1].data.url === "/@mara")
    check("followed again later (same key): no second push", (await notifyUser(db, f)) === "duplicate" && sent.length === 2)
    check("pushUserRow holds the next one from the same source for five minutes", (await pushUserRow(db, { ...f, actorId: IOANA, title: "Ioana followed you", dedupeKey: "follow:i:b" })) === "held" && sent.length === 2)
  }

  console.log("\nA direct message")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true })
    const db = pg(baseTables())
    const m = { communityId: C1, communitySlug: "film-loft", conversationId: "conv-1", senderId: MARA, recipientId: BEN, text: "Are you coming Friday?" }
    check("the other person, at once, from the sender, opening the conversation", (await pushDirectMessage(db, m)) === "sent" && sent.length === 1 && sent[0].userId === BEN && sent[0].title === "Mara Pop" && sent[0].data.url === `/community/film-loft?dm=${MARA}` && sent[0].collapseKey === "dm:conv-1")
    check("a second message a moment later also goes (messages are never held)", (await pushDirectMessage(db, { ...m, text: "?" })) === "sent" && sent.length === 2)
    check("never the sender", (await pushDirectMessage(db, { ...m, recipientId: MARA })) === "skipped" && sent.length === 2)
    db.tables.community_members[1].notify_level = "none"
    check("notifications off in that community: no push", (await pushDirectMessage(db, m)) === "skipped" && sent.length === 2)
    db.tables.community_members[1].notify_level = "mentions"
    check("mentions only still hears messages", (await pushDirectMessage(db, m)) === "sent" && sent.length === 3)
  }

  /* ── Fan outs ─────────────────────────────────────────────────────────── */
  console.log("\nFan outs: ten at a time, never past the deadline")
  {
    const sent: Sent[] = []
    const fake = fakeSender(sent, 4)
    setPushBridgeDeps({ sender: fake.sender, communitiesOn: async () => true })
    const people = Array.from({ length: 600 }, (_, i) => U(1000 + i))
    const tables = baseTables()
    tables.push_tokens = people.filter((_, i) => i % 3 !== 0).map((u, i) => ({ id: `p${i}`, user_id: u, token: `t${i}`, platform: i % 2 ? "android" : "ios" }))
    tables.notification_preferences = [{ user_id: people[1], category: "social", channel: "push", enabled: false }]
    const db = pg(tables)
    const items: PushItem[] = people.map((u) => ({ userId: u, kind: "announcement", group: `c:${C1}`, actorId: MARA, level: "all", content: { title: "Film Loft", body: "Workshop on Friday", url: "/community/film-loft/post/p1", kind: "announcement" } }))
    items.push({ ...items[2], userId: MARA })
    /* Time for a few batches only. */
    const left = await pushFanout(db, items, { deadline: Date.now() + PUSH_SEND_MARGIN_MS + 40 })
    const reachableCount = people.filter((_, i) => i % 3 !== 0).length - 1
    const leftCount = left.reduce((n, e) => n + e.u.length, 0)
    check("only people with a device, never the actor, never a switched off person", !sent.some((s) => s.userId === MARA || s.userId === people[1] || s.userId === people[0]) && sent.length + leftCount === reachableCount, { sent: sent.length, leftCount, reachableCount })
    check(`at most ${PUSH_CONCURRENCY} in flight at once`, fake.max() <= PUSH_CONCURRENCY && fake.max() > 1, fake.max())
    check("out of time: the rest is handed back, in one group with one payload", sent.length > 0 && leftCount > 0 && left.length === 1 && left[0].p.data?.url === "/community/film-loft/post/p1")
    const carried = readPushLeft(JSON.parse(JSON.stringify(left)))
    check("the handed back list survives the job payload (JSON) and is read back clean", carried.length === 1 && carried[0].u.length === leftCount)
    const rest = await drainPushes(carried, { deadline: Date.now() + 60_000 })
    check("the next run sends the rest, nobody twice", rest.length === 0 && sent.length === reachableCount && new Set(sent.map((s) => s.userId)).size === reachableCount)
    check("a payload with someone else's link is dropped when read back", readPushLeft([{ p: { title: "x", body: "y", data: { url: "https://evil.example" } }, u: [BEN] }]).length === 0)

    const sent2: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent2).sender, communitiesOn: async () => true })
    const db2 = pg(baseTables())
    const followers = [BEN, IOANA].map((u) => userPushItem({ userId: u, kind: "followed_new_product", source: "following", actorId: MARA, title: "Mara Pop published a new product", body: "Presets", url: "/mara/presets", dedupeKey: `product:p:${u}` })!)
    await pushFanout(db2, followers, { deadline: Date.now() + 60_000 })
    await pushFanout(db2, followers.map((f) => ({ ...f, dedupeKey: `product:p2:${f.userId}` })), { deadline: Date.now() + 60_000 })
    check("a followed creator's second product in five minutes is held for each follower, one digest each", sent2.length === 2 && db2.tables.community_jobs.filter((j) => j.kind === "push_digest").length === 2)
  }

  console.log("\nThe announcement job pushes its fresh rows, once")
  {
    const sent: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent).sender, communitiesOn: async () => true })
    const tables = baseTables()
    const members = Array.from({ length: 40 }, (_, i) => U(2000 + i))
    tables.community_members = [MARA, ...members].map((u, i) => ({ community_id: C1, user_id: u, status: "active", notify_level: i === 5 ? "none" : i === 6 ? "mentions" : "all", email_announcements: false }))
    tables.push_tokens = [MARA, ...members].map((u, i) => ({ id: `a${i}`, user_id: u, token: `ta${i}`, platform: "android" }))
    tables.community_feed_posts = [{ id: "00000000-0000-4000-c000-000000000001", community_id: C1, title: "", body_text: "Workshop on Friday", status: "published" }]
    const db = pg(tables)
    const job = { id: 1, kind: "fanout_announcement", payload: { communityId: C1, postId: "00000000-0000-4000-c000-000000000001", actorId: MARA, reason: "everyone" }, attempts: 1 } as unknown as JobRow
    const out = await fanoutAnnouncement(db, job, { deadline: Date.now() + 60_000, now: Date.now() })
    const expected = members.length - 2
    check("every member who wants it, not the author, not none, not mentions only", !out && sent.length === expected && !sent.some((s) => s.userId === MARA), { sent: sent.length, expected })
    check("the push opens the post", sent.every((s) => s.data.url === "/community/film-loft/post/00000000-0000-4000-c000-000000000001"))
    await fanoutAnnouncement(db, job, { deadline: Date.now() + 60_000, now: Date.now() })
    check("the job run again: rows are duplicates, nobody pushed twice", sent.length === expected)

    const sent2: Sent[] = []
    setPushBridgeDeps({ sender: fakeSender(sent2, 25).sender, communitiesOn: async () => true })
    const db2 = pg({ ...tables, community_notifications: [], rate_limit_hits: [] })
    const tight = await fanoutAnnouncement(db2, job, { deadline: Date.now() + PUSH_SEND_MARGIN_MS + 15, now: Date.now() })
    const handed = (tight as any)?.again?.payload
    check("short of time: handed back with pushLeft and the page's own cursor", !!handed && Array.isArray(handed.pushLeft) && handed.pushLeft.length === 1 && handed.after === null && sent2.length < expected, { sent: sent2.length })
    const job2 = { ...job, payload: handed } as JobRow
    const next = await fanoutAnnouncement(db2, job2, { deadline: Date.now() + 60_000, now: Date.now() })
    check("the next run sends what was left first, then the page again writes and pushes nothing new", !next && sent2.length === expected && new Set(sent2.map((s) => s.userId)).size === expected)
  }

  console.log("\nThe push switch")
  {
    const db = pg(baseTables())
    check("on unless turned off", (await readPushEnabled(db, BEN)) === true)
    check("off is one row: social, push, from settings", (await setPushEnabled(db, BEN, false)) === "saved" && db.tables.notification_preferences.length === 1 && db.tables.notification_preferences[0].category === "social" && db.tables.notification_preferences[0].channel === "push" && db.tables.notification_preferences[0].source === "settings" && (await readPushEnabled(db, BEN)) === false)
    check("on again updates the same row", (await setPushEnabled(db, BEN, true)) === "saved" && db.tables.notification_preferences.length === 1 && (await readPushEnabled(db, BEN)) === true)
    const before86 = pg(baseTables(), { refuse: { notification_preferences: { code: "23514", message: "violates check constraint" } } })
    check("before part 86 the category is refused: not_set_up", (await setPushEnabled(before86, BEN, false)) === "not_set_up")
  }
  setPushBridgeDeps(null)

  /* ── The source ───────────────────────────────────────────────────────── */
  console.log("\nWired where rows are written")
  const notify = code("lib/communities/server/notify.ts")
  check("notifyMember pushes only after a new row, with the member's level", /if \(!\(Array\.isArray\(data\) && data\.length > 0\)\) return "duplicate"\s*await pushSoon\(\(\) =>\s*pushCommunityRow\(db, \{[\s\S]*?level: \(member\.notify_level/.test(notify))
  const inbox = code("lib/notifications/user-inbox.ts")
  check("notifyUser pushes only after a new row", /if \(!\(Array\.isArray\(data\) && data\.length > 0\)\) return "duplicate"\s*await pushSoon\(\(\) => pushUserRow\(db, freshOf\(row\)\)\)/.test(inbox))
  check("the fan outs push the rows they wrote, from inside the job", ["fanout_announcement", "fanout_event", "event_reminder", "fanout_followers", "fanout_membership_post"].every((k) => { const s = code(`lib/communities/server/jobs/${k}.ts`); return /await carryPushes\(job\.payload, ctx\.deadline\)/.test(s) && /await pushFanout\(db, /.test(s) && /pushLeft: left/.test(s) }))
  /* Changed on purpose (round 37): the banner's words are pushText (the message, "Photo", or "New message" when the admins turned previews off), and the push waits for directPushWanted (a muted conversation, or one open on their screen, is not pushed). */
  check("a direct message pushes the other person after it is written", /if \(!\(await directPushWanted\(db, \{ conversationId: conversation\.id, senderId, recipientId: other, recipientReadAt: otherReadAt \}\)\)\) return\s*await pushDirectMessage\(db, \{ communityId: community\.id, communitySlug: community\.slug, conversationId: conversation\.id, senderId, recipientId: other, text: pushText \}\)/.test(code("lib/communities/server/direct.ts")))
  check("push_digest has its handler and runs while communities are off too", typeof JOB_HANDLERS.push_digest === "function" && (JOB_KINDS as readonly string[]).includes("push_digest") && (PLATFORM_JOB_KINDS as readonly string[]).includes("push_digest"))
  check("in a request a push waits for the response (next/server after), never holding it up", /after\(task\)/.test(code("lib/notifications/push-bridge.ts")) && /defer: deferAfterResponse/.test(code("lib/notifications/push-bridge.ts")))
  const client = code("lib/push/client.ts")
  check("the app's tap listener opens any page a push names (lib/push/tap), not only payouts", /const to = pushTapTarget\(data\)/.test(client) && /window\.location\.href = to/.test(client) && !/type === "sale"/.test(client))
  check("and a cold start's gate does not send the person elsewhere after a tap chose", /__storelibPushTap\) return/.test(code("app/(storelib)/native-start/page.tsx")))
  const sender = code("lib/push/sender.ts")
  check("a browser push opens the inbox page too, and phones stack one banner per key", /data\?\.type === "inbox" \? inboxTapTarget\(data\.url\)/.test(sender) && /"apns-collapse-id": collapse/.test(sender) && /tag: collapse/.test(sender))

  console.log("\nGET and PATCH /api/me/push")
  const route = code("app/api/me/push/route.ts")
  check("the session decides who; nothing else is read from the body but enabled (and the kinds, round 12)", /const userId = await sessionUserId\(\)/.test(route) && /typeof body\.enabled !== "boolean"/.test(route) && /setPushEnabled\(admin\(\), userId, body\.enabled\)/.test(route) && !/body\.userId/.test(route))
  check("PATCH is rate limited, GET says enabled and devices", /rateLimit\(\{ bucket: "me-push"/.test(route) && /export async function GET/.test(route) && /\{ enabled, devices[ ,}]/.test(route) && /export async function PATCH/.test(route))
  check("before part 86 PATCH says not_set_up", /saved === "not_set_up"\) return NextResponse\.json\(\{ error: "not_set_up" \}, \{ status: 503/.test(route))

  console.log("\nPart 86, as run-now wants a part")
  const P = "supabase/sql/run-now/86_push_notifications.sql"
  const sql = read(P)
  const lines = sql.split("\n").filter(Boolean)
  check("it exists, and its migration is a byte for byte copy", read("supabase/migrations/20261106_push_notifications.sql") === sql)
  check("line 1 is a plain summary that says it is safe to run again", /^\/\* .*Safe to run again\. \*\/$/.test(lines[0]))
  check("one statement per line, no -- comments, the schema reloaded last", lines.slice(1).every((l) => l.trim().endsWith(";")) && !/^\s*--/m.test(sql) && lines[lines.length - 1] === "notify pgrst, 'reload schema';")
  check("a constraint is dropped before it is added again, in one statement", [...sql.matchAll(/ADD CONSTRAINT (\w+)/g)].every((m) => sql.includes(`DROP CONSTRAINT IF EXISTS ${m[1]}, ADD CONSTRAINT ${m[1]}`)))
  const kinds = sql.match(/CONSTRAINT community_jobs_kind_check CHECK \(kind IN \(([^)]+)\)\)/)?.[1] ?? ""
  const p85 = read("supabase/sql/run-now/85_profiles_follows_notifications.sql").match(/CONSTRAINT community_jobs_kind_check CHECK \(kind IN \(([^)]+)\)\)/)?.[1] ?? ""
  check("the job CHECK is JOB_KINDS exactly, keeping every kind part 85 allowed", kinds === JOB_KINDS.map((k) => `'${k}'`).join(", ") && p85.split(", ").every((k) => kinds.split(", ").includes(k)), kinds)
  const cats = sql.match(/CONSTRAINT notification_preferences_category_check CHECK \(category IN \(([^)]+)\)\) NOT VALID;/)?.[1] ?? ""
  const p40 = read("supabase/sql/run-now/40_notification_engine.sql").match(/CONSTRAINT notification_preferences_category_check CHECK \(category IN \(([^)]+)\)\) NOT VALID;/)?.[1] ?? ""
  check("the preference categories keep every one part 40 had and add social, NOT VALID", p40.length > 0 && p40.split(", ").every((c) => cats.split(", ").includes(c)) && cats.split(", ").includes("'social'"), cats)
  check("no table, no rows changed", !/CREATE TABLE|INSERT|UPDATE|DELETE/i.test(lines.slice(1).join("\n")))
  const readme = read("supabase/sql/run-now/README.md")
  const row = readme.split("\n").find((l) => l.startsWith("| `86_push_notifications.sql` |")) ?? ""
  check("the README names it, with its lines and bytes", row.endsWith(`| ${sql.split("\n").length - 1} | ${Buffer.byteLength(sql).toLocaleString("en-US")} |`), row.slice(-30))
  check("the check after has its column", /as p86_push_notifications[,;]/.test(read("supabase/sql/run-now/99_check_after.sql")))
  check("the built files and the admin's list carry it", read("supabase/sql/all-in-two/1_of_2_everything.sql").includes("-- part 86_push_notifications.sql") && /part: "86", file: "86_push_notifications\.sql"/.test(read("lib/admin/sql-parts.generated.ts")))

  console.log("\nCopy")
  const files = ["lib/notifications/push-bridge.ts", "lib/push/tap.ts", "app/api/me/push/route.ts", "lib/communities/server/jobs/push_digest.ts", P]
  const banned = /\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i
  check("no em dash and no banned word", files.every((f) => !read(f).includes("—") && !banned.test(read(f))), files.filter((f) => read(f).includes("—") || banned.test(read(f))))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
